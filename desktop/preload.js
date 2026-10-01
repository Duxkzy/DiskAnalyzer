'use strict';
const {contextBridge, ipcRenderer, webUtils} = require('electron');
contextBridge.exposeInMainWorld('diskAPI', {
  chooseFolder: () => ipcRenderer.invoke('disk:choose-folder'),
  scanDroppedFolder: file => ipcRenderer.invoke('disk:scan-folder', webUtils.getPathForFile(file)),
  cancelScan: () => ipcRenderer.invoke('disk:cancel'),
  exportCSV: query => ipcRenderer.invoke('disk:export', query),
  onProgress: callback => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('disk:progress', listener);
    return () => ipcRenderer.removeListener('disk:progress', listener);
  }
});
