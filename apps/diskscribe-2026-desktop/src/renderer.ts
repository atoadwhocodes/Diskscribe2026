import './desktopTheme.css';
import '../../../media/editor.css';

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
