'use strict';
// 새 버전 확인 → 캐릭터 말풍선으로 알리기
// - Windows: GitHub 다운로드 페이지에서 뒤에서 미리 받아 두고, [지금 업데이트]를 누르면 설치 후 다시 시작
// - 맥: 애플 개발자 서명이 없으면 자동 설치가 안 돼서, 새 버전이 있으면 다운로드 페이지로 안내
const { app, shell } = require('electron');

const REPO = 'bumjour/chiikawa-agent';
const PAGE = 'https://bumjour.github.io/chiikawa-agent/';
const FIRST_CHECK_MS = 10 * 1000;
const EVERY_MS = 6 * 60 * 60 * 1000;

let notify = () => {}; // (kind: 'install' | 'open' | 'latest' | 'error', version) → 캐릭터 말풍선
let log = () => {};
let autoUpdater = null;
let ready = null; // 받아 둔 새 버전 (Windows)

function newer(a, b) { // a가 b보다 새 버전이면 true
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

async function latestVersion() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return (await res.json()).tag_name;
}

// manual: 메뉴에서 직접 누른 경우 → 최신이어도 "이미 최신 버전" 말풍선
async function check(manual = false) {
  if (!app.isPackaged) { // 개발용: 버전 비교만 해 보고 알림 흐름은 '--test-update'로 확인
    if (manual) notify('latest', app.getVersion());
    return;
  }
  try {
    if (ready) return notify('install', ready);
    if (autoUpdater) {
      const r = await autoUpdater.checkForUpdates();
      if (manual && (!r || !r.updateInfo || !newer(r.updateInfo.version, app.getVersion()))) notify('latest', app.getVersion());
      return; // 새 버전이면 다 받은 뒤 'update-downloaded'에서 알려요
    }
    const v = await latestVersion();
    if (newer(v, app.getVersion())) notify('open', v);
    else if (manual) notify('latest', app.getVersion());
  } catch (err) {
    log(`[update] 확인 실패: ${err.message}`);
    if (manual) notify('error');
  }
}

// 말풍선 버튼을 눌렀을 때
function act(kind) {
  if (kind === 'install' && autoUpdater && ready) autoUpdater.quitAndInstall(true, true);
  else shell.openExternal(PAGE);
}

function start({ notify: n, log: l }) {
  notify = n;
  log = l;
  if (app.isPackaged && process.platform === 'win32') {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true; // 버튼을 안 눌러도 앱을 끌 때 설치
    autoUpdater.logger = { info: () => {}, warn: (m) => log(`[update] ${m}`), error: (m) => log(`[update] ${m}`), debug: () => {} };
    autoUpdater.on('update-downloaded', (info) => { ready = info.version; notify('install', info.version); });
    autoUpdater.on('error', (err) => log(`[update] ${err.message}`));
  }
  setTimeout(() => check(), FIRST_CHECK_MS);
  setInterval(() => check(), EVERY_MS);
  // 개발용 시험: npm start -- --test-update → 말풍선만 띄워 보기
  if (process.argv.includes('--test-update')) setTimeout(() => notify(process.platform === 'win32' ? 'install' : 'open', '9.9.9'), 4000);
}

module.exports = { start, check, act, PAGE };
