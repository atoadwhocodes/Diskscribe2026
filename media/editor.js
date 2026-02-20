const vscode = acquireVsCodeApi();

const BYTES_PER_ROW = 16;
const ROW_HEIGHT = 20;
const OVERSCAN_ROWS = 24;
const CHUNK_BYTES = 65536;
const MAX_CHUNKS_PER_MODE = 128;

const persisted = vscode.getState() || {};

const elements = {
  status: document.getElementById('status'),
  fileName: document.getElementById('fileName'),
  format: document.getElementById('format'),
  parserId: document.getElementById('parserId'),
  dataOffsetBytes: document.getElementById('dataOffsetBytes'),
  sizeBytes: document.getElementById('sizeBytes'),
  sectorSize: document.getElementById('sectorSize'),
  totalSectors: document.getElementById('totalSectors'),
  geometry: document.getElementById('geometry'),
  partitionRows: document.getElementById('partitionRows'),
  jumpResult: document.getElementById('jumpResult'),
  hexModeSelect: document.getElementById('hexModeSelect'),
  hexRangeMeta: document.getElementById('hexRangeMeta'),
  hexScroller: document.getElementById('hexScroller'),
  hexSpacer: document.getElementById('hexSpacer'),
  hexRows: document.getElementById('hexRows'),
  shiftJisPreview: document.getElementById('shiftJisPreview'),
  notes: document.getElementById('notes'),
  refreshButton: document.getElementById('refreshButton')
};

const state = {
  summary: undefined,
  defaultMode: persisted.defaultMode === 'raw' ? 'raw' : 'disk',
  mode: persisted.mode === 'raw' ? 'raw' : 'disk',
  fileSize: 0,
  dataOffset: 0,
  sectorSize: 512,
  geometry: undefined,
  selectionStart: Number.isInteger(persisted.selectionStart) ? persisted.selectionStart : 0,
  selectionEnd: Number.isInteger(persisted.selectionEnd) ? persisted.selectionEnd : 0,
  cursorOffset: Number.isInteger(persisted.cursorOffset) ? persisted.cursorOffset : 0,
  anchorOffset: Number.isInteger(persisted.anchorOffset) ? persisted.anchorOffset : 0,
  caches: {
    disk: new Map(),
    raw: new Map()
  },
  requestSeq: 0,
  pendingById: new Map(),
  pendingKeys: new Set(),
  renderedRowStart: -1,
  renderedRowEnd: -1
};

if (elements.refreshButton) {
  elements.refreshButton.addEventListener('click', () => {
    post({ type: 'refresh' });
  });
}

if (elements.hexModeSelect) {
  elements.hexModeSelect.addEventListener('change', () => {
    const requested = elements.hexModeSelect.value === 'raw' ? 'raw' : 'disk';
    const nextMode = chooseMode(requested);
    if (nextMode !== state.mode) {
      state.mode = nextMode;
    }

    const clampedStart = clampOffset(state.selectionStart, state.mode);
    const clampedEnd = clampOffset(state.selectionEnd, state.mode);
    state.selectionStart = Math.min(clampedStart, clampedEnd);
    state.selectionEnd = Math.max(clampedStart, clampedEnd);
    state.cursorOffset = clampOffset(state.cursorOffset, state.mode);
    state.anchorOffset = state.selectionStart;
    persistState();

    post({
      type: 'hex.select',
      mode: state.mode,
      start: state.selectionStart,
      end: state.selectionEnd
    });

    renderHexViewport(true);
    scrollToOffset(state.cursorOffset, false);
  });
}

if (elements.hexScroller) {
  elements.hexScroller.addEventListener('scroll', () => {
    renderHexViewport(false);
  });
}

if (elements.hexRows) {
  elements.hexRows.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-byte-off]') : null;
    if (!target) {
      return;
    }

    const offset = Number.parseInt(target.getAttribute('data-byte-off') || '', 10);
    if (!Number.isFinite(offset)) {
      return;
    }

    if (event.shiftKey) {
      const start = Math.min(state.anchorOffset, offset);
      const end = Math.max(state.anchorOffset, offset);
      state.selectionStart = clampOffset(start, state.mode);
      state.selectionEnd = clampOffset(end, state.mode);
    } else {
      state.anchorOffset = offset;
      state.selectionStart = clampOffset(offset, state.mode);
      state.selectionEnd = clampOffset(offset, state.mode);
    }

    state.cursorOffset = clampOffset(offset, state.mode);
    persistState();
    post({
      type: 'hex.select',
      mode: state.mode,
      start: state.selectionStart,
      end: state.selectionEnd
    });

    renderHexViewport(false);
  });
}

window.addEventListener('resize', () => {
  renderHexViewport(false);
});

window.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || typeof message.type !== 'string') {
    return;
  }

  switch (message.type) {
    case 'diskSummary':
      renderSummary(message.summary);
      break;
    case 'hex.init':
      handleHexInit(message);
      break;
    case 'hex.data':
      handleHexData(message);
      break;
    case 'hex.jumpAck':
      handleHexJumpAck(message);
      break;
    case 'hex.selectAck':
      handleHexSelectAck(message);
      break;
    case 'error':
      renderError(message.message);
      break;
    default:
      break;
  }
});

function renderSummary(summary) {
  if (!summary) {
    return;
  }

  state.summary = summary;
  state.fileSize = Number(summary.sizeBytes) || 0;
  state.dataOffset = Number(summary.dataOffsetBytes) || 0;
  state.sectorSize = Number(summary.sectorSize) || 512;
  state.geometry = summary.geometry;

  setText(elements.status, 'Disk image loaded.');
  setText(elements.fileName, summary.fileName);
  setText(elements.format, summary.format);
  setText(elements.parserId, summary.parserId || '-');
  setText(elements.dataOffsetBytes, withUnits(summary.dataOffsetBytes, 'bytes'));
  setText(elements.sizeBytes, withUnits(summary.sizeBytes, 'bytes'));
  setText(elements.sectorSize, withUnits(summary.sectorSize, 'bytes'));
  setText(elements.totalSectors, formatNumber(summary.totalSectors));

  if (summary.geometry) {
    setText(
      elements.geometry,
      `${formatNumber(summary.geometry.cylinders)} cyl / ${summary.geometry.heads} heads / ${summary.geometry.sectorsPerTrack} spt`
    );
  } else {
    setText(elements.geometry, 'Unknown');
  }

  renderPartitions(summary.partitions || []);
  setText(elements.shiftJisPreview, summary.shiftJisPreview || '(no preview)');
  setText(
    elements.notes,
    summary.notes && summary.notes.length > 0
      ? summary.notes.map((note) => `- ${note}`).join('\n')
      : '- none'
  );

  clearChunkCaches();
  state.pendingById.clear();
  state.pendingKeys.clear();

  state.mode = chooseMode(state.defaultMode);
  state.selectionStart = clampOffset(state.selectionStart, state.mode);
  state.selectionEnd = clampOffset(state.selectionEnd, state.mode);
  state.cursorOffset = clampOffset(state.cursorOffset, state.mode);
  state.anchorOffset = state.selectionStart;
  syncModeSelect();
  persistState();
  renderHexViewport(true);
}

function handleHexInit(message) {
  const nextDefault = message.defaultMode === 'raw' ? 'raw' : 'disk';
  state.defaultMode = nextDefault;
  state.mode = chooseMode(state.mode || nextDefault);

  if (Number.isFinite(message.fileSize)) {
    state.fileSize = Number(message.fileSize);
  }
  if (Number.isFinite(message.dataOffset)) {
    state.dataOffset = Number(message.dataOffset);
  }
  if (Number.isFinite(message.sectorSize) && Number(message.sectorSize) > 0) {
    state.sectorSize = Number(message.sectorSize);
  }

  state.selectionStart = clampOffset(state.selectionStart, state.mode);
  state.selectionEnd = clampOffset(state.selectionEnd, state.mode);
  state.cursorOffset = clampOffset(state.cursorOffset, state.mode);
  state.anchorOffset = state.selectionStart;
  syncModeSelect();
  persistState();
  renderHexViewport(true);
}

function handleHexData(message) {
  if (typeof message.requestId !== 'string') {
    return;
  }

  const pending = state.pendingById.get(message.requestId);
  if (pending) {
    state.pendingById.delete(message.requestId);
    state.pendingKeys.delete(pending.key);
  }

  const mode = message.mode === 'raw' ? 'raw' : 'disk';
  const offset = Number.isInteger(message.offset) ? message.offset : pending ? pending.offset : 0;
  const bytes = decodeBase64(message.bytesBase64);
  if (bytes.length === 0) {
    if (mode === state.mode) {
      renderHexViewport(false);
    }
    return;
  }

  const cache = getModeCache(mode);
  cache.delete(offset);
  cache.set(offset, bytes);
  trimChunkCache(cache);

  if (mode === state.mode) {
    renderHexViewport(false);
  }
}

function handleHexJumpAck(message) {
  const mode = message.mode === 'raw' ? 'raw' : 'disk';
  state.mode = chooseMode(mode);
  syncModeSelect();

  const offset = clampOffset(Number(message.offset) || 0, state.mode);
  state.cursorOffset = offset;
  state.anchorOffset = offset;
  state.selectionStart = offset;
  state.selectionEnd = offset;

  setText(
    elements.jumpResult,
    `Jump target: ${state.mode} offset ${formatNumber(offset)} (0x${offset
      .toString(16)
      .toUpperCase()})`
  );

  persistState();
  renderHexViewport(true);
  scrollToOffset(offset, true);
}

function handleHexSelectAck(message) {
  const mode = message.mode === 'raw' ? 'raw' : 'disk';
  state.mode = chooseMode(mode);
  syncModeSelect();

  const start = clampOffset(Number(message.start) || 0, state.mode);
  const end = clampOffset(Number(message.end) || 0, state.mode);
  state.selectionStart = Math.min(start, end);
  state.selectionEnd = Math.max(start, end);
  state.cursorOffset = state.selectionStart;
  state.anchorOffset = state.selectionStart;
  persistState();
  renderHexViewport(false);
}

function renderError(message) {
  setText(elements.status, 'Unable to load disk image.');
  setText(elements.jumpResult, 'No active jump target.');
  renderPartitions([]);
  setText(elements.hexRangeMeta, 'No range selected.');
  if (elements.hexRows) {
    elements.hexRows.textContent = '';
  }
  if (elements.hexSpacer) {
    elements.hexSpacer.style.height = '0px';
  }
  setText(elements.notes, `- ${message || 'Unknown error'}`);
}

function renderPartitions(partitions) {
  if (!elements.partitionRows) {
    return;
  }

  elements.partitionRows.innerHTML = '';

  if (!Array.isArray(partitions) || partitions.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'No partitions detected.';
    row.appendChild(cell);
    elements.partitionRows.appendChild(row);
    return;
  }

  for (const partition of partitions) {
    const row = document.createElement('tr');
    const bootMarker = partition.bootable ? '*' : '';
    const typeHex = Number(partition.typeCode || 0).toString(16).padStart(2, '0');

    appendCell(row, String(partition.index || '-'));
    appendCell(row, `${bootMarker}${partition.typeName || 'Unknown'} (0x${typeHex})`);
    appendCell(row, formatNumber(partition.startLba));
    appendCell(row, formatNumber(partition.totalSectors));
    appendCell(row, `${formatNumber(partition.startOffsetBytes)} bytes`);
    elements.partitionRows.appendChild(row);
  }
}

function renderHexViewport(force) {
  if (!elements.hexScroller || !elements.hexSpacer || !elements.hexRows) {
    return;
  }

  const viewLength = getViewLength(state.mode);
  if (viewLength <= 0) {
    elements.hexSpacer.style.height = '0px';
    elements.hexRows.textContent = '';
    setText(elements.hexRangeMeta, `No bytes in ${state.mode} view.`);
    state.renderedRowStart = -1;
    state.renderedRowEnd = -1;
    return;
  }

  const totalRows = Math.ceil(viewLength / BYTES_PER_ROW);
  elements.hexSpacer.style.height = `${Math.max(totalRows * ROW_HEIGHT, ROW_HEIGHT)}px`;

  const visible = getVisibleRows(totalRows);
  ensureBytesForRows(visible.r0, visible.r1);

  if (!force && visible.r0 === state.renderedRowStart && visible.r1 === state.renderedRowEnd) {
    updateRangeMeta();
    return;
  }

  elements.hexRows.textContent = '';
  const fragment = document.createDocumentFragment();
  for (let rowIndex = visible.r0; rowIndex <= visible.r1; rowIndex += 1) {
    fragment.appendChild(renderRow(rowIndex, viewLength));
  }
  elements.hexRows.appendChild(fragment);

  state.renderedRowStart = visible.r0;
  state.renderedRowEnd = visible.r1;
  updateRangeMeta();
}

function renderRow(rowIndex, viewLength) {
  const row = document.createElement('div');
  row.className = 'hexRow';
  row.style.transform = `translateY(${rowIndex * ROW_HEIGHT}px)`;

  const rowOffset = rowIndex * BYTES_PER_ROW;
  const address = document.createElement('span');
  address.className = 'hexAddr';
  address.textContent = rowOffset.toString(16).padStart(8, '0');
  row.appendChild(address);

  const bytesColumn = document.createElement('span');
  bytesColumn.className = 'hexBytes';

  const asciiColumn = document.createElement('span');
  asciiColumn.className = 'hexAscii';

  for (let i = 0; i < BYTES_PER_ROW; i += 1) {
    const offset = rowOffset + i;
    if (offset >= viewLength) {
      appendPlaceholderByte(bytesColumn, asciiColumn);
      continue;
    }

    const byteValue = getByte(offset, state.mode);
    const isRange = offset >= state.selectionStart && offset <= state.selectionEnd;
    const isCursor = offset === state.cursorOffset;

    const byteCell = document.createElement('span');
    byteCell.className = 'hexByte';
    byteCell.setAttribute('data-byte-off', String(offset));
    if (byteValue === undefined) {
      byteCell.classList.add('is-missing');
      byteCell.textContent = '..';
    } else {
      byteCell.textContent = byteValue.toString(16).padStart(2, '0');
    }
    if (isRange) {
      byteCell.classList.add('is-range');
    }
    if (isCursor) {
      byteCell.classList.add('is-cursor');
    }
    bytesColumn.appendChild(byteCell);
    bytesColumn.appendChild(document.createTextNode(' '));

    const asciiCell = document.createElement('span');
    asciiCell.className = 'asciiByte';
    asciiCell.setAttribute('data-byte-off', String(offset));
    if (byteValue === undefined) {
      asciiCell.classList.add('is-missing');
      asciiCell.textContent = ' ';
    } else {
      asciiCell.textContent = byteValue >= 0x20 && byteValue <= 0x7e ? String.fromCharCode(byteValue) : '.';
    }
    if (isRange) {
      asciiCell.classList.add('is-range');
    }
    if (isCursor) {
      asciiCell.classList.add('is-cursor');
    }
    asciiColumn.appendChild(asciiCell);
  }

  row.appendChild(bytesColumn);
  row.appendChild(asciiColumn);
  return row;
}

function appendPlaceholderByte(bytesColumn, asciiColumn) {
  const byteCell = document.createElement('span');
  byteCell.className = 'hexByte is-placeholder';
  byteCell.textContent = '  ';
  bytesColumn.appendChild(byteCell);
  bytesColumn.appendChild(document.createTextNode(' '));

  const asciiCell = document.createElement('span');
  asciiCell.className = 'asciiByte is-placeholder';
  asciiCell.textContent = ' ';
  asciiColumn.appendChild(asciiCell);
}

function ensureBytesForRows(r0, r1) {
  const viewLength = getViewLength(state.mode);
  if (viewLength <= 0) {
    return;
  }

  const start = r0 * BYTES_PER_ROW;
  const endExclusive = Math.min(viewLength, (r1 + 1) * BYTES_PER_ROW);
  if (endExclusive <= start) {
    return;
  }

  const firstChunk = Math.floor(start / CHUNK_BYTES);
  const lastChunk = Math.floor((endExclusive - 1) / CHUNK_BYTES);
  for (let chunkIndex = firstChunk; chunkIndex <= lastChunk; chunkIndex += 1) {
    const chunkStart = chunkIndex * CHUNK_BYTES;
    const chunkLength = Math.min(CHUNK_BYTES, viewLength - chunkStart);
    if (chunkLength <= 0) {
      continue;
    }
    requestChunk(state.mode, chunkStart, chunkLength);
  }
}

function requestChunk(mode, offset, length) {
  const cache = getModeCache(mode);
  if (cache.has(offset)) {
    return;
  }

  const key = `${mode}:${offset}:${length}`;
  if (state.pendingKeys.has(key)) {
    return;
  }

  const requestId = `hex-${++state.requestSeq}`;
  state.pendingById.set(requestId, { mode, offset, length, key });
  state.pendingKeys.add(key);

  post({
    type: 'hex.read',
    requestId,
    mode,
    offset,
    length
  });
}

function getByte(offset, mode) {
  const cache = getModeCache(mode);
  const chunkStart = Math.floor(offset / CHUNK_BYTES) * CHUNK_BYTES;
  const chunk = cache.get(chunkStart);
  if (!chunk) {
    return undefined;
  }

  const index = offset - chunkStart;
  if (index < 0 || index >= chunk.length) {
    return undefined;
  }
  return chunk[index];
}

function clearChunkCaches() {
  state.caches.disk.clear();
  state.caches.raw.clear();
}

function trimChunkCache(cache) {
  while (cache.size > MAX_CHUNKS_PER_MODE) {
    const first = cache.keys().next();
    if (first.done) {
      break;
    }
    cache.delete(first.value);
  }
}

function getModeCache(mode) {
  return mode === 'raw' ? state.caches.raw : state.caches.disk;
}

function getVisibleRows(totalRows) {
  const scroller = elements.hexScroller;
  if (!scroller) {
    return { r0: 0, r1: Math.max(0, totalRows - 1) };
  }

  const top = scroller.scrollTop;
  const height = scroller.clientHeight || 360;
  let r0 = Math.floor(top / ROW_HEIGHT) - OVERSCAN_ROWS;
  let r1 = Math.ceil((top + height) / ROW_HEIGHT) + OVERSCAN_ROWS;

  r0 = Math.max(0, r0);
  r1 = Math.max(r0, Math.min(totalRows - 1, r1));
  return { r0, r1 };
}

function scrollToOffset(offset, center) {
  const scroller = elements.hexScroller;
  if (!scroller) {
    return;
  }

  const row = Math.floor(offset / BYTES_PER_ROW);
  let targetTop = row * ROW_HEIGHT;
  if (center) {
    targetTop = Math.max(0, targetTop - Math.floor(scroller.clientHeight / 2));
  }
  scroller.scrollTop = targetTop;
}

function updateRangeMeta() {
  const mode = state.mode;
  const viewLength = getViewLength(mode);
  if (viewLength <= 0) {
    setText(elements.hexRangeMeta, `No bytes in ${mode} view.`);
    return;
  }

  const start = clampOffset(state.selectionStart, mode);
  const end = clampOffset(state.selectionEnd, mode);
  const cursor = clampOffset(state.cursorOffset, mode);
  const rangeLength = Math.abs(end - start) + 1;
  let meta = `${mode} range ${formatNumber(start)}-${formatNumber(end)} (${formatNumber(
    rangeLength
  )} bytes) | cursor ${formatNumber(cursor)}`;

  const diskOffset = toDiskOffset(mode, cursor);
  if (diskOffset !== undefined && diskOffset >= 0) {
    const lba = Math.floor(diskOffset / (state.sectorSize || 512));
    meta += ` | LBA ${formatNumber(lba)}`;

    const chs = toChs(lba);
    if (chs) {
      meta += ` | CHS ${chs.c}/${chs.h}/${chs.s}`;
    }
  } else {
    meta += ' | LBA n/a';
  }

  setText(elements.hexRangeMeta, meta);
}

function toDiskOffset(mode, offset) {
  if (mode === 'disk') {
    return offset;
  }
  const diskOffset = offset - state.dataOffset;
  return diskOffset >= 0 ? diskOffset : undefined;
}

function toChs(lba) {
  const geometry = state.geometry;
  if (!geometry) {
    return undefined;
  }

  const heads = Number(geometry.heads);
  const sectorsPerTrack = Number(geometry.sectorsPerTrack);
  if (!Number.isFinite(heads) || !Number.isFinite(sectorsPerTrack) || heads <= 0 || sectorsPerTrack <= 0) {
    return undefined;
  }

  const sectorsPerCylinder = heads * sectorsPerTrack;
  const c = Math.floor(lba / sectorsPerCylinder);
  const remainder = lba % sectorsPerCylinder;
  const h = Math.floor(remainder / sectorsPerTrack);
  const s = (remainder % sectorsPerTrack) + 1;
  return { c, h, s };
}

function getViewLength(mode) {
  if (mode === 'disk') {
    return Math.max(0, state.fileSize - state.dataOffset);
  }
  return Math.max(0, state.fileSize);
}

function chooseMode(mode) {
  if (mode === 'disk') {
    if (getViewLength('disk') <= 0 && getViewLength('raw') > 0) {
      return 'raw';
    }
    return 'disk';
  }
  return 'raw';
}

function clampOffset(offset, mode) {
  const viewLength = getViewLength(mode);
  if (viewLength <= 0) {
    return 0;
  }
  const numeric = Number.isFinite(offset) ? Math.floor(offset) : 0;
  if (numeric < 0) {
    return 0;
  }
  if (numeric >= viewLength) {
    return viewLength - 1;
  }
  return numeric;
}

function syncModeSelect() {
  if (elements.hexModeSelect) {
    elements.hexModeSelect.value = state.mode;
  }
}

function decodeBase64(base64) {
  if (typeof base64 !== 'string' || base64.length === 0) {
    return new Uint8Array();
  }

  try {
    const binary = atob(base64);
    const output = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      output[i] = binary.charCodeAt(i);
    }
    return output;
  } catch {
    return new Uint8Array();
  }
}

function setText(element, text) {
  if (element) {
    element.textContent = text;
  }
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function withUnits(value, units) {
  return `${formatNumber(value)} ${units}`;
}

function appendCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = value;
  row.appendChild(cell);
}

function post(message) {
  vscode.postMessage(message);
}

function persistState() {
  vscode.setState({
    defaultMode: state.defaultMode,
    mode: state.mode,
    selectionStart: state.selectionStart,
    selectionEnd: state.selectionEnd,
    cursorOffset: state.cursorOffset,
    anchorOffset: state.anchorOffset
  });
}
