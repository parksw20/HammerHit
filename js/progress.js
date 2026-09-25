// 단어별 학습 기록 (숙련도 0~5). 저장소가 막혀 있어도 게임은 계속 동작해야 한다.
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.HH = root.HH || {}; Object.assign(root.HH, mod); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX_MASTERY = 5;
  const EMPTY = { seen: 0, correct: 0, mastery: 0, lastSeen: 0 };

  class Progress {
    constructor(storage, key) {
      this.storage = storage || null;
      this.key = key || 'hammerhit.progress.v1';
      this.data = this.load();
    }

    load() {
      try {
        const raw = this.storage && this.storage.getItem(this.key);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch (e) {
        return {};
      }
    }

    save() {
      try {
        if (this.storage) this.storage.setItem(this.key, JSON.stringify(this.data));
      } catch (e) { /* 저장 실패는 무시: 이번 세션 동안은 메모리에 유지 */ }
    }

    get(id) {
      return Object.assign({}, EMPTY, this.data[id]);
    }

    mastery(id) {
      return this.get(id).mastery;
    }

    // 맞히면 +1, 틀리면 -2: 틀린 단어가 빨리 다시 자주 나오도록
    record(id, correct, now) {
      const entry = this.get(id);
      entry.seen += 1;
      if (correct) entry.correct += 1;
      entry.mastery = Math.max(0, Math.min(MAX_MASTERY, entry.mastery + (correct ? 1 : -2)));
      entry.lastSeen = now || Date.now();
      this.data[id] = entry;
      this.save();
      return entry;
    }

    masteredCount(ids) {
      return ids.filter((id) => this.mastery(id) >= MAX_MASTERY).length;
    }

    reset() {
      this.data = {};
      this.save();
    }
  }

  return { Progress, MAX_MASTERY };
});
