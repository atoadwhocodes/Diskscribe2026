import './desktopTheme.css';
import './webview/editor.css';
import { APP_DESKTOP_NAME } from './appMeta';

type QueueItemStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled';
type StatusTone = 'info' | 'success' | 'warning' | 'error' | 'busy';

const SUPPORTED_DISK_EXTENSIONS = /\.(hdi|nhd|d88|hdm|hdd|fdi|fdd)$/i;
const STATUS_TONE_CLASSES = ['tone-info', 'tone-success', 'tone-warning', 'tone-error', 'tone-busy'];

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

interface DesktopBridge {
  postMessage(message: unknown): Promise<void>;
  openDiskDialog(): Promise<string | undefined>;
  openDisksDialog(): Promise<string[]>;
  openDiskFolderDialog(): Promise<string[]>;
  writeClipboard(text: string): Promise<void>;
  saveBatchPlan(entries: BatchPlanEntryPayload[]): Promise<BatchPlanSaveResult>;
  loadBatchPlan(): Promise<BatchPlanLoadResult>;
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

const elements = {
  brandTitle: document.getElementById('brandTitle'),
  brandVersion: document.getElementById('brandVersion'),
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

window.acquireVsCodeApi = () => vscodeApi;
document.title = APP_DESKTOP_NAME;
if (elements.brandTitle) {
  elements.brandTitle.textContent = APP_DESKTOP_NAME;
}

window.diskScribeDesktop.onHostMessage((message) => {
  window.dispatchEvent(new MessageEvent('message', { data: message }));
  handleDesktopMessage(message);
});

wireDesktopControls();
wireGlobalShortcuts();
wireDragAndDrop();

void import('./webview/editor')
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
}

function wireGlobalShortcuts(): void {
  window.addEventListener('keydown', (event) => {
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
  const supported = filePaths.filter(isSupportedDiskPath);
  if (supported.length === 0) {
    setStatus('Dropped files contained no supported PC-98 disk images.', 'warning');
    return;
  }

  if (supported.length === 1 && !queueState.isRunning) {
    const opened = await openQueueItem(supported[0]);
    if (opened) {
      setStatus(`Opened ${supported[0]}.`, 'success');
    }
    return;
  }

  addQueueItems(supported);
  setStatus(`Added ${supported.length} file(s) from drag-and-drop.`, 'success');
}

async function handleOpenDisk(): Promise<void> {
  let selectedPath: string | undefined;
  try {
    selectedPath = await window.diskScribeDesktop.openDiskDialog();
  } catch (error: unknown) {
    setStatus(`Unable to open file picker: ${toErrorMessage(error)}`, 'error');
    return;
  }
  if (!selectedPath) {
    return;
  }

  setActivePath(selectedPath);
  setStatus(`Opening ${selectedPath}...`, 'busy');
  await postDesktopMessage(
    {
      type: 'desktop.openDisk',
      filePath: selectedPath
    },
    'Unable to open selected disk'
  );
}

async function postDesktopMessage(message: unknown, failurePrefix = 'Action failed'): Promise<boolean> {
  try {
    await window.diskScribeDesktop.postMessage(message);
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
    selectedPaths = await window.diskScribeDesktop.openDisksDialog();
  } catch (error: unknown) {
    setStatus(`Unable to open file picker: ${toErrorMessage(error)}`, 'error');
    return;
  }
  if (!Array.isArray(selectedPaths) || selectedPaths.length === 0) {
    return;
  }

  addQueueItems(selectedPaths);
  setStatus(`Added ${selectedPaths.length} file(s) to batch queue.`, 'success');
}

async function handleAddQueueFolder(): Promise<void> {
  let selectedPaths: string[];
  try {
    selectedPaths = await window.diskScribeDesktop.openDiskFolderDialog();
  } catch (error: unknown) {
    setStatus(`Unable to open folder picker: ${toErrorMessage(error)}`, 'error');
    return;
  }
  if (!Array.isArray(selectedPaths) || selectedPaths.length === 0) {
    setStatus('No supported disk images found in selected folder.', 'warning');
    return;
  }

  addQueueItems(selectedPaths);
  setStatus(`Added ${selectedPaths.length} file(s) from folder.`, 'success');
}

function addQueueItems(filePaths: string[]): void {
  const seen = new Set(queueState.items.map((item) => item.filePath.toLowerCase()));
  for (const filePath of filePaths) {
    if (!filePath || seen.has(filePath.toLowerCase())) {
      continue;
    }

    seen.add(filePath.toLowerCase());
    queueState.items.push({
      id: createQueueItemId(),
      filePath,
      status: 'queued'
    });
  }

  if (!queueState.selectedId && queueState.items.length > 0) {
    queueState.selectedId = queueState.items[0].id;
  }

  renderQueue();
  updateQueueButtons();
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

  queueState.items = [];
  queueState.selectedId = undefined;
  renderQueue();
  updateQueueButtons();
  setStatus('Cleared batch queue.', 'info');
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

async function saveQueuePlan(): Promise<void> {
  const entries: BatchPlanEntryPayload[] = queueState.items.map((item) => ({
    id: item.id,
    filePath: item.filePath
  }));
  const result = await invokeDesktop(
    () => window.diskScribeDesktop.saveBatchPlan(entries),
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

  const result = await invokeDesktop(() => window.diskScribeDesktop.loadBatchPlan(), 'Failed to load batch plan');
  if (!result) {
    return;
  }
  if (result.error) {
    setStatus(`Failed to load batch plan: ${result.error}`, 'error');
    return;
  }

  queueState.items = [];
  addQueueItems(result.entries.map((entry) => entry.filePath));
  if (result.filePath) {
    setStatus(`Loaded ${queueState.items.length} queue item(s) from ${result.filePath}.`, 'success');
  }
}

async function runQueue(): Promise<void> {
  if (queueState.isRunning) {
    return;
  }
  if (queueState.items.length === 0) {
    setStatus('Batch queue is empty.', 'warning');
    return;
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

  setStatus(`Running ${queueState.items.length} queued item(s)...`, 'busy');
  setProgress(0, queueState.items.length, true);

  const started = await postDesktopMessage(
    {
      type: 'desktop.batchRun',
      items: queueState.items.map((item) => ({
        id: item.id,
        filePath: item.filePath
      }))
    },
    'Unable to start batch queue'
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

  setStatus('Stopping batch queue after current file...', 'busy');
  void postDesktopMessage({ type: 'desktop.batchStop' }, 'Unable to stop batch queue');
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
          setStatus(`Batch canceled (${message.completed}/${message.total} completed).`, 'warning');
        } else {
          setStatus(
            `Batch complete (${message.completed} succeeded, ${numberOrUndefined(message.failed) ?? 0} failed).`,
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
    cell.textContent = 'Queue is empty.';
    row.appendChild(cell);
    elements.queueRows.appendChild(row);
    if (elements.queueMeta) {
      elements.queueMeta.textContent = '0 items';
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
    elements.queueMeta.textContent = `${queueState.items.length} item(s)`;
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
  setDisabled(elements.runQueueButton, running || !hasItems);
  setDisabled(elements.stopQueueButton, !running);
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

function isSupportedDiskPath(filePath: string): boolean {
  return SUPPORTED_DISK_EXTENSIONS.test(filePath);
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
