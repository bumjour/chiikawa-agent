'use strict';
// 가이드용 화면 캡처 전용: 진짜 앱 대신 가짜 데이터를 돌려주는 preload
const { contextBridge } = require('electron');

const arg = process.argv.find((a) => a.startsWith('--stub='));
const stub = arg ? JSON.parse(decodeURIComponent(arg.slice(7))) : {};
const noop = () => {};

contextBridge.exposeInMainWorld('pet', {
  init: async () => stub.info,
  setIgnore: noop, getPosition: async () => [0, 0], moveTo: noop, dragEnd: noop, openMenu: noop,
  talk: async () => ({ ko: '', ja: '' }),
  getSchedule: async () => [], saveSchedule: async () => {},
  onEditSchedule: noop, onChatter: noop, onUpdate: noop, doUpdate: noop,
});
contextBridge.exposeInMainWorld('settings', {
  get: async () => stub.settings, save: async () => stub.settings, saveProfile: async () => stub.settings,
  test: async () => ({ ok: true, model: 'gemini-3.6-flash' }), openUrl: noop, onTab: noop, close: noop,
});
contextBridge.exposeInMainWorld('picker', {
  get: async () => stub.picker, set: async () => stub.picker, add: async () => stub.picker, close: noop,
});
