'use strict';
// 설정 창이 쓸 수 있는 기능
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settings', {
  get: () => ipcRenderer.invoke('settings:get'),
  save: (s) => ipcRenderer.invoke('settings:save', s),
  saveProfile: (p) => ipcRenderer.invoke('settings:save-profile', p),
  onTab: (fn) => ipcRenderer.on('settings:tab', (_e, tab) => fn(tab)),
  test: (s) => ipcRenderer.invoke('settings:test', s),
  openUrl: (url) => ipcRenderer.send('settings:open-url', url),
  close: () => window.close(),
});
