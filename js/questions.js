// 문제 생성기: 게임 엔진은 여기서 만든 Question만 알면 된다.
// 모드를 추가할 때는 createQuestion의 prompt 규칙만 늘리면 된다.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.HH = root.HH || {}; Object.assign(root.HH, mod); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MODES = {
    meaning: { label: '뜻 찾기', speak: false },
    listen: { label: '듣고 찾기', speak: true },
  };

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // 오답 선정 우선순위: 헷갈리는 단어(similarity 확률) → 같은 카테고리 → 같은 레벨 → 전체
  // 무작위 오답보다 비슷한 단어가 섞여야 실제로 변별력이 생긴다.
  function pickDistractors(answer, allWords, count, opts) {
    const rng = (opts && opts.rng) || Math.random;
    const similarity = (opts && opts.similarity) || 0;
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

    if (similarity > 0 && rng() < similarity) {
      take(allWords.filter((cand) =>
        answer.confusables.includes(cand.id) || cand.confusables.includes(answer.id)));
    }
    take(allWords.filter((cand) => cand.category === answer.category));
    take(allWords.filter((cand) => cand.level === answer.level));
    take(allWords);
    return out;
  }

  // 숙련도가 낮은 단어일수록 자주 나온다 (가중치 6 - mastery).
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

  function createQuestion(mode, answer, allWords, distractorCount, opts) {
    if (!MODES[mode]) throw new Error('Unknown mode: ' + mode);
    return {
      mode,
      answer,
      distractors: pickDistractors(answer, allWords, distractorCount, opts),
      prompt: mode === 'listen' ? answer.en : answer.ko,
      speak: MODES[mode].speak,
    };
  }

  return { MODES, shuffle, pickDistractors, pickAnswer, createQuestion };
});
