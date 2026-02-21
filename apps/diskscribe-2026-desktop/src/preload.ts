import { contextBridge, ipcRenderer } from 'electron';

type HostMessageHandler = (message: unknown) => void;

interface BatchPlanEntryPayload {
  id: string;
  filePath: string;
}

interface BatchPlanSaveResult {
  saved: boolean;
  filePath?: string;
  error?: string;
}

interface BatchPlanLoadResult {
  filePath?: string;
  entries: BatchPlanEntryPayload[];
  error?: string;
}

interface FolderScanResult {
  paths: string[];
  truncated: boolean;
  scannedDirectories: number;
  scannedFiles: number;
  matchedFiles: number;
}

interface DiagnosticsExportResult {
  saved: boolean;
  filePath?: string;
  error?: string;
}

interface DesktopBridge {
  postMessage(message: unknown): Promise<void>;
  openDiskDialog(): Promise<string | undefined>;
  openDisksDialog(): Promise<string[]>;
  openDiskFolderDialog(): Promise<FolderScanResult>;
  writeClipboard(text: string): Promise<void>;
  saveBatchPlan(entries: BatchPlanEntryPayload[]): Promise<BatchPlanSaveResult>;
  loadBatchPlan(): Promise<BatchPlanLoadResult>;
  exportDiagnostics(snapshot: unknown): Promise<DiagnosticsExportResult>;
  onHostMessage(handler: HostMessageHandler): () => void;
}

const bridge: DesktopBridge = {
  async postMessage(message: unknown): Promise<void> {
    await ipcRenderer.invoke('desktop:postMessage', message);
  },
  async openDiskDialog(): Promise<string | undefined> {
    return ipcRenderer.invoke('desktop:openDiskDialog');
  },
  async openDisksDialog(): Promise<string[]> {
    return ipcRenderer.invoke('desktop:openDisksDialog');
  },
  async openDiskFolderDialog(): Promise<FolderScanResult> {
    return ipcRenderer.invoke('desktop:openDiskFolderDialog');
  },
  async writeClipboard(text: string): Promise<void> {
    await ipcRenderer.invoke('desktop:writeClipboard', text);
  },
  async saveBatchPlan(entries: BatchPlanEntryPayload[]): Promise<BatchPlanSaveResult> {
    return ipcRenderer.invoke('desktop:saveBatchPlan', entries);
  },
  async loadBatchPlan(): Promise<BatchPlanLoadResult> {
    return ipcRenderer.invoke('desktop:loadBatchPlan');
  },
  async exportDiagnostics(snapshot: unknown): Promise<DiagnosticsExportResult> {
    return ipcRenderer.invoke('desktop:exportDiagnostics', snapshot);
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
