'use strict';
// 모습 고르기 창이 쓸 수 있는 기능
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('picker', {
  get: () => ipcRenderer.invoke('picker:get'),
  set: (kind, value) => ipcRenderer.invoke('picker:set', { kind, value }),
  add: () => ipcRenderer.invoke('picker:add'),
  close: () => window.close(),
});
