// 문제 생성기: 게임 엔진은 여기서 만든 Question만 알면 된다.
// 모드를 추가할 때는 MODES와 createQuestion의 규칙만 늘리면 된다.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.HH = root.HH || {}; Object.assign(root.HH, mod); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // confusableKey: 오답으로 우선 출제할 "헷갈리는 항목" 필드
  // sequence: 정답을 무작위가 아니라 풀(pool) 순서대로 낸다
  const MODES = {
    meaning: { label: '뜻 찾기', track: 'words', confusableKey: 'confusables' },
    listen: { label: '듣고 찾기', track: 'words', confusableKey: 'confusables' },
    sequence: { label: '순서대로 ABC', track: 'abc', sequence: true },
    case: { label: '대문자·소문자', track: 'abc', confusableKey: 'shape' },
    letterSound: { label: '알파벳 소리', track: 'abc', confusableKey: 'sound' },
  };

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // TTS로 읽을 텍스트
  function sayOf(word) {
    return word.say || word.en;
  }

  // 두더지 팻말에 쓸 글자: 'lower'/'upper'는 알파벳 대소문자 모드용
  function labelFor(word, display) {
    if (display === 'lower') return word.lower || word.en.toLowerCase();
    if (display === 'upper') return word.en.toUpperCase();
    return word.en;
  }

  // 오답 선정 우선순위:
  //   preferred(모드가 지정한 후보) → 헷갈리는 항목(similarity 확률) → 같은 카테고리 → 같은 레벨 → 전체
  // 무작위 오답보다 비슷한 항목이 섞여야 실제로 변별력이 생긴다.
  function pickDistractors(answer, allWords, count, opts) {
    const rng = (opts && opts.rng) || Math.random;
    const similarity = (opts && opts.similarity) || 0;
    const key = (opts && opts.confusableKey) || 'confusables';
    const used = new Set([answer.id]);
    const out = [];
    const take = (candidates) => {
      for (const cand of shuffle(candidates, rng)) {
        if (out.length >= count) return;
        if (used.has(cand.id) || cand.en === answer.en || cand.ko === answer.ko) continue;
        used.add(cand.id);
        out.push(cand);
      }
    };

    if (opts && opts.preferred) take(opts.preferred);
    if (similarity > 0 && rng() < similarity) {
      const mine = answer[key] || [];
      take(allWords.filter((cand) => mine.includes(cand.id) || (cand[key] || []).includes(answer.id)));
    }
    take(allWords.filter((cand) => cand.category === answer.category));
    take(allWords.filter((cand) => cand.level === answer.level));
    take(allWords);
    return out;
  }

  // 숙련도가 낮은 항목일수록 자주 나온다 (가중치 6 - mastery).
  function pickAnswer(pool, opts) {
    const rng = (opts && opts.rng) || Math.random;
    const progress = opts && opts.progress;
    const recent = (opts && opts.recent) || [];
    let candidates = pool.filter((word) => !recent.includes(word.id));
    if (candidates.length === 0) candidates = pool;

    const weights = candidates.map((word) => 6 - (progress ? progress.mastery(word.id) : 0));
    const total = weights.reduce((sum, x) => sum + x, 0);
    let r = rng() * total;
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r < 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  // opts.sequence / opts.sequenceIndex: 순서대로 모드에서 전체 순서와 현재 위치
  function createQuestion(mode, answer, allWords, distractorCount, opts) {
    const cfg = MODES[mode];
    if (!cfg) throw new Error('Unknown mode: ' + mode);
    const rng = (opts && opts.rng) || Math.random;
    const dOpts = Object.assign({}, opts, { confusableKey: cfg.confusableKey });

    let prompt = '';
    let hint = '';
    let speakText = null;
    let display = 'en';

    switch (mode) {
      case 'meaning':
        prompt = answer.ko;
        hint = '이 뜻의 영어 단어는?';
        break;

      case 'listen':
        prompt = '🔊';
        hint = '잘 듣고 맞는 단어를 때려!';
        speakText = sayOf(answer);
        break;

      case 'sequence': {
        const seq = (opts && opts.sequence) || [answer];
        const i = (opts && opts.sequenceIndex) || 0;
        // 바로 앞뒤 글자를 오답으로 섞어야 "순서"를 알아야 풀 수 있다
        dOpts.preferred = seq.slice(Math.max(0, i - 2), i + 3);
        const before = seq.slice(Math.max(0, i - 3), i).map((w) => w.en);
        prompt = before.concat('_').join(' ');
        hint = (i === 0 ? `${answer.en}부터 시작해요!` : '다음 글자는?') + ` (${i + 1}/${seq.length})`;
        display = 'upper';
        break;
      }

      case 'case': {
        const upperFirst = rng() < 0.5;
        prompt = upperFirst ? labelFor(answer, 'upper') : labelFor(answer, 'lower');
        display = upperFirst ? 'lower' : 'upper';
        hint = upperFirst ? '짝꿍 소문자를 찾아요' : '짝꿍 대문자를 찾아요';
        break;
      }

      case 'letterSound':
        prompt = '🔊';
        hint = '잘 듣고 맞는 글자를 때려!';
        speakText = sayOf(answer);
        display = rng() < 0.5 ? 'upper' : 'lower';
        break;
    }

    return {
      mode,
      answer,
      distractors: pickDistractors(answer, allWords, distractorCount, dOpts),
      prompt,
      hint,
      speakText,
      speak: !!speakText,
      display,
    };
  }

  return { MODES, shuffle, sayOf, labelFor, pickDistractors, pickAnswer, createQuestion };
});
