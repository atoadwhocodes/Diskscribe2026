/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import {
  decodeBytesByCharset,
  classifyByteForCharset,
  getCharsetLegend,
  getCharsetProfile,
  glyphForByteForCharset,
  normalizeCharsetId
} from './necCharsets';
import {
  BYTES_PER_ROW,
  CHUNK_BYTES,
  MAX_CHAR_FRAME_BYTES,
  MAX_CHUNKS_PER_MODE,
  MAX_TRANSLATION_BYTES,
  OVERSCAN_ROWS,
  ROW_HEIGHT
} from './editorConstants';
import { editorElements as elements } from './editorElements';

const vscode = acquireVsCodeApi();

const persisted = vscode.getState() || {};

const hasPersistedTranslationEncoding =
  typeof persisted.translationEncoding === 'string' && persisted.translationEncoding.length > 0;

const state = {
  summary: undefined,
  defaultMode: persisted.defaultMode === 'raw' ? 'raw' : 'disk',
  mode: persisted.mode === 'raw' ? 'raw' : 'disk',
  fileSize: 0,
  dataOffset: 0,
  sectorSize: 512,
  geometry: undefined,
  currentDirectory: typeof persisted.currentDirectory === 'string' ? persisted.currentDirectory : '',
  selectedRootEntryPath: typeof persisted.selectedRootEntryPath === 'string' ? persisted.selectedRootEntryPath : '',
  showDeletedEntries: persisted.showDeletedEntries === true,
  translationEncoding: normalizeCharsetId(persisted.translationEncoding),
  translationDraft: typeof persisted.translationDraft === 'string' ? persisted.translationDraft : '',
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

if (elements.jumpOffsetButton) {
  elements.jumpOffsetButton.addEventListener('click', () => {
    void promptJumpOffset();
  });
}

if (elements.jumpLbaButton) {
  elements.jumpLbaButton.addEventListener('click', () => {
    void promptJumpLba();
  });
}

if (elements.copyOffsetButton) {
  elements.copyOffsetButton.addEventListener('click', () => {
    void copyOffsetToClipboard();
  });
}

if (elements.copyLbaButton) {
  elements.copyLbaButton.addEventListener('click', () => {
    void copyLbaToClipboard();
  });
}

if (elements.extractSelectionButton) {
  elements.extractSelectionButton.addEventListener('click', () => {
    void requestExtractSelection();
  });
}

if (elements.exportDiagnosticsButton) {
  elements.exportDiagnosticsButton.addEventListener('click', () => {
    post({ type: 'desktop.exportDiagnostics' });
  });
}

if (elements.directoryUpButton) {
  elements.directoryUpButton.addEventListener('click', () => {
    navigateDirectory(getParentDirectory(state.currentDirectory));
  });
}

if (elements.extractFileButton) {
  elements.extractFileButton.addEventListener('click', () => {
    requestExtractSelectedFile();
  });
}

if (elements.showDeletedEntries) {
  elements.showDeletedEntries.addEventListener('change', () => {
    state.showDeletedEntries = elements.showDeletedEntries.checked === true;
    state.selectedRootEntryPath = '';
    persistState();
    renderRootDirectory(state.summary?.rootDirectoryEntries || []);
  });
}

if (elements.translationEncoding) {
  elements.translationEncoding.addEventListener('change', () => {
    const value = normalizeCharsetId(elements.translationEncoding.value);
    state.translationEncoding = value;
    persistState();
    refreshTranslationPanels();
  });
}

if (elements.translationDraft) {
  elements.translationDraft.addEventListener('input', () => {
    state.translationDraft = elements.translationDraft.value || '';
    persistState();
  });
}

if (elements.copyDecodedButton) {
  elements.copyDecodedButton.addEventListener('click', () => {
    void copyDecodedToClipboard();
  });
}

if (elements.copyDraftButton) {
  elements.copyDraftButton.addEventListener('click', () => {
    void copyDraftToClipboard();
  });
}

if (elements.clearDraftButton) {
  elements.clearDraftButton.addEventListener('click', () => {
    clearDraft();
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

if (elements.partitionRows) {
  elements.partitionRows.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-partition-lba]') : null;
    if (!target) {
      return;
    }

    const lba = Number.parseInt(target.getAttribute('data-partition-lba') || '', 10);
    if (!Number.isFinite(lba) || lba < 0) {
      return;
    }

    const offset = lba * (state.sectorSize || 512);
    post({
      type: 'hex.jump',
      mode: 'disk',
      offset
    });
    setText(
      elements.jumpResult,
      `Jump target: partition LBA ${formatNumber(lba)} (0x${offset.toString(16).toUpperCase()} offset)`
    );
  });
}

if (elements.rootDirectoryRows) {
  elements.rootDirectoryRows.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-root-entry-offset]') : null;
    if (!target) {
      return;
    }

    const offset = Number.parseInt(target.getAttribute('data-root-entry-offset') || '', 10);
    if (!Number.isFinite(offset) || offset < 0) {
      return;
    }

    const entry = findRootEntryByOffset(offset);
    if (entry?.isDirectory && !entry.isDeleted) {
      navigateDirectory(entry.path || '');
      return;
    }

    state.selectedRootEntryPath = entry?.path || '';
    persistState();
    renderRootDirectory(state.summary?.rootDirectoryEntries || []);
    post({
      type: 'hex.jump',
      mode: 'raw',
      offset
    });
    setText(
      elements.jumpResult,
      `Jump target: root directory entry at raw offset ${formatNumber(offset)} (0x${offset
        .toString(16)
        .toUpperCase()})`
    );
  });
}

syncTranslatorInputs();
refreshTranslationPanels();

window.addEventListener('resize', () => {
  renderHexViewport(false);
});

window.addEventListener('keydown', (event) => {
  const isModifier = event.ctrlKey || event.metaKey;
  if (!isModifier || event.altKey) {
    return;
  }

  const key = event.key.toLowerCase();
  if (key === 'g') {
    event.preventDefault();
    void promptJumpOffset();
    return;
  }

  if (key === 'l') {
    event.preventDefault();
    void promptJumpLba();
  }
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
  state.currentDirectory = '';
  state.selectedRootEntryPath = '';

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

  renderFilesystemSummary(summary.filesystems || []);
  renderFilesystemDetails(summary.filesystems || []);
  renderPartitions(summary.partitions || []);
  renderRootDirectory(summary.rootDirectoryEntries || []);
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
  refreshTranslationPanels();
}

function handleHexInit(message) {
  const nextDefault = message.defaultMode === 'raw' ? 'raw' : 'disk';
  state.defaultMode = nextDefault;
  state.mode = chooseMode(state.mode || nextDefault);
  if (!hasPersistedTranslationEncoding && typeof message.defaultCharset === 'string') {
    state.translationEncoding = normalizeCharsetId(message.defaultCharset);
  }

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
  refreshTranslationPanels();
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
      refreshTranslationPanels();
    }
    return;
  }

  const cache = getModeCache(mode);
  cache.delete(offset);
  cache.set(offset, bytes);
  trimChunkCache(cache);

  if (mode === state.mode) {
    renderHexViewport(false);
    refreshTranslationPanels();
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
  refreshTranslationPanels();
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
  refreshTranslationPanels();
}

function renderError(message) {
  setText(elements.status, 'Unable to load disk image.');
  setText(elements.jumpResult, 'No active jump target.');
  renderPartitions([]);
  renderRootDirectory([]);
  renderFilesystemDetails([]);
  setText(elements.hexRangeMeta, 'No range selected.');
  if (elements.hexRows) {
    elements.hexRows.textContent = '';
  }
  if (elements.hexSpacer) {
    elements.hexSpacer.style.height = '0px';
  }
  setText(elements.notes, `- ${message || 'Unknown error'}`);
  refreshTranslationPanels();
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
    row.className = 'partitionRow';
    row.setAttribute('data-partition-lba', String(partition.startLba ?? 0));
    row.title = 'Click to jump to this partition start.';

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

function renderFilesystemSummary(filesystems) {
  if (!elements.filesystem) {
    return;
  }

  if (!Array.isArray(filesystems) || filesystems.length === 0) {
    setText(elements.filesystem, 'None detected');
    return;
  }

  const primary = filesystems[0];
  setText(
    elements.filesystem,
    `${primary.type || 'FAT'} (${formatNumber(primary.clusterCount)} clusters, data LBA ${formatNumber(
      primary.firstDataLba
    )})`
  );
}

function renderFilesystemDetails(filesystems) {
  if (!elements.filesystemDetails) {
    return;
  }

  elements.filesystemDetails.innerHTML = '';
  if (!Array.isArray(filesystems) || filesystems.length === 0) {
    appendDefinition(elements.filesystemDetails, 'Status', 'No filesystem metadata loaded.');
    return;
  }

  const filesystem = filesystems[0];
  appendDefinition(elements.filesystemDetails, 'Type', filesystem.type || 'FAT');
  appendDefinition(elements.filesystemDetails, 'Offset', `${formatNumber(filesystem.offsetBytes)} bytes`);
  appendDefinition(elements.filesystemDetails, 'Reserved', `${formatNumber(filesystem.reservedSectors)} sectors`);
  appendDefinition(elements.filesystemDetails, 'FATs', formatNumber(filesystem.fatCount));
  appendDefinition(elements.filesystemDetails, 'FAT Size', `${formatNumber(filesystem.sectorsPerFat)} sectors`);
  appendDefinition(elements.filesystemDetails, 'Root LBA', formatNumber(filesystem.firstRootDirectoryLba));
  appendDefinition(elements.filesystemDetails, 'Data LBA', formatNumber(filesystem.firstDataLba));
  appendDefinition(elements.filesystemDetails, 'Clusters', formatNumber(filesystem.clusterCount));
}

function renderRootDirectory(entries) {
  if (!elements.rootDirectoryRows) {
    return;
  }

  elements.rootDirectoryRows.innerHTML = '';
  syncDirectoryControls();

  const visibleEntries = getVisibleDirectoryEntries(entries);
  if (elements.directoryPath) {
    elements.directoryPath.textContent = state.currentDirectory ? `/${state.currentDirectory}` : '/';
    elements.directoryPath.title = elements.directoryPath.textContent;
  }

  if (visibleEntries.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = 'No root directory entries detected.';
    row.appendChild(cell);
    elements.rootDirectoryRows.appendChild(row);
    return;
  }

  for (const entry of visibleEntries) {
    const row = document.createElement('tr');
    const offset = Number(entry.offsetBytes || 0);
    row.setAttribute('data-root-entry-offset', String(offset));
    row.title = entry.isDirectory && !entry.isDeleted ? 'Click to open this directory.' : 'Click to select and jump.';
    if (entry.path && entry.path === state.selectedRootEntryPath) {
      row.classList.add('is-selected');
    }
    if (entry.isDeleted) {
      row.classList.add('is-deleted');
    }

    appendCell(row, `${entry.isDirectory ? '[' : ''}${entry.name || '(unnamed)'}${entry.isDirectory ? ']' : ''}`);
    appendCell(row, Array.isArray(entry.attributes) && entry.attributes.length > 0 ? entry.attributes.join(',') : 'FILE');
    appendCell(row, formatNumber(entry.startCluster));
    appendCell(row, `${formatNumber(entry.sizeBytes)} bytes`);
    elements.rootDirectoryRows.appendChild(row);
  }
}

function getVisibleDirectoryEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.filter((entry) => {
    if (!state.showDeletedEntries && entry.isDeleted) {
      return false;
    }
    return (entry.parentPath || '') === state.currentDirectory;
  });
}

function navigateDirectory(path) {
  state.currentDirectory = path || '';
  state.selectedRootEntryPath = '';
  persistState();
  renderRootDirectory(state.summary?.rootDirectoryEntries || []);
}

function getParentDirectory(path) {
  const text = typeof path === 'string' ? path : '';
  const slashIndex = text.lastIndexOf('/');
  return slashIndex > 0 ? text.slice(0, slashIndex) : '';
}

function findRootEntryByOffset(offset) {
  const entries = state.summary?.rootDirectoryEntries || [];
  return entries.find((entry) => Number(entry.offsetBytes || 0) === offset);
}

function findSelectedRootEntry() {
  const entries = state.summary?.rootDirectoryEntries || [];
  return entries.find((entry) => entry.path === state.selectedRootEntryPath);
}

function syncDirectoryControls() {
  if (elements.directoryUpButton) {
    elements.directoryUpButton.disabled = !state.currentDirectory;
  }
  if (elements.showDeletedEntries && elements.showDeletedEntries.checked !== state.showDeletedEntries) {
    elements.showDeletedEntries.checked = state.showDeletedEntries;
  }
  if (elements.extractFileButton) {
    const selected = findSelectedRootEntry();
    elements.extractFileButton.disabled = !selected || selected.isDirectory || selected.isDeleted;
  }
}

function requestExtractSelectedFile() {
  const selected = findSelectedRootEntry();
  if (!selected || selected.isDirectory || selected.isDeleted) {
    setText(elements.status, 'Select a file entry before extracting.');
    return;
  }

  post({
    type: 'desktop.extractFile',
    entry: {
      filesystemOffsetBytes: selected.filesystemOffsetBytes,
      path: selected.path,
      name: selected.name,
      startCluster: selected.startCluster,
      sizeBytes: selected.sizeBytes
    }
  });
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

async function promptJumpOffset() {
  const modeInput = window.prompt('Offset mode (disk/raw):', state.mode);
  if (modeInput === null) {
    return;
  }

  const mode = modeInput.trim().toLowerCase() === 'raw' ? 'raw' : 'disk';
  const offsetInput = window.prompt(
    'Enter offset in decimal or hex (0x..., ...h):',
    mode === 'disk' ? '0x0' : '0'
  );
  if (offsetInput === null) {
    return;
  }

  const offset = parseOffsetInput(offsetInput);
  if (offset === undefined || offset < 0) {
    setText(elements.status, 'Invalid offset input.');
    return;
  }

  post({
    type: 'hex.jump',
    mode,
    offset
  });
}

async function promptJumpLba() {
  const lbaInput = window.prompt('Enter LBA (decimal):', '0');
  if (lbaInput === null) {
    return;
  }

  const lba = parseDecimalInteger(lbaInput);
  if (lba === undefined || lba < 0) {
    setText(elements.status, 'Invalid LBA input.');
    return;
  }

  const offset = lba * (state.sectorSize || 512);
  post({
    type: 'hex.jump',
    mode: 'disk',
    offset
  });
}

async function copyOffsetToClipboard() {
  const start = clampOffset(state.selectionStart, state.mode);
  const text = `0x${start.toString(16).toUpperCase()}`;
  const copied = await copyText(text);
  if (!copied) {
    setText(elements.status, 'Unable to copy offset to clipboard.');
    return;
  }

  setText(elements.status, `Copied offset: ${text}`);
}

async function copyLbaToClipboard() {
  const cursor = clampOffset(state.cursorOffset, state.mode);
  const diskOffset = toDiskOffset(state.mode, cursor);
  if (diskOffset === undefined || diskOffset < 0) {
    setText(elements.status, 'LBA unavailable for current selection.');
    return;
  }

  const lba = Math.floor(diskOffset / (state.sectorSize || 512));
  const text = String(lba);
  const copied = await copyText(text);
  if (!copied) {
    setText(elements.status, 'Unable to copy LBA to clipboard.');
    return;
  }

  setText(elements.status, `Copied LBA: ${formatNumber(lba)}`);
}

async function requestExtractSelection() {
  const start = clampOffset(state.selectionStart, state.mode);
  const end = clampOffset(state.selectionEnd, state.mode);
  post({
    type: 'hex.extract',
    mode: state.mode,
    start,
    end
  });
}

function refreshTranslationPanels() {
  syncTranslatorInputs();
  syncCharsetLegend();

  const viewLength = getViewLength(state.mode);
  if (viewLength <= 0) {
    setText(elements.translationMeta, 'No bytes available in current view.');
    setText(elements.decodedSelection, '(no bytes available)');
    renderCharFramePlaceholder('No bytes available in current view.');
    return;
  }

  const start = clampOffset(state.selectionStart, state.mode);
  const end = clampOffset(state.selectionEnd, state.mode);
  const range = normalizeRange(start, end);
  const totalLength = range.end - range.start + 1;
  if (totalLength <= 0) {
    setText(elements.translationMeta, 'No byte selection.');
    setText(elements.decodedSelection, '(select bytes in hex view)');
    renderCharFramePlaceholder('Select bytes to inspect character framing.');
    return;
  }

  ensureBytesForOffsetRange(range.start, range.end);

  const selection = collectSelectionBytes(range.start, range.end, MAX_TRANSLATION_BYTES);
  if (!selection) {
    setText(elements.translationMeta, 'Selection is outside available bytes.');
    setText(elements.decodedSelection, '(selection out of range)');
    renderCharFramePlaceholder('Selection is outside available bytes.');
    return;
  }

  if (selection.missing) {
    setText(
      elements.translationMeta,
      `Loading bytes for ${formatNumber(totalLength)} selected byte(s)...`
    );
    setText(elements.decodedSelection, '(loading selected bytes from disk...)');
  } else {
    const profile = getCharsetProfile(state.translationEncoding);
    const decoded = decodeSelectionBytes(selection.bytes, state.translationEncoding);
    const detail =
      selection.total > selection.readLength
        ? `, showing first ${formatNumber(selection.readLength)}`
        : '';
    setText(
      elements.translationMeta,
      `Decode ${formatNumber(selection.total)} byte(s) as ${profile.label}${detail}.`
    );
    setText(elements.decodedSelection, decoded.length > 0 ? decoded : '(decoded text is empty)');
  }

  renderCharFrameRows(range.start, range.end);
}

function syncTranslatorInputs() {
  if (elements.translationEncoding) {
    const normalized = normalizeCharsetId(state.translationEncoding);
    if (elements.translationEncoding.value !== normalized) {
      elements.translationEncoding.value = normalized;
    }
  }

  if (elements.translationDraft && elements.translationDraft.value !== state.translationDraft) {
    elements.translationDraft.value = state.translationDraft;
  }
}

function syncCharsetLegend() {
  setText(elements.charsetLegend, getCharsetLegend(state.translationEncoding));
}

async function copyDecodedToClipboard() {
  const text = elements.decodedSelection ? elements.decodedSelection.textContent || '' : '';
  if (!text || text.startsWith('(loading')) {
    setText(elements.status, 'No decoded selection text to copy yet.');
    return;
  }

  const copied = await copyText(text);
  if (!copied) {
    setText(elements.status, 'Unable to copy decoded text.');
    return;
  }

  setText(elements.status, 'Copied decoded selection text.');
}

async function copyDraftToClipboard() {
  const text = (elements.translationDraft ? elements.translationDraft.value : state.translationDraft) || '';
  if (!text) {
    setText(elements.status, 'Translation draft is empty.');
    return;
  }

  const copied = await copyText(text);
  if (!copied) {
    setText(elements.status, 'Unable to copy translation draft.');
    return;
  }

  setText(elements.status, 'Copied translation draft.');
}

function clearDraft() {
  state.translationDraft = '';
  if (elements.translationDraft) {
    elements.translationDraft.value = '';
  }
  persistState();
  setText(elements.status, 'Cleared translation draft.');
}

function renderCharFrameRows(start, end) {
  if (!elements.charFrameRows) {
    return;
  }

  elements.charFrameRows.innerHTML = '';

  const range = normalizeRange(start, end);
  const totalLength = range.end - range.start + 1;
  const rowCount = Math.min(totalLength, MAX_CHAR_FRAME_BYTES);
  for (let i = 0; i < rowCount; i += 1) {
    const offset = range.start + i;
    const row = document.createElement('tr');

    const byte = getByte(offset, state.mode);
    appendCell(row, `0x${offset.toString(16).toUpperCase().padStart(8, '0')}`);
    if (byte === undefined) {
      appendCell(row, '..');
      appendCell(row, '(loading)');
      appendCell(row, 'pending');
      elements.charFrameRows.appendChild(row);
      continue;
    }

    appendCell(row, `0x${byte.toString(16).toUpperCase().padStart(2, '0')}`);
    appendCell(row, toGlyph(byte, state.translationEncoding));
    appendCell(row, classifyByteRole(byte, state.translationEncoding));
    elements.charFrameRows.appendChild(row);
  }

  if (rowCount === 0) {
    renderCharFramePlaceholder('Select bytes to inspect character framing.');
    return;
  }

  if (totalLength > rowCount) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = `Showing first ${formatNumber(rowCount)} of ${formatNumber(totalLength)} selected bytes.`;
    row.appendChild(cell);
    elements.charFrameRows.appendChild(row);
  }
}

function renderCharFramePlaceholder(message) {
  if (!elements.charFrameRows) {
    return;
  }

  elements.charFrameRows.innerHTML = '';
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = 4;
  cell.textContent = message;
  row.appendChild(cell);
  elements.charFrameRows.appendChild(row);
}

function decodeSelectionBytes(bytes, encoding) {
  return decodeBytesByCharset(bytes, encoding);
}

function toGlyph(byte, encoding) {
  return glyphForByteForCharset(byte, encoding);
}

function classifyByteRole(byte, encoding) {
  return classifyByteForCharset(byte, encoding);
}

function collectSelectionBytes(start, end, maxBytes) {
  const range = normalizeRange(start, end);
  const viewLength = getViewLength(state.mode);
  if (range.start < 0 || range.start >= viewLength) {
    return undefined;
  }

  const safeEnd = Math.min(range.end, viewLength - 1);
  const total = safeEnd - range.start + 1;
  const readLength = Math.min(total, maxBytes);
  const bytes = new Uint8Array(readLength);
  let missing = false;

  for (let i = 0; i < readLength; i += 1) {
    const byte = getByte(range.start + i, state.mode);
    if (byte === undefined) {
      missing = true;
      continue;
    }
    bytes[i] = byte;
  }

  return {
    bytes,
    total,
    readLength,
    missing
  };
}

function ensureBytesForOffsetRange(start, end) {
  const viewLength = getViewLength(state.mode);
  if (viewLength <= 0) {
    return;
  }

  const range = normalizeRange(start, end);
  const clampedStart = clampOffset(range.start, state.mode);
  const clampedEnd = clampOffset(range.end, state.mode);
  const firstChunk = Math.floor(clampedStart / CHUNK_BYTES);
  const lastChunk = Math.floor(clampedEnd / CHUNK_BYTES);

  for (let chunkIndex = firstChunk; chunkIndex <= lastChunk; chunkIndex += 1) {
    const chunkStart = chunkIndex * CHUNK_BYTES;
    const chunkLength = Math.min(CHUNK_BYTES, viewLength - chunkStart);
    if (chunkLength > 0) {
      requestChunk(state.mode, chunkStart, chunkLength);
    }
  }
}

function normalizeRange(start, end) {
  return start <= end ? { start, end } : { start: end, end: start };
}

async function copyText(value) {
  if (!value) {
    return false;
  }

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to legacy copy.
  }

  const helper = document.createElement('textarea');
  helper.value = value;
  helper.setAttribute('readonly', 'readonly');
  helper.style.position = 'absolute';
  helper.style.left = '-9999px';
  document.body.appendChild(helper);
  helper.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }

  document.body.removeChild(helper);
  return copied;
}

function parseDecimalInteger(value) {
  const cleaned = value.trim().replace(/,/g, '');
  if (!/^[0-9]+$/.test(cleaned)) {
    return undefined;
  }

  const parsed = Number.parseInt(cleaned, 10);
  if (!Number.isSafeInteger(parsed)) {
    return undefined;
  }
  return parsed;
}

function parseOffsetInput(value) {
  const cleaned = value.trim().replace(/,/g, '').toLowerCase();
  if (cleaned.length === 0) {
    return undefined;
  }

  let parsed;
  if (/^0x[0-9a-f]+$/.test(cleaned)) {
    parsed = Number.parseInt(cleaned, 16);
  } else if (/^[0-9a-f]+h$/.test(cleaned)) {
    parsed = Number.parseInt(cleaned.slice(0, -1), 16);
  } else if (/^[0-9]+$/.test(cleaned)) {
    parsed = Number.parseInt(cleaned, 10);
  } else {
    return undefined;
  }

  if (!Number.isSafeInteger(parsed)) {
    return undefined;
  }
  return parsed;
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

function appendDefinition(list, term, detail) {
  const wrap = document.createElement('div');
  const dt = document.createElement('dt');
  const dd = document.createElement('dd');
  dt.textContent = term;
  dd.textContent = detail;
  wrap.appendChild(dt);
  wrap.appendChild(dd);
  list.appendChild(wrap);
}

function post(message) {
  vscode.postMessage(message);
}

function persistState() {
  vscode.setState({
    defaultMode: state.defaultMode,
    mode: state.mode,
    translationEncoding: state.translationEncoding,
    translationDraft: state.translationDraft,
    selectionStart: state.selectionStart,
    selectionEnd: state.selectionEnd,
    cursorOffset: state.cursorOffset,
    anchorOffset: state.anchorOffset,
    currentDirectory: state.currentDirectory,
    selectedRootEntryPath: state.selectedRootEntryPath,
    showDeletedEntries: state.showDeletedEntries
  });
}

export {};
