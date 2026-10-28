'use strict';
// 메인 프로세스: 투명 창 2개(일정 비서, AI 대화)를 띄우고 화면 쪽 요청을 처리해요.
const { app, BrowserWindow, ipcMain, screen, Menu, shell, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const config = require('./src/config');
const ai = require('./src/ai');
const schedule = require('./src/schedule');
const looks = require('./src/looks');
const chatter = require('./src/chatter');
const { CHARACTERS, ROLES } = require('./src/characters');

const WIN_W = 340;
const WIN_H = 560; // 말풍선(일정 입력칸 포함)이 잘리지 않는 높이
const pets = {}; // role -> BrowserWindow

// 캐릭터 이미지를 받아 두는 폴더 (개발 중엔 프로젝트의 characters, 실행 파일에선 사용자 데이터 폴더)
function userCharactersDir() {
  return path.join(path.dirname(config.configPath()), 'characters');
}

function currentChar(role) {
  const id = config.load().characters[role];
  return CHARACTERS[id] ? id : 'chiikawa';
}

// 고른 모습의 이미지 주소. 아직 안 받은 예시 이미지면 받아 온 뒤 그 캐릭터 창을 새로 그려요.
function imageFor(charId, kind) {
  const r = looks.resolve(config.load(), userCharactersDir(), charId, kind);
  if (r.exists) return pathToFileURL(r.file).href;
  if (r.value && r.value.startsWith('http')) {
    looks.download(userCharactersDir(), charId, r.value)
      .then(() => refreshPets(charId))
      .catch((err) => log(`[looks] ${charId} ${kind}: ${err.message}`));
  }
  return null;
}

function characterInfo(role) {
  const ch = currentChar(role);
  return {
    role,
    roleLabel: ROLES[role].label,
    id: ch,
    nameKo: CHARACTERS[ch].nameKo,
    nameJa: CHARACTERS[ch].nameJa,
    color: CHARACTERS[ch].color,
    images: { idle: imageFor(ch, 'idle'), talk: imageFor(ch, 'talk') },
    appearance: appearanceOf(role),
  };
}

// ---- 크기·투명도 (역할별로 저장, 캐릭터 화면에서 직접 조절) ----
const SCALE_RANGE = [0.5, 1.5];   // 크기 50% ~ 150%
const OPACITY_RANGE = [0.1, 1];   // 투명도: 0에 가깝게 ~ 또렷하게
const clampTo = (v, [min, max], d) => (Number.isFinite(v) ? Math.min(Math.max(v, min), max) : d);
function appearanceOf(role) {
  const a = config.load().appearance?.[role] || {};
  return { scale: clampTo(a.scale, SCALE_RANGE, 1), opacity: clampTo(a.opacity, OPACITY_RANGE, 1) };
}
ipcMain.on('pet:set-appearance', (event, a) => {
  const role = roleOf(event);
  config.update({ appearance: { [role]: {
    scale: clampTo(Number(a.scale), SCALE_RANGE, 1), opacity: clampTo(Number(a.opacity), OPACITY_RANGE, 1),
  } } });
});

function refreshPets(charId) {
  for (const [role, win] of Object.entries(pets)) {
    if (!win.isDestroyed() && (!charId || currentChar(role) === charId)) win.reload();
  }
}

function createPet(role, index) {
  const cfg = config.load();
  const { workArea } = screen.getPrimaryDisplay();
  const saved = cfg.positions[role];
  // 저장된 위치가 화면 밖이면(창 크기·모니터가 바뀐 경우) 화면 안으로 당겨 와요
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
  // 말풍선(폭 290)이 창 양옆 25px 안쪽에 있어서, 창이 화면 밖으로 25px까지만 나가도록 막아요
  const x = clamp(saved ? saved.x : workArea.x + workArea.width - WIN_W - index * (WIN_W - 80),
    workArea.x - 25, workArea.x + workArea.width - WIN_W + 25);
  const y = clamp(saved ? saved.y : workArea.y + workArea.height - WIN_H,
    workArea.y - WIN_H + 220, workArea.y + workArea.height - WIN_H);

  const win = new BrowserWindow({
    x, y, width: WIN_W, height: WIN_H,
    transparent: true, frame: false, hasShadow: false, backgroundColor: '#00000000',
    resizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // 투명한 빈 공간은 클릭이 뒤쪽 창으로 통과하게 (캐릭터·말풍선 위에서만 클릭 받음)
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: { role } });
  pets[role] = win;
  // 화면 배율은 항상 100%로 (시연이 중간에 끊기면 1.4배가 저장돼서 말풍선이 창 밖으로 잘려요). 시연 중엔 시연이 다시 맞춰요
  win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(1));

  // 화면이 죽어서 빈 창이 되면 기록하고 다시 그리기
  win.webContents.on('render-process-gone', (_e, details) => {
    log(`[${role}] 화면 프로세스 종료: ${details.reason} (${details.exitCode})`);
    setTimeout(() => !win.isDestroyed() && win.reload(), 500);
  });
  win.webContents.on('unresponsive', () => log(`[${role}] 화면 응답 없음`));
  win.webContents.on('console-message', (e) => {
    if (e.level === 'warning' || e.level === 'error') log(`[${role}] ${e.message} (${path.basename(e.sourceId)}:${e.lineNumber})`);
  });
}

// 문제 생겼을 때 볼 수 있게 config.json 옆 agent.log에 남겨요.
function log(msg) {
  const line = `${new Date().toLocaleString('ko-KR')} ${msg}\n`;
  console.log(line.trim());
  try { fs.appendFileSync(path.join(path.dirname(config.configPath()), 'agent.log'), line); } catch { /* 무시 */ }
}

app.on('child-process-gone', (_e, details) => log(`[${details.type}] 프로세스 종료: ${details.reason}`));

function roleOf(event) {
  return Object.keys(pets).find((r) => pets[r].webContents === event.sender);
}

ipcMain.handle('pet:init', (event) => characterInfo(roleOf(event)));

ipcMain.on('pet:set-ignore', (event, ignore) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win.setIgnoreMouseEvents(ignore, { forward: true });
});

ipcMain.handle('pet:get-position', (event) => BrowserWindow.fromWebContents(event.sender).getPosition());

ipcMain.on('pet:move-to', (event, { x, y }) => {
  BrowserWindow.fromWebContents(event.sender).setPosition(Math.round(x), Math.round(y));
});

ipcMain.on('pet:drag-end', (event) => {
  const [x, y] = BrowserWindow.fromWebContents(event.sender).getPosition();
  config.update({ positions: { [roleOf(event)]: { x, y } } });
});

// ---- 말 걸기 (AI) ----
const histories = {}; // role -> 최근 대화 [{ role, text }]
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const USER_TYPES = { worker: '직장인', student: '학생' };

// chat=true(대화)면 이름은 물어볼 때만, 혼잣말·일정 브리핑은 가끔만
function systemPrompt(charId, task, { chat = false } = {}) {
  const ch = CHARACTERS[charId];
  const { profile } = config.load();
  return [
    `너는 만화 '치이카와'의 캐릭터 ${ch.nameKo}야.`,
    `성격과 말투: ${ch.persona}`,
    `사용자: ${USER_TYPES[profile.type] || '직장인'}.`
      + (profile.name ? ` 사용자 이름은 "${profile.name}". ${chat ? '대답에 이름을 넣지 마. 사용자가 자기 이름을 물어볼 때만 써.' : '이름은 여러 번 중 한 번 정도만 자연스럽게 부르고, 억지로 넣지 마.'}` : ''),
    task,
    '규칙:',
    '- 처음부터 끝까지 캐릭터 말투를 유지해.',
    '- 한국어로만 답해.',
    '- 출력은 JSON 하나만: {"ko": "한국어"}',
  ].join('\n');
}

const askChar = (cfg, opts) => ai.ask(cfg, opts);

// 홍보 영상 촬영 때만 시각을 고정해요 (밤에 찍어도 낮 일정처럼 보이게). 평소엔 null
let clockOverride = null;
const now = () => (clockOverride ? new Date(clockOverride) : new Date());

function nowText() {
  const d = now();
  const pad = (n) => String(n).padStart(2, '0');
  return `${schedule.todayKey(d)}(${WEEKDAYS[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 같은 일정·같은 화면이면 AI를 다시 부르지 않고 저장해 둔 답을 바로 보여 줘요.
const briefCache = new Map();

function remainingItems(items) {
  const d = now();
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return items.filter((i) => !i.time || i.time >= hhmm);
}

const SCHEDULE_PROMPTS = {
  all: (text) => `오늘 전체 일정:\n${text}\n\n`
    + '위 일정을 빠짐없이 시간 순서대로 알려 줘. 일정 하나마다 줄을 바꿔서 "시간 내용" 형태로 쓰고, '
    + '마지막에 캐릭터답게 응원 한마디.',
  remaining: (text) => `지금 시각: ${nowText()}\n지금부터 남은 일정:\n${text}\n\n`
    + '남은 일정을 시간 순서대로 알려 줘. 일정 하나마다 줄을 바꿔서 "시간 내용" 형태로 쓰고, '
    + '가장 가까운 일정은 몇 분(또는 몇 시간) 남았는지 함께 강조해 줘. 마지막에 캐릭터답게 한마디.',
};

// mode: 'all'(전체 일정) | 'remaining'(현재 시각 기준 남은 일정)
async function talkSchedule(charId, mode = 'all') {
  const all = schedule.getToday();
  if (!all.length) {
    return {
      mode,
      empty: true,
      ko: '오늘 일정이 아직 없어! 아래에 적어 줄래?',
    };
  }
  const items = mode === 'remaining' ? remainingItems(all) : all;
  if (!items.length) {
    return { mode, ko: '오늘 남은 일정은 없어! 오늘도 수고했어!' };
  }
  const text = items.map((i) => `${i.time || '시간 미정'} ${i.text}`).join('\n');
  const cfg = config.load();
  if (!ai.hasKey(cfg)) {
    return { mode, ko: `${text}\n\n(AI 키를 넣으면 ${CHARACTERS[charId].nameKo} 말투로 알려 줄게!)` };
  }
  const key = `${schedule.todayKey()}|${charId}|${mode}|${cfg.profile.name}|${cfg.profile.type}|${text}`;
  if (briefCache.has(key)) return briefCache.get(key);
  try {
    const reply = await askChar(cfg, {
      system: systemPrompt(charId, '너는 사용자의 오늘 일정을 알려 주는 비서야.'),
      messages: [{ role: 'user', text: SCHEDULE_PROMPTS[mode](text) }],
    });
    const result = { mode, ...reply };
    briefCache.set(key, result);
    return result;
  } catch (err) {
    log(`[schedule] AI 실패: ${err.message}`);
    return { mode, ko: `(AI 연결 실패: ${err.message})\n${text}` };
  }
}

async function talkChat(role, charId, text) {
  const cfg = config.load();
  if (!ai.hasKey(cfg)) {
    openSettings('ai');
    return { ko: 'AI 키가 필요해! 설정 창에서 넣어 줘!' };
  }
  const history = (histories[role] ||= []);
  history.push({ role: 'user', text });
  try {
    const reply = await askChar(cfg, {
      system: systemPrompt(charId, '사용자와 자유롭게 대화하는 친구야. 질문에는 캐릭터 말투로 실제 도움이 되게 답해. 한국어 기준 1~4문장으로 짧게.', { chat: true }),
      messages: history.slice(-12),
    });
    history.push({ role: 'assistant', text: JSON.stringify({ ko: reply.ko }) });
    return reply;
  } catch (err) {
    history.pop();
    log(`[chat] AI 실패: ${err.message}`);
    return { ko: `앗, 대답을 못 했어… (${err.message})` };
  }
}

ipcMain.handle('pet:talk', async (event, req) => {
  const role = roleOf(event);
  const charId = currentChar(role);
  if (req.type === 'schedule') return talkSchedule(charId, req.mode);
  return talkChat(role, charId, req.text);
});

// ---- 혼잣말: 시간대에 맞는 한마디를 대화 캐릭터가 가끔 말풍선으로 ----
let chatterTimer = null;

// 짧은 간격(10초 등)에도 AI를 매번 부르지 않게, 한 번에 여러 줄을 받아 두고 하나씩 꺼내 써요.
// 캐릭터·시간대·이름이 바뀌면 새로 받아요.
const CHATTER_BATCH = 10;
let chatterPool = { key: '', lines: [], last: '' };

async function makeChatter(charId) {
  const cfg = config.load();
  if (!ai.hasKey(cfg)) return chatter.FALLBACK[Math.floor(Math.random() * chatter.FALLBACK.length)];
  const topic = chatter.topicFor(cfg.profile.type, now());
  const key = `${charId}|${topic}|${cfg.profile.name}|${cfg.profile.type}`;
  if (chatterPool.key !== key || !chatterPool.lines.length) {
    const reply = await askChar(cfg, {
      system: systemPrompt(charId, '너는 사용자 곁에 늘 있는 친구야. 가끔 혼잣말처럼 툭 한마디 건네.'),
      messages: [{
        role: 'user',
        text: `지금 시각: ${nowText()}\n이 시간대 주제 힌트: ${topic}\n`
          + `사용자가 지금 듣고 싶어할 만한 혼잣말을 캐릭터 말투로 ${CHATTER_BATCH}개 만들어 줘. `
          + '하나당 한국어 기준 30자 안쪽으로 아주 짧게, 서로 다른 표현으로. '
          + 'ko에 혼잣말을 한 줄에 하나씩(줄바꿈으로 구분) 넣어. 번호는 붙이지 마.',
      }],
    });
    const split = (s) => (s || '').split('\n').map((t) => t.trim()).filter(Boolean);
    const ko = split(reply.ko);
    chatterPool = { key, lines: ko.map((k) => ({ ko: k })), last: chatterPool.last };
  }
  // 바로 앞에 한 말은 피해서 무작위로 하나
  let i = Math.floor(Math.random() * chatterPool.lines.length);
  if (chatterPool.lines.length > 1 && chatterPool.lines[i].ko === chatterPool.last) i = (i + 1) % chatterPool.lines.length;
  const [line] = chatterPool.lines.splice(i, 1);
  chatterPool.last = line.ko;
  return line;
}

// 앱을 켜자마자: AI를 기다리지 않고 캐릭터 대표 대사로 첫 혼잣말
function greetOnStart() {
  if (chatter.normalizeFreq(config.load().chatter) === 'off') return;
  const line = CHARACTERS[currentChar('chat')].line;
  setTimeout(() => {
    const win = pets.chat;
    if (line && win && !win.isDestroyed()) win.webContents.send('pet:chatter', line);
  }, 2500);
}

// ---- 새 버전 알림: 대화 캐릭터(없으면 일정 캐릭터)가 말풍선으로 ----
const updater = require('./src/updater');
const UPDATE_BUTTON = { install: '⬆️ 지금 업데이트', open: '⬇️ 새 버전 받으러 가기' };
function notifyUpdate(kind, version) {
  const role = pets.chat && !pets.chat.isDestroyed() ? 'chat' : 'schedule';
  const win = pets[role];
  if (!win || win.isDestroyed()) return;
  const ch = CHARACTERS[currentChar(role)];
  let msg;
  if (kind === 'latest') msg = { ko: `이미 최신 버전이야! (v${version})` };
  else if (kind === 'error') msg = { ko: '업데이트 확인이 안 돼… 인터넷 연결을 확인해 줘!' };
  else {
    const v = String(version).replace(/^v/, '');
    msg = { ko: `${ch.updateLine.ko} (v${v})`, button: { kind, label: UPDATE_BUTTON[kind] } };
  }
  win.webContents.send('pet:update', msg);
}
ipcMain.on('pet:do-update', (_e, kind) => updater.act(kind));

async function runChatter() {
  const win = pets.chat;
  try {
    if (win && !win.isDestroyed()) win.webContents.send('pet:chatter', await makeChatter(currentChar('chat')));
  } catch (err) {
    log(`[chatter] ${err.message}`);
  } finally {
    scheduleChatter();
  }
}

function scheduleChatter(firstDelayMs) {
  clearTimeout(chatterTimer);
  const freq = chatter.normalizeFreq(config.load().chatter);
  if (freq === 'off') return;
  chatterTimer = setTimeout(runChatter, firstDelayMs ?? chatter.nextDelayMs(freq));
}

// ---- 직접 적는 일정 ----
ipcMain.handle('schedule:get', () => schedule.getToday());
ipcMain.handle('schedule:save', (event, items) => schedule.saveToday(items));

// 설정·모습 고르기처럼 일반 창: 다 그린 뒤에 보여 주고(빈 화면 방지), 문제는 로그에 남겨요.
function createToolWindow(name, { width, height, title, preload, page }) {
  const win = new BrowserWindow({
    width, height, title, show: false,
    resizable: false, maximizable: false, minimizable: false,
    autoHideMenuBar: true, alwaysOnTop: true, backgroundColor: '#fffdf8',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, preload), contextIsolation: true, sandbox: true },
  });
  win.setMenu(null);
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.webContents.on('did-fail-load', (_e, code, desc) => log(`[${name}] 불러오기 실패: ${code} ${desc}`));
  win.webContents.on('render-process-gone', (_e, d) => log(`[${name}] 화면 프로세스 종료: ${d.reason}`));
  win.webContents.on('unresponsive', () => log(`[${name}] 응답 없음`));
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') log(`[${name}] ${e.message} (${path.basename(e.sourceId)}:${e.lineNumber})`);
  });
  win.loadFile(path.join(__dirname, 'renderer', page));
  return win;
}

// ---- 설정 창 (내 정보 / AI 키 / 정보) ----
let settingsWin = null;
const KEY_PAGES = [
  'https://aistudio.google.com/apikey',
  'https://console.anthropic.com/settings/keys',
  'https://platform.openai.com/api-keys',
];

function openSettings(tab = 'ai') {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('settings:tab', tab);
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = createToolWindow('settings', {
    width: 460, height: 620, title: '치이카와 에이전트 설정', preload: 'settings-preload.js', page: 'settings.html',
  });
  settingsWin.settingsTab = tab;
}

function settingsState(tab) {
  const cfg = config.load();
  return {
    aiProvider: cfg.aiProvider, apiKeys: cfg.apiKeys, profile: cfg.profile, chatter: chatter.normalizeFreq(cfg.chatter),
    version: app.getVersion(), tab,
  };
}

ipcMain.handle('settings:get', (event) => settingsState(BrowserWindow.fromWebContents(event.sender).settingsTab));

ipcMain.handle('settings:save-profile', (event, { name, type, chatter: freq }) => {
  briefCache.clear();
  const prev = config.load().profile;
  config.update({ profile: { name: name.trim(), type, setupDone: true }, chatter: chatter.normalizeFreq(freq) });
  scheduleChatter();
  return settingsState();
});

ipcMain.handle('settings:save', (event, { aiProvider, key }) => {
  briefCache.clear();
  config.update({ aiProvider, apiKeys: { [aiProvider]: key } });
  talkSchedule(currentChar('schedule'), 'all').catch(() => {}); // 새 키로 미리 받아 두기
  return settingsState();
});

ipcMain.handle('settings:test', async (event, { aiProvider, key }) => {
  const cfg = config.load();
  try {
    const reply = await ai.ask({ ...cfg, aiProvider, apiKeys: { ...cfg.apiKeys, [aiProvider]: key } }, {
      system: '출력은 JSON 하나만: {"ko": "한국어"}',
      messages: [{ role: 'user', text: '"연결 성공"이라고만 답해 줘.' }],
    });
    return { ok: true, model: reply.model };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

ipcMain.on('settings:open-url', (event, url) => {
  if (KEY_PAGES.includes(url)) shell.openExternal(url);
});

// ---- 모습 고르기 창 ----
let pickerWin = null;

function openPicker(charId) {
  if (pickerWin && !pickerWin.isDestroyed()) pickerWin.close();
  pickerWin = createToolWindow('picker', {
    width: 560, height: 640, title: `${CHARACTERS[charId].nameKo} 모습 고르기`, preload: 'picker-preload.js', page: 'picker.html',
  });
  pickerWin.charId = charId;
}

function pickerState(charId) {
  const cfg = config.load();
  const dir = userCharactersDir();
  const thumb = (value) => {
    const file = looks.localFile(dir, charId, value);
    return fs.existsSync(file) ? pathToFileURL(file).href : value; // 아직 안 받은 예시는 원래 주소로 미리보기
  };
  const items = [
    ...looks.userImages(dir, charId).map((value) => ({ value, thumb: thumb(value), mine: true })),
    ...(looks.GALLERY[charId] || []).map((value) => ({ value, thumb: thumb(value) })),
  ];
  return {
    charId,
    nameKo: CHARACTERS[charId].nameKo,
    color: CHARACTERS[charId].color,
    items,
    selected: {
      idle: looks.resolve(cfg, dir, charId, 'idle').value,
      talk: looks.resolve(cfg, dir, charId, 'talk').value || 'none',
    },
  };
}

ipcMain.handle('picker:get', (event) => pickerState(BrowserWindow.fromWebContents(event.sender).charId));

ipcMain.handle('picker:set', async (event, { kind, value }) => {
  const charId = BrowserWindow.fromWebContents(event.sender).charId;
  config.update({ looks: { [charId]: { [kind]: value } } });
  if (value.startsWith('http')) await looks.download(userCharactersDir(), charId, value).catch((err) => log(`[looks] ${err.message}`));
  refreshPets(charId);
  return pickerState(charId);
});

ipcMain.handle('picker:add', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showOpenDialog(win, {
    title: '내 이미지 추가 (배경이 투명한 PNG·GIF 추천)',
    filters: [{ name: '이미지', extensions: looks.IMAGE_EXT }],
    properties: ['openFile', 'multiSelections'],
  });
  for (const src of res.filePaths) looks.addUserImage(userCharactersDir(), win.charId, src);
  return pickerState(win.charId);
});

// ---- 우클릭 메뉴 ----
ipcMain.on('pet:context-menu', (event) => {
  const role = roleOf(event);
  const win = pets[role];
  const current = currentChar(role);
  const menu = Menu.buildFromTemplate([
    {
      label: `캐릭터 바꾸기 (지금: ${CHARACTERS[current].nameKo})`,
      submenu: Object.entries(CHARACTERS).map(([id, ch]) => ({
        label: ch.nameKo,
        type: 'radio',
        checked: id === current,
        click: () => {
          config.update({ characters: { [role]: id } });
          win.reload();
        },
      })),
    },
    { label: `${CHARACTERS[current].nameKo} 모습 고르기…`, click: () => openPicker(current) },
    { label: '크기·투명도 조절', click: () => win.webContents.send('pet:adjust') },
    { type: 'separator' },
    ...(role === 'schedule' ? [{ label: '오늘 일정 적기', click: () => win.webContents.send('schedule:edit') }] : []),
    ...(role === 'chat' ? [{ label: '혼잣말 지금 듣기', click: () => runChatter() }] : []),
    { label: '내 정보·혼잣말 설정…', click: () => openSettings('profile') },
    { label: 'AI 키 설정…', click: () => openSettings('ai') },
    {
      label: '고급',
      submenu: [
        { label: '설정 파일 열기', click: () => shell.openPath(config.configPath()) },
        { label: '캐릭터 이미지 폴더 열기', click: () => { fs.mkdirSync(userCharactersDir(), { recursive: true }); shell.openPath(userCharactersDir()); } },
        { label: '설정 다시 불러오기', click: () => refreshPets() },
        { label: '다시 시작', click: () => { app.relaunch(); app.exit(0); } },
      ],
    },
    { label: '업데이트 확인', click: () => updater.check(true) },
    { label: '정보', click: () => openSettings('about') },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]);
  menu.popup({ window: win });
});

// 이미 켜져 있으면 하나 더 띄우지 않기
// (시연 모드로 켜면 켜져 있던 앱을 끄고, 잠시 뒤 시연용으로 다시 켜요)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  if (process.argv.includes('--demo')) setTimeout(() => { app.relaunch(); app.exit(0); }, 2000);
  else app.quit();
}
app.on('second-instance', (_e, argv) => { if (argv.includes('--demo')) app.quit(); });

app.whenReady().then(() => {
  if (!gotLock) return;
  if (require('./src/demo').recoverIfNeeded(config, schedule)) log('[demo] 지난 시연 설정을 원래대로 되돌렸어요');
  if (process.platform === 'darwin' && app.dock) app.dock.hide(); // 맥 Dock에 아이콘 안 띄우기
  startNormally();

  // 홍보 영상용 자동 시연 (npm run demo): 가로 전체화면, 엑셀 캡처 배경 위에서 실제 앱을 시연
  if (process.argv.includes('--demo')) {
    clearTimeout(chatterTimer); // 시연 중에 혼잣말이 끼어들지 않게
    setTimeout(() => require('./src/demo').run({
      pets, config, schedule, talkSchedule, makeChatter, imageFor, log,
      setClock: (d) => { clockOverride = d; briefCache.clear(); },
    }).catch((err) => log(`[demo] 실패: ${err.message}`)), 3000);
  }
});

function startNormally() {
  createPet('schedule', 1);
  createPet('chat', 0);
  const cfg = config.load();
  if (!cfg.profile.setupDone) {
    setTimeout(() => openSettings('profile'), 1000); // 처음 실행: 캐릭터가 뜬 뒤 내 정보 → AI 키 순서로
  } else if (!ai.hasKey(cfg)) {
    setTimeout(() => openSettings('ai'), 1000);
  } else {
    // 켜자마자 오늘 전체 일정을 미리 받아 두기 → 첫 클릭 때 기다리지 않음 (빠른 모델도 이때 찾아 둬요)
    talkSchedule(currentChar('schedule'), 'all').catch(() => {});
  }
  greetOnStart();     // 켜자마자 대표 대사 한마디
  scheduleChatter();  // 그다음부터는 설정한 간격마다
  updater.start({ notify: notifyUpdate, log }); // 10초 뒤 + 6시간마다 새 버전 확인
}

app.on('window-all-closed', () => app.quit());
