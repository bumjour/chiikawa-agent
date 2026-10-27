'use strict';
const $ = (id) => document.getElementById(id);
let state = null;
let kind = 'idle';

function render() {
  $('title').textContent = `${state.nameKo} 모습 고르기`;
  for (const b of $('kind').children) b.classList.toggle('on', b.dataset.v === kind);
  const grid = $('grid');
  grid.innerHTML = '';

  // 말할 때 모습은 '따로 없음(평소 모습 그대로)'도 고를 수 있게
  if (kind === 'talk') grid.appendChild(tile('none', null, '따로 없음\n(평소 모습 그대로)'));
  for (const item of state.items) grid.appendChild(tile(item.value, item.thumb, null, item.mine));
  // 예시도 내 이미지도 없으면 임시 그림
  if (!state.items.length) {
    const t = tile('', null);
    t.innerHTML = placeholderSvg(state.charId, state.color);
    t.classList.add('on');
    grid.appendChild(t);
  }
  $('empty').classList.toggle('hidden', state.items.length > 0);
}

function tile(value, thumb, label, mine) {
  const el = document.createElement('div');
  el.className = 'tile';
  if (state.selected[kind] === value) el.classList.add('on');
  if (label) {
    el.classList.add('none');
    el.textContent = label;
  } else if (thumb) {
    el.innerHTML = `<img src="${thumb}" alt="">${mine ? '<span class="badge">내 이미지</span>' : ''}`;
  }
  if (value) {
    el.addEventListener('click', async () => {
      state = await window.picker.set(kind, value);
      render();
    });
  }
  return el;
}

for (const b of $('kind').children) {
  b.addEventListener('click', () => {
    kind = b.dataset.v;
    render();
  });
}

$('add').addEventListener('click', async () => {
  state = await window.picker.add();
  render();
});
$('done').addEventListener('click', () => window.picker.close());

(async () => {
  state = await window.picker.get();
  render();
})();
