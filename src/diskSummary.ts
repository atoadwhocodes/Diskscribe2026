import * as vscode from 'vscode';
import {
  buildDiskSummaryFromPath,
  formatSummaryAsText,
  isSupportedDiskPath
} from './core/diskSummary';

export type {
  DiskFormat,
  DiskSummary,
  GeometryGuess
} from './core/diskSummary';

export function isSupportedDiskFile(uri: vscode.Uri): boolean {
  const candidatePath = uri.scheme === 'file' ? uri.fsPath : uri.path;
  return isSupportedDiskPath(candidatePath);
}

export async function buildDiskSummary(uri: vscode.Uri) {
  if (uri.scheme !== 'file') {
    throw new Error(`Unsupported URI scheme "${uri.scheme}". Only file:// disk images are supported.`);
  }
  return buildDiskSummaryFromPath(uri.fsPath);
}

export { formatSummaryAsText };
