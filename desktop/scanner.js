'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

async function scanDirectory(directoryPath, onProgress = () => {}) {
  const rootPath = path.resolve(directoryPath);
  const rootStat = await fs.lstat(rootPath);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error('Please choose a regular folder, not a file or a symbolic link.');
  }
  const records = [{id: 0, parentId: null, name: path.basename(rootPath) || rootPath,
    relativePath: '', type: 'folder', size: 0, partial: false}];
  const pending = [{absolutePath: rootPath, id: 0}];
  let fileCount = 0, folderCount = 0, totalSize = 0, skippedCount = 0, errorCount = 0;
  let lastProgress = 0;
  const errors = [];
  function report(force = false) {
    if (force || Date.now() - lastProgress >= 100) {
      lastProgress = Date.now();
      onProgress({fileCount, folderCount, totalSize, skippedCount, errorCount});
    }
  }
  function recordError(parentId, relativePath, error) {
    errorCount++;
    records[parentId].partial = true;
    if (errors.length < 20) errors.push({path: relativePath, code: error.code || 'UNKNOWN'});
  }
  while (pending.length) {
    const current = pending.pop();
    try {
      // Streaming directory reads avoid loading a whole directory at once.
      const directory = await fs.opendir(current.absolutePath);
      for await (const entry of directory) {
        const absolutePath = path.join(current.absolutePath, entry.name);
        const relativePath = records[current.id].relativePath
          ? `${records[current.id].relativePath}/${entry.name}` : entry.name;
        try {
          const stat = await fs.lstat(absolutePath);
          // Never follow symbolic links, junctions, devices or sockets.
          if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
            skippedCount++;
            report();
            continue;
          }
          const id = records.length;
          const type = stat.isDirectory() ? 'folder' : 'file';
          const size = type === 'file' ? stat.size : 0;
          records.push({id, parentId: current.id, name: entry.name, relativePath, type, size, partial: false});
          if (type === 'folder') {
            folderCount++;
            pending.push({absolutePath, id});
          } else { fileCount++; totalSize += size; }
        } catch (error) { recordError(current.id, relativePath, error); }
        report();
      }
    } catch (error) {
      if (current.id === 0) throw new Error(`Cannot read the selected folder (${error.code || 'access error'}).`);
      recordError(current.id, records[current.id].relativePath, error);
    }
  }
  // Parents precede children, so a reverse pass aggregates every descendant.
  for (let index = records.length - 1; index > 0; index--) {
    const record = records[index];
    const parent = records[record.parentId];
    parent.size += record.size;
    parent.partial ||= record.partial;
  }
  report(true);
  return {rootPath, records, fileCount, folderCount, totalSize, skippedCount, errorCount, errors,
    scannedAt: new Date().toISOString()};
}
module.exports = {scanDirectory};
