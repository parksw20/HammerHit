// 효과음(WebAudio 합성 → 음원 파일 불필요)과 영어 발음(TTS).
(function (root) {
  let ctx = null;
  let muted = false;

  function audioCtx() {
    if (!ctx) {
      const Ctx = root.AudioContext || root.webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freqs, duration, type, volume) {
    const ac = !muted && audioCtx();
    if (!ac) return;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || 'sine';
    const step = duration / freqs.length;
    freqs.forEach((f, i) => osc.frequency.setValueAtTime(f, now + i * step));
    gain.gain.setValueAtTime(volume || 0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(ac.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  const Sfx = {
    hit: () => tone([660, 990], 0.18, 'square', 0.12),
    combo: () => tone([660, 880, 1320], 0.3, 'triangle', 0.15),
    wrong: () => tone([200, 140], 0.3, 'sawtooth', 0.12),
    miss: () => tone([440, 330], 0.25, 'sine', 0.12),
    end: () => tone([523, 659, 784, 1047], 0.6, 'triangle', 0.15),
    unlock: () => audioCtx(),
  };

  const synth = root.speechSynthesis || null;
  let voice = null;
  function pickVoice() {
    if (!synth) return;
    const voices = synth.getVoices();
    voice = voices.find((v) => v.lang === 'en-US') ||
      voices.find((v) => v.lang && v.lang.startsWith('en')) || null;
  }
  if (synth) {
    pickVoice();
    if ('onvoiceschanged' in synth) synth.onvoiceschanged = pickVoice;
  }

  const Speech = {
    available: !!(synth && root.SpeechSynthesisUtterance),
    speak(text) {
      if (!Speech.available || muted) return;
      synth.cancel();
      const u = new root.SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.85;
      if (voice) u.voice = voice;
      synth.speak(u);
    },
    stop() { if (synth) synth.cancel(); },
  };

  root.HH = root.HH || {};
  root.HH.Sfx = Sfx;
  root.HH.Speech = Speech;
  root.HH.setMuted = (value) => { muted = value; if (value) Speech.stop(); };
  root.HH.isMuted = () => muted;
})(window);
