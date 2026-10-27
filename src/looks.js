'use strict';
// 캐릭터 모습(이미지) 고르기·내려받기
// 고른 값: 예시 이미지 주소(https://…) / 앱에 포함된 이미지(bundled:…) / 직접 넣은 파일 경로 / 'none'(말할 때 모습 없음)
const fs = require('fs');
const path = require('path');
const IMAGE_EXT = ['png', 'gif', 'webp'];
const BUNDLED_DIR = path.join(__dirname, '..', 'assets', 'characters');

// 공개 배포판에는 assets/characters 이미지를 넣지 않아요(저작권). 실제로 있는 것만 예시로 보여 줘요.
const GALLERY = Object.fromEntries(Object.entries(require('./gallery').GALLERY).map(([id, list]) => [
  id,
  list.filter((v) => !v.startsWith('bundled:') || fs.existsSync(path.join(BUNDLED_DIR, v.slice('bundled:'.length)))),
]));

// 고른 값 → 화면에 쓸 파일 경로
function localFile(dir, charId, value) {
  if (value.startsWith('http')) return cacheFile(dir, charId, value);
  if (value.startsWith('bundled:')) return path.join(BUNDLED_DIR, value.slice('bundled:'.length));
  return value;
}

function cacheFile(dir, charId, url) {
  const name = decodeURIComponent(path.basename(new URL(url).pathname)).replace(/[^\w.-]/g, '_');
  return path.join(dir, charId, name);
}

// kind: 'idle'(평소) | 'talk'(말할 때)
function chosen(cfg, charId, kind) {
  const picked = cfg.looks?.[charId]?.[kind];
  if (picked) return picked;
  const list = GALLERY[charId] || [];
  return (kind === 'idle' ? list[0] : list[1]) || null;
}

// 화면에 쓸 파일 경로 (아직 안 받았으면 file은 있지만 exists=false)
function resolve(cfg, dir, charId, kind) {
  const value = chosen(cfg, charId, kind);
  if (!value || value === 'none') return { value, file: null, exists: false };
  const file = localFile(dir, charId, value);
  return { value, file, exists: fs.existsSync(file) };
}

const downloading = new Map();

function download(dir, charId, url) {
  const file = cacheFile(dir, charId, url);
  if (fs.existsSync(file)) return Promise.resolve(file);
  if (!downloading.has(file)) {
    const job = (async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`이미지 받기 실패 ${res.status}`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return file;
    })().finally(() => downloading.delete(file));
    downloading.set(file, job);
  }
  return downloading.get(file);
}

// 사용자가 직접 넣은 이미지 (my-로 시작하는 파일)
function userImages(dir, charId) {
  const folder = path.join(dir, charId);
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder)
    .filter((f) => f.startsWith('my-') && IMAGE_EXT.includes(path.extname(f).slice(1).toLowerCase()))
    .map((f) => path.join(folder, f));
}

function addUserImage(dir, charId, src) {
  const ext = path.extname(src).toLowerCase();
  const dest = path.join(dir, charId, `my-${Date.now()}${ext}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return dest;
}

module.exports = { GALLERY, IMAGE_EXT, resolve, download, cacheFile, localFile, userImages, addUserImage };
