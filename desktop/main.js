'use strict';
const {app, BrowserWindow, dialog, ipcMain, Menu} = require('electron');
const {Worker} = require('node:worker_threads');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {createModel, queryRecords, buildCSV} = require('../core');
let mainWindow;
let activeScan = null;
let snapshot = null;
let model = null;
let choosingFolder = false;
let exporting = false;
const pageURL = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
function validateSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame || event.senderFrame.url !== pageURL) {
    throw new Error('This operation is available only in the Disk Analyzer window.');
  }
}
async function startScan(directoryPath) {
  if (activeScan) throw new Error('A scan is already running.');
  if (typeof directoryPath !== 'string' || !directoryPath || !path.isAbsolute(directoryPath)) {
    throw new Error('Drop one folder from your file manager.');
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'scan-worker.js'), {workerData: {directoryPath}});
    const scan = {worker, finish: null};
    activeScan = scan;
    let finished = false;
    scan.finish = (result, error) => {
      if (finished) return;
      finished = true;
      if (activeScan === scan) activeScan = null;
      worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    worker.on('message', message => {
      if (finished) return;
      if (message.type === 'progress' && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('disk:progress', message.progress);
      } else if (message.type === 'complete') {
        snapshot = message.result;
        model = createModel(snapshot.records);
        scan.finish({status: 'complete', snapshot});
      } else if (message.type === 'failure') scan.finish(null, new Error(message.message));
    });
    worker.on('error', error => scan.finish(null, error));
    worker.on('exit', () => { if (!finished) scan.finish(null, new Error('The scan stopped unexpectedly.')); });
  });
}
ipcMain.handle('disk:choose-folder', async event => {
  validateSender(event);
  if (activeScan || choosingFolder) throw new Error('A scan or folder selection is already in progress.');
  choosingFolder = true;
  try {
    const selection = await dialog.showOpenDialog(mainWindow, {title: 'Choose a folder to analyze', properties: ['openDirectory']});
    if (selection.canceled || !selection.filePaths.length) return {status: 'canceled'};
    return await startScan(selection.filePaths[0]);
  } finally { choosingFolder = false; }
});
ipcMain.handle('disk:scan-folder', (event, directoryPath) => {
  validateSender(event);
  if (choosingFolder) throw new Error('Close the folder picker before dropping a folder.');
  return startScan(directoryPath);
});
ipcMain.handle('disk:cancel', event => {
  validateSender(event);
  if (activeScan) activeScan.finish({status: 'canceled'});
  return {status: 'canceled'};
});
ipcMain.handle('disk:export', async (event, query) => {
  validateSender(event);
  if (!snapshot || !model) throw new Error('Scan a folder before exporting.');
  if (activeScan || choosingFolder || exporting) throw new Error('Wait for the current operation to finish.');
  if (!query || typeof query !== 'object' || !Number.isInteger(query.folderId) ||
      model.byId.get(query.folderId)?.type !== 'folder' ||
      typeof query.search !== 'string' || query.search.length > 1000 ||
      !['children', 'descendants'].includes(query.scope) ||
      !['all', 'file', 'folder'].includes(query.kind) ||
      typeof query.extension !== 'string' || query.extension.length > 255 ||
      !Number.isFinite(query.minimumSize) || query.minimumSize < 0) {
    throw new Error('Invalid export options.');
  }
  exporting = true;
  const exportSnapshot = snapshot;
  const rows = queryRecords(model, query);
  const folder = model.byId.get(query.folderId);
  try {
    const selection = await dialog.showSaveDialog(mainWindow, {
      title: 'Export the current filtered results', defaultPath: 'disk-analysis.csv',
      filters: [{name: 'CSV spreadsheet', extensions: ['csv']}]
    });
    if (selection.canceled || !selection.filePath) return {status: 'canceled'};
    await fs.writeFile(selection.filePath, '\ufeff' + buildCSV(rows, folder.size, exportSnapshot), 'utf8');
    return {status: 'saved', rowCount: rows.length, filePath: selection.filePath};
  } finally { exporting = false; }
});
function createWindow() {
  mainWindow = new BrowserWindow({width: 1240, height: 900, minWidth: 420, minHeight: 560,
    title: 'Disk Analyzer', backgroundColor: '#0c111b', autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {preload: path.join(__dirname, 'preload.js'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, webSecurity: true}});
  mainWindow.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    callback({cancel: !details.url.startsWith('file://') && !details.url.startsWith('devtools://')});
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
  mainWindow.on('closed', () => {
    if (activeScan) activeScan.finish({status: 'canceled'});
    mainWindow = null;
  });
}
app.whenReady().then(() => {
  if (process.platform === 'darwin') Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label: 'Disk Analyzer', submenu: [{role: 'about'}, {type: 'separator'}, {role: 'quit'}]},
    {label: 'Edit', submenu: [{role: 'undo'}, {role: 'redo'}, {type: 'separator'}, {role: 'cut'}, {role: 'copy'}, {role: 'paste'}, {role: 'selectAll'}]}
  ]));
  else Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
