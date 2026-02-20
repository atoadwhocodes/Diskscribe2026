import { app, BrowserWindow, clipboard, dialog, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import type { DiskSummary } from '../../../src/core/diskSummary';
import { buildDiskSummaryFromPath, isSupportedDiskPath } from '../../../src/core/diskSummary';
import { PagedFileByteReader } from '../../../src/core/hex/pagedFileByteReader';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

type HexMode = 'disk' | 'raw';

interface HexSelection {
  mode: HexMode;
  start: number;
  end: number;
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
}

const HEX_SETTINGS = {
  pageBytes: 65536,
  maxCachedPages: 32,
  defaultMode: 'disk' as HexMode
};

const sessionsByWindowId = new Map<number, DesktopSession>();

if (require('electron-squirrel-startup')) {
  app.quit();
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 980,
    minHeight: 720,
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
    cursorOffset: undefined
  };
  sessionsByWindowId.set(mainWindow.id, session);

  mainWindow.on('closed', () => {
    disposeSession(mainWindow.id);
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
    title: 'Open PC-98 Disk Image',
    properties: ['openFile'],
    filters: [
      {
        name: 'PC-98 Disk Images',
        extensions: ['hdi', 'nhd', 'd88']
      }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return undefined;
  }
  return result.filePaths[0];
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
    case 'hex.read':
      await handleHexRead(session, rawMessage);
      return;
    case 'hex.jump':
      await handleHexJump(session, rawMessage);
      return;
    case 'hex.select':
      await handleHexSelect(session, rawMessage);
      return;
    default:
      return;
  }
}

async function handleRendererReady(session: DesktopSession): Promise<void> {
  session.rendererReady = true;

  if (!session.summary || !session.filePath) {
    postRendererMessage(session, {
      type: 'desktop.notice',
      message: 'Open a .hdi, .nhd, or .d88 disk image to begin.'
    });
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
    postError(session, 'Unsupported extension. Use .hdi, .nhd, or .d88.');
    return;
  }

  try {
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
    pushSummaryAndInit(session, true);
    postRendererMessage(session, {
      type: 'desktop.notice',
      message: `Loaded ${path.basename(normalizedPath)} (${summary.sizeBytes.toLocaleString()} bytes).`
    });
  } catch (error: unknown) {
    postError(session, toErrorMessage(error));
  }
}

async function refreshSession(session: DesktopSession): Promise<void> {
  if (!session.filePath) {
    postRendererMessage(session, {
      type: 'desktop.notice',
      message: 'No disk is open yet.'
    });
    return;
  }
  await openDisk(session, session.filePath);
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
  postRendererMessage(session, {
    type: 'desktop.notice',
    message: `Error: ${message}`
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
