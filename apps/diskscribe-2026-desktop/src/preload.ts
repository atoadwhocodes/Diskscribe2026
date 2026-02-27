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
  canceled: boolean;
  scannedRoots: number;
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
  expandDiskCandidates(paths: string[]): Promise<FolderScanResult>;
  openFeedbackIssue(context: unknown): Promise<void>;
  writeClipboard(text: string): Promise<void>;
  saveBatchPlan(entries: BatchPlanEntryPayload[]): Promise<BatchPlanSaveResult>;
  loadBatchPlan(): Promise<BatchPlanLoadResult>;
  exportDiagnostics(snapshot: unknown): Promise<DiagnosticsExportResult>;
  onHostMessage(handler: HostMessageHandler): () => void;
  // Translation methods
  extractText(diskPaths?: string[]): Promise<any>;
  autoTranslate(strings: any[]): Promise<any>;
  reflowText(strings: any[]): Promise<any>;
  saveProject(projectData: any): Promise<any>;
  applyPatch(patchData: any): Promise<any>;
  onTranslationProgress(handler: (update: any) => void): () => void;
  // Game profile methods
  getGameProfiles(): Promise<any[]>;
  setGameProfile(profileId: string): Promise<boolean>;
  // Glossary methods
  getGlossary(): Promise<any[]>;
  getGlossaryStats(): Promise<any>;
  addGlossaryEntry(entry: any): Promise<boolean>;
  exportGlossary(): Promise<any>;
  importGlossary(): Promise<any>;
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
  async expandDiskCandidates(paths: string[]): Promise<FolderScanResult> {
    return ipcRenderer.invoke('desktop:expandDiskCandidates', paths);
  },
  async openFeedbackIssue(context: unknown): Promise<void> {
    await ipcRenderer.invoke('desktop:openFeedbackIssue', context);
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
  // Translation methods
  async extractText(diskPaths?: string[]): Promise<any> {
    return ipcRenderer.invoke('translation:extract', diskPaths || []);
  },
  async autoTranslate(strings: any[]): Promise<any> {
    return ipcRenderer.invoke('translation:autoTranslate', strings);
  },
  async reflowText(strings: any[]): Promise<any> {
    return ipcRenderer.invoke('translation:reflow', strings);
  },
  async saveProject(projectData: any): Promise<any> {
    return ipcRenderer.invoke('translation:saveProject', projectData);
  },
  async applyPatch(patchData: any): Promise<any> {
    return ipcRenderer.invoke('translation:applyPatch', patchData);
  },
  // Game profile methods
  async getGameProfiles(): Promise<any[]> {
    return ipcRenderer.invoke('translation:getProfiles');
  },
  async setGameProfile(profileId: string): Promise<boolean> {
    return ipcRenderer.invoke('translation:setProfile', profileId);
  },
  // Glossary methods
  async getGlossary(): Promise<any[]> {
    return ipcRenderer.invoke('translation:getGlossary');
  },
  async getGlossaryStats(): Promise<any> {
    return ipcRenderer.invoke('translation:getGlossaryStats');
  },
  async addGlossaryEntry(entry: any): Promise<boolean> {
    return ipcRenderer.invoke('translation:addGlossaryEntry', entry);
  },
  async exportGlossary(): Promise<any> {
    return ipcRenderer.invoke('translation:exportGlossary');
  },
  async importGlossary(): Promise<any> {
    return ipcRenderer.invoke('translation:importGlossary');
  },
  onHostMessage(handler: HostMessageHandler): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, message: unknown) => {
      handler(message);
    };
    ipcRenderer.on('desktop:hostMessage', wrapped);
    return () => {
      ipcRenderer.removeListener('desktop:hostMessage', wrapped);
    };
  },
  onTranslationProgress(handler: (update: any) => void): () => void {
    const wrapped = (_event: Electron.IpcRendererEvent, update: any) => {
      handler(update);
    };
    ipcRenderer.on('translation:progress', wrapped);
    return () => {
      ipcRenderer.removeListener('translation:progress', wrapped);
    };
  }
};

contextBridge.exposeInMainWorld('diskScribeDesktop', bridge);
