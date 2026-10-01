'use strict';

// Shared data logic for the isolated interface and desktop CSV exporter.
(function exposeCore(globalObject) {
  const colors = ['#a5f0cf', '#98b6f7', '#e7b6fa', '#f6cf8b', '#83d8e5', '#f49bac', '#c1d788', '#8d9cb1'];
  function formatSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${new Intl.NumberFormat('en-US', {maximumFractionDigits: index ? 2 : 0}).format(bytes / 1024 ** index)} ${units[index]}`;
  }
  function extensionOf(record) {
    if (record.type !== 'file') return '';
    const index = record.name.lastIndexOf('.');
    return index > 0 && index < record.name.length - 1 ? record.name.slice(index).toLowerCase() : '(no extension)';
  }
  function createModel(records) {
    const byId = new Map(records.map(record => [record.id, record]));
    const children = new Map();
    for (const record of records) {
      if (record.parentId !== null) {
        if (!children.has(record.parentId)) children.set(record.parentId, []);
        children.get(record.parentId).push(record);
      }
    }
    return {records, byId, children};
  }
  function queryRecords(model, query) {
    const folder = model.byId.get(query.folderId);
    if (!folder) return [];
    let candidates;
    if (query.scope === 'descendants') {
      const prefix = folder.relativePath ? `${folder.relativePath}/` : '';
      candidates = model.records.filter(record => record.id !== folder.id && record.relativePath.startsWith(prefix));
    } else candidates = model.children.get(folder.id) || [];
    const search = (query.search || '').trim().toLowerCase();
    return candidates.filter(record =>
      (!search || record.relativePath.toLowerCase().includes(search)) &&
      (!query.kind || query.kind === 'all' || record.type === query.kind) &&
      (!query.extension || extensionOf(record) === query.extension) &&
      record.size >= (query.minimumSize || 0)
    ).sort((left, right) => right.size - left.size || left.relativePath.localeCompare(right.relativePath, 'en'));
  }
  function chartSegments(children) {
    const sorted = [...children].filter(record => record.size > 0).sort((left, right) => right.size - left.size);
    const segments = sorted.slice(0, 7).map(record => ({...record, recordId: record.id}));
    if (sorted.length > 7) segments.push({name: 'Other items', size: sorted.slice(7).reduce((sum, record) => sum + record.size, 0), recordId: null});
    return segments.map((segment, index) => ({...segment, color: colors[index]}));
  }
  function csvCell(value) {
    let text = String(value ?? '');
    // Neutralize spreadsheet formulas, including whitespace-prefixed formulas.
    if (/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = "'" + text;
    return `"${text.replaceAll('"', '""')}"`;
  }
  function buildCSV(records, folderSize, snapshot) {
    const rows = [['Relative path', 'Type', 'Bytes', 'Formatted size', 'Percent of current folder',
      'Extension', 'Partial result', 'Scan root', 'Scanned at', 'Scan errors', 'Skipped links and special files']];
    for (const record of records) rows.push([record.relativePath, record.type, record.size,
      formatSize(record.size), folderSize ? (record.size / folderSize * 100).toFixed(4) : '0',
      extensionOf(record), record.partial ? 'Yes' : 'No', snapshot.rootPath,
      snapshot.scannedAt, snapshot.errorCount, snapshot.skippedCount]);
    return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
  const api = {formatSize, extensionOf, createModel, queryRecords, chartSegments, buildCSV};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalObject.DiskCore = api;
})(typeof window === 'undefined' ? globalThis : window);
