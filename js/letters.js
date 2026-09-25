// 알파벳 26자. 단어장(words.js)과 같은 형태라서 같은 엔진·문제 생성기로 돌아간다.
// - shape: 모양이 헷갈리는 글자 (대문자·소문자 짝 찾기에서 오답으로 우선 출제)
// - sound: 이름 소리가 헷갈리는 글자 (알파벳 소리 듣기에서 오답으로 우선 출제)
// - say: TTS로 읽을 텍스트 (글자 이름만 읽히도록 소문자)
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.HH = root.HH || {}; Object.assign(root.HH, mod); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const BASE = [
    ['A', '에이', '🍎', 'apple'], ['B', '비', '🐻', 'bear'], ['C', '씨', '🐱', 'cat'],
    ['D', '디', '🐶', 'dog'], ['E', '이', '🥚', 'egg'], ['F', '에프', '🐟', 'fish'],
    ['G', '지', '🍇', 'grape'], ['H', '에이치', '🎩', 'hat'], ['I', '아이', '🍦', 'ice cream'],
    ['J', '제이', '🧃', 'juice'], ['K', '케이', '🪁', 'kite'], ['L', '엘', '🦁', 'lion'],
    ['M', '엠', '🐵', 'monkey'], ['N', '엔', '👃', 'nose'], ['O', '오', '🍊', 'orange'],
    ['P', '피', '🐷', 'pig'], ['Q', '큐', '👑', 'queen'], ['R', '알', '🐰', 'rabbit'],
    ['S', '에스', '☀️', 'sun'], ['T', '티', '🐯', 'tiger'], ['U', '유', '☂️', 'umbrella'],
    ['V', '브이', '🎻', 'violin'], ['W', '더블유', '🍉', 'watermelon'], ['X', '엑스', '📦', 'box'],
    ['Y', '와이', '🪀', 'yo-yo'], ['Z', '지 (제트)', '🦓', 'zebra'],
  ];

  // 모양이 비슷한 글자 묶음 (소문자 기준 + 대문자 기준)
  const SHAPE_GROUPS = ['BDPQ', 'MNUWH', 'IJLT', 'CEOA', 'GQY', 'VUWY', 'FTR', 'SZ', 'KX',
    'EF', 'OQCG', 'MNW', 'PRB', 'ILT'];
  // 이름 소리가 비슷한 글자 묶음 (-ee 계열, -ay 계열 등, 한국 학습자가 헷갈리는 L/R 포함)
  const SOUND_GROUPS = ['BCDEGPTVZ', 'AHJK', 'FSX', 'MN', 'IY', 'QUW', 'LR'];

  function related(letter, groups) {
    const out = new Set();
    for (const g of groups) if (g.includes(letter)) for (const c of g) if (c !== letter) out.add('letter:' + c);
    return Array.from(out);
  }

  const LETTERS = BASE.map(([upper, ko, emoji, example], order) => ({
    id: 'letter:' + upper,
    en: upper,
    lower: upper.toLowerCase(),
    // 대문자 한 글자를 TTS에 넘기면 "capital A"처럼 읽으므로 소문자로 읽힌다
    say: upper.toLowerCase(),
    ko,
    emoji,
    example,
    order,
    category: 'letter',
    level: 0,
    confusables: [],
    shape: related(upper, SHAPE_GROUPS),
    sound: related(upper, SOUND_GROUPS),
  }));

  const RANGES = {
    am: { label: 'A ~ M', from: 0, to: 12 },
    nz: { label: 'N ~ Z', from: 13, to: 25 },
    az: { label: 'A ~ Z', from: 0, to: 25 },
  };

  function lettersInRange(key) {
    const r = RANGES[key] || RANGES.az;
    return LETTERS.slice(r.from, r.to + 1);
  }

  return { LETTERS, RANGES, lettersInRange };
});
