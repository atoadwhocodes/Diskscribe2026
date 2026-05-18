export type QueueItemStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled';
export type StatusTone = 'info' | 'success' | 'warning' | 'error' | 'busy';

export interface BatchPlanEntryPayload {
  id: string;
  filePath: string;
}

export interface BatchPlanSaveResult {
  saved: boolean;
  filePath?: string;
  error?: string;
}

export interface BatchPlanLoadResult {
  filePath?: string;
  entries: BatchPlanEntryPayload[];
  error?: string;
}

export interface DiagnosticsExportResult {
  saved: boolean;
  filePath?: string;
  error?: string;
}

export interface TranslationProjectSaveResult {
  saved: boolean;
  filePath?: string;
  error?: string;
}

export interface TranslationProjectLoadResult {
  filePath?: string;
  project?: unknown;
  error?: string;
}

export interface TranslationProjectDiscoveryResult {
  project?: unknown;
  error?: string;
}

export interface TranslationPatchApplyResult {
  saved: boolean;
  outputFolder?: string;
  report?: unknown;
  error?: string;
}

export interface TranslationPatchPreviewResult {
  byteLength?: number;
  encodedLength?: number;
  fits?: boolean;
  sourceHex?: string;
  replacementHex?: string;
  paddedHex?: string;
  error?: string;
}

export interface TranslationAutomationResult {
  project?: unknown;
  report?: unknown;
  error?: string;
}

export interface DesktopBridge {
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
  validateCleanTranslationPatch(): Promise<TranslationPatchApplyResult>;
  discoverTranslationProject(filePaths: string[]): Promise<TranslationProjectDiscoveryResult>;
  patchTranslationProject(project: unknown): Promise<TranslationPatchApplyResult>;
  previewTranslationPatch(entry: unknown): Promise<TranslationPatchPreviewResult>;
  analyzeTranslationProject(project: unknown): Promise<TranslationAutomationResult>;
  onHostMessage(handler: (message: unknown) => void): () => void;
}

export interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(value: unknown): unknown;
}

export interface QueueItem {
  id: string;
  filePath: string;
  status: QueueItemStatus;
  parserId?: string;
  sizeBytes?: number;
  message?: string;
}
