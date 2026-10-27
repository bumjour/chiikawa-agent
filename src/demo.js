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

// ---- 시나리오 ----
async function run(ctx) {
  const { pets, config, talkSchedule, makeChatter, askChar, systemPrompt, imageFor, log } = ctx;
  const say = (m) => { console.log('[demo] ' + m); log(`[demo] ${m}`); };
  let aborted = false;
  globalShortcut.register('CommandOrControl+Alt+Q', () => { aborted = true; say('중단 요청'); });

  // 화면 위 요소의 중심 좌표 (DIP)
  async function center(role, selector) {
    const win = pets[role];
    const r = await win.webContents.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(selector)});
      if (!el || el.offsetParent === null) return null; const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (!r) return null;
    const [wx, wy] = win.getPosition();
    return { x: Math.round(wx + r.x), y: Math.round(wy + r.y) };
  }
  async function clickOn(role, selector, ms) {
    const p = await center(role, selector);
    if (!p) { say(`못 찾음: ${role} ${selector}`); return false; }
    await input.moveTo(p.x, p.y, ms); await wait(150); await input.click();
    return true;
  }
  const setChar = async (role, id) => { config.update({ characters: { [role]: id } }); pets[role].reload(); await wait(700); };
  const step = async (ms) => { if (aborted) throw new Error('aborted'); await wait(ms); };

  const { CHARACTERS } = require('./characters');
  const LINEUP = ['chiikawa', 'hachiware', 'usagi', 'momonga', 'kurimanju', 'shisa', 'rakko'];
  // AI 답이 안 올 때 쓰는 대사 (캐릭터 말투)
  const FALLBACK = {
    chiikawa: { ko: '와아…! 포니…!', ja: 'ワァ…！ポニー…！' },
    hachiware: { ko: '있잖아~ 포니, 오늘도 힘내자!', ja: 'ねえねえポニー、今日もがんばろ！' },
    usagi: { ko: '야하! 포니! 우라!', ja: 'ヤハ！ポニー！ウラ！' },
    momonga: { ko: '포니! 나 칭찬해!', ja: 'ポニー！ほめろ！' },
    kurimanju: { ko: '하아—ッ! 포니, 수고했어.', ja: 'ハァーッ！ポニー、おつかれ。' },
    shisa: { ko: '포니 님, 기쁘시사!', ja: 'ポニーさん、うれシーサー！' },
    rakko: { ko: '그렇군… 포니, 가자.', ja: 'なるほど…ポニー、行くぞ。' },
  };
  const wa = screen.getPrimaryDisplay().workArea;
  const cx = wa.x + wa.width / 2;
  const cy = wa.y + wa.height / 2;
  const PET_FROM_TOP = 560 - 22 - 75; // 캐릭터 창 위쪽에서 캐릭터 중심까지 (창 높이 560)

  // 준비: 기본 캐릭터, AI 답 미리 받아 두기 (영상에서 기다리는 시간 줄이기)
  say('준비 중… (캐릭터 7종 대사와 일정 답을 미리 받아 둬요)');
  const orig = { ...config.load().characters };
  const origPos = { schedule: pets.schedule.getPosition(), chat: pets.chat.getPosition() };
  await setChar('schedule', 'hachiware');
  await setChar('chat', 'usagi');
  for (const id of LINEUP) imageFor(id, 'idle'); // 아직 안 받은 그림이 있으면 받기 시작
  const cast = [];
  for (const id of LINEUP) { // 무료 한도에 걸리지 않게 하나씩
    const line = await askChar(config.load(), {
      system: systemPrompt(id, '너는 사용자 곁에 늘 있는 친구야.'),
      messages: [{ role: 'user', text: '사용자에게 반갑게 인사하는 한마디를 캐릭터 말투로 해 줘. 한국어 기준 16자 이내로 아주 짧게, 이름을 불러 줘.' }],
    }).catch(() => FALLBACK[id]);
    cast.push({ id, nameKo: CHARACTERS[id].nameKo, color: CHARACTERS[id].color, ko: line.ko, ja: line.ja });
    say(`${CHARACTERS[id].nameKo}: ${line.ko}`);
  }
  for (const c of cast) c.image = imageFor(c.id, 'idle');
  const chatterLine = await makeChatter('usagi').catch(() => FALLBACK.usagi);
  await talkSchedule('hachiware', 'all').catch(() => {});
  await talkSchedule('hachiware', 'remaining').catch(() => {});
  for (const w of Object.values(pets)) await w.webContents.executeJavaScript('closeBubble(), true');

  // 7종 한 줄 세우기 창 (화면 정가운데, 클릭은 통과)
  const lineup = new BrowserWindow({
    x: wa.x, y: Math.round(cy - PET_FROM_TOP), width: wa.width, height: 560, show: false,
    transparent: true, frame: false, hasShadow: false, backgroundColor: '#00000000',
    resizable: false, skipTaskbar: true, focusable: false, alwaysOnTop: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  lineup.setAlwaysOnTop(true, 'floating');
  lineup.setIgnoreMouseEvents(true);
  await lineup.loadFile(path.join(__dirname, '..', 'renderer', 'lineup.html'));
  await lineup.webContents.executeJavaScript(`setLineup(${JSON.stringify(cast)}), true`);

  // 두 캐릭터는 화면 가운데에 나란히 (하치와레 왼쪽, 우사기 오른쪽)
  const placePets = () => {
    pets.schedule.setPosition(Math.round(cx - 140 - 170), Math.round(cy - PET_FROM_TOP));
    pets.chat.setPosition(Math.round(cx + 140 - 170), Math.round(cy - PET_FROM_TOP));
  };
  pets.schedule.hide();
  pets.chat.hide();
  lineup.showInactive();

  const input = startInput();
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const out = path.join(app.getPath('videos'), `치이카와-데모-${stamp}`);
  // 배경: 엑셀이 켜져 있으면 최대화해서 맨 앞으로 (터미널 등 다른 창을 가리도록)
  await input.front('EXCEL');
  await wait(1200);
  await input.moveTo(wa.x + wa.width * 0.82, wa.y + wa.height * 0.2, 200); // 커서는 구석에 대기
  await wait(800);
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
    // 두 캐릭터만 가운데에 남기기
    lineup.hide();
    placePets();
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
    // 일정 말풍선 닫기
    await clickOn('schedule', '#pet', 500);
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
    await input.keys('{DOWN}{DOWN}{DOWN}'); await step(600);   // 하위 메뉴는 치이카와부터 → 하치와레 → 우사기 → 모몽가
    await input.keys('{ENTER}');
    await step(2000);
    // ⑥ 마무리: 다시 7종 (편집에서 "댓글에 '치이카와'" 자막 얹기 좋게)
    await input.moveTo(wa.x + wa.width * 0.82, wa.y + wa.height * 0.2, 500);
    pets.schedule.hide();
    pets.chat.hide();
    lineup.showInactive();
    await step(3500);
  } catch (err) {
    if (err.message !== 'aborted') say('오류: ' + err.message);
  }

  const file = await rec.stop();
  input.close();
  globalShortcut.unregisterAll();
  lineup.destroy();
  await setChar('schedule', orig.schedule);
  await setChar('chat', orig.chat);
  pets.schedule.setPosition(...origPos.schedule);
  pets.chat.setPosition(...origPos.chat);
  pets.schedule.showInactive();
  pets.chat.showInactive();
  say('녹화 저장: ' + file);
  require('electron').shell.showItemInFolder(file);
}

module.exports = { run };
