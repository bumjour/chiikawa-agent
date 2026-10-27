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
    'move'   { [D]::SetCursorPos([int]$p[1], [int]$p[2]) | Out-Null }
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
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '-'], { stdio: ['pipe', 'pipe', 'inherit'] });
  ps.stdin.write(PS_HOST.replace(/\n/g, '\r\n') + '\r\n');
  let pending = [];
  ps.stdout.on('data', (d) => {
    const n = (d.toString().match(/ok/g) || []).length;
    for (let i = 0; i < n; i++) (pending.shift() || (() => {}))();
  });
  const send = (cmd) => new Promise((r) => { pending.push(r); ps.stdin.write(cmd + '\r\n'); });
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

// ---- 세로 녹화: 녹화하는 동안만 모니터를 세로로 ----
const ROTATE_PS = path.join(__dirname, 'display-rotate.ps1');
function rotate(mode) {
  if (process.platform !== 'win32') return false;
  try {
    const out = require('child_process').execFileSync('powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ROTATE_PS, mode], { encoding: 'utf8', timeout: 20000 });
    return /ok|이미/.test(out);
  } catch { return false; }
}
// 화면 크기 바뀐 게 반영될 때까지 기다리기
async function waitForOrientation(portrait) {
  for (let i = 0; i < 30; i++) {
    const { width, height } = screen.getPrimaryDisplay().size;
    if ((height > width) === portrait) return true;
    await wait(200);
  }
  return false;
}

// ---- 시나리오 ----
const DEMO_NAME = { ko: '서연', ja: 'ソヨン' }; // 대법원 통계상 가장 흔한 여자 이름 중 하나 (예시)
const Z = 1.6; // 세로 영상에서 휴대폰으로도 읽히게 캐릭터·말풍선 확대 배율

async function run(ctx) {
  const { pets, config, talkSchedule, makeChatter, imageFor, log } = ctx;
  const say = (m) => { console.log('[demo] ' + m); log(`[demo] ${m}`); };
  let aborted = false;
  globalShortcut.register('CommandOrControl+Alt+Q', () => { aborted = true; say('중단 요청'); });
  const step = async (ms) => { if (aborted) throw new Error('aborted'); await wait(ms); };
  let zoom = 1;
  let input = null;
  const setChar = async (role, id) => {
    config.update({ characters: { [role]: id } });
    pets[role].reload();
    await wait(800);
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

  const { CHARACTERS } = require('./characters');
  const LINEUP = ['chiikawa', 'hachiware', 'usagi', 'momonga', 'kurimanju', 'shisa', 'rakko'];
  const N = DEMO_NAME.ko; const NJ = DEMO_NAME.ja;
  // AI 답이 안 올 때 쓰는 대사 (캐릭터 말투)
  const FALLBACK = {
    chiikawa: { ko: `와아…! ${N}…!`, ja: `ワァ…！${NJ}…！` },
    hachiware: { ko: `있잖아~ ${N}, 오늘도 힘내자!`, ja: `ねえねえ${NJ}、今日もがんばろ！` },
    usagi: { ko: `야하! ${N}! 우라!`, ja: `ヤハ！${NJ}！ウラ！` },
    momonga: { ko: `${N}! 나 칭찬해!`, ja: `${NJ}！ほめろ！` },
    kurimanju: { ko: `하아—ッ! ${N}, 수고했어.`, ja: `ハァーッ！${NJ}、おつかれ。` },
    shisa: { ko: `${N} 님, 기쁘시사!`, ja: `${NJ}さん、うれシーサー！` },
    rakko: { ko: `그렇군… ${N}, 가자.`, ja: `なるほど…${NJ}、行くぞ。` },
  };

  // ── 준비 (아직 가로 화면): 예시 이름·기본 캐릭터, AI 답 미리 받아 두기 ──
  say('준비 중… (혼잣말과 일정 답을 미리 받아 둬요, 약 10초)');
  const origChars = { ...config.load().characters };
  const origProfile = { ...config.load().profile };
  const origPos = { schedule: pets.schedule.getBounds(), chat: pets.chat.getBounds() };
  config.update({ profile: { name: N, nameJa: NJ, nameJaFor: N } });
  await setChar('schedule', 'hachiware');
  await setChar('chat', 'usagi');
  for (const id of LINEUP) imageFor(id, 'idle'); // 아직 안 받은 그림이 있으면 받기 시작
  // 오프닝 대사: 후킹용 고정 대사 (캐릭터 말버릇 × 직장인의 하루: 출근 → 퇴사 고민 → 야근 → 칭찬 → 한 잔 → 월요일 → 칼퇴)
  const HOOK = {
    chiikawa: { ko: '출근… 싫어! ㅜㅜ', ja: '出勤…ヤダー！😭' },
    hachiware: { ko: '있잖아~ 퇴사라는 거… 할까?', ja: 'ねえねえ、退職ってやつ…しちゃう？' },
    usagi: { ko: '하아?! 또 야근?! 우라!!', ja: 'ハァ？！また残業？！ウラ！！' },
    momonga: { ko: '출근한 나, 칭찬해! 빨리!', ja: '出勤したボクをほめろ！はやく！' },
    kurimanju: { ko: '퇴근 후 한 잔..? 키야~!!', ja: '仕事終わりの一杯…？ハァーッ！！' },
    shisa: { ko: '월요일이어도 기쁘시사!!', ja: '月曜日でもうれシーサー！！' },
    rakko: { ko: '그렇군… 칼퇴가 답이다.', ja: 'なるほど…定時退社が正解だ。' },
  };
  const cast = [];
  for (const id of LINEUP) {
    const line = HOOK[id] || FALLBACK[id];
    cast.push({ id, nameKo: CHARACTERS[id].nameKo, color: CHARACTERS[id].color, ko: line.ko, ja: line.ja });
    say(`${CHARACTERS[id].nameKo}: ${line.ko}`);
  }
  for (const c of cast) c.image = imageFor(c.id, 'idle');
  const chatterLine = await makeChatter('usagi').catch(() => FALLBACK.usagi);
  await talkSchedule('hachiware', 'all').catch(() => {});
  await talkSchedule('hachiware', 'remaining').catch(() => {});
  for (const w of Object.values(pets)) await w.webContents.executeJavaScript('closeBubble(), true');

  // ── 세로로 돌리기 ──
  pets.schedule.hide();
  pets.chat.hide();
  const rotated = rotate('portrait') && await waitForOrientation(true);
  say(rotated ? '화면을 세로로 돌렸어요' : '세로로 돌리지 못해서 가로로 녹화해요');
  await wait(1500);
  const wa = screen.getPrimaryDisplay().workArea;
  const portrait = wa.height > wa.width;
  zoom = portrait ? Z : 1.25;

  // 7종 창(세로 화면에선 4+3 두 줄): 화면 가운데(릴스 안전 영역 안), 클릭은 통과
  const LH = portrait ? 1000 : 560;
  const lineup = new BrowserWindow({
    x: wa.x, y: Math.round(wa.y + wa.height * (portrait ? 0.55 : 0.5) - LH / 2), width: wa.width, height: LH, show: false,
    transparent: true, frame: false, hasShadow: false, backgroundColor: '#00000000',
    resizable: false, skipTaskbar: true, focusable: false, alwaysOnTop: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  lineup.setAlwaysOnTop(true, 'floating');
  lineup.setIgnoreMouseEvents(true);
  await lineup.loadFile(path.join(__dirname, '..', 'renderer', 'lineup.html'), { query: { layout: portrait ? 'portrait' : 'row' } });
  lineup.webContents.setZoomFactor(portrait ? 1.05 : 1);
  await lineup.webContents.executeJavaScript(`setLineup(${JSON.stringify(cast)}), true`);

  // 두 캐릭터: 확대해서 화면 가운데(세로 화면 기준 62% 높이)에 나란히
  const W = Math.round(340 * zoom);
  const H = Math.round(560 * zoom);
  const petFromTop = (560 - 22 - 75) * zoom;
  const petY = wa.y + wa.height * (portrait ? 0.62 : 0.6);
  const gap = portrait ? wa.width * 0.25 : 150 * zoom;
  pets.schedule.setBounds({ x: Math.round(wa.x + wa.width / 2 - gap - W / 2), y: Math.round(petY - petFromTop), width: W, height: H });
  pets.chat.setBounds({ x: Math.round(wa.x + wa.width / 2 + gap - W / 2), y: Math.round(petY - petFromTop), width: W, height: H });
  for (const w of Object.values(pets)) w.webContents.setZoomFactor(zoom);
  lineup.showInactive();

  input = startInput();
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const out = path.join(app.getPath('videos'), `치이카와-데모-${stamp}`);
  // 배경: 엑셀을 최대화해서 맨 앞으로 (터미널 등 다른 창을 가리도록)
  await input.front('EXCEL');
  await wait(1500);
  await input.moveTo(wa.x + wa.width * 0.85, wa.y + wa.height * 0.3, 200); // 커서는 구석에 대기
  await wait(600);
  const rec = await startRecorder(out);
  say('녹화 시작');

  try {
    await step(1000);
    // ⓪ 오프닝: 7종이 차례로 한마디씩
    for (let i = 0; i < cast.length; i++) {
      await lineup.webContents.executeJavaScript(`speak(${i}), true`);
      await step(700);
    }
    await step(2600);
    // 두 캐릭터만 남기기
    lineup.hide();
    pets.schedule.showInactive();
    pets.chat.showInactive();
    await step(900);
    // ① 우사기 혼잣말
    pets.chat.webContents.send('pet:chatter', chatterLine);
    await step(3200);
    await pets.chat.webContents.executeJavaScript('closeBubble(), true');
    // ② 하치와레 클릭 → 오늘 일정 브리핑
    await clickOn('schedule', '#pet');
    await step(5200);
    // ③ 남은 일정
    await clickOn('schedule', '#modeBtn', 550);
    await step(5200);
    await clickOn('schedule', '#pet', 500); // 닫기
    await step(700);
    // ④ 우사기 대화
    await clickOn('chat', '#pet');
    await step(1200);
    clipboard.writeText('오늘 야근인데 저녁 뭐 먹지?');
    await input.keys('^v');
    await step(900);
    await input.keys('{ENTER}');
    await step(6500);
    // ⑤ 우클릭 → 캐릭터 바꾸기 → 모몽가
    await pets.chat.webContents.executeJavaScript('closeBubble(), true');
    const p = await center('chat', '#pet');
    await input.moveTo(p.x, p.y, 450); await wait(200); await input.rightClick();
    await step(900);
    await input.keys('{DOWN}'); await step(350);
    await input.keys('{RIGHT}'); await step(600);
    await input.keys('{DOWN}{DOWN}{DOWN}'); await step(600); // 하위 메뉴는 치이카와부터 → 하치와레 → 우사기 → 모몽가
    await input.keys('{ENTER}');
    await step(2200);
    // ⑥ 마무리: 다시 7종 (편집에서 "댓글에 '치이카와'" 자막 얹기 좋게)
    await input.moveTo(wa.x + wa.width * 0.85, wa.y + wa.height * 0.3, 500);
    pets.schedule.hide();
    pets.chat.hide();
    lineup.showInactive();
    await step(3500);
  } catch (err) {
    if (err.message !== 'aborted') say('오류: ' + err.message);
  }

  let file = null;
  try { file = await rec.stop(); } catch (err) { say('녹화 저장 실패: ' + err.message); }
  input.close();
  globalShortcut.unregisterAll();
  lineup.destroy();

  // ── 원래대로: 가로 화면, 캐릭터·이름·위치·배율 ──
  if (rotated) { rotate('landscape'); await waitForOrientation(false); await wait(1000); }
  zoom = 1;
  config.update({ profile: { name: origProfile.name, nameJa: origProfile.nameJa || '', nameJaFor: origProfile.nameJaFor || '' } });
  await setChar('schedule', origChars.schedule);
  await setChar('chat', origChars.chat);
  pets.schedule.setBounds(origPos.schedule);
  pets.chat.setBounds(origPos.chat);
  pets.schedule.showInactive();
  pets.chat.showInactive();
  if (file) { say('녹화 저장: ' + file); require('electron').shell.showItemInFolder(file); }
}

// 시연 도중 앱이 꺼져도 화면은 가로로 되돌려 두기
app.on('will-quit', () => {
  const { width, height } = screen.getPrimaryDisplay().size;
  if (height > width) rotate('landscape');
});

module.exports = { run };
