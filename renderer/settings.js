'use strict';
const $ = (id) => document.getElementById(id);
const providerEl = $('provider');
const keyEl = $('key');
const statusEl = $('status');

const KEY_PAGES = {
  gemini: 'https://aistudio.google.com/apikey',
  claude: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
};

let current = null;
let firstRun = false; // 처음 실행: 내 정보 저장 → AI 연결 탭으로 이어서

function setStatus(el, text, kind = '') {
  el.textContent = text;
  el.className = `status ${kind}`;
}

function form() {
  return { aiProvider: providerEl.value, key: keyEl.value.trim() };
}

// 탭 전환
function showTab(name) {
  document.querySelectorAll('.tab, .panel').forEach((el) => el.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${name}"]`).classList.add('active');
  $(name).classList.add('active');
}
for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', () => showTab(tab.dataset.tab));
window.settings.onTab(showTab);

// ---- 내 정보 ----
let userType = 'worker';
function setType(v) {
  userType = v;
  for (const b of $('type').children) b.classList.toggle('on', b.dataset.v === v);
}
for (const b of $('type').children) b.addEventListener('click', () => setType(b.dataset.v));

$('saveProfile').addEventListener('click', async () => {
  const name = $('name').value.trim();
  if (!name) return setStatus($('profileStatus'), '불리고 싶은 이름을 적어 주세요.', 'err');
  current = await window.settings.saveProfile({ name, type: userType, chatter: $('chatter').value });
  setStatus($('profileStatus'), `저장했어요! 이제 "${name}"(이)라고 부를게요.`, 'ok');
  if (firstRun && !current.apiKeys[current.aiProvider]) setTimeout(() => showTab('ai'), 700);
  else setTimeout(() => window.settings.close(), 900);
});

// ---- AI 연결 ----
providerEl.addEventListener('change', () => {
  keyEl.value = current.apiKeys[providerEl.value] || '';
  setStatus(statusEl, '');
});

$('toggle').addEventListener('click', () => {
  keyEl.type = keyEl.type === 'password' ? 'text' : 'password';
});

$('getKey').addEventListener('click', () => window.settings.openUrl(KEY_PAGES[providerEl.value]));

$('test').addEventListener('click', async () => {
  if (!form().key) return setStatus(statusEl, '키를 먼저 붙여넣어 주세요.', 'err');
  setStatus(statusEl, '연결해 보는 중…');
  const res = await window.settings.test(form());
  setStatus(statusEl, res.ok ? `✅ 연결 성공! (${res.model})` : `❌ 연결 실패: ${res.message}`, res.ok ? 'ok' : 'err');
});

$('save').addEventListener('click', async () => {
  current = await window.settings.save(form());
  setStatus(statusEl, '저장했어요! 캐릭터를 클릭해 보세요.', 'ok');
  setTimeout(() => window.settings.close(), 900);
});

(async () => {
  current = await window.settings.get();
  firstRun = !current.profile.setupDone;
  if (firstRun) $('welcome').innerHTML = '반가워요! 👋 처음 한 번만 설정하면 돼요.<br>캐릭터들이 나에게 맞춰 말할 수 있게 알려 주세요.';
  $('name').value = current.profile.name || '';
  setType(current.profile.type || 'worker');
  $('chatter').value = current.chatter || 'sometimes';
  providerEl.value = current.aiProvider;
  keyEl.value = current.apiKeys[current.aiProvider] || '';
  $('ver').textContent = `버전 ${current.version}`;
  showTab(current.tab || 'ai');
})();
