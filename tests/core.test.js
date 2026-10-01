'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createModel, queryRecords, chartSegments, buildCSV, formatSize, extensionOf} = require('../core');
const records = [
  {id: 0, parentId: null, name: 'Root', relativePath: '', type: 'folder', size: 3072},
  {id: 1, parentId: 0, name: 'Media', relativePath: 'Media', type: 'folder', size: 2048},
  {id: 2, parentId: 0, name: 'notes.TXT', relativePath: 'notes.TXT', type: 'file', size: 1024},
  {id: 3, parentId: 1, name: 'photo.JPG', relativePath: 'Media/photo.JPG', type: 'file', size: 2048},
  {id: 4, parentId: 0, name: 'Media-copy', relativePath: 'Media-copy', type: 'folder', size: 0},
  {id: 5, parentId: 4, name: '.config', relativePath: 'Media-copy/.config', type: 'file', size: 0}
];
const model = createModel(records);
const base = {folderId: 0, scope: 'children', search: '', kind: 'all', extension: '', minimumSize: 0};
test('combines search, scope, type, extension and minimum size without leaking sibling folders', () => {
  assert.deepEqual(queryRecords(model, base).map(record => record.id), [1, 2, 4]);
  const query = {...base, scope: 'descendants', search: 'PHOTO', kind: 'file', extension: '.jpg', minimumSize: 2048};
  assert.deepEqual(queryRecords(model, query).map(record => record.id), [3]);
  assert.deepEqual(queryRecords(model, {...base, folderId: 1, scope: 'descendants'}).map(record => record.id), [3]);
  assert.equal(queryRecords(model, {...query, minimumSize: 2049}).length, 0);
  assert.equal(extensionOf(records[5]), '(no extension)');
});
test('chart sums only direct children and groups the tail without losing any bytes', () => {
  const children = Array.from({length: 15}, (_, id) => ({id, name: `item-${id}`, size: id + 1}));
  const segments = chartSegments(children);
  assert.equal(segments.length, 8);
  assert.equal(segments.at(-1).name, 'Other items');
  assert.equal(segments.reduce((sum, item) => sum + item.size, 0), 120);
  assert.deepEqual(chartSegments([{size: 0}]), []);
});
test('CSV preserves commas, quotes and newlines, neutralizes formulas, and exports all filtered rows', () => {
  const rows = queryRecords(model, {...base, scope: 'descendants', kind: 'file'});
  rows.push({name: '=formula.txt', relativePath: '=SUM(1,2)"\n.txt', type: 'file', size: 0, partial: true});
  const csv = buildCSV(rows, 3072, {rootPath: '/scan', scannedAt: '2026-10-01T00:00:00Z', errorCount: 1, skippedCount: 2});
  assert(csv.includes('"Media/photo.JPG","file","2048","2 KB","66.6667"'));
  assert(csv.includes('"\'=SUM(1,2)""\n.txt"'));
  assert(csv.includes('"Yes","/scan"'));
  assert(csv.endsWith('\r\n'));
  assert.equal(formatSize(1024 ** 3), '1 GB');
  assert.equal(formatSize(0), '0 B');
});
