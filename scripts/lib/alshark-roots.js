const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ROOT_INDEX_PATH = path.join(REPO_ROOT, 'alshark-root-sources.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function toRepoPath(relativePath) {
  return path.join(REPO_ROOT, ...String(relativePath || '').split(/[\\/]+/).filter(Boolean));
}

function loadRootIndex() {
  if (!fs.existsSync(ROOT_INDEX_PATH)) {
    throw new Error(`Alshark root index not found: ${ROOT_INDEX_PATH}`);
  }

  const index = readJson(ROOT_INDEX_PATH);
  const roots = Array.isArray(index.roots) ? index.roots : [];
  return { index, roots };
}

function resolveRoot(rootId) {
  const { roots } = loadRootIndex();
  const rootEntry = roots.find((entry) => entry && entry.id === rootId);

  if (!rootEntry) {
    throw new Error(`Alshark root source not found: ${rootId}`);
  }

  const manifestPath = toRepoPath(rootEntry.manifestPath);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Alshark root manifest not found: ${manifestPath}`);
  }

  const manifest = readJson(manifestPath);
  const paths = Object.fromEntries(
    Object.entries(manifest.paths || {}).map(([key, relativePath]) => [key, toRepoPath(relativePath)])
  );

  return {
    id: rootEntry.id,
    name: manifest.name || rootEntry.id,
    repoRoot: REPO_ROOT,
    indexPath: ROOT_INDEX_PATH,
    manifestPath,
    rootPath: toRepoPath(manifest.rootPath || rootEntry.rootPath),
    legacyProjectPath: manifest.legacyProjectPath ? toRepoPath(manifest.legacyProjectPath) : null,
    translationType: manifest.translationType || rootEntry.translationType || '',
    paths
  };
}

function getAlsharkPc98Roots() {
  return resolveRoot('alshark_pc98');
}

function getAlsharkPcecdRoots() {
  return resolveRoot('alshark_pcecd');
}

module.exports = {
  getAlsharkPc98Roots,
  getAlsharkPcecdRoots,
  loadRootIndex,
  resolveRoot
};
