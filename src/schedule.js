'use strict';
// 직접 적는 일정: schedule.json에 날짜별로 저장해요.
// { "2026-10-27": [{ "time": "10:00", "text": "팀 회의" }, { "time": "", "text": "장보기" }] }
const fs = require('fs');
const path = require('path');
const { configPath } = require('./config');

function schedulePath() {
  return path.join(path.dirname(configPath()), 'schedule.json');
}

function todayKey(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(schedulePath(), 'utf8'));
  } catch {
    return {};
  }
}

// 시간 순 정렬, 시간 없는 일정은 맨 뒤
function sortItems(items) {
  return [...items].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
}

function getToday() {
  const v = readAll()[todayKey()];
  if (!v) return [];
  if (typeof v === 'string') { // 예전 형식("10:00 회의" 줄글)도 읽기
    return v.split('\n').filter(Boolean).map((line) => {
      const m = line.match(/^(\d{1,2}:\d{2})\s*(.*)$/);
      return m ? { time: m[1].padStart(5, '0'), text: m[2] } : { time: '', text: line };
    });
  }
  return v;
}

function saveToday(items) {
  const all = readAll();
  const clean = sortItems(items
    .map((i) => ({ time: (i.time || '').trim(), text: (i.text || '').trim() }))
    .filter((i) => i.text));
  if (clean.length) all[todayKey()] = clean;
  else delete all[todayKey()];
  fs.writeFileSync(schedulePath(), JSON.stringify(all, null, 2), 'utf8');
}

module.exports = { getToday, saveToday, todayKey };
