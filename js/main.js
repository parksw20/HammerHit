// 화면(메뉴/게임/결과)과 입력 처리. 게임 규칙은 전부 engine.js에 있다.
(function () {
  const { WORDS, RANGES, lettersInRange, GameEngine, Progress, Sfx, Speech, sayOf } = window.HH;

  const ROUND_SECONDS = 60;
  const SEQUENCE_SECONDS = 90;
  const REVIEW_SECONDS = 45;
  // 숫자패드 배치 그대로: 7 8 9 / 4 5 6 / 1 2 3
  const KEYMAP = { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 };

  const $ = (id) => document.getElementById(id);

  function safeStorage() {
    try {
      const s = window.localStorage;
      s.setItem('__hh', '1');
      s.removeItem('__hh');
      return s;
    } catch (e) {
      return null;
    }
  }

  const storage = safeStorage();
  const progress = new Progress(storage);

  function loadJson(key, fallback) {
    try { return JSON.parse(storage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function saveJson(key, value) {
    try { storage.setItem(key, JSON.stringify(value)); } catch (e) { /* 무시 */ }
  }

  const settings = Object.assign(
    { track: 'abc', abcMode: 'sequence', range: 'am', mode: 'meaning', level: 1, muted: false },
    loadJson('hammerhit.settings.v1', {}));
  if (!Speech.available && settings.mode === 'listen') settings.mode = 'meaning';
  if (!Speech.available && settings.abcMode === 'letterSound') settings.abcMode = 'case';
  const best = loadJson('hammerhit.best.v1', {});
  const isAbc = () => settings.track === 'abc';
  const bestKey = () => (isAbc()
    ? `abc:${settings.abcMode}:${settings.range}`
    : settings.mode + ':' + settings.level);

  let engine = null;
  let round = null;        // { review, pool }
  let lastSummary = null;
  let lastFrame = 0;

  // ── 화면 전환 ─────────────────────────
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
    $('screen-' + name).classList.add('active');
  }

  // ── 메뉴 ─────────────────────────────
  function renderChoices() {
    document.querySelectorAll('.choices').forEach((group) => {
      const key = group.dataset.choice;
      group.querySelectorAll('button').forEach((btn) => {
        btn.classList.toggle('selected', String(settings[key]) === btn.dataset.value);
      });
    });
    $('menu-abc').hidden = !isAbc();
    $('menu-words').hidden = isAbc();
    const record = best[bestKey()] || 0;
    if (isAbc()) {
      const ids = lettersInRange(settings.range).map((w) => w.id);
      $('menu-stats').textContent =
        `${RANGES[settings.range].label} ${ids.length}글자 중 ${progress.masteredCount(ids)}개 마스터 ⭐ · 최고 점수 ${record}`;
    } else {
      const ids = WORDS.filter((w) => w.level === settings.level).map((w) => w.id);
      $('menu-stats').textContent =
        `Level ${settings.level} 단어 ${ids.length}개 중 ${progress.masteredCount(ids)}개 마스터 ⭐ · 최고 점수 ${record}`;
    }
  }

  document.querySelectorAll('.choices').forEach((group) => {
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn || btn.disabled) return;
      const key = group.dataset.choice;
      settings[key] = key === 'level' ? Number(btn.dataset.value) : btn.dataset.value;
      saveJson('hammerhit.settings.v1', settings);
      renderChoices();
    });
  });

  if (!Speech.available) {
    document.querySelectorAll('[data-value="listen"], [data-value="letterSound"]').forEach((btn) => {
      btn.disabled = true;
      btn.querySelector('small').textContent = '이 브라우저는 음성을 지원하지 않아요';
    });
  }

  // confirm()은 임베드 환경에서 막힐 수 있으므로 "한 번 더 누르기"로 확인한다
  let resetArmed = null;
  const resetBtn = $('btn-reset');
  resetBtn.addEventListener('click', () => {
    if (!resetArmed) {
      resetBtn.textContent = '정말 지울까요? 한 번 더 누르면 초기화돼요';
      resetArmed = setTimeout(() => {
        resetArmed = null;
        resetBtn.textContent = '학습 기록 초기화';
      }, 3000);
      return;
    }
    clearTimeout(resetArmed);
    resetArmed = null;
    progress.reset();
    Object.keys(best).forEach((k) => delete best[k]);
    saveJson('hammerhit.best.v1', best);
    resetBtn.textContent = '초기화했어요';
    renderChoices();
  });

  // ── 보드 ─────────────────────────────
  const board = $('board');
  const holeEls = [];
  for (let i = 0; i < 9; i++) {
    const hole = document.createElement('div');
    hole.className = 'hole';
    hole.dataset.index = i;
    hole.innerHTML =
      '<div class="mole-wrap"><div class="mole"><div class="face"><div class="nose"></div></div>' +
      '<div class="sign"></div></div></div><div class="lip"></div>';
    board.appendChild(hole);
    holeEls.push(hole);
  }

  function resetHoles() {
    holeEls.forEach((hole) => {
      hole.className = 'hole';
      hole.querySelector('.mole').style.transitionDelay = '';
    });
  }

  function lowerOthers(keep) {
    holeEls.forEach((hole, i) => { if (!keep.includes(i)) hole.classList.remove('up'); });
  }

  function floatText(index, text, kind) {
    const el = document.createElement('div');
    el.className = 'float ' + kind;
    el.textContent = text;
    el.addEventListener('animationend', () => el.remove());
    holeEls[index].appendChild(el);
  }

  function describe(word) {
    if (word.lower) return `${word.en} ${word.lower} · ${word.emoji} ${word.example}`;
    return `${word.en} ${word.emoji} (${word.ko})`;
  }

  function setFeedback(text, kind) {
    const el = $('feedback');
    el.textContent = text;
    el.className = 'feedback ' + (kind || '');
  }

  // ── 엔진 이벤트 → 화면 ─────────────────
  function onEvent(type, p) {
    switch (type) {
      case 'start':
        resetHoles();
        $('prompt-label').textContent = round.review ? '📒 틀린 단어 복습' : '';
        $('prompt').textContent = '준비…';
        $('btn-replay').classList.add('hidden');
        setFeedback('');
        break;

      case 'question': {
        resetHoles();
        void board.offsetWidth; // 클래스 초기화를 먼저 반영해야 다시 솟아오르는 애니메이션이 나온다
        p.holes.forEach((mole, i) => {
          if (!mole) return;
          const sign = holeEls[i].querySelector('.sign');
          sign.textContent = mole.label;
          sign.classList.toggle('long', mole.label.length > 6);
          sign.classList.toggle('letter', mole.label.length === 1);
          holeEls[i].querySelector('.mole').style.transitionDelay = Math.round(Math.random() * 150) + 'ms';
          holeEls[i].classList.add('up');
        });
        const q = p.question;
        $('prompt-label').textContent = q.hint;
        $('prompt').textContent = q.prompt;
        $('btn-replay').classList.toggle('hidden', !q.speak);
        setFeedback('');
        if (q.speak) Speech.speak(q.speakText);
        break;
      }

      case 'hit': {
        const hole = holeEls[p.index];
        hole.classList.add('whacked');
        lowerOthers([p.index]);
        floatText(p.index, '+' + p.gained, 'good');
        const milestone = p.combo === 3 || p.combo % 5 === 0;
        (milestone ? Sfx.combo : Sfx.hit)();
        setFeedback('⭕ ' + describe(p.question.answer), 'good');
        if (!p.question.speak) Speech.speak(sayOf(p.question.answer));
        popCombo();
        break;
      }

      case 'wrong':
      case 'miss': {
        const answerIdx = p.question.answerIndex;
        holeEls[answerIdx].classList.add('reveal');
        if (type === 'wrong') {
          holeEls[p.index].classList.add('wrong');
          lowerOthers([answerIdx, p.index]);
          if (p.lost) floatText(p.index, '-' + p.lost, 'bad');
          board.classList.remove('shake');
          void board.offsetWidth;
          board.classList.add('shake');
          Sfx.wrong();
          setFeedback('❌ 정답은 ' + describe(p.question.answer), 'bad');
        } else {
          lowerOthers([answerIdx]);
          Sfx.miss();
          setFeedback('⏰ 정답은 ' + describe(p.question.answer), 'bad');
        }
        Speech.speak(sayOf(p.question.answer));
        break;
      }

      case 'pause':
        $('pause-overlay').classList.remove('hidden');
        Speech.stop();
        break;

      case 'resume':
        $('pause-overlay').classList.add('hidden');
        break;

      case 'complete':
        setFeedback(`🎉 끝까지 완주! 시간 보너스 +${p.bonus}`, 'good');
        break;

      case 'end':
        Sfx.end();
        showResult(p);
        break;
    }
  }

  function popCombo() {
    const el = $('hud-combo');
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  function renderHud() {
    $('hud-score').textContent = engine.score;
    $('hud-time').textContent = Math.ceil(engine.remaining);
    $('hud-combo').textContent = engine.combo >= 2 ? `🔥 ${engine.combo} 콤보` : '';
    const timeRatio = engine.remaining / engine.duration;
    $('timebar-fill').style.width = (timeRatio * 100) + '%';
    $('timebar-fill').classList.toggle('low', engine.remaining <= 10);
    const q = engine.question;
    const qRatio = q ? Math.max(0, engine.timeLeft / q.stay) : 0;
    $('qbar-fill').style.width = (qRatio * 100) + '%';
    $('qbar-fill').classList.toggle('low', qRatio < 0.35);
  }

  function frame(now) {
    if (!engine) return;
    const dt = Math.min(0.1, (now - lastFrame) / 1000); // 탭 전환 등으로 프레임이 끊겨도 시간이 튀지 않게
    lastFrame = now;
    engine.tick(dt);
    renderHud();
    if (engine.state !== 'ended') requestAnimationFrame(frame);
  }

  // ── 라운드 ───────────────────────────
  function roundConfig(review) {
    if (isAbc()) {
      const letters = lettersInRange(settings.range);
      const sequence = settings.abcMode === 'sequence';
      // 순서대로 모드의 복습은 틀린 글자만 알파벳 순서로 다시 친다
      const pool = review ? lastSummary.wrongWords.slice().sort((a, b) => a.order - b.order) : letters;
      return {
        words: letters,
        pool,
        mode: settings.abcMode,
        level: 'abc',
        duration: review ? REVIEW_SECONDS : (sequence ? SEQUENCE_SECONDS : ROUND_SECONDS),
      };
    }
    return {
      words: WORDS.filter((w) => w.level <= settings.level),
      pool: review ? lastSummary.wrongWords : WORDS.filter((w) => w.level === settings.level),
      mode: settings.mode,
      level: settings.level,
      duration: review ? REVIEW_SECONDS : ROUND_SECONDS,
    };
  }

  function startRound(review) {
    const cfg = roundConfig(review);
    round = { review, pool: cfg.pool };
    engine = new GameEngine(Object.assign(cfg, { progress, onEvent }));
    Sfx.unlock();
    $('pause-overlay').classList.add('hidden');
    showScreen('game');
    engine.start();
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  function quitRound() {
    if (engine) engine.state = 'ended';
    engine = null;
    Speech.stop();
    $('pause-overlay').classList.add('hidden');
    renderChoices();
    showScreen('menu');
  }

  // ── 결과 ─────────────────────────────
  function showResult(summary) {
    lastSummary = summary;
    const isBest = !round.review && summary.score > (best[bestKey()] || 0);
    if (isBest) {
      best[bestKey()] = summary.score;
      saveJson('hammerhit.best.v1', best);
    }

    $('result-title').textContent = summary.completed
      ? `🎉 완주! 시간 보너스 +${summary.bonus}`
      : (round.review ? '복습 완료!' : '라운드 종료!');
    $('result-score').textContent = summary.score;
    $('result-best').classList.toggle('hidden', !isBest);
    $('result-accuracy').textContent = Math.round(summary.accuracy * 100) + '%';
    $('result-correct').textContent = `${summary.correct}/${summary.total}`;
    $('result-combo').textContent = summary.maxCombo;

    const list = $('wrong-list');
    list.innerHTML = '';
    if (summary.wrongWords.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = summary.total ? '🎉 모두 맞혔어요!' : '문제를 하나도 풀지 않았어요.';
      list.appendChild(li);
    }
    summary.wrongWords.forEach((word) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="emoji"></span><span class="en"></span><span class="ko"></span>' +
        '<button class="say" aria-label="발음 듣기">🔊</button>';
      li.querySelector('.emoji').textContent = word.emoji;
      li.querySelector('.en').textContent = word.lower ? `${word.en} ${word.lower}` : word.en;
      li.querySelector('.ko').textContent = word.lower ? `${word.ko} · ${word.example}` : word.ko;
      li.querySelector('.say').addEventListener('click', () => Speech.speak(sayOf(word)));
      list.appendChild(li);
    });

    const reviewBtn = $('btn-review');
    reviewBtn.classList.toggle('hidden', summary.wrongWords.length === 0);
    reviewBtn.textContent = `틀린 단어 복습 (${summary.wrongWords.length}개)`;
    showScreen('result');
  }

  // ── 입력 ─────────────────────────────
  board.addEventListener('pointerdown', (e) => {
    const hole = e.target.closest('.hole');
    if (!hole || !engine) return;
    e.preventDefault();
    engine.hit(Number(hole.dataset.index));
  });

  document.addEventListener('keydown', (e) => {
    if (!engine || engine.state === 'ended') return;
    if (e.key in KEYMAP) {
      engine.hit(KEYMAP[e.key]);
    } else if (e.key === ' ') {
      e.preventDefault();
      if (engine.question && engine.question.speak) Speech.speak(engine.question.speakText);
    } else if (e.key === 'Escape') {
      engine.state === 'paused' ? engine.resume() : engine.pause();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && engine) engine.pause();
  });

  function applyMute() {
    window.HH.setMuted(settings.muted);
    $('btn-mute').textContent = settings.muted ? '🔇' : '🔈';
  }

  $('btn-start').addEventListener('click', () => startRound(false));
  $('btn-again').addEventListener('click', () => startRound(false));
  $('btn-review').addEventListener('click', () => startRound(true));
  $('btn-menu').addEventListener('click', quitRound);
  $('btn-pause').addEventListener('click', () => engine && engine.pause());
  $('btn-resume').addEventListener('click', () => engine && engine.resume());
  $('btn-quit').addEventListener('click', quitRound);
  $('btn-replay').addEventListener('click', () => {
    if (engine && engine.question && engine.question.speak) Speech.speak(engine.question.speakText);
  });
  $('btn-mute').addEventListener('click', () => {
    settings.muted = !settings.muted;
    saveJson('hammerhit.settings.v1', settings);
    applyMute();
  });

  applyMute();
  renderChoices();
})();
