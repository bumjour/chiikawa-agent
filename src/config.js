'use strict';
// 설정 파일(config.json) 읽기/쓰기.
// 개발 중에는 프로젝트 폴더에, 실행 파일로 만든 뒤에는 사용자 데이터 폴더에 저장해요.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  aiProvider: 'gemini', // gemini | claude | openai
  apiKeys: { gemini: '', claude: '', openai: '' },
  models: { gemini: '', claude: '', openai: '' }, // 비워 두면 기본 모델을 써요
  characters: { schedule: 'hachiware', chat: 'usagi' },
  // 첫 설정: 불리고 싶은 이름, 직장인(worker)/학생(student)
  profile: { name: '', type: 'worker', setupDone: false },
  chatter: '10m', // 혼잣말 간격: 10s | 30s | 1m | 5m | 10m | 30m | 1h | off
  looks: {}, // 캐릭터별 고른 모습 { hachiware: { idle: '주소 또는 파일', talk: ... } }
  positions: {},
};

function configPath() {
  const dir = app.isPackaged ? app.getPath('userData') : path.join(__dirname, '..');
  return path.join(dir, 'config.json');
}

function merge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(base[k] || {}, v) : v;
  }
  return out;
}

function load() {
  const file = configPath();
  if (!fs.existsSync(file)) save(DEFAULTS);
  try {
    return merge(DEFAULTS, JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    console.error('config.json을 읽지 못했어요. 쉼표·따옴표를 확인해 주세요.', err.message);
    return merge(DEFAULTS, {});
  }
}

function save(cfg) {
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
}

// 바뀐 부분만 반영해서 저장 (사용자가 직접 고친 다른 값은 보존)
function update(patch) {
  const next = merge(load(), patch);
  save(next);
  return next;
}

module.exports = { load, save, update, configPath };
