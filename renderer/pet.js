'use strict';
// 캐릭터 그리기, 클릭/드래그 처리, 말풍선 표시
const $ = (id) => document.getElementById(id);
const petApi = window.pet; // preload가 열어 준 기능
const petEl = $('pet');
const bubbleEl = $('bubble');
const koEl = $('ko');
const chatForm = $('chatForm');
const chatInput = $('chatInput');
const scheduleForm = $('scheduleForm');
const rowsEl = $('rows');
const schedBar = $('schedBar');
const modeBtn = $('modeBtn');
const editBtn = $('editBtn');
const updateBar = $('updateBar');
const updateBtn = $('updateBtn');

let info = null;
let hideTimer = null;
let typing = 0; // 진행 중인 타자 효과 번호 (새 말이 오면 이전 효과 중단)

// ---- 캐릭터 그림: 그림마다 투명 여백이 달라서, 실제로 그려진 부분을 재서 키와 발끝 위치를 맞춰요 ----
const PET_H = 128;     // 모든 캐릭터의 보이는 키
const PET_MAX_W = 190; // 옆으로 긴 그림(꼬리·망토)이 너무 커지지 않게
const fitCache = new Map(); // 그림 주소 → 그려진 영역

function visibleBox(img) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? { x: 0, y: 0, w, h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function fitImage(img, src) {
  let box = fitCache.get(src);
  if (!box) {
    try { box = visibleBox(img); } catch { box = null; }
    if (box) fitCache.set(src, box);
  }
  if (box) {
    const s = Math.min(PET_H / box.h, PET_MAX_W / box.w);
    const { offsetWidth: bw, offsetHeight: bh } = petEl;
    Object.assign(img.style, {
      position: 'absolute', maxWidth: 'none',
      width: `${img.naturalWidth * s}px`, height: `${img.naturalHeight * s}px`,
      left: `${bw / 2 - (box.x + box.w / 2) * s}px`, top: `${bh - (box.y + box.h) * s}px`,
    });
  }
  img.style.visibility = '';
}

function setPetImage(kind) {
  const src = (kind === 'talk' && info.images.talk) || info.images.idle;
  if (!src) {
    petEl.innerHTML = placeholderSvg(info.id, info.color);
    return;
  }
  const img = new Image();
  img.alt = '';
  img.style.visibility = 'hidden'; // 크기를 맞춘 뒤에 보여 줘요
  img.onload = () => fitImage(img, src);
  img.onerror = () => { img.style.visibility = ''; };
  img.src = src;
  petEl.replaceChildren(img);
}

// ---- 말풍선 ----
function openBubble() {
  if (bubbleEl.classList.contains('hidden')) {
    bubbleEl.classList.remove('hidden', 'pop');
    void bubbleEl.offsetWidth;
    bubbleEl.classList.add('pop');
  }
}

function closeBubble() {
  clearTimeout(hideTimer);
  typing++;
  bubbleEl.classList.add('hidden');
  petEl.classList.remove('talking');
  scheduleForm.classList.add('hidden');
  schedBar.classList.add('hidden');
  updateBar.classList.add('hidden');
  setPetImage('idle');
  petApi.setIgnore(true);
}

const TYPE_MS = 45; // 한 글자씩 나오는 속도 (말하는 모션도 이 동안 계속돼요)

async function say({ ko }, { autoHide } = {}) {
  const my = ++typing;
  clearTimeout(hideTimer);
  openBubble();
  koEl.textContent = '';
  setPetImage('talk');
  petEl.classList.add('talking');
  for (const ch of ko) {
    if (my !== typing) return;
    koEl.textContent += ch;
    await new Promise((r) => setTimeout(r, TYPE_MS));
  }
  await new Promise((r) => setTimeout(r, 700)); // 다 말한 뒤에도 잠깐 더 들썩
  if (my !== typing) return;
  petEl.classList.remove('talking');
  setPetImage('idle');
  if (autoHide) hideTimer = setTimeout(() => { if (!bubbleEl.matches(':hover')) closeBubble(); }, autoHide);
}

function thinking() {
  typing++;
  openBubble();
  koEl.textContent = '음… 잠깐만…';
}

// ---- 클릭 동작 (역할별) ----
// 말풍선이 떠 있을 때 캐릭터를 한 번 더 누르면 닫혀요.
async function onClick() {
  const chatterOnly = info.role === 'chat' && chatForm.classList.contains('hidden'); // 혼잣말 중이면 대화창으로
  if (!bubbleEl.classList.contains('hidden') && !chatterOnly) return closeBubble();
  if (info.role === 'schedule') {
    briefSchedule();
  } else {
    chatForm.classList.remove('hidden');
    say({ ko: `${info.nameKo}한테 말 걸어 봐!` });
    chatInput.focus();
  }
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  chatInput.disabled = true;
  thinking();
  try {
    say(await petApi.talk({ type: 'chat', text }));
  } finally {
    chatInput.disabled = false;
    chatInput.focus();
  }
});

// ---- 일정 비서: 오늘 일정 브리핑 / 직접 적기 ----
// 왼쪽 [전체 일정 확인] = 오늘 일정 목록(수정 가능), 오른쪽 = 남은 일정(현재 시각 기준) ⇄ 처음 브리핑
let scheduleMode = 'all';
const MODE_BUTTON = { all: '⏰ 남은 일정', remaining: '↩ 돌아가기' };

async function briefSchedule(mode = 'all') {
  scheduleMode = mode;
  scheduleForm.classList.add('hidden');
  schedBar.classList.add('hidden');
  thinking();
  const res = await petApi.talk({ type: 'schedule', mode });
  if (res.empty) {
    say(res);
    openEditor([]);
  } else {
    say(res, { autoHide: 45000 });
    modeBtn.textContent = MODE_BUTTON[mode];
    schedBar.classList.remove('hidden');
  }
}

modeBtn.addEventListener('click', () => briefSchedule(scheduleMode === 'all' ? 'remaining' : 'all'));

// 일정 한 행 = [시간 | 내용 | 삭제]
function addRow(item = { time: '', text: '' }) {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = '<input type="time" class="time"><input class="text" placeholder="예: 팀 회의"><button type="button" class="del" title="삭제">×</button>';
  row.querySelector('.time').value = item.time;
  row.querySelector('.text').value = item.text;
  row.querySelector('.del').addEventListener('click', () => {
    row.remove();
    if (!rowsEl.children.length) addRow();
  });
  // 내용 칸에서 Enter → 다음 행으로 (마지막 행이면 새 행 추가), Ctrl/Cmd+Enter → 저장
  row.querySelector('.text').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) return scheduleForm.requestSubmit();
    const next = row.nextElementSibling || addRow();
    next.querySelector('.time').focus();
  });
  rowsEl.appendChild(row);
  rowsEl.scrollTop = rowsEl.scrollHeight;
  return row;
}

function openEditor(items) {
  clearTimeout(hideTimer);
  openBubble();
  schedBar.classList.add('hidden');
  scheduleForm.classList.remove('hidden');
  rowsEl.innerHTML = '';
  for (const item of items) addRow(item);
  addRow().querySelector('.time').focus(); // 항상 빈 행 하나는 열어 두기
}

$('addRowBtn').addEventListener('click', () => addRow().querySelector('.time').focus());

scheduleForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const items = [...rowsEl.querySelectorAll('.row')].map((row) => ({
    time: row.querySelector('.time').value,
    text: row.querySelector('.text').value,
  }));
  await petApi.saveSchedule(items);
  briefSchedule();
});

editBtn.addEventListener('click', async () => {
  say({ ko: '오늘 전체 일정이야! 고칠 게 있으면 고쳐 줘!' });
  openEditor(await petApi.getSchedule());
});

// 혼잣말: 말풍선이 닫혀 있을 때만 잠깐 띄웠다가 사라져요.
petApi.onChatter((line) => {
  if (!bubbleEl.classList.contains('hidden')) return;
  chatForm.classList.add('hidden');
  say(line, { autoHide: 12000 });
});

// 새 버전 알림: 버튼이 있는 말풍선 (저절로 닫히지 않아요)
let updateKind = null;
petApi.onUpdate((msg) => {
  chatForm.classList.add('hidden');
  scheduleForm.classList.add('hidden');
  schedBar.classList.add('hidden');
  updateBar.classList.toggle('hidden', !msg.button);
  if (msg.button) { updateKind = msg.button.kind; updateBtn.textContent = msg.button.label; }
  say(msg, msg.button ? {} : { autoHide: 8000 });
});
updateBtn.addEventListener('click', () => {
  if (updateKind === 'install') say({ ko: '업데이트하고 금방 다시 올게!' });
  petApi.doUpdate(updateKind);
});

petApi.onEditSchedule(async () => {
  say({ ko: '오늘 일정 적어 줘!' });
  openEditor(await petApi.getSchedule());
});

$('closeBtn').addEventListener('click', closeBubble);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeBubble(); });

// ---- 마우스: 캐릭터·말풍선 위에서만 클릭을 받고 나머지는 뒤 창으로 통과 ----
let drag = null;

for (const el of [petEl, bubbleEl]) {
  el.addEventListener('mouseenter', () => petApi.setIgnore(false));
  el.addEventListener('mouseleave', () => { if (!drag) petApi.setIgnore(true); });
}

petEl.addEventListener('mousedown', async (e) => {
  if (e.button !== 0) return;
  drag = { sx: e.screenX, sy: e.screenY, moved: false, win: null };
  const [x, y] = await petApi.getPosition();
  if (drag) drag.win = { x, y };
});

window.addEventListener('mousemove', (e) => {
  if (!drag || !drag.win) return;
  const dx = e.screenX - drag.sx;
  const dy = e.screenY - drag.sy;
  if (!drag.moved && Math.hypot(dx, dy) < 5) return;
  drag.moved = true;
  petEl.classList.add('dragging');
  petApi.moveTo(drag.win.x + dx, drag.win.y + dy);
});

window.addEventListener('mouseup', (e) => {
  if (!drag || e.button !== 0) return;
  const wasDrag = drag.moved;
  drag = null;
  petEl.classList.remove('dragging');
  if (wasDrag) petApi.dragEnd();
  else onClick();
  if (!petEl.matches(':hover') && !bubbleEl.matches(':hover')) petApi.setIgnore(true);
});

petEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  petApi.openMenu();
});

// ---- 가끔 꿈틀 (6~12초마다 0.8초만 움직여서 PC 부담을 줄여요) ----
function scheduleWiggle() {
  setTimeout(() => {
    if (!drag && !petEl.classList.contains('talking')) {
      petEl.classList.remove('wiggle');
      void petEl.offsetWidth;
      petEl.classList.add('wiggle');
    }
    scheduleWiggle();
  }, 6000 + Math.random() * 6000);
}
petEl.addEventListener('animationend', () => petEl.classList.remove('wiggle', 'talking'));

// ---- 시작 ----
scheduleWiggle();
(async () => {
  info = await petApi.init();
  $('nameTag').textContent = `${info.nameKo} · ${info.roleLabel}`;
  chatInput.placeholder = `${info.nameKo}에게 말 걸기…`;
  setPetImage('idle');
})();
