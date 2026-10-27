'use strict';
// 캐릭터 이미지가 없을 때 쓰는 임시 그림 (SVG, 몸 전체)
function placeholderSvg(id, color) {
  const line = '#4a3b33';
  const s = `stroke="${line}" stroke-width="4"`;
  const body = `<ellipse cx="100" cy="118" rx="62" ry="56" fill="${color}" ${s}/>`;
  const feet = `<ellipse cx="80" cy="174" rx="13" ry="8" fill="${color}" ${s}/>
                <ellipse cx="120" cy="174" rx="13" ry="8" fill="${color}" ${s}/>`;
  const arms = `<ellipse cx="44" cy="132" rx="9" ry="12" fill="${color}" ${s}/>
                <ellipse cx="156" cy="132" rx="9" ry="12" fill="${color}" ${s}/>`;

  const back = { // 몸 뒤에 그리는 것 (귀·꼬리·갈기)
    chiikawa: `<circle cx="62" cy="72" r="15" fill="${color}" ${s}/><circle cx="138" cy="72" r="15" fill="${color}" ${s}/>`,
    hachiware: `<path d="M50 90 L60 46 L88 72 Z M150 90 L140 46 L112 72 Z" fill="#7d9cc4" ${s} stroke-linejoin="round"/>`,
    usagi: `<ellipse cx="80" cy="44" rx="13" ry="38" fill="${color}" ${s}/><ellipse cx="120" cy="44" rx="13" ry="38" fill="${color}" ${s}/>`,
    momonga: `<path d="M150 150 Q196 120 172 70 Q160 110 140 128 Z" fill="#a9d4ee" ${s} stroke-linejoin="round"/>
              <circle cx="58" cy="74" r="18" fill="${color}" ${s}/><circle cx="142" cy="74" r="18" fill="${color}" ${s}/>`,
    kani: `<path d="M56 74 q-16 -26 4 -34 q4 14 12 16 q-2 -12 8 -18 q14 18 -8 40 Z" fill="#ec6a5e" ${s} stroke-linejoin="round"/>
           <path d="M144 74 q16 -26 -4 -34 q-4 14 -12 16 q2 -12 -8 -18 q-14 18 8 40 Z" fill="#ec6a5e" ${s} stroke-linejoin="round"/>`,
    shisa: `<circle cx="100" cy="104" r="74" fill="#e39a3b" ${s}/>`,
    rakko: `<circle cx="58" cy="76" r="11" fill="${color}" ${s}/><circle cx="142" cy="76" r="11" fill="${color}" ${s}/>`,
  }[id] || '';

  const front = { // 몸 위에 그리는 것 (무늬·머리)
    hachiware: `<path d="M40 112 Q42 64 100 62 Q158 64 160 112 Q140 94 108 98 L100 114 L92 98 Q60 94 40 112 Z" fill="#7d9cc4"/>`,
    kurimanju: `<path d="M38 104 Q40 58 100 56 Q160 58 162 104 Q132 92 100 94 Q68 92 38 104 Z" fill="#7a4a24" ${s} stroke-linejoin="round"/>`,
    rakko: `<ellipse cx="100" cy="136" rx="22" ry="14" fill="#fff8f0" stroke="${line}" stroke-width="2.5"/>`,
  }[id] || '';

  const eyeR = id === 'momonga' ? 9 : 5;
  const eyeY = id === 'kurimanju' ? 124 : 118;
  const shine = id === 'momonga'
    ? `<circle cx="79" cy="115" r="3" fill="#fff"/><circle cx="119" cy="115" r="3" fill="#fff"/>` : '';

  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    ${back}
    ${feet}${arms}${body}
    ${front}
    <circle cx="80" cy="${eyeY}" r="${eyeR}" fill="${line}"/>
    <circle cx="120" cy="${eyeY}" r="${eyeR}" fill="${line}"/>
    ${shine}
    <ellipse cx="62" cy="${eyeY + 16}" rx="11" ry="6" fill="#f6b9c2" opacity="0.8"/>
    <ellipse cx="138" cy="${eyeY + 16}" rx="11" ry="6" fill="#f6b9c2" opacity="0.8"/>
    <path d="M93 ${eyeY + 14} Q96.5 ${eyeY + 19} 100 ${eyeY + 14} Q103.5 ${eyeY + 19} 107 ${eyeY + 14}" fill="none" stroke="${line}" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}
