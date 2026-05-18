import { app, BrowserWindow, clipboard, dialog, ipcMain } from 'electron';
import * as iconv from 'iconv-lite';
import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_DESKTOP_NAME, APP_NAME, APP_VENDOR } from './appMeta';
import type { DiskSummary } from './core/diskSummary';
import { buildDiskSummaryFromPath, formatSummaryAsText, isSupportedDiskPath } from './core/diskSummary';
import { extractFatFileBytes } from './core/fatExtract';
import { buildFatClusterChain, getClusterOffsetBytes, getClusterSizeBytes } from './core/fat';
import { PagedFileByteReader } from './core/hex/pagedFileByteReader';
import { extractSegaCdIsoFileBytes, extractStandaloneIsoFileBytes } from './core/segaCd';
import {
  applyCleanPatchEntry,
  encodePatchTextForPatch,
  enrichCleanPatchScriptForExport,
  normalizeCleanPatchScript
} from './core/translationPatchApply';
import {
  APP_BATCH_PLAN_VERSION,
  DISK_IMAGE_FILTERS,
  HEX_SETTINGS
} from './mainProcessConfig';
import type {
  BatchItemStatus,
  BatchQueueItemPayload,
  DesktopSession,
  HexMode,
  HexSelection
} from './mainProcessTypes';
import {
  buildTranslationProject,
  makeTranslationEntryId,
  normalizeTranslationEntries,
  type TranslationEntry,
  type TranslationPatchEntry,
  type TranslationPatchReport,
  type TranslationPatchReportEntry,
  type TranslationProjectDisk,
  type TranslationProjectManifest
} from './webview/translationProject';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

const sessionsByWindowId = new Map<number, DesktopSession>();

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
  const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const result = await dialog.showOpenDialog(ownerWindow, {
    title: 'Open Disk Image',
    properties: ['openFile'],
    filters: DISK_IMAGE_FILTERS
  });

  if (result.canceled || result.filePaths.length === 0) {
    return undefined;
  }
  return result.filePaths[0];
});

ipcMain.handle('desktop:openDisksDialog', async (event): Promise<string[]> => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const result = await dialog.showOpenDialog(ownerWindow, {
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
  const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const result = await dialog.showOpenDialog(ownerWindow, {
    title: 'Add Folder to Batch Queue',
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }
  return collectSupportedDisksFromFolder(result.filePaths[0]);
});

ipcMain.handle('desktop:saveBatchPlan', async (event, rawEntries: unknown) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const entries = normalizeBatchQueueItems(rawEntries);
  const saveResult = await dialog.showSaveDialog(ownerWindow, {
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
  const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const loadResult = await dialog.showOpenDialog(ownerWindow, {
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

ipcMain.handle('desktop:saveTranslationProject', async (event, project: unknown) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  return saveJsonFromRenderer(ownerWindow, {
    title: 'Save Translation Project',
    defaultPath: 'diskscribe2026-translation-project.json',
    buttonLabel: 'Save',
    payload: project
  });
});

ipcMain.handle('desktop:loadTranslationProject', async (event) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const loadResult = await dialog.showOpenDialog(ownerWindow, {
    title: 'Load Translation Project',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (loadResult.canceled || loadResult.filePaths.length === 0) {
    return {};
  }

  const filePath = loadResult.filePaths[0];
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return { filePath, project: JSON.parse(text) };
  } catch (error: unknown) {
    return { filePath, error: toErrorMessage(error) };
  }
});

ipcMain.handle('desktop:exportTranslationPatch', async (event, script: unknown) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  return saveJsonFromRenderer(ownerWindow, {
    title: 'Export Clean Translation Patch',
    defaultPath: 'diskscribe2026-clean-translation-patch.json',
    buttonLabel: 'Export',
    payload: enrichCleanPatchScriptForExport(script) || script
  });
});

ipcMain.handle('desktop:applyCleanTranslationPatch', async (event) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  try {
    return await applyCleanTranslationPatch(ownerWindow);
  } catch (error: unknown) {
    return { saved: false, error: toErrorMessage(error) };
  }
});

ipcMain.handle('desktop:discoverTranslationProject', async (_event, rawFilePaths: unknown) => {
  try {
    const filePaths = normalizeDiskFilePaths(rawFilePaths);
    if (filePaths.length === 0) {
      return { error: 'No supported disk images selected.' };
    }
    const project = await discoverTranslationProject(filePaths);
    return { project };
  } catch (error: unknown) {
    return { error: toErrorMessage(error) };
  }
});

ipcMain.handle('desktop:patchTranslationProject', async (event, rawProject: unknown) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  try {
    return await patchTranslationProject(rawProject, ownerWindow);
  } catch (error: unknown) {
    return { saved: false, error: toErrorMessage(error) };
  }
});

ipcMain.handle('desktop:previewTranslationPatch', async (_event, rawEntry: unknown) => {
  try {
    return buildPatchPreview(rawEntry);
  } catch (error: unknown) {
    return { error: toErrorMessage(error) };
  }
});

ipcMain.handle('desktop:analyzeTranslationProject', async (_event, rawProject: unknown) => {
  try {
    return analyzeTranslationProject(rawProject);
  } catch (error: unknown) {
    return { error: toErrorMessage(error) };
  }
});

ipcMain.handle('desktop:exportDiagnostics', async (event) => {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender);
  const session = ownerWindow ? sessionsByWindowId.get(ownerWindow.id) : undefined;
  if (!ownerWindow || !session) {
    return { saved: false, error: 'No active DiskScribe window.' };
  }
  return exportDiagnosticsBundle(session, ownerWindow);
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
    case 'desktop.exportDiagnostics':
      await exportDiagnosticsBundle(session);
      return;
    case 'desktop.extractFile':
      await handleExtractFile(session, rawMessage.entry);
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
    postStatus(session, 'Open a supported legacy image (.hdi, .nhd, .d88, .hdm, .hdd, .fdi, .fdd, .cue, or .iso) to begin.');
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
    postError(session, 'Unsupported extension. Supported types: .hdi, .nhd, .d88, .hdm, .hdd, .fdi, .fdd, .cue, .iso.');
    return;
  }

  try {
    postStatus(session, `Loading ${path.basename(normalizedPath)}...`, { busy: true });
    const summary = await buildDiskSummaryFromPath(normalizedPath);

    disposeReader(session);
    session.filePath = normalizedPath;
    session.summary = summary;
    session.mode = chooseValidMode(summary, HEX_SETTINGS.defaultMode);
    session.reader = new PagedFileByteReader(summary.readPath || normalizedPath, summary.sizeBytes, {
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
  const targetPath = await dialog.showSaveDialog(window, {
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

async function handleExtractFile(session: DesktopSession, rawEntry: unknown): Promise<void> {
  if (!session.summary || !session.filePath) {
    postStatus(session, 'Open a disk image before extracting files.');
    return;
  }
  if (!isRecord(rawEntry)) {
    postStatus(session, 'Select a file entry before extracting.');
    return;
  }

  const entryPath = typeof rawEntry.path === 'string' ? rawEntry.path : '';
  const filesystemOffsetBytes = numberOrUndefined(rawEntry.filesystemOffsetBytes);
  const selected = session.summary.rootDirectoryEntries.find(
    (entry) =>
      entry.path === entryPath &&
      entry.filesystemOffsetBytes === filesystemOffsetBytes &&
      !entry.isDirectory &&
      !entry.isDeleted
  );
  if (!selected) {
    postStatus(session, 'Selected file entry is no longer available.');
    return;
  }

  const defaultPath = path.join(path.dirname(session.filePath), sanitizeFileName(selected.name || 'extracted.bin'));
  const window = BrowserWindow.fromId(session.windowId) ?? undefined;
  const targetPath = await dialog.showSaveDialog(window, {
    title: selected.source === 'ISO9660' ? 'Extract ISO9660 File' : 'Extract FAT File',
    defaultPath,
    buttonLabel: 'Extract',
    filters: [
      { name: 'All files', extensions: ['*'] },
      { name: 'Binary', extensions: ['bin'] }
    ]
  });
  if (targetPath.canceled || !targetPath.filePath) {
    return;
  }

  try {
    postStatus(session, `Extracting ${selected.path}...`, { busy: true });
    const bytes =
      selected.source === 'ISO9660'
        ? await extractIsoFileBytes(session.filePath, selected)
        : await extractSelectedFatFileBytes(session, selected);
    await fs.writeFile(targetPath.filePath, bytes);
    postStatus(
      session,
      `Extracted ${selected.path} (${bytes.length.toLocaleString()} bytes) to ${path.basename(targetPath.filePath)}.`,
      { busy: false }
    );
  } catch (error: unknown) {
    postError(session, `Failed to extract ${selected.path}: ${toErrorMessage(error)}`);
  }
}

async function extractIsoFileBytes(
  sourcePath: string,
  selected: DiskSummary['rootDirectoryEntries'][number]
): Promise<Uint8Array> {
  const extension = path.extname(sourcePath).toLowerCase();
  if (extension === '.iso') {
    return extractStandaloneIsoFileBytes(sourcePath, selected);
  }
  return extractSegaCdIsoFileBytes(sourcePath, selected);
}

async function extractSelectedFatFileBytes(
  session: DesktopSession,
  selected: DiskSummary['rootDirectoryEntries'][number]
): Promise<Uint8Array> {
  if (!session.summary || !session.filePath) {
    throw new Error('No disk image is open.');
  }
  const filesystem = session.summary.filesystems.find(
    (candidate) => candidate.offsetBytes === selected.filesystemOffsetBytes
  );
  if (!filesystem) {
    throw new Error('No filesystem metadata found for selected file.');
  }
  return extractFatFileBytes(session.filePath, filesystem, selected);
}

async function exportDiagnosticsBundle(
  session: DesktopSession,
  ownerWindow: BrowserWindow | undefined = BrowserWindow.fromId(session.windowId) ?? undefined
): Promise<{ saved: boolean; filePath?: string; error?: string }> {
  if (!session.summary || !session.filePath) {
    const message = 'Open a disk image before exporting diagnostics.';
    postStatus(session, message);
    return { saved: false, error: message };
  }

  const sourceBaseName = path.parse(session.filePath).name || 'disk-image';
  const defaultPath = path.join(path.dirname(session.filePath), `${sourceBaseName}.diagnostics.json`);
  const saveResult = await dialog.showSaveDialog(ownerWindow, {
    title: 'Export Diagnostics Bundle',
    defaultPath,
    buttonLabel: 'Export',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (saveResult.canceled || !saveResult.filePath) {
    return { saved: false };
  }

  try {
    const payload = {
      appName: APP_NAME,
      appDesktopName: APP_DESKTOP_NAME,
      appVersion: app.getVersion(),
      exportedAt: new Date().toISOString(),
      sourcePath: session.filePath,
      summary: session.summary,
      reportText: formatSummaryAsText(session.summary)
    };
    await fs.writeFile(saveResult.filePath, JSON.stringify(payload, null, 2), 'utf8');
    postStatus(session, `Exported diagnostics to ${path.basename(saveResult.filePath)}.`);
    return { saved: true, filePath: saveResult.filePath };
  } catch (error: unknown) {
    const message = toErrorMessage(error);
    postError(session, `Failed to export diagnostics: ${message}`);
    return { saved: false, filePath: saveResult.filePath, error: message };
  }
}

async function saveJsonFromRenderer(
  ownerWindow: BrowserWindow | undefined,
  options: {
    title: string;
    defaultPath: string;
    buttonLabel: string;
    payload: unknown;
  }
): Promise<{ saved: boolean; filePath?: string; error?: string }> {
  const saveResult = await dialog.showSaveDialog(ownerWindow, {
    title: options.title,
    defaultPath: options.defaultPath,
    buttonLabel: options.buttonLabel,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (saveResult.canceled || !saveResult.filePath) {
    return { saved: false };
  }

  try {
    await fs.writeFile(saveResult.filePath, JSON.stringify(options.payload, null, 2), 'utf8');
    return { saved: true, filePath: saveResult.filePath };
  } catch (error: unknown) {
    return { saved: false, filePath: saveResult.filePath, error: toErrorMessage(error) };
  }
}

async function discoverTranslationProject(filePaths: string[]): Promise<unknown> {
  const disks: TranslationProjectDisk[] = [];
  const entries: TranslationEntry[] = [];
  const seenText = new Set<string>();
  let duplicateCount = 0;
  const discoveredAt = new Date().toISOString();
  const sourceFolder = commonParentFolder(filePaths);

  for (const filePath of filePaths) {
    const stat = await fs.stat(filePath);
    const summary = await buildDiskSummaryFromPath(filePath);
    disks.push({
      path: filePath,
      name: path.basename(filePath),
      sizeBytes: stat.size,
      format: summary.format,
      sectorSize: summary.sectorSize,
      geometry: summary.geometry,
      rawAnalysis: summary.rawAnalysis
        ? {
            analyzedBytes: summary.rawAnalysis.analyzedBytes,
            totalSectors: summary.rawAnalysis.totalSectors,
            asciiRunCount: summary.rawAnalysis.asciiRunCount,
            shiftJisRunCount: summary.rawAnalysis.shiftJisRunCount,
            textLikeSectorCount: summary.rawAnalysis.textLikeSectorCount,
            densestTextSectors: summary.rawAnalysis.densestTextSectors
          }
        : undefined
    });

    const bytes = await fs.readFile(filePath);
    const candidates = await discoverStringCandidates(bytes, filePath, summary, discoveredAt);
    for (const entry of candidates) {
      const dedupeKey = `${entry.encoding}::${entry.sourceText}`;
      if (seenText.has(dedupeKey)) {
        duplicateCount += 1;
        continue;
      }
      seenText.add(dedupeKey);
      entries.push(entry);
    }
  }

  const manifest: TranslationProjectManifest = {
    sourceFolder,
    disks,
    discoveredAt,
    discovery: {
      minLength: 4,
      candidateCount: entries.length,
      duplicateCount
    }
  };

  return buildTranslationProject('DiskScribe2026', sourceFolder, path.basename(sourceFolder), entries, discoveredAt, manifest);
}

async function discoverStringCandidates(
  bytes: Uint8Array,
  filePath: string,
  summary: DiskSummary,
  discoveredAt: string
): Promise<TranslationEntry[]> {
  const entries: TranslationEntry[] = [];
  const fatEntries = await discoverFatFileCandidates(filePath, summary, discoveredAt);
  entries.push(...fatEntries);
  if (fatEntries.length === 0) {
    entries.push(...discoverAsciiCandidates(bytes, filePath, discoveredAt, summary));
    entries.push(...discoverShiftJisCandidates(bytes, filePath, discoveredAt, summary));
  }
  return assignBankIds(entries);
}

function discoverAsciiCandidates(
  bytes: Uint8Array,
  filePath: string,
  discoveredAt: string,
  summary?: DiskSummary
): TranslationEntry[] {
  const entries: TranslationEntry[] = [];
  let runStart = -1;
  let hasHalfWidthKana = false;

  for (let index = 0; index <= bytes.length; index += 1) {
    const byte = index < bytes.length ? bytes[index] : 0;
    const printable = isStringCandidateByte(byte);
    if (printable && runStart < 0) {
      runStart = index;
      hasHalfWidthKana = false;
    }
    if (printable && byte >= 0xa1 && byte <= 0xdf) {
      hasHalfWidthKana = true;
    }
    if ((!printable || index === bytes.length) && runStart >= 0) {
      const runEnd = index - 1;
      const length = runEnd - runStart + 1;
      if (length >= 4) {
        const runBytes = bytes.subarray(runStart, runEnd + 1);
        const sourceText = decodeCandidateRun(runBytes);
        if (sourceText.trim().length >= 4) {
          const scored = scoreCandidate(sourceText, path.basename(filePath), hasHalfWidthKana ? 'pc98-cp932' : 'ascii');
          if (scored.score < 18) {
            runStart = -1;
            hasHalfWidthKana = false;
            continue;
          }
          entries.push({
            id: makeTranslationEntryId('raw', runStart, runEnd, filePath),
            sourcePath: filePath,
            mode: 'raw',
            start: runStart,
            end: runEnd,
            encoding: hasHalfWidthKana ? 'pc98-cp932' : 'ascii',
            sourceText,
            translatedText: '',
            status: 'raw',
            notes: `Discovered project-wide; ${describeRawRange(runStart, runEnd, summary)}; ${scored.reason}`,
            category: scored.category,
            priority: scored.priority,
            score: scored.score,
            batch: scored.category,
            sourceBytesBase64: Buffer.from(runBytes).toString('base64'),
            sourceFilePath: describeRawRange(runStart, runEnd, summary),
            updatedAt: discoveredAt
          });
        }
      }
      runStart = -1;
      hasHalfWidthKana = false;
    }
  }

  return entries;
}

async function discoverFatFileCandidates(
  filePath: string,
  summary: DiskSummary,
  discoveredAt: string
): Promise<TranslationEntry[]> {
  const entries: TranslationEntry[] = [];
  const files = summary.rootDirectoryEntries.filter(
    (entry) => !entry.isDirectory && !entry.isDeleted && entry.sizeBytes > 0 && entry.startCluster >= 2
  );
  for (const file of files) {
    const filesystem = summary.filesystems.find((candidate) => candidate.offsetBytes === file.filesystemOffsetBytes);
    if (!filesystem) {
      continue;
    }
    try {
      const fileBytes = await extractFatFileBytes(filePath, filesystem, file);
      const segments = await getFatFileDiskSegments(filePath, filesystem, file);
      const context = `${path.basename(filePath)}:${file.path}`;
      const candidates = [
        ...discoverAsciiCandidatesInBuffer(fileBytes, filePath, discoveredAt, context),
        ...discoverShiftJisCandidatesInBuffer(fileBytes, filePath, discoveredAt, context)
      ];
      for (const candidate of candidates) {
        const diskRange = mapFileRangeToDiskRange(segments, candidate.start, candidate.end);
        if (!diskRange) {
          continue;
        }
        candidate.id = makeTranslationEntryId('raw', diskRange.start, diskRange.end, filePath);
        candidate.start = diskRange.start;
        candidate.end = diskRange.end;
        candidate.sourceFilePath = file.path;
        candidate.notes = `${candidate.notes} Source file: ${file.path}.`;
        entries.push(candidate);
      }
    } catch {
      continue;
    }
  }
  return entries;
}

function discoverAsciiCandidatesInBuffer(
  bytes: Uint8Array,
  filePath: string,
  discoveredAt: string,
  contextName: string
): TranslationEntry[] {
  return discoverAsciiCandidates(bytes, filePath, discoveredAt).map((entry) => {
    const scored = scoreCandidate(entry.sourceText, contextName, entry.encoding);
    return {
      ...entry,
      category: scored.category,
      priority: scored.priority,
      score: scored.score,
      batch: scored.category,
      notes: `Discovered from FAT file; ${scored.reason}`
    };
  });
}

function discoverShiftJisCandidates(
  bytes: Uint8Array,
  filePath: string,
  discoveredAt: string,
  summary?: DiskSummary
): TranslationEntry[] {
  const entries: TranslationEntry[] = [];
  let index = 0;
  while (index < bytes.length) {
    const start = index;
    const tokens: number[] = [];
    let japaneseUnits = 0;
    while (index < bytes.length) {
      const byte = bytes[index];
      if (isAsciiPrintable(byte) || isHalfWidthKana(byte)) {
        tokens.push(byte);
        japaneseUnits += isHalfWidthKana(byte) ? 1 : 0;
        index += 1;
        continue;
      }
      if (isShiftJisLead(byte) && index + 1 < bytes.length && isShiftJisTrail(bytes[index + 1])) {
        tokens.push(byte, bytes[index + 1]);
        japaneseUnits += 1;
        index += 2;
        continue;
      }
      break;
    }

    const end = index - 1;
    if (tokens.length >= 6 && japaneseUnits >= 2) {
      const sourceText = iconv.decode(Buffer.from(tokens), 'shift_jis').replace(/\0/g, '').trim();
      const scored = scoreCandidate(sourceText, path.basename(filePath), 'pc98-cp932');
      if (sourceText.length >= 3 && scored.score >= 28) {
        entries.push({
          id: makeTranslationEntryId('raw', start, end, filePath),
          sourcePath: filePath,
          mode: 'raw',
          start,
          end,
          encoding: 'pc98-cp932',
          sourceText,
          translatedText: '',
          status: 'raw',
          notes: `Discovered project-wide by Shift-JIS scanner; ${describeRawRange(start, end, summary)}; ${scored.reason}`,
          category: scored.category,
          priority: scored.priority,
          score: scored.score,
          batch: scored.category,
          sourceBytesBase64: Buffer.from(tokens).toString('base64'),
          sourceFilePath: describeRawRange(start, end, summary),
          updatedAt: discoveredAt
        });
      }
    }

    index = Math.max(index + 1, start + 1);
  }
  return entries;
}

function discoverShiftJisCandidatesInBuffer(
  bytes: Uint8Array,
  filePath: string,
  discoveredAt: string,
  contextName: string
): TranslationEntry[] {
  return discoverShiftJisCandidates(bytes, filePath, discoveredAt).map((entry) => {
    const scored = scoreCandidate(entry.sourceText, contextName, entry.encoding);
    return {
      ...entry,
      category: scored.category,
      priority: scored.priority,
      score: scored.score,
      batch: scored.category,
      notes: `Discovered from FAT file by Shift-JIS scanner; ${scored.reason}`
    };
  });
}

function assignBankIds(entries: TranslationEntry[]): TranslationEntry[] {
  const sorted = [...entries].sort((left, right) => {
    const sourceCompare = left.sourcePath.localeCompare(right.sourcePath);
    return sourceCompare !== 0 ? sourceCompare : left.start - right.start;
  });
  const counters = new Map<string, number>();
  let previous: TranslationEntry | undefined;
  let currentBank = '';

  for (const entry of sorted) {
    const category = entry.category || 'leftovers';
    const sameBank =
      previous &&
      previous.sourcePath === entry.sourcePath &&
      previous.category === entry.category &&
      entry.start - previous.end <= 512;
    if (!sameBank) {
      const key = `${entry.sourcePath}::${category}`;
      const next = (counters.get(key) || 0) + 1;
      counters.set(key, next);
      currentBank = `${category}-${next.toString().padStart(4, '0')}`;
    }
    entry.bankId = currentBank;
    if (!entry.batch) {
      entry.batch = currentBank;
    }
    previous = entry;
  }
  return sorted;
}

function describeRawRange(start: number, end: number, summary?: DiskSummary): string {
  if (!summary || !summary.sectorSize) {
    return `raw offset 0x${start.toString(16)}-0x${end.toString(16)}`;
  }

  const startSector = Math.floor(start / summary.sectorSize);
  const endSector = Math.floor(end / summary.sectorSize);
  const sectorLabel =
    startSector === endSector
      ? `raw sector ${startSector.toLocaleString()}`
      : `raw sectors ${startSector.toLocaleString()}-${endSector.toLocaleString()}`;
  const chs = formatChs(startSector, summary.geometry);
  return `${sectorLabel}${chs ? ` (${chs})` : ''}, offset 0x${start.toString(16)}-0x${end.toString(16)}`;
}

function formatChs(
  sector: number,
  geometry?: DiskSummary['geometry']
): string {
  if (!geometry || geometry.heads <= 0 || geometry.sectorsPerTrack <= 0 || sector < 0) {
    return '';
  }
  const sectorsPerCylinder = geometry.heads * geometry.sectorsPerTrack;
  const cylinder = Math.floor(sector / sectorsPerCylinder);
  const withinCylinder = sector % sectorsPerCylinder;
  const head = Math.floor(withinCylinder / geometry.sectorsPerTrack);
  const sectorNumber = (withinCylinder % geometry.sectorsPerTrack) + 1;
  return `C/H/S ${cylinder}/${head}/${sectorNumber}`;
}

async function patchTranslationProject(
  rawProject: unknown,
  ownerWindow: BrowserWindow | undefined
): Promise<{ saved: boolean; outputFolder?: string; report?: TranslationPatchReport; error?: string }> {
  if (!isRecord(rawProject)) {
    return { saved: false, error: 'No translation project loaded.' };
  }

  const entries = normalizeTranslationEntries(rawProject.entries);
  const patchableStatuses = new Set(['reviewed', 'final']);
  const sourceEntries = entries.filter((entry) => patchableStatuses.has(entry.status));
  if (sourceEntries.length === 0) {
    return { saved: false, error: 'No reviewed or final translation entries are ready to patch.' };
  }

  const outputResult = await dialog.showOpenDialog(ownerWindow, {
    title: 'Choose Patch Output Folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (outputResult.canceled || outputResult.filePaths.length === 0) {
    return { saved: false };
  }

  const outputFolder = outputResult.filePaths[0];
  await fs.mkdir(outputFolder, { recursive: true });

  const sourceToOutput = new Map<string, string>();
  const reportEntries: TranslationPatchReportEntry[] = [];
  for (const sourcePath of uniqueSourcePaths(sourceEntries)) {
    if (!existsSync(sourcePath)) {
      continue;
    }
    const outputPath = uniqueOutputPath(outputFolder, path.basename(sourcePath), sourceToOutput.size);
    await fs.copyFile(sourcePath, outputPath);
    sourceToOutput.set(sourcePath, outputPath);
  }

  for (const entry of sourceEntries) {
    const outputPath = sourceToOutput.get(sourcePathFromEntry(entry));
    if (!outputPath) {
      reportEntries.push(toPatchReportEntry(entry, 'skipped', undefined, 'Source disk image was not found.'));
      continue;
    }

    const encoded = encodePatchTextForPatch(entry.translatedText, entry.encoding);
    const byteLength = entry.end - entry.start + 1;
    if (!encoded.bytes) {
      reportEntries.push(toPatchReportEntry(entry, 'skipped', outputPath, encoded.reason || 'Unsupported encoding.'));
      continue;
    }
    if (encoded.bytes.length > byteLength) {
      reportEntries.push(toPatchReportEntry(entry, 'skipped', outputPath, 'Translation does not fit in original range.'));
      continue;
    }

    const handle = await fs.open(outputPath, 'r+');
    try {
      const current = Buffer.alloc(byteLength);
      await handle.read(current, 0, byteLength, entry.start);
      if (entry.sourceBytesBase64) {
        const expected = Buffer.from(entry.sourceBytesBase64, 'base64');
        if (expected.length <= byteLength && !bufferStartsWith(current, expected)) {
          reportEntries.push(toPatchReportEntry(entry, 'skipped', outputPath, 'Source bytes no longer match entry text.'));
          continue;
        }
      } else if (entry.encoding === 'ascii') {
        const expected = encodePatchTextForPatch(entry.sourceText, entry.encoding).bytes;
        if (expected && expected.length <= byteLength && !bufferStartsWith(current, Buffer.from(expected))) {
          reportEntries.push(toPatchReportEntry(entry, 'skipped', outputPath, 'Source text no longer matches entry text.'));
          continue;
        }
      }

      const replacement = Buffer.alloc(byteLength, 0x20);
      Buffer.from(encoded.bytes).copy(replacement, 0, 0, encoded.bytes.length);
      await handle.write(replacement, 0, replacement.length, entry.start);
      const verifyBuffer = Buffer.alloc(byteLength);
      await handle.read(verifyBuffer, 0, byteLength, entry.start);
      reportEntries.push({
        ...toPatchReportEntry(entry, 'applied', outputPath),
        verified: verifyBuffer.equals(replacement)
      });
    } finally {
      await handle.close();
    }
  }

  const appliedCount = reportEntries.filter((entry) => entry.status === 'applied').length;
  const skippedCount = reportEntries.length - appliedCount;
  const verifiedCount = reportEntries.filter((entry) => entry.verified === true).length;
  const report: TranslationPatchReport = {
    appName: 'DiskScribe2026',
    patchVersion: 1,
    sourceName: typeof rawProject.sourceName === 'string' ? rawProject.sourceName : 'translation-project',
    outputFolder,
    createdAt: new Date().toISOString(),
    appliedCount,
    skippedCount,
    verifiedCount,
    entries: reportEntries
  };
  await fs.writeFile(path.join(outputFolder, 'patch-report.json'), JSON.stringify(report, null, 2), 'utf8');
  return { saved: true, outputFolder, report };
}

async function applyCleanTranslationPatch(
  ownerWindow: BrowserWindow | undefined
): Promise<{ saved: boolean; outputFolder?: string; report?: TranslationPatchReport; error?: string }> {
  const patchResult = await dialog.showOpenDialog(ownerWindow, {
    title: 'Open Clean Translation Patch',
    properties: ['openFile'],
    filters: [{ name: 'Clean Translation Patch', extensions: ['json'] }]
  });
  if (patchResult.canceled || patchResult.filePaths.length === 0) {
    return { saved: false };
  }

  const patchPath = patchResult.filePaths[0];
  const patchText = await fs.readFile(patchPath, 'utf8');
  const patchScript = normalizeCleanPatchScript(JSON.parse(patchText));
  if (!patchScript) {
    return { saved: false, error: 'Selected JSON is not a DiskScribe2026 clean translation patch.' };
  }

  const patchableEntries = patchScript.entries.filter((entry) => entry.patchable);
  if (patchableEntries.length === 0) {
    return { saved: false, error: 'Clean patch does not contain any patchable entries.' };
  }

  const sourceResult = await dialog.showOpenDialog(ownerWindow, {
    title: 'Choose Source Image(s) Owned by User',
    properties: ['openFile', 'multiSelections'],
    filters: DISK_IMAGE_FILTERS
  });
  if (sourceResult.canceled || sourceResult.filePaths.length === 0) {
    return { saved: false };
  }

  const outputResult = await dialog.showOpenDialog(ownerWindow, {
    title: 'Choose Patched Output Folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (outputResult.canceled || outputResult.filePaths.length === 0) {
    return { saved: false };
  }

  const outputFolder = outputResult.filePaths[0];
  await fs.mkdir(outputFolder, { recursive: true });

  const sourceFilesByName = new Map<string, string>();
  for (const sourcePath of sourceResult.filePaths) {
    sourceFilesByName.set(path.basename(sourcePath).toLowerCase(), sourcePath);
  }

  const sourceToOutput = new Map<string, string>();
  const reportEntries: TranslationPatchReportEntry[] = [];
  for (const entry of patchableEntries) {
    const sourcePath = sourceFilesByName.get(path.basename(entry.sourcePath).toLowerCase());
    if (!sourcePath) {
      reportEntries.push(toCleanPatchReportEntry(entry, 'skipped', undefined, 'Matching source image was not selected.'));
      continue;
    }

    let outputPath = sourceToOutput.get(sourcePath);
    if (!outputPath) {
      outputPath = uniqueOutputPath(outputFolder, path.basename(sourcePath), sourceToOutput.size);
      await fs.copyFile(sourcePath, outputPath);
      sourceToOutput.set(sourcePath, outputPath);
    }

    const result = await applyCleanPatchEntry(outputPath, entry);
    reportEntries.push(toCleanPatchReportEntry(entry, result.status, outputPath, result.reason, result.verified));
  }

  const appliedCount = reportEntries.filter((entry) => entry.status === 'applied').length;
  const skippedCount = reportEntries.length - appliedCount;
  const verifiedCount = reportEntries.filter((entry) => entry.verified === true).length;
  const report: TranslationPatchReport = {
    appName: 'DiskScribe2026',
    patchVersion: patchScript.patchVersion,
    sourceName: patchScript.sourceName,
    outputFolder,
    createdAt: new Date().toISOString(),
    appliedCount,
    skippedCount,
    verifiedCount,
    entries: reportEntries
  };
  await fs.writeFile(path.join(outputFolder, 'patch-report.json'), JSON.stringify(report, null, 2), 'utf8');
  return { saved: true, outputFolder, report };
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

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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

function normalizeDiskFilePaths(rawItems: unknown): string[] {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const item of rawItems) {
    if (typeof item !== 'string') {
      continue;
    }
    const resolved = path.resolve(item);
    const key = resolved.toLowerCase();
    if (!seen.has(key) && existsSync(resolved) && isSupportedDiskPath(resolved)) {
      seen.add(key);
      normalized.push(resolved);
    }
  }
  return normalized.sort((a, b) => a.localeCompare(b));
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

function isStringCandidateByte(byte: number): boolean {
  return (byte >= 0x20 && byte <= 0x7e) || (byte >= 0xa1 && byte <= 0xdf);
}

function isAsciiPrintable(byte: number): boolean {
  return byte >= 0x20 && byte <= 0x7e;
}

function isHalfWidthKana(byte: number): boolean {
  return byte >= 0xa1 && byte <= 0xdf;
}

function isShiftJisLead(byte: number): boolean {
  return (byte >= 0x81 && byte <= 0x9f) || (byte >= 0xe0 && byte <= 0xfc);
}

function isShiftJisTrail(byte: number): boolean {
  return (byte >= 0x40 && byte <= 0x7e) || (byte >= 0x80 && byte <= 0xfc);
}

function decodeCandidateRun(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => {
    if (byte >= 0x20 && byte <= 0x7e) {
      return String.fromCharCode(byte);
    }
    if (byte >= 0xa1 && byte <= 0xdf) {
      return `\\x${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
    return '';
  }).join('');
}

function scoreCandidate(
  sourceText: string,
  diskName: string,
  encoding: string
): { score: number; priority: 'high' | 'medium' | 'low'; category: string; reason: string } {
  const text = sourceText.trim();
  const lowerDisk = diskName.toLowerCase();
  let score = 0;
  let category = 'leftovers';

  const japaneseChars = Array.from(text).filter((char) => /[\u3040-\u30ff\u3400-\u9fff]/u.test(char)).length;
  const asciiLetters = Array.from(text).filter((char) => /[A-Za-z]/.test(char)).length;
  const controls = Array.from(text).filter((char) => char.charCodeAt(0) < 0x20).length;
  const symbolRatio = text.length > 0 ? Array.from(text).filter((char) => /[^\w\s\u3040-\u30ff\u3400-\u9fff]/u.test(char)).length / text.length : 1;

  if (japaneseChars > 0) {
    score += 40 + Math.min(30, japaneseChars * 3);
    category = 'main-dialogue';
  }
  if (encoding === 'pc98-cp932') {
    score += 8;
  }
  if (asciiLetters >= 3) {
    score += 12;
  }
  if (text.length >= 4 && text.length <= 48) {
    score += 12;
  } else if (text.length > 96) {
    score -= 18;
  }
  if (controls > 0) {
    score -= 30;
  }
  if (symbolRatio > 0.45) {
    score -= 25;
  }

  if (/system|data/.test(lowerDisk) && /^[A-Z0-9_ .:/+-]+$/.test(text)) {
    score += 20;
    category = 'menus-items-battle';
  } else if (/opening/.test(lowerDisk)) {
    score += 10;
    category = 'opening-system';
  } else if (/ending|visual/.test(lowerDisk)) {
    score += 8;
    category = 'ending-visual';
  }

  const priority = score >= 55 ? 'high' : score >= 32 ? 'medium' : 'low';
  return {
    score,
    priority,
    category,
    reason: `${priority} priority ${category} candidate, score ${score}`
  };
}

function commonParentFolder(filePaths: string[]): string {
  if (filePaths.length === 0) {
    return process.cwd();
  }
  const directories = filePaths.map((filePath) => path.dirname(filePath));
  let common = directories[0];
  for (const directory of directories.slice(1)) {
    while (common && !directory.toLowerCase().startsWith(common.toLowerCase())) {
      const parent = path.dirname(common);
      if (parent === common) {
        return common;
      }
      common = parent;
    }
  }
  return common;
}

function uniqueSourcePaths(entries: TranslationEntry[]): string[] {
  const paths = new Map<string, string>();
  for (const entry of entries) {
    const sourcePath = sourcePathFromEntry(entry);
    if (sourcePath) {
      paths.set(sourcePath.toLowerCase(), sourcePath);
    }
  }
  return [...paths.values()].sort((a, b) => a.localeCompare(b));
}

async function getFatFileDiskSegments(
  filePath: string,
  filesystem: DiskSummary['filesystems'][number],
  file: DiskSummary['rootDirectoryEntries'][number]
): Promise<Array<{ fileStart: number; fileEnd: number; diskStart: number; diskEnd: number }>> {
  const fatOffset = filesystem.offsetBytes + filesystem.firstFatLba * filesystem.bytesPerSector;
  const fatLength = filesystem.sectorsPerFat * filesystem.bytesPerSector;
  const fatBytes = await readFileRange(filePath, fatOffset, fatLength);
  const clusterSize = getClusterSizeBytes(filesystem);
  const maxClusters = Math.ceil(file.sizeBytes / clusterSize);
  const chain = buildFatClusterChain(fatBytes, filesystem, file.startCluster, maxClusters);
  const segments: Array<{ fileStart: number; fileEnd: number; diskStart: number; diskEnd: number }> = [];
  let fileStart = 0;
  for (const cluster of chain) {
    if (fileStart >= file.sizeBytes) {
      break;
    }
    const length = Math.min(clusterSize, file.sizeBytes - fileStart);
    const diskStart = getClusterOffsetBytes(filesystem, cluster);
    segments.push({
      fileStart,
      fileEnd: fileStart + length - 1,
      diskStart,
      diskEnd: diskStart + length - 1
    });
    fileStart += length;
  }
  return segments;
}

function mapFileRangeToDiskRange(
  segments: Array<{ fileStart: number; fileEnd: number; diskStart: number; diskEnd: number }>,
  start: number,
  end: number
): { start: number; end: number } | undefined {
  const segment = segments.find((candidate) => start >= candidate.fileStart && end <= candidate.fileEnd);
  if (!segment) {
    return undefined;
  }
  const relativeStart = start - segment.fileStart;
  const relativeEnd = end - segment.fileStart;
  return {
    start: segment.diskStart + relativeStart,
    end: segment.diskStart + relativeEnd
  };
}

async function readFileRange(filePath: string, offset: number, length: number): Promise<Uint8Array> {
  if (length <= 0) {
    return new Uint8Array();
  }
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    return new Uint8Array(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

function sourcePathFromEntry(entry: TranslationEntry): string {
  const raw = entry.sourcePath || '';
  if (raw.startsWith('file:')) {
    try {
      return path.resolve(fileURLToPath(raw));
    } catch {
      return '';
    }
  }
  return raw ? path.resolve(raw) : '';
}

function uniqueOutputPath(outputFolder: string, fileName: string, index: number): string {
  const candidate = path.join(outputFolder, sanitizeFileName(fileName));
  if (!existsSync(candidate)) {
    return candidate;
  }
  const parsed = path.parse(fileName);
  return path.join(outputFolder, `${sanitizeFileName(parsed.name)}-${index + 1}${parsed.ext}`);
}

function toPatchReportEntry(
  entry: TranslationEntry,
  status: 'applied' | 'skipped',
  outputPath?: string,
  reason?: string
): TranslationPatchReportEntry {
  return {
    id: entry.id,
    sourcePath: entry.sourcePath,
    outputPath,
    start: entry.start,
    end: entry.end,
    status,
    reason
  };
}

function toCleanPatchReportEntry(
  entry: TranslationPatchEntry,
  status: 'applied' | 'skipped',
  outputPath?: string,
  reason?: string,
  verified?: boolean
): TranslationPatchReportEntry {
  return {
    id: entry.id,
    sourcePath: entry.sourcePath,
    outputPath,
    start: entry.start,
    end: entry.end,
    status,
    verified,
    reason
  };
}

function bufferStartsWith(buffer: Buffer, expected: Buffer): boolean {
  if (expected.length > buffer.length) {
    return false;
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (buffer[index] !== expected[index]) {
      return false;
    }
  }
  return true;
}

function buildPatchPreview(rawEntry: unknown): {
  byteLength?: number;
  encodedLength?: number;
  fits?: boolean;
  sourceHex?: string;
  replacementHex?: string;
  paddedHex?: string;
  error?: string;
} {
  const [entry] = normalizeTranslationEntries([rawEntry]);
  if (!entry) {
    return { error: 'No translation entry selected.' };
  }
  const byteLength = entry.end - entry.start + 1;
  const encoded = encodePatchTextForPatch(entry.translatedText, entry.encoding);
  if (!encoded.bytes) {
    return { byteLength, error: encoded.reason || 'Unable to encode translation.' };
  }
  const replacement = Buffer.from(encoded.bytes);
  const padded = Buffer.alloc(byteLength, 0x20);
  replacement.copy(padded, 0, 0, Math.min(replacement.length, padded.length));
  const source = entry.sourceBytesBase64 ? Buffer.from(entry.sourceBytesBase64, 'base64') : Buffer.alloc(0);
  return {
    byteLength,
    encodedLength: replacement.length,
    fits: replacement.length <= byteLength,
    sourceHex: formatHexPreview(source, 64),
    replacementHex: formatHexPreview(replacement, 64),
    paddedHex: formatHexPreview(padded, 64)
  };
}

function analyzeTranslationProject(rawProject: unknown): { project?: unknown; report?: unknown; error?: string } {
  if (!isRecord(rawProject)) {
    return { error: 'No translation project loaded.' };
  }
  const entries = normalizeTranslationEntries(rawProject.entries);
  const glossaryConflicts = buildGlossaryConflictSet(entries);
  let high = 0;
  let medium = 0;
  let low = 0;
  let human = 0;
  let tooLong = 0;
  let patchable = 0;

  const analyzed = entries.map((entry) => {
    const byteLength = entry.end - entry.start + 1;
    const encoded = entry.translatedText ? encodePatchTextForPatch(entry.translatedText, entry.encoding) : {};
    const encodedLength = encoded.bytes?.length ?? 0;
    const fits = encoded.bytes ? encodedLength <= byteLength : false;
    const sourceQuality = entry.sourceQuality || inferSourceQuality(entry);
    const glossaryKey = entry.glossaryKey || inferGlossaryKey(entry.sourceText);
    const needsHumanReview =
      sourceQuality === 'source-suspect' ||
      glossaryConflicts.has(entry.sourceText.trim()) ||
      !fits && Boolean(entry.translatedText) ||
      Number(entry.score || 0) < 32 ||
      /[\uFFFD]/u.test(entry.sourceText);
    const confidence = inferConfidence(entry, sourceQuality, fits, glossaryConflicts.has(entry.sourceText.trim()));
    if (confidence === 'high') high += 1;
    if (confidence === 'medium') medium += 1;
    if (confidence === 'low') low += 1;
    if (needsHumanReview) human += 1;
    if (entry.translatedText && !fits) tooLong += 1;
    if (entry.translatedText && fits && ['reviewed', 'final'].includes(entry.status)) patchable += 1;
    return {
      ...entry,
      sourceQuality,
      glossaryKey,
      confidence,
      needsHumanReview: needsHumanReview || undefined,
      playtestStatus: entry.playtestStatus || 'untested',
      notes: appendUniqueNote(
        entry.notes,
        `QA: ${confidence} confidence, ${encodedLength}/${byteLength} bytes${fits ? '' : ', too long'}`
      )
    };
  });

  const project = buildTranslationProject(
    'DiskScribe2026',
    typeof rawProject.sourcePath === 'string' ? rawProject.sourcePath : '',
    typeof rawProject.sourceName === 'string' ? rawProject.sourceName : 'translation-project',
    analyzed,
    new Date().toISOString(),
    isTranslationProjectManifest(rawProject.manifest) ? rawProject.manifest : undefined
  );
  return {
    project,
    report: {
      reportType: 'automation-qa-report',
      createdAt: new Date().toISOString(),
      totals: {
        entries: analyzed.length,
        highConfidence: high,
        mediumConfidence: medium,
        lowConfidence: low,
        needsHumanReview: human,
        tooLong,
        patchable
      },
      glossaryConflicts: [...glossaryConflicts]
    }
  };
}

function inferSourceQuality(entry: TranslationEntry): 'source-good' | 'source-suspect' | 'source-garbage' {
  const score = Number(entry.score || 0);
  if (score < 18 || entry.priority === 'low') {
    return 'source-suspect';
  }
  if (
    Array.from(entry.sourceText).every((char) => {
      const code = char.charCodeAt(0);
      return code < 0x20 || code === 0x7f;
    }) ||
    entry.sourceText.trim().length === 0
  ) {
    return 'source-garbage';
  }
  return 'source-good';
}

function inferConfidence(
  entry: TranslationEntry,
  sourceQuality: string,
  fits: boolean,
  glossaryConflict: boolean
): 'high' | 'medium' | 'low' {
  if (sourceQuality === 'source-garbage' || glossaryConflict) {
    return 'low';
  }
  if (entry.status === 'final' && fits && sourceQuality === 'source-good') {
    return 'high';
  }
  if ((entry.status === 'reviewed' || entry.translatedText) && fits && sourceQuality !== 'source-suspect') {
    return 'medium';
  }
  return 'low';
}

function inferGlossaryKey(sourceText: string): string | undefined {
  const trimmed = sourceText.trim();
  if (trimmed.length > 0 && trimmed.length <= 32) {
    return trimmed;
  }
  return undefined;
}

function buildGlossaryConflictSet(entries: TranslationEntry[]): Set<string> {
  const bySource = new Map<string, Set<string>>();
  for (const entry of entries) {
    const source = entry.sourceText.trim();
    const translated = entry.translatedText.trim();
    if (!source || !translated || source.length > 64) {
      continue;
    }
    const values = bySource.get(source) ?? new Set<string>();
    values.add(translated);
    bySource.set(source, values);
  }
  return new Set([...bySource.entries()].filter(([, values]) => values.size > 1).map(([source]) => source));
}

function appendUniqueNote(notes: string, note: string): string {
  if (notes.includes(note)) {
    return notes;
  }
  return notes ? `${notes} ${note}` : note;
}

function formatHexPreview(bytes: Buffer, limit: number): string {
  return Array.from(bytes.subarray(0, limit), (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
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

function isTranslationProjectManifest(value: unknown): value is TranslationProjectManifest {
  if (!isRecord(value) || !Array.isArray(value.disks) || !isRecord(value.discovery)) {
    return false;
  }
  return (
    typeof value.sourceFolder === 'string' &&
    typeof value.discoveredAt === 'string' &&
    typeof value.discovery.minLength === 'number' &&
    typeof value.discovery.candidateCount === 'number' &&
    typeof value.discovery.duplicateCount === 'number'
  );
}

function sanitizeFileName(value: string): string {
  const sanitized = Array.from(value, (char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || '<>:"/\\|?*'.includes(char) ? '_' : char;
  })
    .join('')
    .trim();
  return sanitized || 'extracted.bin';
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
