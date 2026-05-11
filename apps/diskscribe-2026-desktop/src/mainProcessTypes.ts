import type { DiskSummary } from './core/diskSummary';
import type { PagedFileByteReader } from './core/hex/pagedFileByteReader';

export type HexMode = 'disk' | 'raw';

export interface HexSelection {
  mode: HexMode;
  start: number;
  end: number;
}

export type BatchItemStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled';

export interface BatchQueueItemPayload {
  id: string;
  filePath: string;
}

export interface BatchRunState {
  activeRunId: number;
  running: boolean;
  cancelRequested: boolean;
}

export interface DesktopSession {
  windowId: number;
  rendererReady: boolean;
  filePath: string | undefined;
  summary: DiskSummary | undefined;
  reader: PagedFileByteReader | undefined;
  mode: HexMode;
  selection: HexSelection | undefined;
  cursorOffset: number | undefined;
  batch: BatchRunState;
}
