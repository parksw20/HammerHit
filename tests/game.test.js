const test = require('node:test');
const assert = require('node:assert/strict');

const { WORDS } = require('../js/words.js');
const { LETTERS, lettersInRange } = require('../js/letters.js');
const { pickDistractors, pickAnswer, createQuestion, labelFor } = require('../js/questions.js');
const { Progress } = require('../js/progress.js');
const { GameEngine, comboMultiplier } = require('../js/engine.js');

// 결정적 난수 (mulberry32)
function seeded(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

const byId = (id) => WORDS.find((w) => w.id === id);

test('단어장: id·영어·뜻이 겹치지 않고 confusables가 실제 단어를 가리킨다', () => {
  for (const key of ['id', 'en', 'ko']) {
    const values = WORDS.map((w) => w[key]);
    assert.equal(new Set(values).size, values.length, `${key} 중복`);
  }
  for (const w of WORDS) {
    assert.ok([1, 2, 3].includes(w.level));
    for (const c of w.confusables) assert.ok(byId(c), `${w.id} → ${c} 없음`);
  }
});

test('오답: 정답·중복 없이 요청한 개수만큼, 기본은 같은 카테고리에서 고른다', () => {
  const rng = seeded(1);
  const apple = byId('apple');
  for (let i = 0; i < 50; i++) {
    const ds = pickDistractors(apple, WORDS, 4, { rng });
    assert.equal(ds.length, 4);
    assert.equal(new Set(ds.map((d) => d.id)).size, 4);
    assert.ok(ds.every((d) => d.id !== apple.id && d.ko !== apple.ko));
    assert.ok(ds.every((d) => d.category === 'fruit'));
  }
});

test('오답: similarity=1이면 헷갈리는 단어가 양방향으로 포함된다', () => {
  const rng = seeded(2);
  assert.ok(pickDistractors(byId('sheep'), WORDS, 2, { rng, similarity: 1 }).some((d) => d.id === 'ship'));
  // ship → sheep은 ship의 confusables에도 있지만, bear → pear처럼 한쪽만 적어도 동작해야 한다
  const words = WORDS.map((w) => (w.id === 'pear' ? Object.assign({}, w, { confusables: [] }) : w));
  const bear = words.find((w) => w.id === 'bear');
  const pear = words.find((w) => w.id === 'pear');
  assert.ok(pickDistractors(pear, words, 2, { rng, similarity: 1 }).some((d) => d.id === 'bear'));
  assert.ok(pickDistractors(bear, words, 2, { rng, similarity: 1 }).some((d) => d.id === 'pear'));
});

test('출제: 최근 단어는 피하고, 숙련도가 낮은 단어가 더 자주 나온다', () => {
  const rng = seeded(3);
  const pool = [byId('dog'), byId('cat')];
  const progress = new Progress(null);
  for (let i = 0; i < 5; i++) progress.record('dog', true); // dog 마스터(5) → 가중치 1, cat → 6

  let cat = 0;
  for (let i = 0; i < 700; i++) if (pickAnswer(pool, { rng, progress }).id === 'cat') cat++;
  assert.ok(cat / 700 > 0.8, `cat 비율 ${cat / 700}`);

  for (let i = 0; i < 20; i++) assert.equal(pickAnswer(pool, { rng, recent: ['cat'] }).id, 'dog');
  assert.ok(pool.includes(pickAnswer(pool, { rng, recent: ['dog', 'cat'] }))); // 전부 최근이면 풀 전체에서
});

test('문제: 모드에 따라 프롬프트가 바뀐다', () => {
  const rng = seeded(4);
  const apple = byId('apple');
  assert.equal(createQuestion('meaning', apple, WORDS, 2, { rng }).prompt, '사과');
  const listen = createQuestion('listen', apple, WORDS, 2, { rng });
  assert.equal(listen.prompt, '🔊');
  assert.equal(listen.speakText, 'apple');
  assert.equal(listen.speak, true);
  assert.throws(() => createQuestion('nope', apple, WORDS, 2, { rng }));
});

test('숙련도: 맞히면 +1, 틀리면 -2, 0~5로 제한되고 저장소에 남는다', () => {
  const storage = memoryStorage();
  const p = new Progress(storage);
  for (let i = 0; i < 8; i++) p.record('dog', true);
  assert.equal(p.mastery('dog'), 5);
  p.record('dog', false);
  assert.equal(p.mastery('dog'), 3);
  for (let i = 0; i < 3; i++) p.record('dog', false);
  assert.equal(p.mastery('dog'), 0);
  assert.equal(new Progress(storage).get('dog').seen, 12);
});

test('숙련도: 저장소가 깨지거나 막혀도 예외 없이 동작한다', () => {
  const broken = { getItem: () => '{not json', setItem: () => { throw new Error('quota'); } };
  const p = new Progress(broken);
  assert.doesNotThrow(() => p.record('cat', true));
  assert.equal(p.mastery('cat'), 1);
});

test('콤보 배율', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 9, 10, 30].map(comboMultiplier), [1, 1, 1.2, 1.2, 1.5, 1.5, 2, 2]);
});

function makeEngine(opts) {
  const events = [];
  const engine = new GameEngine(Object.assign({
    words: WORDS,
    pool: WORDS.filter((w) => w.level === 1),
    mode: 'meaning',
    level: 1,
    duration: 60,
    rng: seeded(5),
    onEvent: (type, payload) => events.push({ type, payload }),
  }, opts));
  return { engine, events };
}

function untilQuestion(engine) {
  for (let i = 0; i < 1000 && !engine.question; i++) engine.tick(0.05);
  assert.ok(engine.question, '문제가 나와야 한다');
  return engine.question;
}

test('엔진: 정답 두더지를 치면 점수와 콤보가 오르고 기록된다', () => {
  const progress = new Progress(null);
  const { engine, events } = makeEngine({ progress });
  engine.start();
  const q = untilQuestion(engine);
  const moles = engine.holes.filter(Boolean);
  assert.equal(moles.length, 2);                       // 레벨 1 시작: 두더지 2마리
  assert.equal(moles.filter((m) => m.isAnswer).length, 1);
  assert.equal(engine.holes[q.answerIndex].word.id, q.answer.id);

  assert.deepEqual(engine.hit(q.answerIndex), { correct: true, gained: 100 });
  assert.equal(engine.score, 100);
  assert.equal(engine.combo, 1);
  assert.equal(engine.question, null);
  assert.equal(progress.mastery(q.answer.id), 1);
  assert.equal(engine.hit(q.answerIndex), null);       // 이미 끝난 문제는 다시 칠 수 없다
  assert.ok(events.some((e) => e.type === 'hit'));
});

test('엔진: 오답을 치면 감점(0 미만 불가)·콤보 초기화 후 문제가 끝난다', () => {
  const { engine, events } = makeEngine();
  engine.start();
  let q = untilQuestion(engine);
  engine.hit(q.answerIndex);
  engine.hit(untilQuestion(engine).answerIndex);
  assert.equal(engine.combo, 2);

  q = untilQuestion(engine);
  const wrongIdx = engine.holes.findIndex((m) => m && !m.isAnswer);
  assert.deepEqual(engine.hit(wrongIdx), { correct: false, lost: 50 });
  assert.equal(engine.score, 150);
  assert.equal(engine.combo, 0);
  assert.equal(engine.question, null);
  assert.equal(engine.hit(q.answerIndex), null);       // 오답 후 정답 연타 불가
  const ev = events.find((e) => e.type === 'wrong');
  assert.equal(ev.payload.question.answerIndex, q.answerIndex);

  const fresh = makeEngine().engine;
  fresh.start();
  untilQuestion(fresh);
  const idx = fresh.holes.findIndex((m) => m && !m.isAnswer);
  assert.deepEqual(fresh.hit(idx), { correct: false, lost: 0 });
  assert.equal(fresh.score, 0);
});

test('엔진: 시간 안에 못 치면 miss, 라운드가 끝나면 요약에 오답 노트가 담긴다', () => {
  const { engine, events } = makeEngine({ duration: 10 });
  engine.start();
  const q = untilQuestion(engine);
  for (let i = 0; i < 100 && engine.question; i++) engine.tick(0.05);
  const miss = events.find((e) => e.type === 'miss');
  assert.ok(miss);
  assert.equal(miss.payload.question.answer.id, q.answer.id);

  for (let i = 0; i < 400 && engine.state === 'running'; i++) engine.tick(0.05);
  assert.equal(engine.state, 'ended');
  const summary = events.find((e) => e.type === 'end').payload;
  assert.ok(summary.missed >= 1);
  assert.equal(summary.correct, 0);
  assert.ok(summary.wrongWords.some((w) => w.id === q.answer.id));
  assert.equal(new Set(summary.wrongWords.map((w) => w.id)).size, summary.wrongWords.length);
});

test('엔진: 일시정지 중에는 시간이 흐르지 않고 입력도 받지 않는다', () => {
  const { engine } = makeEngine();
  engine.start();
  const q = untilQuestion(engine);
  const before = engine.elapsed;
  engine.pause();
  engine.tick(5);
  assert.equal(engine.elapsed, before);
  assert.equal(engine.hit(q.answerIndex), null);
  engine.resume();
  assert.equal(engine.hit(q.answerIndex).correct, true);
});

test('엔진: 난이도는 시간이 갈수록 오르고 읽기 시간 하한(1.5초)을 지킨다', () => {
  for (const level of [1, 2, 3]) {
    const { engine } = makeEngine({ level });
    const start = engine.difficulty();
    engine.elapsed = engine.duration;
    const end = engine.difficulty();
    assert.ok(end.stay < start.stay);
    assert.ok(end.stay >= 1.5);
    assert.ok(end.moles >= start.moles && end.moles <= 5);
  }
});

test('엔진: 복습 라운드처럼 풀이 한 단어뿐이어도 계속 출제된다', () => {
  const { engine } = makeEngine({ pool: [byId('grape')] });
  engine.start();
  for (let i = 0; i < 5; i++) {
    const q = untilQuestion(engine);
    assert.equal(q.answer.id, 'grape');
    engine.hit(q.answerIndex);
  }
});

// ── 알파벳 ─────────────────────────────
const L = (c) => LETTERS.find((w) => w.en === c);

test('알파벳: 26자, 범위, 헷갈리는 글자가 실제 글자를 가리킨다', () => {
  assert.equal(LETTERS.length, 26);
  assert.deepEqual(lettersInRange('am').map((w) => w.en).join(''), 'ABCDEFGHIJKLM');
  assert.deepEqual(lettersInRange('nz').map((w) => w.en).join(''), 'NOPQRSTUVWXYZ');
  assert.equal(new Set(LETTERS.map((w) => w.ko)).size, 26);
  const ids = new Set(LETTERS.map((w) => w.id));
  for (const w of LETTERS) {
    for (const id of w.shape.concat(w.sound)) assert.ok(ids.has(id) && id !== w.id, `${w.en} → ${id}`);
  }
  assert.ok(L('B').shape.includes('letter:D'));
  assert.ok(L('B').sound.includes('letter:P'));
});

test('대소문자: 프롬프트와 팻말은 서로 다른 대소문자, 모양이 비슷한 글자가 오답으로', () => {
  const rng = seeded(7);
  let sawUpperPrompt = false, sawLowerPrompt = false;
  for (let i = 0; i < 40; i++) {
    const q = createQuestion('case', L('b'.toUpperCase()), LETTERS, 3, { rng, similarity: 1 });
    if (q.prompt === 'B') { sawUpperPrompt = true; assert.equal(q.display, 'lower'); }
    else { assert.equal(q.prompt, 'b'); sawLowerPrompt = true; assert.equal(q.display, 'upper'); }
    assert.ok(q.distractors.every((d) => L('B').shape.includes(d.id)), q.distractors.map((d) => d.en).join());
  }
  assert.ok(sawUpperPrompt && sawLowerPrompt);
  assert.equal(labelFor(L('Q'), 'lower'), 'q');
  assert.equal(labelFor(L('Q'), 'upper'), 'Q');
});

test('알파벳 소리: 글자 이름을 읽고, 소리가 비슷한 글자가 오답으로', () => {
  const rng = seeded(8);
  const q = createQuestion('letterSound', L('B'), LETTERS, 3, { rng, similarity: 1 });
  assert.equal(q.speakText, 'B');
  assert.ok(q.distractors.every((d) => L('B').sound.includes(d.id)));
});

test('순서대로: 앞 글자를 보여주고 바로 앞뒤 글자를 오답으로 섞는다', () => {
  const rng = seeded(9);
  const seq = lettersInRange('am');
  const q = createQuestion('sequence', L('E'), seq, 3, { rng, sequence: seq, sequenceIndex: 4 });
  assert.equal(q.prompt, 'B C D _');
  assert.match(q.hint, /5\/13/);
  assert.equal(q.distractors.length, 3);
  assert.ok(q.distractors.every((d) => 'CDFG'.includes(d.en)));
  assert.equal(createQuestion('sequence', L('A'), seq, 2, { rng, sequence: seq, sequenceIndex: 0 }).prompt, '_');
});

function makeAbc(opts) {
  return makeEngine(Object.assign({ words: lettersInRange('am'), pool: lettersInRange('am'), level: 'abc' }, opts));
}

test('엔진(순서대로): 틀리면 같은 글자를 다시, 끝까지 치면 완주 보너스와 함께 끝난다', () => {
  const pool = lettersInRange('am').slice(0, 3); // A B C
  const { engine, events } = makeAbc({ mode: 'sequence', pool, duration: 90 });
  engine.start();

  let q = untilQuestion(engine);
  assert.equal(q.answer.en, 'A');
  assert.ok(engine.holes.every((m) => !m || m.label === m.word.en)); // 팻말은 대문자
  engine.hit(engine.holes.findIndex((m) => m && !m.isAnswer));        // 오답
  assert.equal(untilQuestion(engine).answer.en, 'A');                 // 같은 글자 다시

  for (const c of 'ABC') {
    q = untilQuestion(engine);
    assert.equal(q.answer.en, c);
    engine.hit(q.answerIndex);
  }
  assert.ok(events.some((e) => e.type === 'complete'));
  const before = engine.score;
  for (let i = 0; i < 100 && engine.state === 'running'; i++) engine.tick(0.05);
  assert.equal(engine.state, 'ended');
  const summary = events.find((e) => e.type === 'end').payload;
  assert.equal(summary.completed, true);
  assert.ok(summary.bonus > 0);
  assert.equal(summary.score, before);
  assert.deepEqual(summary.wrongWords.map((w) => w.en), ['A']);
});

test('엔진(대소문자): 팻말 라벨이 문제의 대소문자 방향을 따른다', () => {
  const { engine } = makeAbc({ mode: 'case' });
  engine.start();
  for (let i = 0; i < 10; i++) {
    const q = untilQuestion(engine);
    for (const m of engine.holes.filter(Boolean)) assert.equal(m.label, labelFor(m.word, q.display));
    assert.notEqual(engine.holes[q.answerIndex].label, q.prompt);
    engine.hit(q.answerIndex);
  }
});
