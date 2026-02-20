import { contextBridge, ipcRenderer } from 'electron';

type HostMessageHandler = (message: unknown) => void;

interface DesktopBridge {
  postMessage(message: unknown): Promise<void>;
  openDiskDialog(): Promise<string | undefined>;
  writeClipboard(text: string): Promise<void>;
  onHostMessage(handler: HostMessageHandler): () => void;
}

const bridge: DesktopBridge = {
  async postMessage(message: unknown): Promise<void> {
    await ipcRenderer.invoke('desktop:postMessage', message);
  },
  async openDiskDialog(): Promise<string | undefined> {
    return ipcRenderer.invoke('desktop:openDiskDialog');
  },
  async writeClipboard(text: string): Promise<void> {
    await ipcRenderer.invoke('desktop:writeClipboard', text);
  },
  onHostMessage(handler: HostMessageHandler): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, message: unknown) => {
      handler(message);
    };
    ipcRenderer.on('desktop:hostMessage', wrapped);
    return () => {
      ipcRenderer.removeListener('desktop:hostMessage', wrapped);
    };
  }
};

contextBridge.exposeInMainWorld('diskScribeDesktop', bridge);
