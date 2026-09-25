// 단어장. 교사가 직접 항목을 추가/수정할 수 있도록 데이터만 모아 둔다.
// - id: 고유값 (보통 영어 단어와 동일)
// - ko: 게임 안에서 겹치지 않아야 한다 (동음이의어는 괄호로 구분)
// - confusables: 철자/발음이 비슷해 헷갈리는 단어 id → 난이도가 오르면 오답으로 우선 출제
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.HH = root.HH || {}; Object.assign(root.HH, mod); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const w = (en, ko, emoji, category, level, confusables) =>
    ({ id: en, en, ko, emoji, category, level, confusables: confusables || [] });

  const WORDS = [
    // ── Level 1 ─────────────────────────────
    w('dog', '개', '🐶', 'animal', 1),
    w('cat', '고양이', '🐱', 'animal', 1, ['cap']),
    w('pig', '돼지', '🐷', 'animal', 1, ['big']),
    w('cow', '소', '🐮', 'animal', 1),
    w('sheep', '양', '🐑', 'animal', 1, ['ship']),
    w('bear', '곰', '🐻', 'animal', 1, ['pear']),
    w('duck', '오리', '🦆', 'animal', 1),
    w('mouse', '쥐', '🐭', 'animal', 1, ['mouth']),
    w('rabbit', '토끼', '🐰', 'animal', 1),
    w('lion', '사자', '🦁', 'animal', 1),
    w('tiger', '호랑이', '🐯', 'animal', 1),
    w('monkey', '원숭이', '🐵', 'animal', 1),

    w('apple', '사과', '🍎', 'fruit', 1),
    w('banana', '바나나', '🍌', 'fruit', 1),
    w('grape', '포도', '🍇', 'fruit', 1),
    w('pear', '배 (과일)', '🍐', 'fruit', 1, ['bear']),
    w('peach', '복숭아', '🍑', 'fruit', 1),
    w('orange', '오렌지', '🍊', 'fruit', 1),
    w('lemon', '레몬', '🍋', 'fruit', 1),
    w('strawberry', '딸기', '🍓', 'fruit', 1),

    w('red', '빨간색', '🔴', 'color', 1),
    w('blue', '파란색', '🔵', 'color', 1),
    w('green', '초록색', '🟢', 'color', 1),
    w('yellow', '노란색', '🟡', 'color', 1),
    w('black', '검은색', '⚫', 'color', 1),
    w('white', '흰색', '⚪', 'color', 1),

    w('one', '하나 (1)', '1️⃣', 'number', 1),
    w('two', '둘 (2)', '2️⃣', 'number', 1),
    w('three', '셋 (3)', '3️⃣', 'number', 1, ['tree']),
    w('four', '넷 (4)', '4️⃣', 'number', 1),
    w('five', '다섯 (5)', '5️⃣', 'number', 1),
    w('ten', '열 (10)', '🔟', 'number', 1),

    // ── Level 2 ─────────────────────────────
    w('head', '머리', '🙆', 'body', 2),
    w('eye', '눈 (신체)', '👁️', 'body', 2),
    w('nose', '코', '👃', 'body', 2),
    w('mouth', '입', '👄', 'body', 2, ['mouse']),
    w('ear', '귀', '👂', 'body', 2),
    w('hand', '손', '✋', 'body', 2),
    w('foot', '발', '🦶', 'body', 2),

    w('book', '책', '📚', 'school', 2),
    w('pencil', '연필', '✏️', 'school', 2),
    w('desk', '책상', '🪑', 'school', 2),
    w('bag', '가방', '🎒', 'school', 2),
    w('eraser', '지우개', '🧽', 'school', 2),
    w('ruler', '자', '📏', 'school', 2),

    w('tree', '나무', '🌳', 'nature', 2, ['three']),
    w('flower', '꽃', '🌸', 'nature', 2),
    w('sun', '해', '☀️', 'nature', 2),
    w('moon', '달', '🌙', 'nature', 2),
    w('star', '별', '⭐', 'nature', 2),
    w('rain', '비', '🌧️', 'nature', 2),
    w('snow', '눈 (날씨)', '❄️', 'nature', 2),

    w('ship', '배 (선박)', '🚢', 'transport', 2, ['sheep']),
    w('bus', '버스', '🚌', 'transport', 2),
    w('car', '자동차', '🚗', 'transport', 2),
    w('train', '기차', '🚆', 'transport', 2),
    w('bike', '자전거', '🚲', 'transport', 2),
    w('cap', '야구모자', '🧢', 'transport', 2, ['cat']),

    // ── Level 3 ─────────────────────────────
    w('run', '달리다', '🏃', 'verb', 3),
    w('walk', '걷다', '🚶', 'verb', 3, ['work']),
    w('eat', '먹다', '🍽️', 'verb', 3),
    w('drink', '마시다', '🥤', 'verb', 3),
    w('sleep', '자다', '😴', 'verb', 3),
    w('swim', '수영하다', '🏊', 'verb', 3),
    w('read', '읽다', '📖', 'verb', 3),
    w('write', '쓰다', '✍️', 'verb', 3, ['right']),
    w('sing', '노래하다', '🎤', 'verb', 3),
    w('work', '일하다', '💼', 'verb', 3, ['walk']),

    w('big', '큰', '🐘', 'adjective', 3, ['pig']),
    w('small', '작은', '🐜', 'adjective', 3),
    w('happy', '행복한', '😊', 'adjective', 3),
    w('sad', '슬픈', '😢', 'adjective', 3),
    w('hot', '뜨거운', '🔥', 'adjective', 3),
    w('cold', '차가운', '🧊', 'adjective', 3),
    w('fast', '빠른', '⚡', 'adjective', 3),
    w('slow', '느린', '🐢', 'adjective', 3),
    w('right', '옳은', '✅', 'adjective', 3, ['write']),

    w('school', '학교', '🏫', 'place', 3),
    w('hospital', '병원', '🏥', 'place', 3),
    w('park', '공원', '🏞️', 'place', 3),
    w('library', '도서관', '🏛️', 'place', 3),
    w('kitchen', '부엌', '🍳', 'place', 3),
  ];

  return { WORDS };
});
