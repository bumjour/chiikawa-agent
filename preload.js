'use strict';
// 화면(renderer)이 메인 프로세스에 요청할 수 있는 기능만 골라서 열어 줘요.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  init: () => ipcRenderer.invoke('pet:init'),
  setIgnore: (ignore) => ipcRenderer.send('pet:set-ignore', ignore),
  getPosition: () => ipcRenderer.invoke('pet:get-position'),
  moveTo: (x, y) => ipcRenderer.send('pet:move-to', { x, y }),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  talk: (req) => ipcRenderer.invoke('pet:talk', req),
  openMenu: () => ipcRenderer.send('pet:context-menu'),
  getSchedule: () => ipcRenderer.invoke('schedule:get'),
  saveSchedule: (text) => ipcRenderer.invoke('schedule:save', text),
  onEditSchedule: (fn) => ipcRenderer.on('schedule:edit', () => fn()),
  onChatter: (fn) => ipcRenderer.on('pet:chatter', (_e, line) => fn(line)),
  onUpdate: (fn) => ipcRenderer.on('pet:update', (_e, msg) => fn(msg)),
  doUpdate: (kind) => ipcRenderer.send('pet:do-update', kind),
});
