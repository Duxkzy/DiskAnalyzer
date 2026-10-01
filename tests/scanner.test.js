'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {scanDirectory} = require('../desktop/scanner');

async function fixture(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'disk-analyzer-test-'));
  context.after(() => fs.rm(root, {recursive: true, force: true}));
  await fs.mkdir(path.join(root, 'nested', 'empty'), {recursive: true});
  await fs.writeFile(path.join(root, 'small.txt'), Buffer.alloc(1024));
  await fs.writeFile(path.join(root, 'nested', 'large.bin'), Buffer.alloc(2048));
  await fs.writeFile(path.join(root, '.hidden'), '');
  return root;
}
test('counts every file, includes empty folders, and aggregates nested sizes', async context => {
  const root = await fixture(context);
  await Promise.all(Array.from({length: 205}, (_, index) => fs.writeFile(path.join(root, `item-${index}.txt`), 'x')));
  const progress = [];
  const result = await scanDirectory(root, value => progress.push(value));
  assert.equal(result.totalSize, 3277);
  assert.equal(result.fileCount, 208);
  assert.equal(result.folderCount, 2);
  assert.equal(result.records[0].size, 3277);
  assert.equal(result.records.find(record => record.relativePath === 'nested').size, 2048);
  assert.equal(result.records.find(record => record.relativePath === 'nested/empty').size, 0);
  assert.equal(progress.at(-1).fileCount, 208);
  assert.equal(result.errorCount, 0);
});
test('does not follow symbolic links or a cyclic folder link', async context => {
  const root = await fixture(context);
  try {
    await fs.symlink(root, path.join(root, 'nested', 'cycle'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (error.code === 'EPERM') return context.skip('Symbolic links require additional Windows permissions.');
    throw error;
  }
  const result = await scanDirectory(root);
  assert.equal(result.totalSize, 3072);
  assert.equal(result.skippedCount, 1);
  assert(!result.records.some(record => record.name === 'cycle'));
  await assert.rejects(scanDirectory(path.join(root, 'nested', 'cycle')), /regular folder/);
});
test('propagates unreadable-folder markers and reports a partial total', async context => {
  const root = await fixture(context);
  const original = fs.opendir;
  context.mock.method(fs, 'opendir', async folderPath => {
    if (folderPath === path.join(root, 'nested')) throw Object.assign(new Error('Access denied'), {code: 'EACCES'});
    return original(folderPath);
  });
  const result = await scanDirectory(root);
  assert.equal(result.totalSize, 1024);
  assert.equal(result.errorCount, 1);
  assert.equal(result.records[0].partial, true);
  assert.equal(result.records.find(record => record.name === 'nested').partial, true);
  assert.deepEqual(result.errors, [{path: 'nested', code: 'EACCES'}]);
});
test('rejects files as scan roots and accepts a completely empty folder', async context => {
  const root = await fixture(context);
  await assert.rejects(scanDirectory(path.join(root, 'small.txt')), /regular folder/);
  const empty = await scanDirectory(path.join(root, 'nested', 'empty'));
  assert.equal(empty.totalSize, 0);
  assert.equal(empty.fileCount, 0);
  assert.equal(empty.records.length, 1);
});
