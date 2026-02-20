import * as vscode from 'vscode';
import { PagedFileByteReader } from '../core/hex/pagedFileByteReader';

export type { ByteReaderOptions } from '../core/hex/pagedFileByteReader';
import type { ByteReaderOptions } from '../core/hex/pagedFileByteReader';

export class PagedByteReader implements vscode.Disposable {
  private readonly fileReader: PagedFileByteReader | undefined;
  private fallbackBytesPromise: Promise<Uint8Array> | undefined;
  private disposed = false;

  constructor(
    private readonly uri: vscode.Uri,
    fileSizeBytes: number,
    options: ByteReaderOptions
  ) {
    if (uri.scheme === 'file') {
      this.fileReader = new PagedFileByteReader(uri.fsPath, fileSizeBytes, options);
    }
  }

  async readFileBytes(offsetBytes: number, lengthBytes: number): Promise<Uint8Array> {
    if (this.disposed || lengthBytes <= 0) {
      return new Uint8Array();
    }

    if (this.fileReader) {
      return this.fileReader.readFileBytes(offsetBytes, lengthBytes);
    }

    const allBytes = await this.readFallbackBytes();
    if (allBytes.length === 0) {
      return new Uint8Array();
    }

    const start = clampInt(offsetBytes, 0, allBytes.length);
    const end = clampInt(start + lengthBytes, start, allBytes.length);
    if (end <= start) {
      return new Uint8Array();
    }
    return allBytes.subarray(start, end);
  }

  dispose(): void {
    this.disposed = true;
    this.fallbackBytesPromise = undefined;
    this.fileReader?.dispose();
  }

  private async readFallbackBytes(): Promise<Uint8Array> {
    if (!this.fallbackBytesPromise) {
      this.fallbackBytesPromise = Promise.resolve(vscode.workspace.fs.readFile(this.uri));
    }
    const bytesPromise = this.fallbackBytesPromise;
    return bytesPromise ?? new Uint8Array();
  }
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
