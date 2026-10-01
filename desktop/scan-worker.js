'use strict';
const {parentPort, workerData} = require('node:worker_threads');
const {scanDirectory} = require('./scanner');
scanDirectory(workerData.directoryPath, progress => parentPort.postMessage({type: 'progress', progress}))
  .then(result => parentPort.postMessage({type: 'complete', result}))
  .catch(error => parentPort.postMessage({type: 'failure', message: error.message}));
