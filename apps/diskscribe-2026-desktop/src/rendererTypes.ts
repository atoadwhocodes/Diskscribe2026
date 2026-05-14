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

export interface DesktopBridge {
  postMessage(message: unknown): Promise<void>;
  openDiskDialog(): Promise<string | undefined>;
  openDisksDialog(): Promise<string[]>;
  openDiskFolderDialog(): Promise<string[]>;
  writeClipboard(text: string): Promise<void>;
  saveBatchPlan(entries: BatchPlanEntryPayload[]): Promise<BatchPlanSaveResult>;
  loadBatchPlan(): Promise<BatchPlanLoadResult>;
  exportDiagnostics(): Promise<DiagnosticsExportResult>;
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
