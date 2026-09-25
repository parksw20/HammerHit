// 게임 엔진: DOM을 모른다. tick(dt)로 시간을 흘리고 hit(i)로 입력을 받으며,
// 화면 갱신은 onEvent(type, payload)로 UI에 알린다. → Node에서 그대로 테스트 가능.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const mod = factory(isNode ? require('./questions.js') : root.HH);
  if (isNode) module.exports = mod;
  else { root.HH = root.HH || {}; Object.assign(root.HH, mod); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Q) {
  // 레벨별 난이도 곡선: 라운드 진행도(0→1)에 따라 start → end로 보간
  // stay 하한은 "단어를 읽을 수 있는 시간"(1.5초) 이상으로 유지한다.
  const LEVELS = {
    1: { stay: [3.2, 2.0], moles: [2, 3], similarity: [0, 0.3] },
    2: { stay: [2.8, 1.7], moles: [2, 4], similarity: [0.2, 0.6] },
    3: { stay: [2.4, 1.5], moles: [3, 5], similarity: [0.5, 1] },
    // 알파벳: 글자 하나라 읽기는 빠르지만, 처음 배우는 아이들이라 여유 있게
    abc: { stay: [4.0, 2.5], moles: [2, 4], similarity: [0.3, 0.8] },
  };

  const SCORE_CORRECT = 100;
  const SCORE_WRONG = -50;
  const GAP_AFTER_HIT = 0.45;   // 정답 후 다음 문제까지
  const GAP_AFTER_FAIL = 1.1;   // 오답/시간초과 후 정답을 보여주는 시간
  const RECENT_SIZE = 3;
  const COMPLETE_BONUS_PER_SEC = 10; // 순서대로 모드 완주 시 남은 1초당 보너스

  const lerp = (a, b, t) => a + (b - a) * t;

  function comboMultiplier(combo) {
    if (combo >= 10) return 2;
    if (combo >= 5) return 1.5;
    if (combo >= 3) return 1.2;
    return 1;
  }

  class GameEngine {
    constructor(opts) {
      this.words = opts.words;
      this.pool = opts.pool && opts.pool.length ? opts.pool : opts.words;
      this.mode = opts.mode || 'meaning';
      this.sequence = !!(Q.MODES[this.mode] && Q.MODES[this.mode].sequence);
      this.level = LEVELS[opts.level] ? opts.level : 1;
      this.duration = opts.duration || 60;
      this.holeCount = opts.holeCount || 9;
      this.progress = opts.progress || null;
      this.rng = opts.rng || Math.random;
      this.onEvent = opts.onEvent || function () {};
      this.reset();
    }

    reset() {
      this.state = 'idle';     // idle | running | paused | ended
      this.elapsed = 0;
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.holes = new Array(this.holeCount).fill(null);
      this.question = null;    // 현재 문제 (답을 기다리는 중일 때만)
      this.timeLeft = 0;       // 현재 문제의 남은 시간
      this.gap = 0;            // 다음 문제까지 남은 대기 시간
      this.recent = [];
      this.results = [];       // { word, correct, reason }
      this.seqIndex = 0;       // 순서대로 모드: 다음에 쳐야 할 위치
      this.completed = false;  // 순서대로 모드: 끝까지 다 쳤는지
      this.bonus = 0;
    }

    get remaining() {
      return Math.max(0, this.duration - this.elapsed);
    }

    difficulty() {
      const cfg = LEVELS[this.level];
      const p = Math.min(1, this.elapsed / this.duration);
      const [m0, m1] = cfg.moles;
      return {
        stay: lerp(cfg.stay[0], cfg.stay[1], p),
        moles: Math.min(this.holeCount, m1, m0 + Math.floor(p * (m1 - m0 + 1))),
        similarity: lerp(cfg.similarity[0], cfg.similarity[1], p),
      };
    }

    emit(type, payload) {
      this.onEvent(type, payload || {});
    }

    start() {
      this.reset();
      this.state = 'running';
      this.gap = 0.6;
      this.emit('start');
    }

    pause() {
      if (this.state === 'running') { this.state = 'paused'; this.emit('pause'); }
    }

    resume() {
      if (this.state === 'paused') { this.state = 'running'; this.emit('resume'); }
    }

    tick(dt) {
      if (this.state !== 'running') return;
      this.elapsed += dt;
      if (this.elapsed >= this.duration) { this.end(); return; }

      if (this.question) {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) this.fail(null, 'miss');
        return;
      }
      if (this.gap > 0) {
        this.gap -= dt;
        if (this.gap <= 0) this.completed ? this.end() : this.nextQuestion();
      }
    }

    nextQuestion() {
      const diff = this.difficulty();
      const answer = this.sequence
        ? this.pool[this.seqIndex]
        : Q.pickAnswer(this.pool, { rng: this.rng, progress: this.progress, recent: this.recent });
      const question = Q.createQuestion(this.mode, answer, this.words, diff.moles - 1, {
        rng: this.rng,
        similarity: diff.similarity,
        sequence: this.pool,
        sequenceIndex: this.seqIndex,
      });

      const moleWords = [answer].concat(question.distractors);
      const slots = Q.shuffle(this.holes.map((_, i) => i), this.rng);
      this.holes.fill(null);
      moleWords.forEach((word, i) => {
        this.holes[slots[i]] = { word, label: Q.labelFor(word, question.display), isAnswer: word.id === answer.id };
      });
      question.answerIndex = slots[0];
      question.stay = diff.stay;

      this.question = question;
      this.timeLeft = diff.stay;
      this.recent = this.recent.concat(answer.id).slice(-RECENT_SIZE);
      this.emit('question', { question, holes: this.holes.slice() });
    }

    hit(index) {
      if (this.state !== 'running' || !this.question) return null;
      const mole = this.holes[index];
      if (!mole) return null;
      if (!mole.isAnswer) return this.fail(index, 'wrong');

      const question = this.question;
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      const gained = Math.round(SCORE_CORRECT * comboMultiplier(this.combo));
      this.score += gained;
      this.record(question.answer, true, 'hit');
      this.finishQuestion(GAP_AFTER_HIT);
      this.emit('hit', { index, question, gained, combo: this.combo });

      if (this.sequence) {
        this.seqIndex += 1;
        if (this.seqIndex >= this.pool.length) {
          this.completed = true;
          this.bonus = Math.ceil(this.remaining) * COMPLETE_BONUS_PER_SEC;
          this.score += this.bonus;
          this.gap = GAP_AFTER_FAIL; // 마지막 타격 애니메이션을 보여준 뒤 종료
          this.emit('complete', { bonus: this.bonus });
        }
      }
      return { correct: true, gained };
    }

    // 오답을 치거나 시간이 지나면 문제를 끝내고 정답을 보여준다.
    // (오답 후에도 정답을 칠 수 있게 하면 "아무거나 연타"가 유리해지므로 막는다)
    // 순서대로 모드에서는 seqIndex가 그대로라 같은 글자를 다시 낸다.
    fail(index, reason) {
      const question = this.question;
      const lost = reason === 'wrong' ? Math.min(this.score, -SCORE_WRONG) : 0;
      this.score -= lost;
      this.combo = 0;
      this.record(question.answer, false, reason);
      this.finishQuestion(GAP_AFTER_FAIL);
      this.emit(reason, { index, question, lost });
      return { correct: false, lost };
    }

    finishQuestion(gap) {
      this.question = null;
      this.holes.fill(null);
      this.gap = gap;
    }

    record(word, correct, reason) {
      this.results.push({ word, correct, reason });
      if (this.progress) this.progress.record(word.id, correct);
    }

    end() {
      this.state = 'ended';
      this.question = null;
      this.holes.fill(null);
      this.emit('end', this.summary());
    }

    summary() {
      const total = this.results.length;
      const correct = this.results.filter((r) => r.correct).length;
      const seen = new Set();
      const wrongWords = [];
      for (const r of this.results) {
        if (!r.correct && !seen.has(r.word.id)) { seen.add(r.word.id); wrongWords.push(r.word); }
      }
      return {
        score: this.score,
        total,
        correct,
        wrong: this.results.filter((r) => r.reason === 'wrong').length,
        missed: this.results.filter((r) => r.reason === 'miss').length,
        accuracy: total ? correct / total : 0,
        maxCombo: this.maxCombo,
        wrongWords,
        completed: this.completed,
        bonus: this.bonus,
      };
    }
  }

  return { GameEngine, LEVELS, comboMultiplier };
});
