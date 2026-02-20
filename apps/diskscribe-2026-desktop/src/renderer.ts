import './desktopTheme.css';
import '../../../media/editor.css';

type HexMode = 'disk' | 'raw';

interface DesktopBridge {
  postMessage(message: unknown): Promise<void>;
  openDiskDialog(): Promise<string | undefined>;
  writeClipboard(text: string): Promise<void>;
  onHostMessage(handler: (message: unknown) => void): () => void;
}

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(value: unknown): unknown;
}

declare global {
  interface Window {
    diskScribeDesktop: DesktopBridge;
    acquireVsCodeApi: () => VsCodeApi;
  }
}

const stateStore: { value: unknown } = {
  value: {}
};

const vscodeApi: VsCodeApi = {
  postMessage(message: unknown): void {
    void window.diskScribeDesktop.postMessage(message);
  },
  getState(): unknown {
    return stateStore.value;
  },
  setState(value: unknown): unknown {
    stateStore.value = value;
    return value;
  }
};

window.acquireVsCodeApi = () => vscodeApi;

window.diskScribeDesktop.onHostMessage((message) => {
  window.dispatchEvent(new MessageEvent('message', { data: message }));
  handleDesktopMessage(message);
});

wireDesktopControls();

void import('../../../media-src/editor')
  .then(async () => {
    await window.diskScribeDesktop.postMessage({ type: 'desktop.rendererReady' });
  })
  .catch((error: unknown) => {
    setStatus(`Failed to load editor UI: ${toErrorMessage(error)}`);
  });

function wireDesktopControls(): void {
  const openButton = document.getElementById('openDiskButton');
  if (openButton) {
    openButton.addEventListener('click', () => {
      void handleOpenDisk();
    });
  }

  const jumpOffsetButton = document.getElementById('jumpOffsetButton');
  if (jumpOffsetButton) {
    jumpOffsetButton.addEventListener('click', () => {
      void handleJumpOffset();
    });
  }

  const jumpLbaButton = document.getElementById('jumpLbaButton');
  if (jumpLbaButton) {
    jumpLbaButton.addEventListener('click', () => {
      void handleJumpLba();
    });
  }

  const copyOffsetButton = document.getElementById('copyOffsetButton');
  if (copyOffsetButton) {
    copyOffsetButton.addEventListener('click', () => {
      void window.diskScribeDesktop.postMessage({ type: 'desktop.copyOffset' });
    });
  }

  const copyLbaButton = document.getElementById('copyLbaButton');
  if (copyLbaButton) {
    copyLbaButton.addEventListener('click', () => {
      void window.diskScribeDesktop.postMessage({ type: 'desktop.copyLba' });
    });
  }
}

async function handleOpenDisk(): Promise<void> {
  const selectedPath = await window.diskScribeDesktop.openDiskDialog();
  if (!selectedPath) {
    return;
  }

  setActivePath(selectedPath);
  await window.diskScribeDesktop.postMessage({
    type: 'desktop.openDisk',
    filePath: selectedPath
  });
}

async function handleJumpOffset(): Promise<void> {
  const modeInput = window.prompt('Offset mode (disk/raw):', 'disk');
  if (modeInput === null) {
    return;
  }
  const mode: HexMode = modeInput.trim().toLowerCase() === 'raw' ? 'raw' : 'disk';

  const offsetInput = window.prompt(
    'Enter offset in decimal or hex (0x..., ...h):',
    mode === 'disk' ? '0x0' : '0'
  );
  if (offsetInput === null) {
    return;
  }

  const offset = parseOffsetInput(offsetInput);
  if (offset === undefined || offset < 0) {
    setStatus('Invalid offset input.');
    return;
  }

  await window.diskScribeDesktop.postMessage({
    type: 'hex.jump',
    mode,
    offset
  });
}

async function handleJumpLba(): Promise<void> {
  const input = window.prompt('Enter LBA (decimal):', '0');
  if (input === null) {
    return;
  }

  const lba = parseDecimalInteger(input);
  if (lba === undefined || lba < 0) {
    setStatus('Invalid LBA input.');
    return;
  }

  await window.diskScribeDesktop.postMessage({
    type: 'desktop.jumpLba',
    lba
  });
}

function handleDesktopMessage(message: unknown): void {
  if (!isRecord(message) || typeof message.type !== 'string') {
    return;
  }

  if (message.type === 'desktop.fileOpened' && typeof message.filePath === 'string') {
    setActivePath(message.filePath);
    return;
  }

  if (message.type === 'desktop.notice' && typeof message.message === 'string') {
    setStatus(message.message);
  }
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

function setStatus(text: string): void {
  const status = document.getElementById('status');
  if (status) {
    status.textContent = text;
  }
}

function setActivePath(filePath: string): void {
  const activePath = document.getElementById('activePath');
  if (activePath) {
    activePath.textContent = filePath;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
