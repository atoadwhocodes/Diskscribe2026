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

interface DiagnosticsExportResult {
  saved: boolean;
  filePath?: string;
  error?: string;
}

interface TranslationProjectSaveResult {
  saved: boolean;
  filePath?: string;
  error?: string;
}

interface TranslationProjectLoadResult {
  filePath?: string;
  project?: unknown;
  error?: string;
}

interface TranslationProjectDiscoveryResult {
  project?: unknown;
  error?: string;
}

interface TranslationPatchApplyResult {
  saved: boolean;
  outputFolder?: string;
  report?: unknown;
  error?: string;
}

interface TranslationPatchPreviewResult {
  byteLength?: number;
  encodedLength?: number;
  fits?: boolean;
  sourceHex?: string;
  replacementHex?: string;
  paddedHex?: string;
  error?: string;
}

interface TranslationAutomationResult {
  project?: unknown;
  report?: unknown;
  error?: string;
}

interface DesktopBridge {
  postMessage(message: unknown): Promise<void>;
  openDiskDialog(): Promise<string | undefined>;
  openDisksDialog(): Promise<string[]>;
  openDiskFolderDialog(): Promise<string[]>;
  writeClipboard(text: string): Promise<void>;
  saveBatchPlan(entries: BatchPlanEntryPayload[]): Promise<BatchPlanSaveResult>;
  loadBatchPlan(): Promise<BatchPlanLoadResult>;
  exportDiagnostics(): Promise<DiagnosticsExportResult>;
  saveTranslationProject(project: unknown): Promise<TranslationProjectSaveResult>;
  loadTranslationProject(): Promise<TranslationProjectLoadResult>;
  exportTranslationPatch(script: unknown): Promise<TranslationProjectSaveResult>;
  applyCleanTranslationPatch(): Promise<TranslationPatchApplyResult>;
  discoverTranslationProject(filePaths: string[]): Promise<TranslationProjectDiscoveryResult>;
  patchTranslationProject(project: unknown): Promise<TranslationPatchApplyResult>;
  previewTranslationPatch(entry: unknown): Promise<TranslationPatchPreviewResult>;
  analyzeTranslationProject(project: unknown): Promise<TranslationAutomationResult>;
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
  async openDiskFolderDialog(): Promise<string[]> {
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
  async exportDiagnostics(): Promise<DiagnosticsExportResult> {
    return ipcRenderer.invoke('desktop:exportDiagnostics');
  },
  async saveTranslationProject(project: unknown): Promise<TranslationProjectSaveResult> {
    return ipcRenderer.invoke('desktop:saveTranslationProject', project);
  },
  async loadTranslationProject(): Promise<TranslationProjectLoadResult> {
    return ipcRenderer.invoke('desktop:loadTranslationProject');
  },
  async exportTranslationPatch(script: unknown): Promise<TranslationProjectSaveResult> {
    return ipcRenderer.invoke('desktop:exportTranslationPatch', script);
  },
  async applyCleanTranslationPatch(): Promise<TranslationPatchApplyResult> {
    return ipcRenderer.invoke('desktop:applyCleanTranslationPatch');
  },
  async discoverTranslationProject(filePaths: string[]): Promise<TranslationProjectDiscoveryResult> {
    return ipcRenderer.invoke('desktop:discoverTranslationProject', filePaths);
  },
  async patchTranslationProject(project: unknown): Promise<TranslationPatchApplyResult> {
    return ipcRenderer.invoke('desktop:patchTranslationProject', project);
  },
  async previewTranslationPatch(entry: unknown): Promise<TranslationPatchPreviewResult> {
    return ipcRenderer.invoke('desktop:previewTranslationPatch', entry);
  },
  async analyzeTranslationProject(project: unknown): Promise<TranslationAutomationResult> {
    return ipcRenderer.invoke('desktop:analyzeTranslationProject', project);
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
