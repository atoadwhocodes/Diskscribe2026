import './desktopTheme.css';
import './webview/editor.css';
import { APP_DESKTOP_NAME } from './appMeta';

type QueueItemStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled';
type StatusTone = 'info' | 'success' | 'warning' | 'error' | 'busy';
type WorkMode = 'guided' | 'expert';

const STATUS_TONE_CLASSES = ['tone-info', 'tone-success', 'tone-warning', 'tone-error', 'tone-busy'];
const WORKBENCH_UI_STORAGE_KEY = 'diskscribe2026.workbenchUi';
const WORKBENCH_ONBOARDING_STORAGE_KEY = 'diskscribe2026.workbenchOnboardingComplete';

interface WorkbenchUiPrefs {
  workMode: WorkMode;
  expertArmed: boolean;
}

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
  onHostMessage(handler: (message: unknown) => void): () => void;
}

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(value: unknown): unknown;
}

declare global {
  interface Window {
    diskScribeDesktop?: Partial<DesktopBridge>;
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

interface QueueItem {
  id: string;
  filePath: string;
  status: QueueItemStatus;
  parserId?: string;
  sizeBytes?: number;
  message?: string;
}

const stateStore: { value: unknown } = {
  value: {}
};

const queueState: {
  items: QueueItem[];
  selectedId: string | undefined;
  isRunning: boolean;
} = {
  items: [],
  selectedId: undefined,
  isRunning: false
};

const uiState: WorkbenchUiPrefs = loadWorkbenchUiPrefs();

const DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE =
  'Desktop bridge is unavailable. Restart DiskScribe2026 Desktop and try again.';

const elements = {
  brandTitle: document.getElementById('brandTitle'),
  brandVersion: document.getElementById('brandVersion'),
  modeHint: document.getElementById('modeHint'),
  workbenchHint: document.getElementById('workbenchHint'),
  guidedModeButton: document.getElementById('guidedModeButton'),
  expertModeButton: document.getElementById('expertModeButton'),
  armExpertToggle: document.getElementById('armExpertToggle') as HTMLInputElement | null,
  firstRunModal: document.getElementById('firstRunModal'),
  firstRunGuidedButton: document.getElementById('firstRunGuidedButton'),
  firstRunExpertButton: document.getElementById('firstRunExpertButton'),
  sendFeedbackButton: document.getElementById('sendFeedbackButton'),
  guidedOpenDiskButton: document.getElementById('guidedOpenDiskButton'),
  guidedAddFilesButton: document.getElementById('guidedAddFilesButton'),
  guidedAddFolderButton: document.getElementById('guidedAddFolderButton'),
  guidedLoadPlanButton: document.getElementById('guidedLoadPlanButton'),
  guidedRunQueueButton: document.getElementById('guidedRunQueueButton'),
  guidedExportDiagnosticsButton: document.getElementById('guidedExportDiagnosticsButton'),
  activePath: document.getElementById('activePath'),
  dropHint: document.getElementById('dropHint'),
  status: document.getElementById('status'),
  statusBar: document.getElementById('statusBar'),
  statusProgressWrap: document.getElementById('statusProgressWrap'),
  statusProgress: document.getElementById('statusProgress') as HTMLProgressElement | null,
  statusProgressLabel: document.getElementById('statusProgressLabel'),
  queueRows: document.getElementById('queueRows'),
  queueMeta: document.getElementById('queueMeta'),
  addQueueFilesButton: document.getElementById('addQueueFilesButton'),
  addQueueFolderButton: document.getElementById('addQueueFolderButton'),
  removeQueueItemButton: document.getElementById('removeQueueItemButton'),
  clearQueueButton: document.getElementById('clearQueueButton'),
  moveQueueUpButton: document.getElementById('moveQueueUpButton'),
  moveQueueDownButton: document.getElementById('moveQueueDownButton'),
  saveQueueButton: document.getElementById('saveQueueButton'),
  loadQueueButton: document.getElementById('loadQueueButton'),
  exportDiagnosticsButton: document.getElementById('exportDiagnosticsButton'),
  runQueueButton: document.getElementById('runQueueButton'),
  stopQueueButton: document.getElementById('stopQueueButton')
};

const vscodeApi: VsCodeApi = {
  postMessage(message: unknown): void {
    void postDesktopMessage(message);
  },
  getState(): unknown {
    return stateStore.value;
  },
  setState(value: unknown): unknown {
    stateStore.value = value;
    return value;
  }
};

const rawDesktopBridge = window.diskScribeDesktop;
const desktopBridge = resolveDesktopBridge(rawDesktopBridge);
const desktopBridgeAvailable =
  typeof rawDesktopBridge?.postMessage === 'function' &&
  typeof rawDesktopBridge?.onHostMessage === 'function' &&
  typeof rawDesktopBridge?.openDiskDialog === 'function';

window.acquireVsCodeApi = () => vscodeApi;
document.title = APP_DESKTOP_NAME;
if (elements.brandTitle) {
  elements.brandTitle.textContent = APP_DESKTOP_NAME;
}
applyWorkbenchMode(false);

if (!desktopBridgeAvailable) {
  setStatus(DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE, 'error');
}

desktopBridge.onHostMessage((message) => {
  window.dispatchEvent(new MessageEvent('message', { data: message }));
  handleDesktopMessage(message);
});

wireDesktopControls();
wireGlobalShortcuts();
wireDragAndDrop();
maybeShowFirstRunChooser();

void import('./webview/editor')
  .then(async () => {
    await desktopBridge.postMessage({ type: 'desktop.rendererReady' });
  })
  .catch((error: unknown) => {
    setStatus(`Failed to load editor UI: ${toErrorMessage(error)}`);
  });

function wireDesktopControls(): void {
  elements.firstRunGuidedButton?.addEventListener('click', () => {
    completeFirstRunChooser('guided');
  });
  elements.firstRunExpertButton?.addEventListener('click', () => {
    completeFirstRunChooser('expert');
  });

  elements.guidedModeButton?.addEventListener('click', () => {
    setWorkbenchMode('guided');
  });
  elements.expertModeButton?.addEventListener('click', () => {
    setWorkbenchMode('expert');
  });
  elements.armExpertToggle?.addEventListener('change', () => {
    uiState.expertArmed = elements.armExpertToggle?.checked === true;
    persistWorkbenchUiPrefs();
    applyWorkbenchMode(false);
    setStatus(
      uiState.expertArmed ? 'DiskEdit manual commands armed.' : 'DiskEdit manual commands disarmed.',
      uiState.expertArmed ? 'warning' : 'info'
    );
  });

  const openButton = document.getElementById('openDiskButton');
  if (openButton) {
    openButton.addEventListener('click', () => {
      void handleOpenDisk();
    });
  }
  elements.guidedOpenDiskButton?.addEventListener('click', () => {
    void handleOpenDisk();
  });
  elements.guidedAddFilesButton?.addEventListener('click', () => {
    void handleAddQueueFiles();
  });
  elements.guidedAddFolderButton?.addEventListener('click', () => {
    void handleAddQueueFolder();
  });
  elements.guidedLoadPlanButton?.addEventListener('click', () => {
    void loadQueuePlan();
  });
  elements.guidedRunQueueButton?.addEventListener('click', () => {
    void runQueue();
  });
  elements.guidedExportDiagnosticsButton?.addEventListener('click', () => {
    void exportDiagnosticsBundle();
  });

  elements.sendFeedbackButton?.addEventListener('click', () => {
    void openFeedbackIssue();
  });

  elements.addQueueFilesButton?.addEventListener('click', () => {
    void handleAddQueueFiles();
  });
  elements.addQueueFolderButton?.addEventListener('click', () => {
    void handleAddQueueFolder();
  });
  elements.removeQueueItemButton?.addEventListener('click', () => {
    removeSelectedQueueItem();
  });
  elements.clearQueueButton?.addEventListener('click', () => {
    clearQueue();
  });
  elements.moveQueueUpButton?.addEventListener('click', () => {
    moveSelectedQueueItem(-1);
  });
  elements.moveQueueDownButton?.addEventListener('click', () => {
    moveSelectedQueueItem(1);
  });
  elements.saveQueueButton?.addEventListener('click', () => {
    void saveQueuePlan();
  });
  elements.loadQueueButton?.addEventListener('click', () => {
    void loadQueuePlan();
  });
  elements.exportDiagnosticsButton?.addEventListener('click', () => {
    void exportDiagnosticsBundle();
  });
  elements.runQueueButton?.addEventListener('click', () => {
    void runQueue();
  });
  elements.stopQueueButton?.addEventListener('click', () => {
    stopQueue();
  });
  elements.queueRows?.addEventListener('click', (event) => {
    const row = event.target instanceof Element ? event.target.closest('[data-queue-id]') : null;
    if (!row) {
      return;
    }

    const queueId = row.getAttribute('data-queue-id');
    if (!queueId) {
      return;
    }

    queueState.selectedId = queueId;
    renderQueue();
  });
  elements.queueRows?.addEventListener('dblclick', (event) => {
    const row = event.target instanceof Element ? event.target.closest('[data-queue-id]') : null;
    if (!row) {
      return;
    }

    const queueId = row.getAttribute('data-queue-id');
    if (!queueId) {
      return;
    }

    const item = queueState.items.find((candidate) => candidate.id === queueId);
    if (!item) {
      return;
    }

    void openQueueItem(item.filePath);
  });

  renderQueue();
  updateQueueButtons();
  applyWorkbenchMode(false);
}

function wireGlobalShortcuts(): void {
  window.addEventListener('keydown', (event) => {
    if (isFirstRunChooserOpen()) {
      return;
    }

    const editableTarget = isEditableTarget(event.target);
    if (!(event.ctrlKey || event.metaKey)) {
      if (!editableTarget && event.key === 'Escape' && queueState.isRunning) {
        event.preventDefault();
        stopQueue();
      }
      return;
    }

    if (editableTarget) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === '1') {
      event.preventDefault();
      setWorkbenchMode('guided');
      return;
    }
    if (key === '2') {
      event.preventDefault();
      setWorkbenchMode('expert');
      return;
    }
    if (key === 'e' && event.shiftKey) {
      event.preventDefault();
      uiState.expertArmed = !uiState.expertArmed;
      persistWorkbenchUiPrefs();
      applyWorkbenchMode(false);
      setStatus(
        uiState.expertArmed ? 'DiskEdit manual commands armed.' : 'DiskEdit manual commands disarmed.',
        uiState.expertArmed ? 'warning' : 'info'
      );
      return;
    }
    if (key === 'o' && !event.shiftKey) {
      event.preventDefault();
      void handleOpenDisk();
      return;
    }
    if (key === 'o' && event.shiftKey) {
      event.preventDefault();
      void handleAddQueueFiles();
      return;
    }
    if (key === 'd' && event.shiftKey) {
      event.preventDefault();
      void exportDiagnosticsBundle();
      return;
    }
    if (key === 'enter') {
      event.preventDefault();
      void runQueue();
    }
  });
}

function wireDragAndDrop(): void {
  let dragDepth = 0;

  const showDropHint = (): void => {
    document.body.classList.add('is-dropping');
    elements.dropHint?.classList.remove('isHidden');
  };

  const hideDropHint = (): void => {
    dragDepth = 0;
    document.body.classList.remove('is-dropping');
    elements.dropHint?.classList.add('isHidden');
  };

  const hasFilePayload = (event: DragEvent): boolean =>
    Array.from(event.dataTransfer?.types ?? []).includes('Files');

  window.addEventListener('dragenter', (event) => {
    if (!hasFilePayload(event)) {
      return;
    }
    dragDepth += 1;
    showDropHint();
    event.preventDefault();
  });

  window.addEventListener('dragover', (event) => {
    if (!hasFilePayload(event)) {
      return;
    }
    event.preventDefault();
  });

  window.addEventListener('dragleave', (event) => {
    if (!hasFilePayload(event)) {
      return;
    }
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      hideDropHint();
    }
    event.preventDefault();
  });

  window.addEventListener('drop', (event) => {
    if (!hasFilePayload(event)) {
      return;
    }
    event.preventDefault();

    const dropped = extractDroppedPaths(event);
    hideDropHint();
    void handleDroppedPaths(dropped);
  });
}

function extractDroppedPaths(event: DragEvent): string[] {
  const paths = new Set<string>();
  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) {
    return [];
  }

  for (let i = 0; i < files.length; i += 1) {
    const file = files.item(i) as (File & { path?: string }) | null;
    const filePath = file?.path?.trim();
    if (!filePath) {
      continue;
    }
    paths.add(filePath);
  }
  return Array.from(paths);
}

async function handleDroppedPaths(filePaths: string[]): Promise<void> {
  if (isFirstRunChooserOpen()) {
    return;
  }

  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    setStatus('Dropped items were empty.', 'warning');
    return;
  }

  setStatus('Scanning dropped files and folders...', 'busy');
  const scanResult = await invokeDesktop(
    () => desktopBridge.expandDiskCandidates(filePaths),
    'Unable to scan dropped items'
  );
  if (!scanResult) {
    return;
  }

  const supported = Array.isArray(scanResult.paths) ? scanResult.paths : [];
  if (supported.length === 0) {
    if (scanResult.truncated) {
      setStatus(
        `Dropped scan reached limits after ${scanResult.scannedDirectories.toLocaleString()} directories and ${scanResult.scannedFiles.toLocaleString()} files.`,
        'warning'
      );
      return;
    }

    setStatus('Dropped items contained no supported disk image files.', 'warning');
    return;
  }

  if (supported.length === 1 && !queueState.isRunning) {
    const opened = await openQueueItem(supported[0]);
    if (opened) {
      setStatus(`Opened ${supported[0]}.`, 'success');
    }
    return;
  }

  const result = addQueueItems(supported);
  if (result.added === 0) {
    setStatus('Dropped files were already in the queue.', 'warning');
    return;
  }

  if (scanResult.truncated) {
    setStatus(
      `Added ${result.added} file(s). Dropped scan hit limits after ${scanResult.scannedDirectories.toLocaleString()} directories and ${scanResult.scannedFiles.toLocaleString()} files.`,
      'warning'
    );
    return;
  }

  if (result.duplicates > 0) {
    setStatus(`Added ${result.added} file(s); skipped ${result.duplicates} duplicate(s).`, 'warning');
    return;
  }

  setStatus(`Added ${result.added} file(s) from drag-and-drop scan.`, 'success');
}

async function handleOpenDisk(): Promise<void> {
  let selectedPath: string | undefined;
  try {
    selectedPath = await desktopBridge.openDiskDialog();
  } catch (error: unknown) {
    setStatus(`Unable to open file picker: ${toErrorMessage(error)}`, 'error');
    return;
  }
  if (!selectedPath) {
    return;
  }

  setActivePath(selectedPath);
  setStatus(`Opening volume image ${selectedPath}...`, 'busy');
  await postDesktopMessage(
    {
      type: 'desktop.openDisk',
      filePath: selectedPath
    },
    'Unable to open selected disk'
  );
}

async function openFeedbackIssue(): Promise<void> {
  const context = {
    status: elements.status?.textContent ?? '',
    activePath: elements.activePath?.textContent ?? '',
    queueCount: queueState.items.length,
    queueRunning: queueState.isRunning
  };

  try {
    await desktopBridge.openFeedbackIssue(context);
  } catch (error: unknown) {
    setStatus(`Unable to open feedback page: ${toErrorMessage(error)}`, 'error');
    return;
  }

  setStatus('Opened issue report page.', 'info');
}

async function postDesktopMessage(message: unknown, failurePrefix = 'Action failed'): Promise<boolean> {
  try {
    await desktopBridge.postMessage(message);
    return true;
  } catch (error: unknown) {
    setStatus(`${failurePrefix}: ${toErrorMessage(error)}`, 'error');
    return false;
  }
}

async function invokeDesktop<T>(
  operation: () => Promise<T>,
  failurePrefix: string
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error: unknown) {
    setStatus(`${failurePrefix}: ${toErrorMessage(error)}`, 'error');
    return undefined;
  }
}

async function handleAddQueueFiles(): Promise<void> {
  let selectedPaths: string[];
  try {
    selectedPaths = await desktopBridge.openDisksDialog();
  } catch (error: unknown) {
    setStatus(`Unable to open file picker: ${toErrorMessage(error)}`, 'error');
    return;
  }
  if (!Array.isArray(selectedPaths) || selectedPaths.length === 0) {
    return;
  }

  const result = addQueueItems(selectedPaths);
  if (result.added === 0) {
    setStatus('All selected files were already in the queue.', 'warning');
    return;
  }

  if (result.duplicates > 0) {
    setStatus(`Added ${result.added} file(s); skipped ${result.duplicates} duplicate(s).`, 'warning');
    return;
  }

  setStatus(`Added ${result.added} file(s) to batch job queue.`, 'success');
}

async function handleAddQueueFolder(): Promise<void> {
  let scanResult: FolderScanResult;
  setStatus('Scanning selected folder for disk images...', 'busy');
  try {
    scanResult = await desktopBridge.openDiskFolderDialog();
  } catch (error: unknown) {
    setStatus(`Unable to open folder picker: ${toErrorMessage(error)}`, 'error');
    return;
  }

  if (scanResult.canceled) {
    setStatus('Folder selection canceled.', 'info');
    return;
  }

  const selectedPaths = Array.isArray(scanResult.paths) ? scanResult.paths : [];
  if (!Array.isArray(selectedPaths) || selectedPaths.length === 0) {
    if (scanResult.truncated) {
      setStatus(
        `Folder scan reached limits after ${scanResult.scannedDirectories.toLocaleString()} directories and ${scanResult.scannedFiles.toLocaleString()} files; no supported images were added.`,
        'warning'
      );
      return;
    }
    setStatus('No supported disk images found in selected folder.', 'warning');
    return;
  }

  const result = addQueueItems(selectedPaths);
  if (result.added === 0) {
    setStatus('Folder scan found files, but they were already in the queue.', 'warning');
    return;
  }

  if (scanResult.truncated) {
    setStatus(
      `Added ${result.added} file(s). Scan limit reached after ${scanResult.scannedDirectories.toLocaleString()} directories and ${scanResult.scannedFiles.toLocaleString()} files.`,
      'warning'
    );
    return;
  }

  if (result.duplicates > 0) {
    setStatus(`Added ${result.added} file(s); skipped ${result.duplicates} duplicate(s).`, 'warning');
    return;
  }

  setStatus(`Added ${result.added} file(s) from folder scan.`, 'success');
}

function addQueueItems(filePaths: string[]): { added: number; duplicates: number } {
  const seen = new Set(queueState.items.map((item) => item.filePath.toLowerCase()));
  let added = 0;
  let duplicates = 0;
  for (const filePath of filePaths) {
    if (!filePath || seen.has(filePath.toLowerCase())) {
      duplicates += 1;
      continue;
    }

    seen.add(filePath.toLowerCase());
    queueState.items.push({
      id: createQueueItemId(),
      filePath,
      status: 'queued'
    });
    added += 1;
  }

  if (!queueState.selectedId && queueState.items.length > 0) {
    queueState.selectedId = queueState.items[0].id;
  }

  renderQueue();
  updateQueueButtons();
  return { added, duplicates };
}

function removeSelectedQueueItem(): void {
  if (!queueState.selectedId || queueState.isRunning) {
    return;
  }

  const index = queueState.items.findIndex((item) => item.id === queueState.selectedId);
  if (index < 0) {
    return;
  }

  queueState.items.splice(index, 1);
  queueState.selectedId = queueState.items[index]?.id ?? queueState.items[index - 1]?.id;
  renderQueue();
  updateQueueButtons();
}

function clearQueue(): void {
  if (queueState.isRunning) {
    return;
  }
  if (queueState.items.length > 0) {
    const confirmed = window.confirm(
      `Clear all ${queueState.items.length} queued job(s)? This cannot be undone.`
    );
    if (!confirmed) {
      setStatus('Batch queue clear canceled.', 'info');
      return;
    }
  }

  queueState.items = [];
  queueState.selectedId = undefined;
  renderQueue();
  updateQueueButtons();
  setStatus('Cleared batch job queue.', 'info');
}

function moveSelectedQueueItem(delta: -1 | 1): void {
  if (!queueState.selectedId || queueState.isRunning) {
    return;
  }

  const index = queueState.items.findIndex((item) => item.id === queueState.selectedId);
  if (index < 0) {
    return;
  }

  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= queueState.items.length) {
    return;
  }

  const [item] = queueState.items.splice(index, 1);
  queueState.items.splice(nextIndex, 0, item);
  renderQueue();
  updateQueueButtons();
}

async function exportDiagnosticsBundle(): Promise<void> {
  const snapshot = {
    activePath: elements.activePath?.textContent ?? '',
    status: elements.status?.textContent ?? '',
    queue: queueState.items.map((item) => ({
      id: item.id,
      filePath: item.filePath,
      status: item.status,
      parserId: item.parserId,
      sizeBytes: item.sizeBytes,
      message: item.message
    })),
    queueMeta: {
      totalItems: queueState.items.length,
      selectedId: queueState.selectedId,
      isRunning: queueState.isRunning
    },
    statusTone: STATUS_TONE_CLASSES.find((toneClass) => elements.statusBar?.classList.contains(toneClass))
  };

  const result = await invokeDesktop(
    () => desktopBridge.exportDiagnostics(snapshot),
    'Failed to export diagnostics'
  );
  if (!result?.saved) {
    if (result?.error) {
      setStatus(`Failed to export diagnostics: ${result.error}`, 'error');
    }
    return;
  }

  setStatus(`Exported diagnostics to ${result.filePath ?? 'selected path'}.`, 'success');
}

async function saveQueuePlan(): Promise<void> {
  const entries: BatchPlanEntryPayload[] = queueState.items.map((item) => ({
    id: item.id,
    filePath: item.filePath
  }));
  const result = await invokeDesktop(
    () => desktopBridge.saveBatchPlan(entries),
    'Failed to save batch plan'
  );
  if (!result?.saved) {
    if (result?.error) {
      setStatus(`Failed to save batch plan: ${result.error}`, 'error');
    }
    return;
  }

  setStatus(`Saved batch plan to ${result.filePath ?? 'selected path'}.`, 'success');
}

async function loadQueuePlan(): Promise<void> {
  if (queueState.isRunning) {
    return;
  }

  const result = await invokeDesktop(() => desktopBridge.loadBatchPlan(), 'Failed to load batch plan');
  if (!result) {
    return;
  }
  if (result.error) {
    setStatus(`Failed to load batch plan: ${result.error}`, 'error');
    return;
  }

  queueState.items = [];
  const addResult = addQueueItems(result.entries.map((entry) => entry.filePath));
  if (result.filePath) {
    if (addResult.added === 0) {
      setStatus(`Loaded plan from ${result.filePath}, but all entries were duplicates.`, 'warning');
      return;
    }

    if (addResult.duplicates > 0) {
      setStatus(
        `Loaded ${addResult.added} queued job(s) from ${result.filePath}; skipped ${addResult.duplicates} duplicate(s).`,
        'warning'
      );
      return;
    }
    setStatus(`Loaded ${addResult.added} queued job(s) from ${result.filePath}.`, 'success');
  }
}

async function runQueue(): Promise<void> {
  if (queueState.isRunning) {
    return;
  }
  if (queueState.items.length === 0) {
    setStatus('Batch job queue is empty.', 'warning');
    return;
  }
  if (uiState.workMode === 'guided') {
    const confirmed = window.confirm(
      `Run guided batch now for ${queueState.items.length} queued job(s)?`
    );
    if (!confirmed) {
      setStatus('Guided batch run canceled.', 'info');
      return;
    }
  }

  queueState.isRunning = true;
  queueState.items = queueState.items.map((item) => ({
    ...item,
    status: 'queued',
    parserId: undefined,
    sizeBytes: undefined,
    message: undefined
  }));
  renderQueue();
  updateQueueButtons();

  setStatus(`Running ${queueState.items.length} queued job(s)...`, 'busy');
  setProgress(0, queueState.items.length, true);

  const started = await postDesktopMessage(
    {
      type: 'desktop.batchRun',
      items: queueState.items.map((item) => ({
        id: item.id,
        filePath: item.filePath
      }))
    },
    'Unable to start batch run'
  );
  if (!started) {
    queueState.isRunning = false;
    updateQueueButtons();
    setProgress(undefined, undefined, false);
  }
}

function stopQueue(): void {
  if (!queueState.isRunning) {
    return;
  }

  setStatus('Stopping batch run after current file...', 'busy');
  void postDesktopMessage({ type: 'desktop.batchStop' }, 'Unable to stop batch run');
}

async function openQueueItem(filePath: string): Promise<boolean> {
  setActivePath(filePath);
  return postDesktopMessage(
    {
      type: 'desktop.openDisk',
      filePath
    },
    `Unable to open queued disk ${filePath}`
  );
}

function handleDesktopMessage(message: unknown): void {
  if (!isRecord(message) || typeof message.type !== 'string') {
    return;
  }

  switch (message.type) {
    case 'desktop.appMeta':
      if (typeof message.appDesktopName === 'string' && elements.brandTitle) {
        elements.brandTitle.textContent = message.appDesktopName;
        document.title = message.appDesktopName;
      }
      if (typeof message.appVersion === 'string' && elements.brandVersion) {
        elements.brandVersion.textContent = `Version ${message.appVersion}`;
      }
      return;
    case 'desktop.fileOpened':
      if (typeof message.filePath === 'string') {
        setActivePath(message.filePath);
      }
      return;
    case 'desktop.notice':
      if (typeof message.message === 'string') {
        setStatus(message.message);
      }
      return;
    case 'desktop.status':
      if (typeof message.message === 'string') {
        setStatus(message.message, message.busy === true ? 'busy' : undefined);
      }
      setProgress(numberOrUndefined(message.current), numberOrUndefined(message.total), message.busy === true);
      return;
    case 'desktop.batchItemUpdate':
      applyBatchItemUpdate(message);
      return;
    case 'desktop.batchProgress':
      if (typeof message.message === 'string') {
        setStatus(message.message, message.running === true ? 'busy' : undefined);
      }
      setProgress(numberOrUndefined(message.processed), numberOrUndefined(message.total), message.running === true);
      return;
    case 'desktop.batchComplete':
      queueState.isRunning = false;
      updateQueueButtons();
      if (typeof message.total === 'number' && typeof message.completed === 'number') {
        if (message.canceled === true) {
          setStatus(`Batch run canceled (${message.completed}/${message.total} completed).`, 'warning');
        } else {
          setStatus(
            `Batch run complete (${message.completed} succeeded, ${numberOrUndefined(message.failed) ?? 0} failed).`,
            'success'
          );
        }
      }
      setProgress(undefined, undefined, false);
      return;
    default:
      return;
  }
}

function setWorkbenchMode(mode: WorkMode): void {
  if (uiState.workMode === mode) {
    return;
  }

  uiState.workMode = mode;
  if (mode !== 'expert') {
    uiState.expertArmed = false;
  }
  persistWorkbenchUiPrefs();
  applyWorkbenchMode(true);
}

function applyWorkbenchMode(announce: boolean): void {
  document.body.setAttribute('data-work-mode', uiState.workMode);
  document.body.setAttribute('data-expert-armed', uiState.expertArmed ? 'true' : 'false');

  const guidedActive = uiState.workMode === 'guided';
  setToggleState(elements.guidedModeButton, guidedActive);
  setToggleState(elements.expertModeButton, !guidedActive);

  if (elements.armExpertToggle) {
    elements.armExpertToggle.checked = uiState.expertArmed;
    elements.armExpertToggle.disabled = guidedActive;
  }

  if (elements.modeHint) {
    if (guidedActive) {
      elements.modeHint.textContent = 'DiskTools mode: guided menu flow with safety prompts.';
    } else {
      elements.modeHint.textContent = uiState.expertArmed
        ? 'DiskEdit mode: direct sector commands enabled (armed).'
        : 'DiskEdit mode: direct sector commands visible. Arm expert actions for risky tasks.';
    }
  }

  if (elements.workbenchHint) {
    elements.workbenchHint.textContent = guidedActive
      ? 'Guided mode active. Use DiskTools queue and partition menus for safer workflows.'
      : 'Expert mode active. Sector editor commands are manual and require careful validation.';
  }

  if (announce) {
    setStatus(
      guidedActive
        ? 'Switched to DiskTools guided menu mode.'
        : uiState.expertArmed
          ? 'Switched to DiskEdit expert mode. Manual commands are armed.'
          : 'Switched to DiskEdit expert mode. Arm expert actions before risky commands.',
      guidedActive ? 'info' : 'warning'
    );
  }
}

function maybeShowFirstRunChooser(): void {
  if (!desktopBridgeAvailable) {
    return;
  }

  if (!shouldShowFirstRunChooser()) {
    return;
  }

  showFirstRunChooser();
  setStatus('Choose startup workbench mode to continue.', 'info');
}

function shouldShowFirstRunChooser(): boolean {
  try {
    return window.localStorage.getItem(WORKBENCH_ONBOARDING_STORAGE_KEY) !== 'true';
  } catch {
    return false;
  }
}

function isFirstRunChooserOpen(): boolean {
  return Boolean(elements.firstRunModal && !elements.firstRunModal.classList.contains('isHidden'));
}

function showFirstRunChooser(): void {
  if (!elements.firstRunModal) {
    return;
  }

  elements.firstRunModal.classList.remove('isHidden');
  document.body.classList.add('is-modal-open');
  const primary = elements.firstRunGuidedButton;
  if (primary instanceof HTMLButtonElement) {
    window.requestAnimationFrame(() => {
      primary.focus();
    });
  }
}

function hideFirstRunChooser(): void {
  if (!elements.firstRunModal) {
    return;
  }

  elements.firstRunModal.classList.add('isHidden');
  document.body.classList.remove('is-modal-open');
}

function completeFirstRunChooser(mode: WorkMode): void {
  uiState.workMode = mode;
  uiState.expertArmed = false;
  persistWorkbenchUiPrefs();
  applyWorkbenchMode(false);
  markFirstRunChooserCompleted();
  hideFirstRunChooser();
  setStatus(
    mode === 'guided'
      ? 'Startup set to DiskTools guided mode.'
      : 'Startup set to DiskEdit expert mode. Arm expert actions for risky commands.',
    mode === 'guided' ? 'info' : 'warning'
  );
}

function markFirstRunChooserCompleted(): void {
  try {
    window.localStorage.setItem(WORKBENCH_ONBOARDING_STORAGE_KEY, 'true');
  } catch {
    // Ignore storage failures.
  }
}

function setStatus(text: string, tone?: StatusTone): void {
  if (elements.status) {
    elements.status.textContent = text;
  }
  setStatusTone(tone ?? inferStatusTone(text));
}

function setActivePath(filePath: string): void {
  if (elements.activePath) {
    elements.activePath.textContent = filePath;
    elements.activePath.setAttribute('title', filePath);
  }
}

function setStatusTone(tone: StatusTone): void {
  if (!elements.statusBar) {
    return;
  }

  elements.statusBar.classList.remove(...STATUS_TONE_CLASSES);
  elements.statusBar.classList.add(`tone-${tone}`);
}

function inferStatusTone(message: string): StatusTone {
  const text = message.toLowerCase();
  if (text.includes('error') || text.includes('failed') || text.includes('unable')) {
    return 'error';
  }
  if (text.includes('warning') || text.includes('canceled') || text.includes('empty')) {
    return 'warning';
  }
  if (text.includes('running') || text.includes('loading') || text.includes('opening') || text.includes('stopping')) {
    return 'busy';
  }
  if (text.includes('loaded') || text.includes('saved') || text.includes('copied') || text.includes('complete')) {
    return 'success';
  }
  return 'info';
}

function setProgress(current: number | undefined, total: number | undefined, busy: boolean): void {
  const progress = elements.statusProgress;
  const wrap = elements.statusProgressWrap;
  if (!progress || !wrap) {
    return;
  }

  if (typeof current === 'number' && typeof total === 'number' && total > 0) {
    progress.max = total;
    progress.value = Math.max(0, Math.min(current, total));
    wrap.classList.remove('isHidden');
    if (elements.statusProgressLabel) {
      elements.statusProgressLabel.textContent = `${Math.max(0, Math.min(current, total))}/${total}`;
    }
    return;
  }

  if (busy) {
    progress.removeAttribute('value');
    wrap.classList.remove('isHidden');
    if (elements.statusProgressLabel) {
      elements.statusProgressLabel.textContent = 'Working...';
    }
    return;
  }

  progress.value = 0;
  wrap.classList.add('isHidden');
  if (elements.statusProgressLabel) {
    elements.statusProgressLabel.textContent = '';
  }
}

function applyBatchItemUpdate(message: Record<string, unknown>): void {
  if (typeof message.id !== 'string') {
    return;
  }

  const target = queueState.items.find((item) => item.id === message.id);
  if (!target) {
    return;
  }

  if (isQueueStatus(message.status)) {
    target.status = message.status;
  }
  if (typeof message.message === 'string') {
    target.message = message.message;
  }
  if (typeof message.parserId === 'string') {
    target.parserId = message.parserId;
  }
  if (typeof message.sizeBytes === 'number') {
    target.sizeBytes = message.sizeBytes;
  }

  if (target.status === 'running') {
    queueState.isRunning = true;
  }

  renderQueue();
  updateQueueButtons();
}

function renderQueue(): void {
  if (!elements.queueRows) {
    return;
  }

  elements.queueRows.innerHTML = '';
  if (queueState.items.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'Batch queue is empty.';
    row.appendChild(cell);
    elements.queueRows.appendChild(row);
    if (elements.queueMeta) {
      elements.queueMeta.textContent = '0 jobs';
    }
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of queueState.items) {
    const row = document.createElement('tr');
    row.setAttribute('data-queue-id', item.id);
    row.classList.add('queueRow', `queueRow--${item.status}`);
    if (item.id === queueState.selectedId) {
      row.classList.add('is-selected');
    }

    appendCell(row, item.status.toUpperCase());
    appendCell(row, item.filePath);
    appendCell(row, item.parserId ?? '-');
    appendCell(row, typeof item.sizeBytes === 'number' ? formatBytes(item.sizeBytes) : '-');
    appendCell(row, item.message ?? '-');
    fragment.appendChild(row);
  }

  elements.queueRows.appendChild(fragment);
  if (elements.queueMeta) {
    elements.queueMeta.textContent = `${queueState.items.length} job(s)`;
  }
}

function updateQueueButtons(): void {
  const selectedIndex = queueState.selectedId
    ? queueState.items.findIndex((item) => item.id === queueState.selectedId)
    : -1;
  const hasSelection = selectedIndex >= 0;
  const hasItems = queueState.items.length > 0;
  const running = queueState.isRunning;

  setDisabled(elements.addQueueFilesButton, running);
  setDisabled(elements.addQueueFolderButton, running);
  setDisabled(elements.removeQueueItemButton, running || !hasSelection);
  setDisabled(elements.clearQueueButton, running || !hasItems);
  setDisabled(elements.moveQueueUpButton, running || !hasSelection || selectedIndex <= 0);
  setDisabled(
    elements.moveQueueDownButton,
    running || !hasSelection || selectedIndex >= queueState.items.length - 1
  );
  setDisabled(elements.saveQueueButton, running || !hasItems);
  setDisabled(elements.loadQueueButton, running);
  setDisabled(elements.exportDiagnosticsButton, false);
  setDisabled(elements.runQueueButton, running || !hasItems);
  setDisabled(elements.stopQueueButton, !running);

  setDisabled(elements.guidedOpenDiskButton, running);
  setDisabled(elements.guidedAddFilesButton, running);
  setDisabled(elements.guidedAddFolderButton, running);
  setDisabled(elements.guidedLoadPlanButton, running);
  setDisabled(elements.guidedRunQueueButton, running || !hasItems);
  setDisabled(elements.guidedExportDiagnosticsButton, false);
}

function appendCell(row: HTMLTableRowElement, text: string): void {
  const cell = document.createElement('td');
  cell.textContent = text;
  row.appendChild(cell);
}

function setDisabled(element: HTMLElement | null, disabled: boolean): void {
  if (!(element instanceof HTMLButtonElement)) {
    return;
  }
  element.disabled = disabled;
}

function setToggleState(element: HTMLElement | null, active: boolean): void {
  if (!(element instanceof HTMLButtonElement)) {
    return;
  }
  element.classList.toggle('is-active', active);
  element.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function createQueueItemId(): string {
  return `queue-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function formatBytes(value: number): string {
  return `${value.toLocaleString()} B`;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

function isQueueStatus(value: unknown): value is QueueItemStatus {
  return (
    value === 'queued' ||
    value === 'running' ||
    value === 'done' ||
    value === 'error' ||
    value === 'canceled'
  );
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

function loadWorkbenchUiPrefs(): WorkbenchUiPrefs {
  try {
    const raw = window.localStorage.getItem(WORKBENCH_UI_STORAGE_KEY);
    if (!raw) {
      return { workMode: 'guided', expertArmed: false };
    }

    const parsed = JSON.parse(raw) as Partial<WorkbenchUiPrefs>;
    const workMode: WorkMode = parsed.workMode === 'expert' ? 'expert' : 'guided';
    const expertArmed = parsed.expertArmed === true;
    return {
      workMode,
      expertArmed: workMode === 'expert' ? expertArmed : false
    };
  } catch {
    return { workMode: 'guided', expertArmed: false };
  }
}

function persistWorkbenchUiPrefs(): void {
  try {
    const safe: WorkbenchUiPrefs = {
      workMode: uiState.workMode === 'expert' ? 'expert' : 'guided',
      expertArmed: uiState.workMode === 'expert' && uiState.expertArmed
    };
    window.localStorage.setItem(WORKBENCH_UI_STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // Ignore storage failures.
  }
}

function resolveDesktopBridge(candidate: Partial<DesktopBridge> | undefined): DesktopBridge {
  return {
    async postMessage(message: unknown): Promise<void> {
      if (candidate && typeof candidate.postMessage === 'function') {
        return candidate.postMessage(message);
      }
      return Promise.reject(new Error(DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE));
    },
    async openDiskDialog(): Promise<string | undefined> {
      if (candidate && typeof candidate.openDiskDialog === 'function') {
        return candidate.openDiskDialog();
      }
      return Promise.reject(new Error(DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE));
    },
    async openDisksDialog(): Promise<string[]> {
      if (candidate && typeof candidate.openDisksDialog === 'function') {
        return candidate.openDisksDialog();
      }
      return Promise.reject(new Error(DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE));
    },
    async openDiskFolderDialog(): Promise<FolderScanResult> {
      if (candidate && typeof candidate.openDiskFolderDialog === 'function') {
        return candidate.openDiskFolderDialog();
      }
      return Promise.reject(new Error(DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE));
    },
    async expandDiskCandidates(paths: string[]): Promise<FolderScanResult> {
      if (candidate && typeof candidate.expandDiskCandidates === 'function') {
        return candidate.expandDiskCandidates(paths);
      }
      return Promise.reject(new Error(DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE));
    },
    async openFeedbackIssue(context: unknown): Promise<void> {
      if (candidate && typeof candidate.openFeedbackIssue === 'function') {
        return candidate.openFeedbackIssue(context);
      }
      return Promise.reject(new Error(DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE));
    },
    async writeClipboard(text: string): Promise<void> {
      if (candidate && typeof candidate.writeClipboard === 'function') {
        return candidate.writeClipboard(text);
      }
      return Promise.reject(new Error(DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE));
    },
    async saveBatchPlan(entries: BatchPlanEntryPayload[]): Promise<BatchPlanSaveResult> {
      if (candidate && typeof candidate.saveBatchPlan === 'function') {
        return candidate.saveBatchPlan(entries);
      }
      return Promise.reject(new Error(DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE));
    },
    async loadBatchPlan(): Promise<BatchPlanLoadResult> {
      if (candidate && typeof candidate.loadBatchPlan === 'function') {
        return candidate.loadBatchPlan();
      }
      return Promise.reject(new Error(DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE));
    },
    async exportDiagnostics(snapshot: unknown): Promise<DiagnosticsExportResult> {
      if (candidate && typeof candidate.exportDiagnostics === 'function') {
        return candidate.exportDiagnostics(snapshot);
      }
      return Promise.reject(new Error(DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE));
    },
    onHostMessage(handler: (message: unknown) => void): () => void {
      if (candidate && typeof candidate.onHostMessage === 'function') {
        return candidate.onHostMessage(handler);
      }
      return () => {
        // no-op when bridge is unavailable
      };
    }
  };
}
