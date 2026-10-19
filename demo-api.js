// Ukážkový režim: napodobňuje backend (apps-script/Code.gs) v prehliadači,
// aby sa dala aplikácia vyskúšať bez nastavenia Google služieb.
// Ukážkové videá sa rátajú ako dopozerané po 60 sekundách.
window.DemoApi = (() => {
  const VIDEOS = [
    { title: 'Ukážkové video 1', youtubeId: 'aqz-KE-bpKQ', duration: 60 },
    { title: 'Ukážkové video 2', youtubeId: 'aqz-KE-bpKQ', duration: 60 },
    { title: 'Ukážkové video 3', youtubeId: 'aqz-KE-bpKQ', duration: 60 },
  ];
  const QUESTIONS = VIDEOS.map((v, i) => [
    { text: `Ukážková otázka 1 k videu ${i + 1}: ktorá odpoveď je správna?`, options: ['Táto', 'Nie táto', 'Ani táto'], correct: 0 },
    { text: `Ukážková otázka 2 k videu ${i + 1}: koľko je 2 + 2?`, options: ['3', '4', '5', '22'], correct: 1 },
  ]);
  const KEY = 'kurz-demo';
  let memory = null;

  const load = () => {
    try { memory = JSON.parse(localStorage.getItem(KEY)) || memory; } catch (e) { /* bez úložiska */ }
    return memory || { user: null, progress: VIDEOS.map(() => ({ watched: 0, videoDone: false, quizPassed: false, best: 0, tries: 0 })), cert: null };
  };
  const save = (db) => {
    memory = db;
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* bez úložiska */ }
  };

  const state = (db) => ({
    user: db.user,
    school: 'Názov školy',
    course: 'Ukážkové vzdelávanie',
    passPercent: 80,
    quizMinutes: 10,
    videos: VIDEOS.map((v, i) => Object.assign({}, v, db.progress[i])),
    certificate: db.cert,
  });

  const unlocked = (db, i) => {
    if (!VIDEOS[i]) throw new Error('Neznáme video.');
    for (let k = 0; k < i; k++) if (!db.progress[k].quizPassed) throw new Error('Najprv dokončite predchádzajúce video a test.');
    return db.progress[i];
  };

  const actions = {
    login(db, d) {
      db.user = { email: 'ucitel@koharysuli.sk', name: d.name || 'Ukážkový učiteľ' };
      return Object.assign({ session: 'demo' }, state(db));
    },
    state: (db) => state(db),
    heartbeat(db, d) {
      const p = unlocked(db, d.video);
      const dur = VIDEOS[d.video].duration;
      p.watched = Math.max(p.watched, Math.min(d.position, dur));
      if (p.watched >= dur) p.videoDone = true;
      return { watched: p.watched, videoDone: p.videoDone };
    },
    quiz(db, d) {
      const p = unlocked(db, d.video);
      if (!p.videoDone) throw new Error('Najprv dopozerajte video.');
      return { questions: QUESTIONS[d.video].map(q => ({ text: q.text, options: q.options })), seconds: 600 };
    },
    submit(db, d) {
      const p = unlocked(db, d.video);
      const qs = QUESTIONS[d.video];
      const correct = qs.filter((q, k) => d.answers[k] === q.correct).length;
      const score = Math.round(correct / qs.length * 100);
      const passed = score >= 80;
      p.tries++;
      p.best = Math.max(p.best, score);
      if (passed) p.quizPassed = true;
      return { score, correct, total: qs.length, passed, late: false };
    },
    certificate(db) {
      if (!db.progress.every(p => p.quizPassed)) throw new Error('Kurz ešte nie je dokončený.');
      if (!db.cert) db.cert = { id: 'OSV-DEMO-0001', name: db.user.name, date: new Date().toLocaleDateString('sk-SK') };
      return { certificate: db.cert };
    },
  };

  return {
    call(action, data) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            const db = load();
            const out = actions[action](db, data || {});
            save(db);
            resolve(JSON.parse(JSON.stringify(out)));
          } catch (e) {
            reject(e);
          }
        }, 150);
      });
    },
    reset() {
      memory = null;
      try { localStorage.removeItem(KEY); } catch (e) { /* bez úložiska */ }
    },
  };
})();
