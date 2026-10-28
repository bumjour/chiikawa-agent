'use strict';
// 홍보 영상용 자동 시연 + 화면 녹화 (npm run demo)
// 실제 마우스를 움직여 클릭하고, 화면 전체를 녹화해서 '동영상' 폴더에 저장해요.
// 시연 중에는 마우스·키보드를 만지지 마세요. 멈추려면 Esc 대신 Ctrl+Alt+Q.
const { app, BrowserWindow, ipcMain, screen, clipboard, globalShortcut } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 마우스·키보드: PowerShell 하나를 띄워 두고 명령을 보내요 ----
// 커서 이동은 실제 마우스 입력(mouse_event)으로: SetCursorPos는 캐릭터 창이 "마우스가 올라왔다"를 못 느껴서 클릭이 뒤로 통과해요
const PS_HOST = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class D {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
"@
[D]::SetProcessDPIAware() | Out-Null
Add-Type -AssemblyName System.Windows.Forms
while ($true) {
  $l = [Console]::In.ReadLine(); if ($l -eq $null -or $l -eq 'exit') { break }
  $p = $l.Split(' ')
  switch ($p[0]) {
    'move'   { $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
               [D]::mouse_event(0x8001, [uint32]([int]$p[1] * 65535 / ($b.Width - 1)), [uint32]([int]$p[2] * 65535 / ($b.Height - 1)), 0, [UIntPtr]::Zero) }
    'down'   { [D]::mouse_event(2,0,0,0,[UIntPtr]::Zero) }
    'up'     { [D]::mouse_event(4,0,0,0,[UIntPtr]::Zero) }
    'rdown'  { [D]::mouse_event(8,0,0,0,[UIntPtr]::Zero) }
    'rup'    { [D]::mouse_event(16,0,0,0,[UIntPtr]::Zero) }
    'keys'   { [System.Windows.Forms.SendKeys]::SendWait($l.Substring(5)) }
    'front'  { $w = Get-Process $p[1] -ErrorAction SilentlyContinue | ? { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
               if ($w) { [D]::ShowWindow($w.MainWindowHandle, 3) | Out-Null; [D]::SetForegroundWindow($w.MainWindowHandle) | Out-Null } }
  }
  [Console]::Out.WriteLine('ok')
}
`;

function startInput() {
  // 스크립트는 파일로 실행하고, 표준 입력은 명령 전달에만 써요 (-Command - 로 넘기면 명령과 섞여 멈춰요)
  const hostFile = path.join(app.getPath('temp'), 'chiikawa-demo-input.ps1');
  fs.writeFileSync(hostFile, PS_HOST.replace(/\n/g, '\r\n'), 'ascii');
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', hostFile], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true }); // 빈 파워셸 창이 뜨지 않게
  let pending = [];
  ps.stdout.on('data', (d) => {
    const n = (d.toString().match(/ok/g) || []).length;
    for (let i = 0; i < n; i++) (pending.shift() || (() => {}))();
  });
  // 5초 안에 답이 없으면 기다리지 않고 넘어가요 (시연이 통째로 멈추지 않게)
  const send = (cmd) => new Promise((resolve) => {
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { pending = pending.filter((f) => f !== done); resolve(); }, 5000);
    pending.push(done);
    ps.stdin.write(cmd + '\r\n');
  });
  let cur = screen.getCursorScreenPoint();
  const toPx = (p) => (process.platform === 'win32' ? screen.dipToScreenPoint(p) : p);
  return {
    // 사람처럼 부드럽게 이동 (DIP 좌표)
    async moveTo(x, y, ms = 650) {
      const from = cur; const steps = Math.max(12, Math.round(ms / 16));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps; const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        const p = toPx({ x: Math.round(from.x + (x - from.x) * e), y: Math.round(from.y + (y - from.y) * e) });
        await send(`move ${p.x} ${p.y}`);
        await wait(ms / steps);
      }
      cur = { x, y };
    },
    async click() { await send('down'); await wait(70); await send('up'); },
    async rightClick() { await send('rdown'); await wait(70); await send('rup'); },
    async keys(k) { await send('keys ' + k); },
    async front(processName) { await send('front ' + processName); }, // 그 프로그램 창을 최대화해서 맨 앞으로
    close() { try { ps.stdin.write('exit\r\n'); } catch { /* 무시 */ } },
  };
}

// ---- 화면 녹화: 숨은 창에서 화면 전체를 MediaRecorder로 ----
async function startRecorder(outFile) {
  const { desktopCapturer } = require('electron');
  const display = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  const src = sources.find((s) => s.display_id === String(display.id)) || sources[0];
  const win = new BrowserWindow({ show: false, webPreferences: {
    nodeIntegration: true, contextIsolation: false, backgroundThrottling: false, partition: 'demo-recorder' } });
  // 화면 공유 요청이 오면 묻지 않고 주 모니터를 넘겨줘요 (녹화 전용 세션에서만)
  win.webContents.session.setDisplayMediaRequestHandler((_req, cb) => cb({ video: src }));
  const chunks = [];
  ipcMain.on('demo:chunk', (_e, buf) => chunks.push(Buffer.from(buf)));
  const finished = new Promise((r) => ipcMain.once('demo:done', (_e, mime) => r(mime)));
  // 화면 녹화는 안전한 페이지에서만 허용돼서 data: 대신 로컬 파일로 열어요
  const blank = path.join(app.getPath('temp'), 'chiikawa-demo-recorder.html');
  fs.writeFileSync(blank, '<!doctype html><meta charset="utf-8"><body></body>');
  await win.loadFile(blank);
  const started = win.webContents.executeJavaScript(`(async () => {
    const { ipcRenderer } = require('electron');
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: false, video: { frameRate: 30 } });
    const mime = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16000000 });
    rec.ondataavailable = async (e) => { if (e.data.size) ipcRenderer.send('demo:chunk', new Uint8Array(await e.data.arrayBuffer())); };
    rec.onstop = () => setTimeout(() => ipcRenderer.send('demo:done', mime), 300);
    window.__rec = rec; rec.start(1000);
    return mime;
  })()`);
  const mime = await Promise.race([started, wait(10000).then(() => { throw new Error('화면 녹화를 시작하지 못했어요'); })]);
  console.log('[demo] 녹화 형식:', mime);
  return {
    async stop() {
      await win.webContents.executeJavaScript('window.__rec.stop(), true');
      const mime = await finished;
      const file = outFile + (mime.includes('mp4') ? '.mp4' : '.webm');
      fs.writeFileSync(file, Buffer.concat(chunks));
      win.destroy();
      return file;
    },
  };
}

// ---- 시나리오 (가로 전체화면, 핸드폰으로 화면을 찍는 용도) ----
const DEMO_NAME = { ko: '서연', ja: 'ソヨン' }; // 대법원 통계상 가장 흔한 여자 이름 중 하나 (예시)
const Z = 1.4; // 휴대폰으로 찍어도 읽히게 캐릭터·말풍선 확대 배율
// 영상 속 '지금 시각'과 예시 일정 (밤에 찍어도 낮처럼, 남은 일정이 자연스럽게 나오게)
const DEMO_CLOCK = { h: 13, m: 50 };
const DEMO_SCHEDULE = [
  { time: '10:00', text: '팀 회의' },
  { time: '12:30', text: '점심 약속' },
  { time: '15:00', text: '기획 리뷰' },
  { time: '19:30', text: '운동' },
];

function restoreFile(config) {
  return path.join(path.dirname(config.configPath()), 'demo-restore.json');
}

// 앱 시작 때 호출: 지난 시연이 중간에 멈췄으면 캐릭터·이름·일정을 원래대로
function recoverIfNeeded(config, schedule) {
  const f = restoreFile(config);
  if (!fs.existsSync(f)) return false;
  try {
    const saved = JSON.parse(fs.readFileSync(f, 'utf8'));
    config.update({ characters: saved.characters, profile: saved.profile, positions: saved.positions || {} });
    if (schedule && saved.schedule) schedule.saveToday(saved.schedule);
  } catch { /* 무시 */ }
  fs.unlinkSync(f);
  return true;
}

async function run(ctx) {
  const { pets, config, schedule, talkSchedule, makeChatter, imageFor, setClock, log } = ctx;
  const say = (m) => { console.log('[demo] ' + m); log(`[demo] ${m}`); };
  let aborted = false;
  globalShortcut.register('CommandOrControl+Alt+Q', () => { aborted = true; say('중단 요청'); });
  const step = async (ms) => { if (aborted) throw new Error('aborted'); await wait(ms); };
  let zoom = 1;
  let input = null;
  const setChar = async (role, id) => {
    config.update({ characters: { [role]: id } });
    pets[role].reload();
    await wait(900);
    pets[role].webContents.setZoomFactor(zoom);
  };

  // 화면 위 요소의 중심 좌표 (확대 배율 반영, DIP)
  async function center(role, selector) {
    const win = pets[role];
    const r = await win.webContents.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
      if (!el || el.offsetParent === null) return null; const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (!r) return null;
    const [wx, wy] = win.getPosition();
    const zf = win.webContents.getZoomFactor();
    return { x: Math.round(wx + r.x * zf), y: Math.round(wy + r.y * zf) };
  }
  async function clickOn(role, selector, ms) {
    const p = await center(role, selector);
    if (!p) { say(`못 찾음: ${role} ${selector}`); return false; }
    await input.moveTo(p.x, p.y, ms); await wait(150); await input.click();
    return true;
  }
  // 우클릭 → 캐릭터 바꾸기 → n번째 캐릭터 (실제 앱 메뉴를 키보드로 고름)
  const ORDER = ['chiikawa', 'hachiware', 'usagi', 'momonga', 'kurimanju', 'shisa', 'rakko'];
  async function pickCharacter(role, id) {
    const p = await center(role, '#pet');
    await input.moveTo(p.x, p.y, 500); await wait(250); await input.rightClick();
    await step(900);
    await input.keys('{DOWN}'); await step(400);          // 캐릭터 바꾸기
    await input.keys('{RIGHT}'); await step(700);         // 하위 메뉴 (치이카와부터)
    for (let i = 0; i < ORDER.indexOf(id); i++) { await input.keys('{DOWN}'); await step(260); }
    await step(400);
    await input.keys('{ENTER}');
    await wait(1000);
    pets[role].webContents.setZoomFactor(zoom);
    await step(600);
    // 메뉴 고르기가 빗나갔으면(포커스 문제 등) 직접 바꿔서 시연을 이어 가요
    if (config.load().characters[role] !== id) {
      say(`메뉴로 못 바꿈(${role}: ${config.load().characters[role]}) → 직접 ${id}`);
      await setChar(role, id);
    }
  }
  // 조건이 맞을 때까지 기다리기 (최대 ms)
  async function waitFor(role, expr, ms) {
    for (let t = 0; t < ms; t += 250) {
      if (await pets[role].webContents.executeJavaScript(expr).catch(() => false)) return true;
      await step(250);
    }
    return false;
  }
  const STATE = "JSON.stringify({ bubble: !bubbleEl.classList.contains('hidden'), bar: !schedBar.classList.contains('hidden'), editor: !scheduleForm.classList.contains('hidden'), ko: koEl.textContent.slice(0, 40) })";
  const BAR_SHOWN = "!schedBar.classList.contains('hidden')";

  const { CHARACTERS } = require('./characters');
  const LINEUP = ORDER;
  // 오프닝 대사: 캐릭터 말버릇 × 직장인의 하루 (출근 → 퇴사 고민 → 야근 → 칭찬 → 한 잔 → 월요일 → 칼퇴)
  const HOOK = Object.fromEntries(Object.entries(CHARACTERS).map(([id, ch]) => [id, ch.line]));

  // ── 준비: 원래 설정 저장(멈춰도 복구) → 예시 이름·일정·시각 적용 → AI 답 미리 받기 ──
  say('준비 중… (예시 일정과 AI 답을 미리 받아 둬요, 약 15초)');
  const orig = {
    characters: { ...config.load().characters }, profile: { ...config.load().profile },
    positions: { ...config.load().positions }, schedule: schedule.getToday(),
  };
  fs.writeFileSync(restoreFile(config), JSON.stringify(orig, null, 2));
  const origBounds = { schedule: pets.schedule.getBounds(), chat: pets.chat.getBounds() };
  const clock = new Date(); clock.setHours(DEMO_CLOCK.h, DEMO_CLOCK.m, 0, 0);
  setClock(clock);
  config.update({ profile: { name: DEMO_NAME.ko, nameJa: DEMO_NAME.ja, nameJaFor: DEMO_NAME.ko } });
  schedule.saveToday(DEMO_SCHEDULE);
  for (const id of LINEUP) imageFor(id, 'idle'); // 아직 안 받은 그림이 있으면 받기 시작
  await setChar('schedule', 'chiikawa'); // 시작은 치이카와 → 영상에서 하치와레로 지정
  await setChar('chat', 'usagi');        // 시작은 우사기 → 영상에서 쿠리만쥬로 지정
  const chatterLine = await makeChatter('usagi').catch(() => ({ ko: '야하! 서연! 졸려?! 우라!', ja: 'ヤハ！ソヨン！ねむい？！ウラ！' }));
  await talkSchedule('hachiware', 'all').catch(() => {});
  await talkSchedule('hachiware', 'remaining').catch(() => {});
  const cast = LINEUP.map((id) => ({
    id, nameKo: CHARACTERS[id].nameKo, color: CHARACTERS[id].color, ko: HOOK[id].ko, ja: HOOK[id].ja,
    image: imageFor(id, 'idle'), // 쿠리만쥬는 기본 모습이 '키야!!' + 맥주
  }));
  for (const w of Object.values(pets)) await w.webContents.executeJavaScript('closeBubble(), true');

  const display = screen.getPrimaryDisplay();
  const full = display.bounds;

  // 배경: 엑셀 캡처를 화면 전체에 (아이콘·작업 표시줄까지 가림, 눌러도 아무 일 없음)
  const bgImage = path.join(__dirname, '..', 'assets', 'demo', 'excel-landscape.png');
  const bg = new BrowserWindow({
    ...full, frame: false, show: false, skipTaskbar: true, resizable: false, fullscreen: true,
    backgroundColor: '#ffffff', webPreferences: { sandbox: true },
  });
  const bgHtml = path.join(app.getPath('temp'), 'chiikawa-demo-bg.html');
  fs.writeFileSync(bgHtml, `<!doctype html><meta charset="utf-8"><body style="margin:0;overflow:hidden;cursor:default">
    <img src="${require('url').pathToFileURL(bgImage).href}" style="width:100vw;height:100vh;object-fit:cover;display:block" draggable="false"></body>`);
  await bg.loadFile(bgHtml);

  // 7종 한 줄 창: 화면 가운데, 클릭은 통과
  const lineup = new BrowserWindow({
    x: full.x, y: Math.round(full.y + full.height * 0.5 - 300), width: full.width, height: 560, show: false,
    transparent: true, frame: false, hasShadow: false, backgroundColor: '#00000000',
    resizable: false, skipTaskbar: true, focusable: false, alwaysOnTop: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  lineup.setAlwaysOnTop(true, 'screen-saver');
  lineup.setIgnoreMouseEvents(true);
  await lineup.loadFile(path.join(__dirname, '..', 'renderer', 'lineup.html'));
  await lineup.webContents.executeJavaScript(`setLineup(${JSON.stringify(cast)}), true`);

  // 두 캐릭터: 확대해서 화면 가운데에 나란히 (일정 왼쪽, 대화 오른쪽)
  zoom = Z;
  const W = Math.round(340 * zoom); const H = Math.round(560 * zoom);
  const petFromTop = (560 - 22 - 75) * zoom;
  const petY = full.y + full.height * 0.68;
  pets.schedule.setBounds({ x: Math.round(full.x + full.width / 2 - 330 - W / 2), y: Math.round(petY - petFromTop), width: W, height: H });
  pets.chat.setBounds({ x: Math.round(full.x + full.width / 2 + 330 - W / 2), y: Math.round(petY - petFromTop), width: W, height: H });
  for (const w of Object.values(pets)) { w.webContents.setZoomFactor(zoom); w.setAlwaysOnTop(true, 'screen-saver'); w.hide(); }

  bg.show(); bg.focus();
  await wait(800);
  lineup.showInactive();

  input = startInput();
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const out = path.join(app.getPath('videos'), `치이카와-데모-${stamp}`);
  await input.moveTo(full.x + full.width * 0.9, full.y + full.height * 0.15, 200); // 커서는 구석에 대기
  await wait(600);
  let rec = null;
  try { rec = await startRecorder(out); } catch (err) { say('화면 녹화 파일은 못 만들어요(시연은 계속): ' + err.message); }
  say('시연 시작');

  try {
    await step(1500);
    // ⓪ 오프닝: 7종이 차례로 한마디씩
    for (let i = 0; i < cast.length; i++) {
      await lineup.webContents.executeJavaScript(`speak(${i}), true`);
      await step(750);
    }
    await step(2800);
    // 두 캐릭터만 남기기
    lineup.hide();
    pets.schedule.showInactive();
    pets.chat.showInactive();
    await step(1000);
    // ① 우사기 혼잣말
    pets.chat.webContents.send('pet:chatter', chatterLine);
    await step(4500); // 한 글자씩 천천히 나와요
    await pets.chat.webContents.executeJavaScript('closeBubble(), true');
    // ② 일정 캐릭터를 하치와레로 지정 → 오늘 일정
    await pickCharacter('schedule', 'hachiware');
    await clickOn('schedule', '#pet');
    if (!(await waitFor('schedule', BAR_SHOWN, 15000))) {
      say('일정 말풍선이 안 떠서 직접 띄움: ' + await pets.schedule.webContents.executeJavaScript(STATE));
      await pets.schedule.webContents.executeJavaScript('briefSchedule(), true');
      await waitFor('schedule', BAR_SHOWN, 15000);
    }
    await step(7000); // 한 글자씩 다 나올 때까지
    // ③ 남은 일정
    if (!(await clickOn('schedule', '#modeBtn', 550))) await pets.schedule.webContents.executeJavaScript("briefSchedule('remaining'), true");
    await waitFor('schedule', BAR_SHOWN, 15000);
    await step(7000);
    await clickOn('schedule', '#pet', 500); // 닫기
    await step(800);
    // ④ 대화 캐릭터를 쿠리만쥬로 지정 → 대화
    await pickCharacter('chat', 'kurimanju');
    await clickOn('chat', '#pet');
    await step(1200);
    for (const ch of '오늘 야근인데 저녁 뭐 먹지?') { clipboard.writeText(ch); await input.keys('^v'); await wait(90); }
    await step(700);
    await input.keys('{ENTER}');
    await step(9500);
    // ⑤ 마무리: 다시 7종 (편집에서 "댓글에 '치이카와'" 자막 얹기 좋게)
    await input.moveTo(full.x + full.width * 0.9, full.y + full.height * 0.15, 500);
    pets.schedule.hide();
    pets.chat.hide();
    lineup.showInactive();
    await step(4000);
  } catch (err) {
    if (err.message !== 'aborted') say('오류: ' + err.message);
  }

  let file = null;
  if (rec) { try { file = await rec.stop(); } catch (err) { say('녹화 저장 실패: ' + err.message); } }
  input.close();
  globalShortcut.unregisterAll();
  lineup.destroy();
  bg.destroy();

  // ── 원래대로: 시각·이름·일정·캐릭터·위치·배율 ──
  zoom = 1;
  setClock(null);
  schedule.saveToday(orig.schedule);
  config.update({ profile: orig.profile });
  await setChar('schedule', orig.characters.schedule);
  await setChar('chat', orig.characters.chat);
  for (const role of ['schedule', 'chat']) {
    pets[role].setAlwaysOnTop(true, 'floating');
    pets[role].setBounds(origBounds[role]);
    pets[role].showInactive();
  }
  try { fs.unlinkSync(restoreFile(config)); } catch { /* 없음 */ }
  say(file ? '녹화 저장: ' + file : '시연 끝');
  if (file) require('electron').shell.showItemInFolder(file);
}

module.exports = { run, recoverIfNeeded, startInput };
