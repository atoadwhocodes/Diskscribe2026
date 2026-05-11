import { open, type FileHandle } from 'node:fs/promises';

export interface ByteReaderOptions {
  pageBytes: number;
  maxCachedPages: number;
}

interface CachedPage {
  readonly index: number;
  readonly bytes: Uint8Array;
}

export class PagedFileByteReader {
  private readonly pageBytes: number;
  private readonly maxCachedPages: number;
  private readonly pageCache = new Map<number, CachedPage>();
  private fileHandlePromise: Promise<FileHandle> | undefined;
  private disposed = false;

  constructor(
    private readonly filePath: string,
    private readonly fileSizeBytes: number,
    options: ByteReaderOptions
  ) {
    this.pageBytes = normalizePageBytes(options.pageBytes);
    this.maxCachedPages = normalizeMaxCachedPages(options.maxCachedPages);
  }

  async readFileBytes(offsetBytes: number, lengthBytes: number): Promise<Uint8Array> {
    if (this.disposed) {
      return new Uint8Array();
    }

    if (lengthBytes <= 0 || this.fileSizeBytes <= 0) {
      return new Uint8Array();
    }

    const start = clampInt(offsetBytes, 0, this.fileSizeBytes);
    const available = this.fileSizeBytes - start;
    const clampedLength = clampInt(lengthBytes, 0, available);
    if (clampedLength <= 0) {
      return new Uint8Array();
    }

    const output = new Uint8Array(clampedLength);
    let outputOffset = 0;
    let current = start;

    while (outputOffset < clampedLength) {
      const pageIndex = Math.floor(current / this.pageBytes);
      const page = await this.getPage(pageIndex);

      const pageStart = pageIndex * this.pageBytes;
      const inPageOffset = current - pageStart;
      const bytesAvailableInPage = page.bytes.length - inPageOffset;
      const remaining = clampedLength - outputOffset;
      const copyLength = Math.min(bytesAvailableInPage, remaining);
      if (copyLength <= 0) {
        break;
      }

      output.set(page.bytes.subarray(inPageOffset, inPageOffset + copyLength), outputOffset);
      current += copyLength;
      outputOffset += copyLength;
    }

    return outputOffset === clampedLength ? output : output.subarray(0, outputOffset);
  }

  dispose(): void {
    this.disposed = true;
    this.pageCache.clear();

    const handlePromise = this.fileHandlePromise;
    this.fileHandlePromise = undefined;
    if (handlePromise) {
      void handlePromise
        .then(async (handle) => handle.close())
        .catch((): undefined => undefined);
    }
  }

  private async getPage(pageIndex: number): Promise<CachedPage> {
    const cached = this.pageCache.get(pageIndex);
    if (cached) {
      this.touchPage(cached);
      return cached;
    }

    const pageStart = pageIndex * this.pageBytes;
    const maxPageLength = Math.min(this.pageBytes, this.fileSizeBytes - pageStart);
    if (maxPageLength <= 0) {
      return { index: pageIndex, bytes: new Uint8Array() };
    }

    const bytes = await this.readPage(pageStart, maxPageLength);
    const page: CachedPage = { index: pageIndex, bytes };
    this.pageCache.set(pageIndex, page);
    this.enforceCacheLimit();
    return page;
  }

  private touchPage(page: CachedPage): void {
    this.pageCache.delete(page.index);
    this.pageCache.set(page.index, page);
  }

  private enforceCacheLimit(): void {
    while (this.pageCache.size > this.maxCachedPages) {
      const first = this.pageCache.keys().next();
      if (first.done) {
        break;
      }
      this.pageCache.delete(first.value);
    }
  }

  private async readPage(pageStart: number, length: number): Promise<Uint8Array> {
    const handle = await this.getFileHandle();
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, pageStart);
    return new Uint8Array(buffer.subarray(0, bytesRead));
  }

  private async getFileHandle(): Promise<FileHandle> {
    if (!this.fileHandlePromise) {
      this.fileHandlePromise = open(this.filePath, 'r');
    }
    return this.fileHandlePromise;
  }
}

function normalizePageBytes(value: number): number {
  const minValue = 4096;
  const maxValue = 1024 * 1024;
  const fallback = 65536;
  if (!Number.isInteger(value)) {
    return fallback;
  }
  return clampInt(value, minValue, maxValue);
}

function normalizeMaxCachedPages(value: number): number {
  const fallback = 32;
  if (!Number.isInteger(value)) {
    return fallback;
  }
  return clampInt(value, 1, 1024);
}

function clampInt(value: number, minValue: number, maxValue: number): number {
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}
