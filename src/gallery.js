'use strict';
// 모습 고르기 화면에 보여 줄 예시 이미지 (배경 투명 + 몸 전체가 나온 것만)
// - https://… : chiikawawallpaper.com(비공식 팬 사이트) GIF. 앱에 넣지 않고, 고를 때 내려받아요.
// - bundled:… : assets/characters 에 들어 있는 PNG (유저가 모아 준 이미지를 360px로 줄인 것)
// 첫 번째 = 기본 '평소 모습', 두 번째 = 기본 '말할 때 모습'

const R2 = 'https://r2.chiikawawallpaper.com/wallpaper/gif/';

const GALLERY = {
  chiikawa: [
    '0a5b14fa1e054648a1b510aae2c3a2ca.gif',
    '14cb75949ad641c5a80f7c8233855f45.gif',
    '24e49d4344c84b508d9c969b87c7c1f3.gif',
    '4ae04224105e4c95b4e1aa5f6a566b00.gif',
    '540847cfa4e84b688146845821db3a65.gif',
    '66c08780a2164891808e9274ce6aae42.gif',
    'bc83011f354d4c328738a55ae0cf8b31.gif',
    'ea7e6ff9136a4712b1712e0415a00cbb.gif',
    'ecddec36d0c748bbb8462c1af4c728b9.gif',
    'f91600f4bf3e4ec58054e3498336a9da.gif',
  ],
  hachiware: [
    '17e51f83bd6649f2bcea2d61ba8955fd.gif',
    'c53f69f886854df28b85a0da5eb9f954.gif',
    '4a19ac355637469194bc9fb7a20b59ab.gif',
  ],
  usagi: [
    '4f47518c8d9f447682e067cfd59b626b.gif',
    '8c7e20ea2b244367a413df9c26fb92e7%20(1).gif',
    '678c5d8408a542988757e75afe04880a.gif',
    'eb9616d2535d4515aa36530dbb225ac6%20(1).gif',
    'd25bfb1482b74f22b9c86ce1847b07b9.gif',
    'df7097c0ea064161a432815422d0fe37.gif',
    'f064bb269ae34b08a276d4baf4c35f6d.gif',
  ],
  momonga: [
    'bundled:momonga/momonga1.png',
    'bundled:momonga/momonga2.png',
    'bundled:momonga/momonga3.png',
    'bundled:momonga/momonga4.png',
    'bundled:momonga/momonga5.png',
    '0b8404aaca03403a9c534d4f27931d1d.gif',
    'd401a67b428b444ca12b03d95c2de4f9.gif',
  ],
  kurimanju: [
    'bundled:kurimanju/kurimanju5.png', // 맥주 한 잔 (기본 모습)
    'bundled:kurimanju/kurimanju1.png',
    'bundled:kurimanju/kurimanju2.png',
    'bundled:kurimanju/kurimanju3.png',
    'bundled:kurimanju/kurimanju4.png',
  ],
  shisa: [
    'bundled:shisa/shisa1.png',
    'bundled:shisa/shisa2.png',
    'bundled:shisa/shisa3.png',
  ],
  rakko: [
    'bundled:rakko/rakko1.png',
    'bundled:rakko/rakko2.png',
    'bundled:rakko/rakko3.png',
    'bundled:rakko/rakko4.png',
  ],
};

for (const id of Object.keys(GALLERY)) GALLERY[id] = GALLERY[id].map((f) => (f.startsWith('bundled:') ? f : R2 + f));

module.exports = { GALLERY };
