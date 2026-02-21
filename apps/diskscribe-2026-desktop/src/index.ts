import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type OpenDialogReturnValue,
  type SaveDialogOptions,
  type SaveDialogReturnValue
} from 'electron';
import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { APP_DESKTOP_NAME, APP_NAME, APP_VENDOR } from './appMeta';
import type { DiskSummary } from './core/diskSummary';
import { buildDiskSummaryFromPath, isSupportedDiskPath } from './core/diskSummary';
import { PagedFileByteReader } from './core/hex/pagedFileByteReader';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

type HexMode = 'disk' | 'raw';

interface HexSelection {
  mode: HexMode;
  start: number;
  end: number;
}

type BatchItemStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled';

interface BatchQueueItemPayload {
  id: string;
  filePath: string;
}

interface BatchRunState {
  activeRunId: number;
  running: boolean;
  cancelRequested: boolean;
}

interface DesktopSession {
  windowId: number;
  rendererReady: boolean;
  filePath: string | undefined;
  summary: DiskSummary | undefined;
  reader: PagedFileByteReader | undefined;
  mode: HexMode;
  selection: HexSelection | undefined;
  cursorOffset: number | undefined;
  batch: BatchRunState;
}

const HEX_SETTINGS = {
  pageBytes: 65536,
  maxCachedPages: 32,
  defaultMode: 'disk' as HexMode
};

const sessionsByWindowId = new Map<number, DesktopSession>();
const DISK_IMAGE_FILTERS = [
  {
    name: 'PC-98 Disk Images',
    extensions: ['hdi', 'nhd', 'd88', 'hdm', 'hdd', 'fdi', 'fdd']
  }
];
const APP_BATCH_PLAN_VERSION = 1;

if (require('electron-squirrel-startup')) {
  app.quit();
}

app.setName(APP_DESKTOP_NAME);

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    title: APP_DESKTOP_NAME,
    width: 1400,
    height: 920,
    minWidth: 980,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#162128',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const session: DesktopSession = {
    windowId: mainWindow.id,
    rendererReady: false,
    filePath: undefined,
    summary: undefined,
    reader: undefined,
    mode: HEX_SETTINGS.defaultMode,
    selection: undefined,
    cursorOffset: undefined,
    batch: {
      activeRunId: 0,
      running: false,
      cancelRequested: false
    }
  };
  sessionsByWindowId.set(mainWindow.id, session);
  setWindowTitle(session);

  mainWindow.on('closed', () => {
    disposeSession(mainWindow.id);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  void mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  const launchPath = getLaunchDiskPath();
  if (launchPath) {
    void openDisk(session, launchPath);
  }
}

ipcMain.handle('desktop:openDiskDialog', async (event): Promise<string | undefined> => {
  const result = await showOpenDialogForEvent(event, {
    title: 'Open PC-98 Disk Image',
    properties: ['openFile'],
    filters: DISK_IMAGE_FILTERS
  });

  if (result.canceled || result.filePaths.length === 0) {
    return undefined;
  }
  return result.filePaths[0];
});

ipcMain.handle('desktop:openDisksDialog', async (event): Promise<string[]> => {
  const result = await showOpenDialogForEvent(event, {
    title: 'Add Disk Images to Batch Queue',
    properties: ['openFile', 'multiSelections'],
    filters: DISK_IMAGE_FILTERS
  });
  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }
  return result.filePaths;
});

ipcMain.handle('desktop:openDiskFolderDialog', async (event): Promise<string[]> => {
  const result = await showOpenDialogForEvent(event, {
    title: 'Add Folder to Batch Queue',
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }
  return collectSupportedDisksFromFolder(result.filePaths[0]);
});

ipcMain.handle('desktop:saveBatchPlan', async (event, rawEntries: unknown) => {
  const entries = normalizeBatchQueueItems(rawEntries);
  const saveResult = await showSaveDialogForEvent(event, {
    title: 'Save Batch Plan',
    defaultPath: 'diskscribe2026-batch-plan.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (saveResult.canceled || !saveResult.filePath) {
    return { saved: false };
  }

  const payload = {
    appName: APP_NAME,
    appVendor: APP_VENDOR,
    planVersion: APP_BATCH_PLAN_VERSION,
    createdAt: new Date().toISOString(),
    entries
  };

  await fs.writeFile(saveResult.filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { saved: true, filePath: saveResult.filePath };
});

ipcMain.handle('desktop:loadBatchPlan', async (event) => {
  const loadResult = await showOpenDialogForEvent(event, {
    title: 'Load Batch Plan',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (loadResult.canceled || loadResult.filePaths.length === 0) {
    return { entries: [] };
  }

  const filePath = loadResult.filePaths[0];
  try {
    const text = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(text) as { entries?: unknown };
    const entries = normalizeBatchQueueItems(parsed?.entries);
    return { filePath, entries };
  } catch (error: unknown) {
    return { filePath, entries: [], error: toErrorMessage(error) };
  }
});

ipcMain.handle('desktop:writeClipboard', async (_event, text: unknown): Promise<void> => {
  clipboard.writeText(typeof text === 'string' ? text : String(text ?? ''));
});

ipcMain.handle('desktop:postMessage', async (event, rawMessage: unknown): Promise<void> => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);
  if (!ownerWindow) {
    return;
  }

  const session = sessionsByWindowId.get(ownerWindow.id);
  if (!session) {
    return;
  }

  await handleIncomingMessage(session, rawMessage);
});

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

async function handleIncomingMessage(session: DesktopSession, rawMessage: unknown): Promise<void> {
  if (!isRecord(rawMessage) || typeof rawMessage.type !== 'string') {
    return;
  }

  switch (rawMessage.type) {
    case 'desktop.rendererReady':
      await handleRendererReady(session);
      return;
    case 'desktop.openDisk':
      if (typeof rawMessage.filePath === 'string') {
        await openDisk(session, rawMessage.filePath);
      }
      return;
    case 'desktop.jumpLba':
      if (Number.isFinite(rawMessage.lba)) {
        await jumpToLba(session, Math.floor(Number(rawMessage.lba)));
      }
      return;
    case 'desktop.copyOffset':
      await copyOffset(session);
      return;
    case 'desktop.copyLba':
      await copyLba(session);
      return;
    case 'refresh':
      await refreshSession(session);
      return;
    case 'desktop.batchRun':
      await runBatchQueue(session, rawMessage.items);
      return;
    case 'desktop.batchStop':
      requestBatchStop(session);
      return;
    case 'hex.read':
      await handleHexRead(session, rawMessage);
      return;
    case 'hex.jump':
      await handleHexJump(session, rawMessage);
      return;
    case 'hex.select':
      await handleHexSelect(session, rawMessage);
      return;
    case 'hex.extract':
      await handleHexExtract(session, rawMessage);
      return;
    default:
      return;
  }
}

async function handleRendererReady(session: DesktopSession): Promise<void> {
  session.rendererReady = true;
  postRendererMessage(session, {
    type: 'desktop.appMeta',
    appName: APP_NAME,
    appDesktopName: APP_DESKTOP_NAME,
    appVersion: app.getVersion()
  });

  if (!session.summary || !session.filePath) {
    postStatus(session, 'Open a .hdi, .nhd, .d88, .hdm, .hdd, .fdi, or .fdd disk image to begin.');
    return;
  }

  postRendererMessage(session, {
    type: 'desktop.fileOpened',
    filePath: session.filePath,
    fileName: path.basename(session.filePath)
  });
  pushSummaryAndInit(session, false);
}

async function openDisk(session: DesktopSession, requestedPath: string): Promise<void> {
  const normalizedPath = path.resolve(requestedPath);
  if (!existsSync(normalizedPath)) {
    postError(session, `File not found: ${normalizedPath}`);
    return;
  }

  if (!isSupportedDiskPath(normalizedPath)) {
    postError(session, 'Unsupported extension. Use .hdi, .nhd, .d88, .hdm, .hdd, .fdi, or .fdd.');
    return;
  }

  try {
    postStatus(session, `Loading ${path.basename(normalizedPath)}...`, { busy: true });
    const summary = await buildDiskSummaryFromPath(normalizedPath);

    disposeReader(session);
    session.filePath = normalizedPath;
    session.summary = summary;
    session.mode = chooseValidMode(summary, HEX_SETTINGS.defaultMode);
    session.reader = new PagedFileByteReader(normalizedPath, summary.sizeBytes, {
      pageBytes: HEX_SETTINGS.pageBytes,
      maxCachedPages: HEX_SETTINGS.maxCachedPages
    });

    const initialOffset = clampViewOffset(session, session.mode, 0);
    session.selection = normalizeSelection(session.mode, initialOffset, initialOffset);
    session.cursorOffset = initialOffset;

    postRendererMessage(session, {
      type: 'desktop.fileOpened',
      filePath: normalizedPath,
      fileName: path.basename(normalizedPath)
    });
    setWindowTitle(session, path.basename(normalizedPath));
    pushSummaryAndInit(session, true);
    postRendererMessage(session, {
      type: 'desktop.notice',
      message: `Loaded ${path.basename(normalizedPath)} (${summary.sizeBytes.toLocaleString()} bytes).`
    });
    postStatus(session, `Loaded ${path.basename(normalizedPath)}.`, { busy: false });
  } catch (error: unknown) {
    postError(session, toErrorMessage(error));
    postStatus(session, `Failed to load ${path.basename(normalizedPath)}.`, { busy: false });
  }
}

async function refreshSession(session: DesktopSession): Promise<void> {
  if (!session.filePath) {
    postStatus(session, 'No disk is open yet.');
    return;
  }
  await openDisk(session, session.filePath);
}

async function runBatchQueue(session: DesktopSession, rawItems: unknown): Promise<void> {
  if (session.batch.running) {
    postStatus(session, 'A batch run is already active.');
    return;
  }

  const items = normalizeBatchQueueItems(rawItems);
  if (items.length === 0) {
    postStatus(session, 'Batch queue is empty.');
    return;
  }

  session.batch.running = true;
  session.batch.cancelRequested = false;
  session.batch.activeRunId += 1;
  const runId = session.batch.activeRunId;

  let processed = 0;
  let completed = 0;
  let failed = 0;
  let canceled = false;
  let lastSuccessfulPath: string | undefined;

  try {
    postBatchProgress(session, {
      processed,
      total: items.length,
      completed,
      failed,
      running: true,
      message: `Running queue: 0/${items.length}`
    });

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];

      if (runId !== session.batch.activeRunId || session.batch.cancelRequested) {
        canceled = true;
        for (let pending = index; pending < items.length; pending += 1) {
          postBatchItemUpdate(session, {
            id: items[pending].id,
            filePath: items[pending].filePath,
            status: 'canceled',
            message: 'Canceled before processing.'
          });
        }
        break;
      }

      postBatchItemUpdate(session, {
        id: item.id,
        filePath: item.filePath,
        status: 'running',
        message: `Processing ${path.basename(item.filePath)}...`
      });

      try {
        const normalizedPath = path.resolve(item.filePath);
        if (!existsSync(normalizedPath)) {
          throw new Error(`File not found: ${normalizedPath}`);
        }
        if (!isSupportedDiskPath(normalizedPath)) {
          throw new Error(`Unsupported extension: ${path.extname(normalizedPath) || '(none)'}`);
        }

        const summary = await buildDiskSummaryFromPath(normalizedPath);
        completed += 1;
        lastSuccessfulPath = normalizedPath;
        postBatchItemUpdate(session, {
          id: item.id,
          filePath: normalizedPath,
          status: 'done',
          parserId: summary.parserId,
          sizeBytes: summary.sizeBytes,
          message: `Parsed ${summary.sizeBytes.toLocaleString()} bytes.`
        });
      } catch (error: unknown) {
        failed += 1;
        postBatchItemUpdate(session, {
          id: item.id,
          filePath: item.filePath,
          status: 'error',
          message: toErrorMessage(error)
        });
      }

      processed += 1;
      postBatchProgress(session, {
        processed,
        total: items.length,
        completed,
        failed,
        running: true,
        message: `Running queue: ${processed}/${items.length}`
      });
    }

    if (!canceled && !session.batch.cancelRequested && lastSuccessfulPath) {
      await openDisk(session, lastSuccessfulPath);
    }
  } finally {
    if (runId === session.batch.activeRunId) {
      session.batch.running = false;
      canceled = canceled || session.batch.cancelRequested;
      session.batch.cancelRequested = false;
    }

    postBatchProgress(session, {
      processed,
      total: items.length,
      completed,
      failed,
      running: false,
      message: canceled
        ? `Batch canceled (${processed}/${items.length} processed).`
        : `Batch complete (${completed} succeeded, ${failed} failed).`
    });
    postBatchComplete(session, {
      processed,
      total: items.length,
      completed,
      failed,
      canceled
    });
  }
}

function requestBatchStop(session: DesktopSession): void {
  if (!session.batch.running) {
    postStatus(session, 'No active batch run.');
    return;
  }
  session.batch.cancelRequested = true;
  postStatus(session, 'Stopping batch queue after current file...');
}

function pushSummaryAndInit(session: DesktopSession, forceInitialJump: boolean): void {
  if (!session.summary) {
    return;
  }

  const mode = chooseValidMode(session.summary, session.mode);
  session.mode = mode;

  postRendererMessage(session, {
    type: 'diskSummary',
    summary: session.summary
  });
  postRendererMessage(session, {
    type: 'hex.init',
    defaultMode: mode,
    fileSize: session.summary.sizeBytes,
    dataOffset: session.summary.dataOffsetBytes,
    sectorSize: session.summary.sectorSize
  });

  if (forceInitialJump || !session.selection) {
    const initialOffset = clampViewOffset(session, mode, 0);
    postJumpAck(session, mode, initialOffset);
    return;
  }

  const selection = session.selection;
  const start = clampViewOffset(session, selection.mode, selection.start);
  const end = clampViewOffset(session, selection.mode, selection.end);
  session.selection = normalizeSelection(selection.mode, start, end);
  session.cursorOffset = session.selection.start;
  postSelectAck(session, session.selection);
}

async function handleHexRead(
  session: DesktopSession,
  message: Record<string, unknown>
): Promise<void> {
  const requestId = typeof message.requestId === 'string' ? message.requestId : '';
  if (!requestId) {
    return;
  }

  const mode = normalizeMode(message.mode, session.mode);
  session.mode = mode;

  if (!session.summary || !session.reader) {
    postRendererMessage(session, {
      type: 'hex.data',
      requestId,
      mode,
      offset: 0,
      bytesBase64: ''
    });
    return;
  }

  const viewLength = getViewLength(session, mode);
  const requestedOffset = Number.isFinite(message.offset) ? Math.floor(Number(message.offset)) : 0;
  const requestedLength = Number.isFinite(message.length) ? Math.floor(Number(message.length)) : 0;
  const offset = clampInt(requestedOffset, 0, viewLength);
  const length = clampInt(requestedLength, 0, Math.max(0, viewLength - offset));
  const baseOffset = mode === 'disk' ? session.summary.dataOffsetBytes : 0;
  const absoluteOffset = baseOffset + offset;

  const bytes = await session.reader.readFileBytes(absoluteOffset, length);
  postRendererMessage(session, {
    type: 'hex.data',
    requestId,
    mode,
    offset,
    bytesBase64: Buffer.from(bytes).toString('base64')
  });
}

async function handleHexJump(
  session: DesktopSession,
  message: Record<string, unknown>
): Promise<void> {
  if (!session.summary) {
    postRendererMessage(session, {
      type: 'desktop.notice',
      message: 'Open a disk image before jumping.'
    });
    return;
  }

  const mode = normalizeMode(message.mode, session.mode);
  const requestedOffset = Number.isFinite(message.offset) ? Math.floor(Number(message.offset)) : 0;
  const offset = clampViewOffset(session, mode, requestedOffset);
  postJumpAck(session, mode, offset);
}

async function handleHexSelect(
  session: DesktopSession,
  message: Record<string, unknown>
): Promise<void> {
  if (!session.summary) {
    return;
  }

  const mode = normalizeMode(message.mode, session.mode);
  const start = clampViewOffset(
    session,
    mode,
    Number.isFinite(message.start) ? Math.floor(Number(message.start)) : 0
  );
  const end = clampViewOffset(
    session,
    mode,
    Number.isFinite(message.end) ? Math.floor(Number(message.end)) : 0
  );
  const selection = normalizeSelection(mode, start, end);

  session.mode = mode;
  session.selection = selection;
  session.cursorOffset = selection.start;
  postSelectAck(session, selection);
}

async function handleHexExtract(
  session: DesktopSession,
  message: Record<string, unknown>
): Promise<void> {
  if (!session.summary) {
    postRendererMessage(session, {
      type: 'desktop.notice',
      message: 'Open a disk image before extracting bytes.'
    });
    return;
  }

  const mode = normalizeMode(message.mode, session.mode);
  const start = clampViewOffset(
    session,
    mode,
    Number.isFinite(message.start) ? Math.floor(Number(message.start)) : 0
  );
  const end = clampViewOffset(
    session,
    mode,
    Number.isFinite(message.end) ? Math.floor(Number(message.end)) : 0
  );
  const selection = normalizeSelection(mode, start, end);
  await extractRangeToFile(session, selection.mode, selection.start, selection.end);
}

async function jumpToLba(session: DesktopSession, lba: number): Promise<void> {
  if (!session.summary) {
    postRendererMessage(session, {
      type: 'desktop.notice',
      message: 'Open a disk image before jumping to LBA.'
    });
    return;
  }

  const nonNegativeLba = Math.max(0, lba);
  const sectorSize = session.summary.sectorSize || 512;
  const offset = nonNegativeLba * sectorSize;
  const clampedOffset = clampViewOffset(session, 'disk', offset);
  postJumpAck(session, 'disk', clampedOffset);
}

async function copyOffset(session: DesktopSession): Promise<void> {
  const selection = getSelection(session);
  if (!selection) {
    postRendererMessage(session, {
      type: 'desktop.notice',
      message: 'No byte selection to copy.'
    });
    return;
  }

  const copied = `0x${selection.start.toString(16).toUpperCase()}`;
  clipboard.writeText(copied);
  postRendererMessage(session, {
    type: 'desktop.notice',
    message: `Copied offset: ${copied}`
  });
}

async function copyLba(session: DesktopSession): Promise<void> {
  if (!session.summary) {
    return;
  }

  const selection = getSelection(session);
  if (!selection) {
    postRendererMessage(session, {
      type: 'desktop.notice',
      message: 'No byte selection to copy.'
    });
    return;
  }

  const diskOffset = toDiskOffset(session, selection.mode, selection.start);
  if (diskOffset === undefined) {
    postRendererMessage(session, {
      type: 'desktop.notice',
      message: 'Selection is before disk data offset. LBA is not available.'
    });
    return;
  }

  const sectorSize = session.summary.sectorSize || 512;
  const lba = Math.floor(diskOffset / sectorSize);
  clipboard.writeText(String(lba));
  postRendererMessage(session, {
    type: 'desktop.notice',
    message: `Copied LBA: ${lba.toLocaleString()}`
  });
}

function postJumpAck(session: DesktopSession, mode: HexMode, offset: number): void {
  const clamped = clampViewOffset(session, mode, offset);
  session.mode = mode;
  session.selection = normalizeSelection(mode, clamped, clamped);
  session.cursorOffset = clamped;

  postRendererMessage(session, {
    type: 'hex.jumpAck',
    mode,
    offset: clamped
  });
  postSelectAck(session, session.selection);
}

function postSelectAck(session: DesktopSession, selection: HexSelection): void {
  postRendererMessage(session, {
    type: 'hex.selectAck',
    mode: selection.mode,
    start: selection.start,
    end: selection.end
  });
}

function postError(session: DesktopSession, message: string): void {
  postRendererMessage(session, { type: 'error', message });
  postStatus(session, `Error: ${message}`, { busy: false });
}

function postStatus(
  session: DesktopSession,
  message: string,
  options: { busy?: boolean; current?: number; total?: number } = {}
): void {
  postRendererMessage(session, {
    type: 'desktop.notice',
    message
  });
  postRendererMessage(session, {
    type: 'desktop.status',
    message,
    busy: options.busy === true,
    current: Number.isFinite(options.current) ? options.current : undefined,
    total: Number.isFinite(options.total) ? options.total : undefined
  });
}

function postBatchItemUpdate(
  session: DesktopSession,
  payload: {
    id: string;
    filePath: string;
    status: BatchItemStatus;
    message?: string;
    parserId?: string;
    sizeBytes?: number;
  }
): void {
  postRendererMessage(session, {
    type: 'desktop.batchItemUpdate',
    ...payload
  });
}

function postBatchProgress(
  session: DesktopSession,
  payload: {
    processed: number;
    total: number;
    completed: number;
    failed: number;
    running: boolean;
    message: string;
  }
): void {
  postRendererMessage(session, {
    type: 'desktop.batchProgress',
    ...payload
  });
  postStatus(session, payload.message, {
    busy: payload.running,
    current: payload.total > 0 ? payload.processed : undefined,
    total: payload.total > 0 ? payload.total : undefined
  });
}

function postBatchComplete(
  session: DesktopSession,
  payload: {
    processed: number;
    total: number;
    completed: number;
    failed: number;
    canceled: boolean;
  }
): void {
  postRendererMessage(session, {
    type: 'desktop.batchComplete',
    ...payload
  });
}

async function extractRangeToFile(
  session: DesktopSession,
  mode: HexMode,
  start: number,
  end: number
): Promise<void> {
  if (!session.summary || !session.reader || !session.filePath) {
    return;
  }

  const selection = normalizeSelection(mode, start, end);
  const baseOffset = selection.mode === 'disk' ? session.summary.dataOffsetBytes : 0;
  const absoluteStart = baseOffset + selection.start;
  const length = selection.end - selection.start + 1;
  if (length <= 0) {
    return;
  }

  const sourceBaseName = path.parse(session.filePath).name || 'disk-image';
  const rangeName = `${selection.start.toString(16).toUpperCase()}-${selection.end
    .toString(16)
    .toUpperCase()}`;
  const defaultPath = path.join(
    path.dirname(session.filePath),
    `${sourceBaseName}.${selection.mode}.${rangeName}.bin`
  );

  const window = BrowserWindow.fromId(session.windowId) ?? undefined;
  const targetPath = window
    ? await dialog.showSaveDialog(window, {
        title: 'PC-98: Extract Selected Bytes',
        defaultPath,
        buttonLabel: 'Extract',
        filters: [
          { name: 'Binary', extensions: ['bin'] },
          { name: 'All files', extensions: ['*'] }
        ]
      })
    : await dialog.showSaveDialog({
        title: 'PC-98: Extract Selected Bytes',
        defaultPath,
        buttonLabel: 'Extract',
        filters: [
          { name: 'Binary', extensions: ['bin'] },
          { name: 'All files', extensions: ['*'] }
        ]
      });
  if (targetPath.canceled || !targetPath.filePath) {
    return;
  }

  const bytes = await session.reader.readFileBytes(absoluteStart, length);
  await fs.writeFile(targetPath.filePath, bytes);

  postRendererMessage(session, {
    type: 'desktop.notice',
    message: `Extracted ${bytes.length.toLocaleString()} bytes to ${path.basename(targetPath.filePath)}.`
  });
}

function postRendererMessage(session: DesktopSession, message: unknown): void {
  if (!session.rendererReady) {
    return;
  }

  const window = BrowserWindow.fromId(session.windowId);
  if (!window || window.isDestroyed()) {
    return;
  }

  window.webContents.send('desktop:hostMessage', message);
}

function setWindowTitle(session: DesktopSession, fileName?: string): void {
  const window = BrowserWindow.fromId(session.windowId);
  if (!window || window.isDestroyed()) {
    return;
  }

  const title = fileName ? `${APP_DESKTOP_NAME} - ${fileName}` : APP_DESKTOP_NAME;
  window.setTitle(title);
}

function getViewLength(session: DesktopSession, mode: HexMode): number {
  if (!session.summary) {
    return 0;
  }
  if (mode === 'disk') {
    return Math.max(0, session.summary.sizeBytes - session.summary.dataOffsetBytes);
  }
  return session.summary.sizeBytes;
}

function clampViewOffset(session: DesktopSession, mode: HexMode, offset: number): number {
  const viewLength = getViewLength(session, mode);
  if (viewLength <= 0) {
    return 0;
  }
  return clampInt(offset, 0, viewLength - 1);
}

function toDiskOffset(session: DesktopSession, mode: HexMode, offset: number): number | undefined {
  if (!session.summary) {
    return undefined;
  }
  if (mode === 'disk') {
    return offset;
  }
  const diskOffset = offset - session.summary.dataOffsetBytes;
  return diskOffset >= 0 ? diskOffset : undefined;
}

function chooseValidMode(summary: DiskSummary, requestedMode: HexMode): HexMode {
  if (requestedMode === 'disk') {
    const diskLength = Math.max(0, summary.sizeBytes - summary.dataOffsetBytes);
    if (diskLength <= 0 && summary.sizeBytes > 0) {
      return 'raw';
    }
    return 'disk';
  }
  return 'raw';
}

function normalizeSelection(mode: HexMode, start: number, end: number): HexSelection {
  return start <= end ? { mode, start, end } : { mode, start: end, end: start };
}

function normalizeMode(value: unknown, fallback: HexMode): HexMode {
  return value === 'raw' || value === 'disk' ? value : fallback;
}

function getSelection(session: DesktopSession): HexSelection | undefined {
  if (session.selection) {
    return session.selection;
  }
  if (session.cursorOffset === undefined) {
    return undefined;
  }
  return normalizeSelection(session.mode, session.cursorOffset, session.cursorOffset);
}

function clampInt(value: number, minValue: number, maxValue: number): number {
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}

function disposeSession(windowId: number): void {
  const session = sessionsByWindowId.get(windowId);
  if (!session) {
    return;
  }
  disposeReader(session);
  sessionsByWindowId.delete(windowId);
}

function disposeReader(session: DesktopSession): void {
  session.reader?.dispose();
  session.reader = undefined;
}

function normalizeBatchQueueItems(rawItems: unknown): BatchQueueItemPayload[] {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  const normalized: BatchQueueItemPayload[] = [];
  const seen = new Set<string>();
  for (const candidate of rawItems) {
    if (!isRecord(candidate)) {
      continue;
    }

    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const rawPath = typeof candidate.filePath === 'string' ? candidate.filePath.trim() : '';
    if (!id || !rawPath) {
      continue;
    }

    const resolvedPath = path.resolve(rawPath);
    const dedupeKey = `${id}::${resolvedPath.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    normalized.push({
      id,
      filePath: resolvedPath
    });
  }
  return normalized;
}

async function collectSupportedDisksFromFolder(folderPath: string): Promise<string[]> {
  const normalized = path.resolve(folderPath);
  if (!existsSync(normalized)) {
    return [];
  }

  const entries = await fs.readdir(normalized, { withFileTypes: true });
  const filePaths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(normalized, entry.name))
    .filter((candidate) => isSupportedDiskPath(candidate))
    .sort((a, b) => a.localeCompare(b));

  return filePaths;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getLaunchDiskPath(): string | undefined {
  const args = process.argv.slice(app.isPackaged ? 1 : 2);
  for (const arg of args) {
    if (!arg || arg.startsWith('-')) {
      continue;
    }

    const resolved = path.resolve(arg);
    if (isSupportedDiskPath(resolved) && existsSync(resolved)) {
      return resolved;
    }
  }
  return undefined;
}

function getDialogOwnerWindow(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);
  if (!ownerWindow || ownerWindow.isDestroyed()) {
    return undefined;
  }
  return ownerWindow;
}

function showOpenDialogForEvent(
  event: IpcMainInvokeEvent,
  options: OpenDialogOptions
): Promise<OpenDialogReturnValue> {
  const ownerWindow = getDialogOwnerWindow(event);
  if (ownerWindow) {
    return dialog.showOpenDialog(ownerWindow, options);
  }
  return dialog.showOpenDialog(options);
}

function showSaveDialogForEvent(
  event: IpcMainInvokeEvent,
  options: SaveDialogOptions
): Promise<SaveDialogReturnValue> {
  const ownerWindow = getDialogOwnerWindow(event);
  if (ownerWindow) {
    return dialog.showSaveDialog(ownerWindow, options);
  }
  return dialog.showSaveDialog(options);
}
