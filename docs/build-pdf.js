'use strict';
// 가이드 PDF 만들기: ① 앱 화면을 가짜 데이터로 띄워 캡처 → ② guide.html을 A4 PDF로 인쇄
// 실행: npm run guide   (결과: docs/치이카와 에이전트 설치 방법.pdf)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const IMG = path.join(__dirname, 'img');
const OUT = path.join(__dirname, '치이카와 에이전트 설치 방법.pdf');
const R2 = 'https://r2.chiikawawallpaper.com/wallpaper/gif/';
fs.mkdirSync(IMG, { recursive: true });

// 캡처에 쓸 캐릭터 그림: 개발 PC에 받아 둔 파일이 있으면 그걸, 없으면 원래 주소
function art(charId, file) {
  const local = path.join(ROOT, 'characters', charId, file);
  return fs.existsSync(local) ? pathToFileURL(local).href : R2 + file;
}
const bundled = (p) => pathToFileURL(path.join(ROOT, 'assets', 'characters', p)).href;

const HACHI = { role: 'schedule', roleLabel: '일정 비서', id: 'hachiware', nameKo: '하치와레', nameJa: 'ハチワレ', color: '#fff',
  images: { idle: art('hachiware', '17e51f83bd6649f2bcea2d61ba8955fd.gif'), talk: null } };
const USAGI = { role: 'chat', roleLabel: 'AI 대화', id: 'usagi', nameKo: '우사기', nameJa: 'うさぎ', color: '#fff3c4',
  images: { idle: art('usagi', '4f47518c8d9f447682e067cfd59b626b.gif'), talk: null } };
const SETTINGS = { aiProvider: 'gemini', apiKeys: { gemini: 'AQ.example-key-1234' }, version: '0.2.0', chatter: 'sometimes',
  profile: { name: '포니', type: 'worker', setupDone: false } };
const PICKER = { charId: 'momonga', nameKo: '모몽가', color: '#f7f7f7',
  items: [1, 2, 3, 4, 5].map((n) => ({ value: `m${n}`, thumb: bundled(`momonga/momonga${n}.png`) }))
    .concat([{ value: 'g1', thumb: R2 + '0b8404aaca03403a9c534d4f27931d1d.gif' }]),
  selected: { idle: 'm1', talk: 'm2' } };

const BG = '#dfe8f2'; // 바탕화면 느낌 배경

async function shot(name, page, { stub = {}, width, height, query, script, wait = 800, bg } = {}) {
  const win = new BrowserWindow({
    useContentSize: true, width, height, show: false, backgroundColor: bg || '#fffdf8',
    webPreferences: {
      preload: path.join(__dirname, 'stub-preload.js'), contextIsolation: true, sandbox: false,
      backgroundThrottling: false, // 안 보이는 창이어도 애니메이션·타이머가 멈추지 않게
      additionalArguments: ['--stub=' + encodeURIComponent(JSON.stringify(stub))],
    },
  });
  win.webContents.on('console-message', (e) => { if (e.level === 'error') console.log(`  [${name}] 오류:`, e.message); });
  await win.loadFile(path.join(ROOT, 'renderer', page), { query });
  await new Promise((r) => setTimeout(r, 500));
  if (bg) await win.webContents.executeJavaScript(`document.documentElement.style.background=document.body.style.background='${bg}'`);
  if (script) await win.webContents.executeJavaScript(script).catch((e) => console.log(`  [${name}] 실행 실패:`, e.message));
  await new Promise((r) => setTimeout(r, wait));
  // 등장 애니메이션 중간에 찍히지 않게, 찍기 직전 애니메이션을 끝 상태로
  await win.webContents.insertCSS('*, *::before, *::after { animation: none !important; transition: none !important; }');
  await new Promise((r) => setTimeout(r, 200));
  fs.writeFileSync(path.join(IMG, name + '.png'), (await win.webContents.capturePage()).toPNG());
  win.destroy();
  console.log('캡처:', name);
}

// 말풍선 장면: pet.js의 함수(say, openEditor 등)를 직접 불러서 상황을 만들어요
const pet = (info, script) => ({ stub: { info }, width: 340, height: 560, bg: BG, query: { role: info.role }, script, wait: 2600 });

async function captureAll() {
  await shot('settings-profile', 'settings.html', { stub: { settings: SETTINGS }, width: 444, height: 581,
    script: `document.getElementById('name').value='포니'` });
  await shot('settings-ai', 'settings.html', { stub: { settings: { ...SETTINGS, tab: 'ai', profile: { ...SETTINGS.profile, setupDone: true } } }, width: 444, height: 581,
    script: `document.querySelector('[data-tab="ai"]').click(); document.getElementById('status').textContent='✅ 연결 성공! (gemini-3.6-flash)'; document.getElementById('status').className='status ok'` });
  await shot('settings-about', 'settings.html', { stub: { settings: { ...SETTINGS, tab: 'about', profile: { ...SETTINGS.profile, setupDone: true } } }, width: 444, height: 581 });
  await shot('picker', 'picker.html', { stub: { picker: PICKER }, width: 544, height: 600, wait: 2500 });

  // 대사는 JSON으로 넘겨요 (줄바꿈·따옴표가 스크립트를 깨뜨리지 않게)
  const line = (ko, ja) => JSON.stringify({ ko, ja });
  await shot('bubble-schedule', 'index.html', pet(HACHI, `
    say(${line('있잖아~ 포니, 오늘 일정 알려줄게!\n\n10:00 팀 회의\n14:00 기획 리뷰\n✨ 19:30 운동 (곧이잖아!)\n\n오늘도 어떻게든 되어라—ッ!',
    'ねえねえポニー、今日の予定だよ！ 10:00 チーム会議 / 14:00 企画レビュー / ✨19:30 運動（もうすぐじゃん！）なんとかなれーッ！')});
    modeBtn.textContent = '⏰ 남은 일정'; schedBar.classList.remove('hidden');`));
  await shot('bubble-editor', 'index.html', pet(HACHI, `
    say(${line('오늘 일정 적어 줘!', '今日の予定を書いてね！')});
    openEditor([{ time: '10:00', text: '팀 회의' }, { time: '14:00', text: '기획 리뷰' }, { time: '19:30', text: '운동' }]);`));
  await shot('bubble-chat', 'index.html', pet(USAGI, `
    chatForm.classList.remove('hidden');
    say(${line('야하! 포니, 저녁은 야키소바다!! 우라!', 'ヤハ！ポニー、晩ごはんは焼きそばだッ！！ウラ！')});`));
  await shot('bubble-chatter', 'index.html', pet(USAGI, `
    say(${line('우라! 포니, 점심 뭐야!', 'ウラ！ポニー、昼メシ何！')});`));
}

async function printGuide() {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await win.loadFile(path.join(__dirname, 'guide.html'));
  await new Promise((r) => setTimeout(r, 2500)); // 바깥 이미지까지 다 받을 시간
  const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } });
  fs.writeFileSync(OUT, pdf);
  console.log('PDF:', OUT, `${(pdf.length / 1048576).toFixed(1)}MB`);
}

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  if (!process.argv.includes('--pdf-only')) await captureAll();
  await printGuide();
  app.quit();
});
