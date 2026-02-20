import * as path from 'node:path';
import * as vscode from 'vscode';
import { buildDiskSummary, formatSummaryAsText, isSupportedDiskFile, type DiskSummary } from './diskSummary';
import { PagedByteReader } from './hex/byteReader';

const CUSTOM_EDITOR_VIEW_TYPE = 'pc98.dskedit';
const VIRTUAL_DOCUMENT_SCHEME = 'pc98disk';
const HEX_CONFIG_SECTION = 'diskscribe2026.hex';

type HexMode = 'disk' | 'raw';

interface HexSettings {
  pageBytes: number;
  maxCachedPages: number;
  defaultMode: HexMode;
}

interface HexSelection {
  mode: HexMode;
  start: number;
  end: number;
}

interface HexSession {
  panel: vscode.WebviewPanel;
  uri: vscode.Uri;
  summary: DiskSummary;
  reader: PagedByteReader;
  mode: HexMode;
  selection: HexSelection | undefined;
  cursorOffset: number | undefined;
}

interface HexReadMessage {
  type: 'hex.read';
  requestId: string;
  mode: HexMode;
  offset: number;
  length: number;
}

interface HexJumpMessage {
  type: 'hex.jump';
  mode: HexMode;
  offset: number;
}

interface HexSelectMessage {
  type: 'hex.select';
  mode: HexMode;
  start: number;
  end: number;
}

interface RefreshMessage {
  type: 'refresh';
}

type IncomingMessage = HexReadMessage | HexJumpMessage | HexSelectMessage | RefreshMessage;

export function activate(context: vscode.ExtensionContext): void {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 95);
  statusBarItem.name = 'DiskScribe2026 Hex Status';
  statusBarItem.text = 'DiskScribe2026: no selection';
  statusBarItem.tooltip = 'Open a .hdi/.nhd/.d88 file in DiskScribe2026.';
  statusBarItem.show();

  const editorProvider = new Pc98DiskEditorProvider(context, statusBarItem);
  const virtualProvider = new Pc98VirtualDocumentProvider();

  context.subscriptions.push(
    statusBarItem,
    editorProvider,
    virtualProvider,
    vscode.window.registerCustomEditorProvider(CUSTOM_EDITOR_VIEW_TYPE, editorProvider, {
      supportsMultipleEditorsPerDocument: false,
      webviewOptions: {
        retainContextWhenHidden: true
      }
    }),
    vscode.workspace.registerTextDocumentContentProvider(VIRTUAL_DOCUMENT_SCHEME, virtualProvider),
    vscode.commands.registerCommand('pc98.jumpToPartition', async () => {
      await runJumpToLba(editorProvider);
    }),
    vscode.commands.registerCommand('pc98.jumpToLba', async () => {
      await runJumpToLba(editorProvider);
    }),
    vscode.commands.registerCommand('pc98.jumpToOffset', async () => {
      const defaultMode = editorProvider.getActiveMode() ?? getHexSettings().defaultMode;
      const resolved = await resolveJumpOffset(defaultMode);
      if (!resolved) {
        return;
      }

      const didJump = await editorProvider.jumpToOffset(resolved.mode, resolved.offset);
      if (!didJump) {
        void vscode.window.showInformationMessage(
          'Open a .hdi/.nhd/.d88 file in DiskScribe2026 first.'
        );
      }
    }),
    vscode.commands.registerCommand('pc98.copyOffset', async () => {
      const copied = await editorProvider.copyOffsetToClipboard();
      if (!copied) {
        void vscode.window.showInformationMessage('No byte selection to copy.');
      }
    }),
    vscode.commands.registerCommand('pc98.copyLba', async () => {
      const copied = await editorProvider.copyLbaToClipboard();
      if (!copied) {
        void vscode.window.showInformationMessage(
          'No disk-relative selection available for LBA copy.'
        );
      }
    }),
    vscode.commands.registerCommand('pc98.openVirtualDisk', async (resource?: vscode.Uri) => {
      const sourceUri = resolveSourceDiskUri(resource, editorProvider);
      if (!sourceUri) {
        void vscode.window.showWarningMessage(
          'Select or open a .hdi/.nhd/.d88 file before opening the virtual disk document.'
        );
        return;
      }

      const virtualUri = toVirtualDiskUri(sourceUri);
      const document = await vscode.workspace.openTextDocument(virtualUri);
      await vscode.window.showTextDocument(document, { preview: false });
      virtualProvider.refresh(virtualUri);
    })
  );
}

export function deactivate(): void {}

class Pc98DiskDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) {}

  dispose(): void {}
}

class Pc98DiskEditorProvider
  implements vscode.CustomReadonlyEditorProvider<Pc98DiskDocument>, vscode.Disposable
{
  private readonly sessionsByPanel = new Map<vscode.WebviewPanel, HexSession>();
  private lastActivePanel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly statusBarItem: vscode.StatusBarItem
  ) {}

  dispose(): void {
    for (const session of this.sessionsByPanel.values()) {
      session.reader.dispose();
    }
    this.sessionsByPanel.clear();
    this.lastActivePanel = undefined;
  }

  openCustomDocument(uri: vscode.Uri): Pc98DiskDocument {
    return new Pc98DiskDocument(uri);
  }

  async resolveCustomEditor(
    document: Pc98DiskDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
    };
    webviewPanel.webview.html = this.getWebviewHtml(webviewPanel.webview);

    const session = await this.createSession(webviewPanel, document.uri);
    this.sessionsByPanel.set(webviewPanel, session);
    this.lastActivePanel = webviewPanel;

    const onMessage = webviewPanel.webview.onDidReceiveMessage(async (message: unknown) => {
      await this.handleIncomingMessage(session, message);
    });

    const onViewState = webviewPanel.onDidChangeViewState((event) => {
      if (event.webviewPanel.active) {
        this.lastActivePanel = event.webviewPanel;
        this.updateStatusBar();
      }
    });

    const onDispose = webviewPanel.onDidDispose(() => {
      onMessage.dispose();
      onViewState.dispose();
      onDispose.dispose();
      this.disposeSession(webviewPanel);
      this.updateStatusBar();
    });

    await this.pushSummaryAndInit(session, true);
    this.updateStatusBar();
  }

  getActiveDocumentUri(): vscode.Uri | undefined {
    return this.getActiveSession()?.uri;
  }

  getActiveSummary(): DiskSummary | undefined {
    return this.getActiveSession()?.summary;
  }

  getActiveMode(): HexMode | undefined {
    return this.getActiveSession()?.mode;
  }

  async jumpToOffset(mode: HexMode, offset: number): Promise<boolean> {
    const session = this.getActiveSession();
    if (!session) {
      return false;
    }

    const clamped = this.clampViewOffset(session, mode, offset);
    await this.postJumpAck(session, mode, clamped);
    return true;
  }

  async jumpToLba(lba: number): Promise<boolean> {
    const session = this.getActiveSession();
    if (!session) {
      return false;
    }

    const sectorSize = session.summary.sectorSize || 512;
    const offset = Math.floor(lba) * sectorSize;
    const clamped = this.clampViewOffset(session, 'disk', offset);
    await this.postJumpAck(session, 'disk', clamped);
    return true;
  }

  async copyOffsetToClipboard(): Promise<boolean> {
    const session = this.getActiveSession();
    if (!session) {
      return false;
    }

    const selection = this.getSelectionForSession(session);
    if (!selection) {
      return false;
    }

    const copied = `0x${selection.start.toString(16).toUpperCase()}`;
    await vscode.env.clipboard.writeText(copied);
    void vscode.window.showInformationMessage(`Copied offset: ${copied}`);
    return true;
  }

  async copyLbaToClipboard(): Promise<boolean> {
    const session = this.getActiveSession();
    if (!session) {
      return false;
    }

    const selection = this.getSelectionForSession(session);
    if (!selection) {
      return false;
    }

    const diskOffset = this.toDiskOffset(session, selection.mode, selection.start);
    if (diskOffset === undefined) {
      return false;
    }

    const sectorSize = session.summary.sectorSize || 512;
    const lba = Math.floor(diskOffset / sectorSize);
    if (lba < 0) {
      return false;
    }

    await vscode.env.clipboard.writeText(String(lba));
    void vscode.window.showInformationMessage(`Copied LBA: ${lba.toLocaleString()}`);
    return true;
  }

  private async createSession(
    panel: vscode.WebviewPanel,
    uri: vscode.Uri
  ): Promise<HexSession> {
    const summary = await buildDiskSummary(uri);
    const settings = getHexSettings();

    return {
      panel,
      uri,
      summary,
      reader: new PagedByteReader(uri, summary.sizeBytes, {
        pageBytes: settings.pageBytes,
        maxCachedPages: settings.maxCachedPages
      }),
      mode: chooseValidMode(summary, settings.defaultMode),
      selection: undefined,
      cursorOffset: undefined
    };
  }

  private disposeSession(panel: vscode.WebviewPanel): void {
    const session = this.sessionsByPanel.get(panel);
    if (!session) {
      return;
    }

    session.reader.dispose();
    this.sessionsByPanel.delete(panel);
    if (this.lastActivePanel === panel) {
      this.lastActivePanel = undefined;
    }
  }

  private async reloadSession(session: HexSession): Promise<void> {
    const settings = getHexSettings();
    const nextSummary = await buildDiskSummary(session.uri);
    const nextMode = chooseValidMode(nextSummary, session.mode);
    const previousSelection = session.selection;
    const previousCursor = session.cursorOffset;

    session.reader.dispose();
    session.summary = nextSummary;
    session.mode = nextMode;
    session.reader = new PagedByteReader(session.uri, nextSummary.sizeBytes, {
      pageBytes: settings.pageBytes,
      maxCachedPages: settings.maxCachedPages
    });

    if (previousSelection) {
      const start = this.clampViewOffset(session, previousSelection.mode, previousSelection.start);
      const end = this.clampViewOffset(session, previousSelection.mode, previousSelection.end);
      session.selection = normalizeSelection(previousSelection.mode, start, end);
    } else {
      session.selection = undefined;
    }

    if (previousCursor !== undefined) {
      session.cursorOffset = this.clampViewOffset(session, session.mode, previousCursor);
    } else {
      session.cursorOffset = undefined;
    }

    await this.pushSummaryAndInit(session, false);
    this.updateStatusBar();
  }

  private async pushSummaryAndInit(session: HexSession, forceInitialJump: boolean): Promise<void> {
    const settings = getHexSettings();
    const mode = chooseValidMode(session.summary, session.mode || settings.defaultMode);
    session.mode = mode;

    await session.panel.webview.postMessage({
      type: 'diskSummary',
      summary: session.summary
    });
    await session.panel.webview.postMessage({
      type: 'hex.init',
      defaultMode: mode,
      fileSize: session.summary.sizeBytes,
      dataOffset: session.summary.dataOffsetBytes,
      sectorSize: session.summary.sectorSize
    });

    if (forceInitialJump || !session.selection) {
      const initialOffset = this.clampViewOffset(session, mode, 0);
      session.selection = normalizeSelection(mode, initialOffset, initialOffset);
      session.cursorOffset = initialOffset;
      await this.postJumpAck(session, mode, initialOffset);
      return;
    }

    const selection = session.selection;
    const normalizedStart = this.clampViewOffset(session, selection.mode, selection.start);
    const normalizedEnd = this.clampViewOffset(session, selection.mode, selection.end);
    session.selection = normalizeSelection(selection.mode, normalizedStart, normalizedEnd);
    session.cursorOffset = normalizedStart;
    await this.postSelectAck(session, session.selection);
  }

  private async handleIncomingMessage(session: HexSession, rawMessage: unknown): Promise<void> {
    const message = parseIncomingMessage(rawMessage);
    if (!message) {
      return;
    }

    switch (message.type) {
      case 'refresh':
        await this.reloadSession(session);
        break;
      case 'hex.read':
        await this.handleHexRead(session, message);
        break;
      case 'hex.jump':
        await this.handleHexJump(session, message);
        break;
      case 'hex.select':
        await this.handleHexSelect(session, message);
        break;
      default:
        break;
    }
  }

  private async handleHexRead(session: HexSession, message: HexReadMessage): Promise<void> {
    const mode = normalizeMode(message.mode, session.mode);
    session.mode = mode;

    const viewLength = this.getViewLength(session, mode);
    const offset = clampInt(message.offset, 0, viewLength);
    const length = clampInt(message.length, 0, Math.max(0, viewLength - offset));
    const baseOffset = mode === 'disk' ? session.summary.dataOffsetBytes : 0;
    const absoluteOffset = baseOffset + offset;

    const bytes = await session.reader.readFileBytes(absoluteOffset, length);
    await session.panel.webview.postMessage({
      type: 'hex.data',
      requestId: message.requestId,
      mode,
      offset,
      bytesBase64: Buffer.from(bytes).toString('base64')
    });
  }

  private async handleHexJump(session: HexSession, message: HexJumpMessage): Promise<void> {
    const mode = normalizeMode(message.mode, session.mode);
    const offset = this.clampViewOffset(session, mode, message.offset);
    await this.postJumpAck(session, mode, offset);
  }

  private async handleHexSelect(session: HexSession, message: HexSelectMessage): Promise<void> {
    const mode = normalizeMode(message.mode, session.mode);
    const start = this.clampViewOffset(session, mode, message.start);
    const end = this.clampViewOffset(session, mode, message.end);
    const selection = normalizeSelection(mode, start, end);

    session.mode = mode;
    session.selection = selection;
    session.cursorOffset = selection.start;
    await this.postSelectAck(session, selection);
    this.updateStatusBar();
  }

  private async postJumpAck(session: HexSession, mode: HexMode, offset: number): Promise<void> {
    const clamped = this.clampViewOffset(session, mode, offset);
    session.mode = mode;
    session.selection = normalizeSelection(mode, clamped, clamped);
    session.cursorOffset = clamped;

    await session.panel.webview.postMessage({
      type: 'hex.jumpAck',
      mode,
      offset: clamped
    });
    await this.postSelectAck(session, session.selection);
    this.updateStatusBar();
  }

  private async postSelectAck(session: HexSession, selection: HexSelection): Promise<void> {
    await session.panel.webview.postMessage({
      type: 'hex.selectAck',
      mode: selection.mode,
      start: selection.start,
      end: selection.end
    });
  }

  private getViewLength(session: HexSession, mode: HexMode): number {
    if (mode === 'disk') {
      return Math.max(0, session.summary.sizeBytes - session.summary.dataOffsetBytes);
    }
    return session.summary.sizeBytes;
  }

  private clampViewOffset(session: HexSession, mode: HexMode, offset: number): number {
    const viewLength = this.getViewLength(session, mode);
    if (viewLength <= 0) {
      return 0;
    }
    return clampInt(offset, 0, viewLength - 1);
  }

  private toDiskOffset(session: HexSession, mode: HexMode, offset: number): number | undefined {
    if (mode === 'disk') {
      return offset;
    }

    const diskOffset = offset - session.summary.dataOffsetBytes;
    if (diskOffset < 0) {
      return undefined;
    }
    return diskOffset;
  }

  private getSelectionForSession(session: HexSession): HexSelection | undefined {
    if (session.selection) {
      return session.selection;
    }
    if (session.cursorOffset === undefined) {
      return undefined;
    }
    return normalizeSelection(session.mode, session.cursorOffset, session.cursorOffset);
  }

  private getActivePanel(): vscode.WebviewPanel | undefined {
    for (const panel of this.sessionsByPanel.keys()) {
      if (panel.active) {
        return panel;
      }
    }

    if (this.lastActivePanel && this.sessionsByPanel.has(this.lastActivePanel)) {
      return this.lastActivePanel;
    }
    return undefined;
  }

  private getActiveSession(): HexSession | undefined {
    const panel = this.getActivePanel();
    return panel ? this.sessionsByPanel.get(panel) : undefined;
  }

  private updateStatusBar(): void {
    const session = this.getActiveSession();
    if (!session) {
      this.statusBarItem.text = 'DiskScribe2026: no selection';
      this.statusBarItem.tooltip = 'Open a .hdi/.nhd/.d88 file in DiskScribe2026.';
      this.statusBarItem.show();
      return;
    }

    const selection = this.getSelectionForSession(session);
    if (!selection) {
      this.statusBarItem.text = `DiskScribe2026 ${path.basename(session.uri.path)}: no selection`;
      this.statusBarItem.tooltip = 'Click a byte in hex view to select it.';
      this.statusBarItem.show();
      return;
    }

    const offset = selection.start;
    const offsetHex = `0x${offset.toString(16).toUpperCase()}`;
    const offsetDec = offset.toLocaleString();
    const diskOffset = this.toDiskOffset(session, selection.mode, offset);
    const sectorSize = session.summary.sectorSize || 512;

    let text = `${selection.mode} ${offsetHex} (${offsetDec})`;
    let tooltip = `File: ${path.basename(session.uri.path)}\n`;
    tooltip += `Mode: ${selection.mode}\n`;
    tooltip += `Selection: ${selection.start.toLocaleString()}-${selection.end.toLocaleString()}`;

    if (diskOffset !== undefined) {
      const lba = Math.floor(diskOffset / sectorSize);
      text += ` | LBA ${lba.toLocaleString()}`;
      tooltip += `\nLBA: ${lba.toLocaleString()}`;

      const chs = toChs(session.summary, lba);
      if (chs) {
        text += ` | CHS ${chs.c}/${chs.h}/${chs.s}`;
        tooltip += `\nCHS: ${chs.c}/${chs.h}/${chs.s}`;
      }
    } else {
      text += ' | LBA n/a';
      tooltip += '\nLBA: n/a (selection is before disk data offset)';
    }

    this.statusBarItem.text = text;
    this.statusBarItem.tooltip = tooltip;
    this.statusBarItem.show();
  }

  private getWebviewHtml(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.js')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src ${webview.cspSource};" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>DiskScribe2026</title>
</head>
<body>
  <header class="toolbar">
    <div class="toolbarMain">
      <div class="brand">
        <h1>DiskScribe2026</h1>
        <p>PC-98 Disk Hex Workbench</p>
      </div>
      <div class="toolbarButtons">
        <button id="jumpOffsetButton" type="button">Jump Offset</button>
        <button id="jumpLbaButton" type="button">Jump LBA</button>
        <button id="copyOffsetButton" type="button">Copy Offset</button>
        <button id="copyLbaButton" type="button">Copy LBA</button>
        <button id="refreshButton" type="button">Refresh</button>
      </div>
    </div>
    <p class="toolbarHint">Shift+Click extends selection. Ctrl/Cmd+G jumps to offset, Ctrl/Cmd+L jumps to LBA.</p>
  </header>

  <div id="status" class="status">Loading disk image...</div>

  <div class="workspace">
    <aside class="leftRail">
      <section class="panel">
        <h2>Disk Summary</h2>
        <table class="summaryTable">
          <tr><th>File</th><td id="fileName">-</td></tr>
          <tr><th>Format</th><td id="format">-</td></tr>
          <tr><th>Parser</th><td id="parserId">-</td></tr>
          <tr><th>Data Offset</th><td id="dataOffsetBytes">-</td></tr>
          <tr><th>Size</th><td id="sizeBytes">-</td></tr>
          <tr><th>Sector Size</th><td id="sectorSize">-</td></tr>
          <tr><th>Total Sectors</th><td id="totalSectors">-</td></tr>
          <tr><th>Geometry Guess</th><td id="geometry">-</td></tr>
        </table>
      </section>

      <section class="panel">
        <h2>Partitions</h2>
        <table class="summaryTable">
          <thead>
            <tr>
              <th>#</th>
              <th>Type</th>
              <th>Start LBA</th>
              <th>Sectors</th>
              <th>Start Offset</th>
            </tr>
          </thead>
          <tbody id="partitionRows">
            <tr><td colspan="5">No partition data loaded.</td></tr>
          </tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Shift-JIS Preview</h2>
        <pre id="shiftJisPreview">(waiting for data)</pre>
      </section>

      <section class="panel">
        <h2>Notes</h2>
        <pre id="notes">-</pre>
      </section>
    </aside>

    <main class="rightRail">
      <section class="panel panelHex">
        <h2>Hex View</h2>
        <div class="hexControls">
          <label for="hexModeSelect">Mode</label>
          <select id="hexModeSelect">
            <option value="disk">Disk (LBA 0 base)</option>
            <option value="raw">Raw (file offset base)</option>
          </select>
          <span id="hexRangeMeta">No range selected.</span>
        </div>
        <div id="hexScroller" class="hexScroller">
          <div id="hexSpacer"></div>
          <div id="hexRows"></div>
        </div>
      </section>

      <section class="panel">
        <h2>Selection</h2>
        <p id="jumpResult">Use quick controls above to jump or copy cursor context.</p>
      </section>
    </main>
  </div>

  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}

class Pc98VirtualDocumentProvider
  implements vscode.TextDocumentContentProvider, vscode.Disposable
{
  private readonly didChangeEmitter = new vscode.EventEmitter<vscode.Uri>();

  readonly onDidChange = this.didChangeEmitter.event;

  dispose(): void {
    this.didChangeEmitter.dispose();
  }

  refresh(uri: vscode.Uri): void {
    this.didChangeEmitter.fire(uri);
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const sourceUri = extractSourceUri(uri);
    if (!sourceUri) {
      return 'Unable to resolve source disk image URI from query parameter "source".';
    }

    try {
      const summary = await buildDiskSummary(sourceUri);
      return formatSummaryAsText(summary);
    } catch (error: unknown) {
      return `Failed to inspect disk image:\n${toErrorMessage(error)}`;
    }
  }
}

async function runJumpToLba(editorProvider: Pc98DiskEditorProvider): Promise<void> {
  const summary = editorProvider.getActiveSummary();
  const lba = await resolveJumpLba(summary);
  if (lba === undefined) {
    return;
  }

  const didJump = await editorProvider.jumpToLba(lba);
  if (!didJump) {
    void vscode.window.showInformationMessage('Open a .hdi/.nhd/.d88 file in DiskScribe2026 first.');
  }
}

function resolveSourceDiskUri(
  resource: vscode.Uri | undefined,
  editorProvider: Pc98DiskEditorProvider
): vscode.Uri | undefined {
  if (resource && isSupportedDiskFile(resource)) {
    return resource;
  }

  const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
  if (activeEditorUri && isSupportedDiskFile(activeEditorUri)) {
    return activeEditorUri;
  }

  const customEditorUri = editorProvider.getActiveDocumentUri();
  if (customEditorUri && isSupportedDiskFile(customEditorUri)) {
    return customEditorUri;
  }

  return undefined;
}

function toVirtualDiskUri(sourceUri: vscode.Uri): vscode.Uri {
  const source = encodeURIComponent(sourceUri.toString());
  const fileName = path.basename(sourceUri.path) || 'disk-image';

  return vscode.Uri.from({
    scheme: VIRTUAL_DOCUMENT_SCHEME,
    path: `/${fileName}.txt`,
    query: `source=${source}`
  });
}

function extractSourceUri(virtualUri: vscode.Uri): vscode.Uri | undefined {
  const params = new URLSearchParams(virtualUri.query);
  const encodedSource = params.get('source');
  if (!encodedSource) {
    return undefined;
  }

  try {
    return vscode.Uri.parse(decodeURIComponent(encodedSource));
  } catch {
    return undefined;
  }
}

function parseIncomingMessage(value: unknown): IncomingMessage | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return undefined;
  }

  if (value.type === 'refresh') {
    return { type: 'refresh' };
  }

  if (value.type === 'hex.read') {
    if (
      typeof value.requestId === 'string' &&
      isHexMode(value.mode) &&
      Number.isFinite(value.offset) &&
      Number.isFinite(value.length)
    ) {
      return {
        type: 'hex.read',
        requestId: value.requestId,
        mode: value.mode,
        offset: Math.floor(value.offset),
        length: Math.floor(value.length)
      };
    }
    return undefined;
  }

  if (value.type === 'hex.jump') {
    if (isHexMode(value.mode) && Number.isFinite(value.offset)) {
      return {
        type: 'hex.jump',
        mode: value.mode,
        offset: Math.floor(value.offset)
      };
    }
    return undefined;
  }

  if (value.type === 'hex.select') {
    if (
      isHexMode(value.mode) &&
      Number.isFinite(value.start) &&
      Number.isFinite(value.end)
    ) {
      return {
        type: 'hex.select',
        mode: value.mode,
        start: Math.floor(value.start),
        end: Math.floor(value.end)
      };
    }
    return undefined;
  }

  return undefined;
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

function normalizeMode(value: HexMode, fallback: HexMode): HexMode {
  return isHexMode(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

function isHexMode(value: unknown): value is HexMode {
  return value === 'disk' || value === 'raw';
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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function toChs(
  summary: DiskSummary,
  lba: number
): { c: number; h: number; s: number } | undefined {
  const geometry = summary.geometry;
  if (!geometry) {
    return undefined;
  }

  const sectorsPerCylinder = geometry.heads * geometry.sectorsPerTrack;
  if (sectorsPerCylinder <= 0 || lba < 0) {
    return undefined;
  }

  const c = Math.floor(lba / sectorsPerCylinder);
  const remainder = lba % sectorsPerCylinder;
  const h = Math.floor(remainder / geometry.sectorsPerTrack);
  const s = (remainder % geometry.sectorsPerTrack) + 1;
  return { c, h, s };
}

function getHexSettings(): HexSettings {
  const config = vscode.workspace.getConfiguration(HEX_CONFIG_SECTION);
  const pageBytes = config.get<number>('pageBytes', 65536);
  const maxCachedPages = config.get<number>('maxCachedPages', 32);
  const defaultMode = config.get<string>('defaultMode', 'disk');

  return {
    pageBytes: Number.isInteger(pageBytes) ? pageBytes : 65536,
    maxCachedPages: Number.isInteger(maxCachedPages) ? maxCachedPages : 32,
    defaultMode: defaultMode === 'raw' ? 'raw' : 'disk'
  };
}

async function resolveJumpLba(summary: DiskSummary | undefined): Promise<number | undefined> {
  if (summary && summary.partitions.length > 0) {
    const partitionItems: PartitionPickItem[] = summary.partitions.map((partition) => ({
      label: `Partition ${partition.index}: ${partition.typeName}`,
      description: `LBA ${partition.startLba.toLocaleString()}, ${partition.totalSectors.toLocaleString()} sectors`,
      lba: partition.startLba
    }));

    partitionItems.push({
      label: 'Custom LBA input',
      description: 'Enter a manual LBA value',
      lba: undefined
    });

    const selected = await vscode.window.showQuickPick(partitionItems, {
      title: 'PC-98: Jump to LBA',
      placeHolder: 'Select a detected partition or choose custom input'
    });
    if (!selected) {
      return undefined;
    }

    if (selected.lba !== undefined) {
      return selected.lba;
    }
  }

  const input = await vscode.window.showInputBox({
    title: 'PC-98: Jump to LBA',
    prompt: 'Enter LBA (decimal)',
    placeHolder: 'e.g. 63',
    validateInput: (value) => {
      const parsed = parseDecimalInteger(value);
      if (parsed === undefined || parsed < 0) {
        return 'Enter a non-negative integer.';
      }
      return undefined;
    }
  });
  if (input === undefined) {
    return undefined;
  }

  return parseDecimalInteger(input);
}

async function resolveJumpOffset(
  defaultMode: HexMode
): Promise<{ mode: HexMode; offset: number } | undefined> {
  const modeSelection = await vscode.window.showQuickPick<ModePickItem>(
    [
      {
        label: 'Disk View Offset',
        description: 'Offset 0 is LBA0 (data offset)',
        mode: 'disk'
      },
      {
        label: 'Raw View Offset',
        description: 'Offset 0 is file byte 0',
        mode: 'raw'
      }
    ],
    {
      title: 'PC-98: Jump to Offset',
      placeHolder: 'Choose offset space',
      canPickMany: false
    }
  );
  if (!modeSelection) {
    return undefined;
  }

  const mode = modeSelection.mode ?? defaultMode;
  const input = await vscode.window.showInputBox({
    title: 'PC-98: Jump to Offset',
    prompt: 'Enter offset in decimal or hex (0x..., or ...h)',
    placeHolder: 'Examples: 4096, 0x1000, 1000h',
    validateInput: (value) => {
      const parsed = parseOffsetInput(value);
      if (parsed === undefined || parsed < 0) {
        return 'Enter a non-negative decimal or hex integer.';
      }
      return undefined;
    }
  });
  if (input === undefined) {
    return undefined;
  }

  const offset = parseOffsetInput(input);
  if (offset === undefined || offset < 0) {
    return undefined;
  }

  return { mode, offset };
}

function parseDecimalInteger(value: string): number | undefined {
  const cleaned = value.trim().replace(/,/g, '');
  if (!/^[0-9]+$/.test(cleaned)) {
    return undefined;
  }
  const parsed = Number.parseInt(cleaned, 10);
  if (!Number.isSafeInteger(parsed)) {
    return undefined;
  }
  return parsed;
}

function parseOffsetInput(value: string): number | undefined {
  const cleaned = value.trim().replace(/,/g, '').toLowerCase();
  if (cleaned.length === 0) {
    return undefined;
  }

  let parsed: number | undefined;
  if (/^0x[0-9a-f]+$/.test(cleaned)) {
    parsed = Number.parseInt(cleaned, 16);
  } else if (/^[0-9a-f]+h$/.test(cleaned)) {
    parsed = Number.parseInt(cleaned.slice(0, -1), 16);
  } else if (/^[0-9]+$/.test(cleaned)) {
    parsed = Number.parseInt(cleaned, 10);
  } else {
    return undefined;
  }

  if (!Number.isSafeInteger(parsed)) {
    return undefined;
  }
  return parsed;
}

interface PartitionPickItem extends vscode.QuickPickItem {
  lba: number | undefined;
}

interface ModePickItem extends vscode.QuickPickItem {
  mode: HexMode;
}
