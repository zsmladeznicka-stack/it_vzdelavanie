// Ukážkový režim: napodobňuje backend (apps-script/Code.gs) v prehliadači,
// aby sa dala aplikácia vyskúšať bez nastavenia Google služieb.
// Videá sa v ukážke rátajú ako dopozerané po 60 sekundách.
window.DemoApi = (() => {
  const VIDEOS = [
    { title: 'Vitajte v spleti sociálnych sietí', youtubeId: '8Y-4Xv8t68M', duration: 4440 },
    { title: 'Úvod do informačnej bezpečnosti', youtubeId: '1W2Una0nT1U', duration: 3500 },
    { title: 'Nástroje Canvy využívajúce umelú inteligenciu', youtubeId: 'OAN3jZFkdfk', duration: 4457 },
    { title: 'Využitie QR kódov a rozšírenej reality vo vyučovaní', youtubeId: 'Ye0Ed6noRGI', duration: 3510 },
    { title: 'Kolaborácia žiakov na digitálnych boardoch počas a mimo vyučovania', youtubeId: 'GdD_emxfcWM', duration: 3576 },
  ];
  const DEMO_WATCH_SECONDS = 60; // v ukážke sa video ráta ako dopozerané po 1 minúte
  const QUESTIONS = VIDEOS.map((v, i) => [
    { text: `Ukážková otázka 1 k videu ${i + 1}: ktorá odpoveď je správna?`, options: ['Táto', 'Nie táto', 'Ani táto'], correct: 0 },
    { text: `Ukážková otázka 2 k videu ${i + 1}: koľko je 2 + 2?`, options: ['3', '4', '5', '22'], correct: 1 },
  ]);
  const KEY = 'kurz-demo-v2';
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
    school: 'Základná škola Štefana Koháriho II. s VJM - II. Koháry István Alapiskola',
    course: 'Zvýšenie digitálnych zručností pedagogických a odborných zamestnancov',
    courseHours: 10,
    passPercent: 80,
    watchPercent: 98,
    active: true,
    canStart: true,
    admin: true, // v ukážke sa čas konca nevynucuje
    closeAt: new Date().setHours(17, 0, 0, 0),
    closeLabel: '17:00',
    estimateHours: 7,
    now: Date.now(),
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
      p.watched = Math.max(p.watched, Math.min(d.position, VIDEOS[d.video].duration));
      if (p.watched >= DEMO_WATCH_SECONDS) p.videoDone = true;
      return { watched: p.watched, videoDone: p.videoDone };
    },
    quiz(db, d) {
      const p = unlocked(db, d.video);
      if (!p.videoDone) throw new Error('Najprv dopozerajte video.');
      return { questions: QUESTIONS[d.video].map(q => ({ text: q.text, options: q.options })) };
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
      return { score, correct, total: qs.length, passed };
    },
    godmode: () => ({ ok: true }),
    godSkipVideo(db, d) {
      Object.assign(db.progress[d.video], { watched: VIDEOS[d.video].duration, videoDone: true });
      return state(db);
    },
    godPassQuiz(db, d) {
      Object.assign(db.progress[d.video], { watched: VIDEOS[d.video].duration, videoDone: true, quizPassed: true, best: 100 });
      return state(db);
    },
    godAnswers: (db, d) => ({ correct: QUESTIONS[d.video].map(q => q.correct) }),
    godReset(db) {
      db.progress = VIDEOS.map(() => ({ watched: 0, videoDone: false, quizPassed: false, best: 0, tries: 0 }));
      db.cert = null;
      return state(db);
    },
    certificate(db) {
      if (!db.progress.every(p => p.quizPassed)) throw new Error('Kurz ešte nie je dokončený.');
      if (!db.cert) {
        const now = new Date();
        db.cert = {
          id: 'OSV-DEMO-0001', name: db.user.name, date: now.toLocaleDateString('sk-SK'),
          completed: now.toLocaleDateString('sk-SK') + ' o ' + now.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' }),
        };
      }
      return { certificate: db.cert };
    },
  };

  return {
    call(action, data) {
      return new Promise((resolve) => {
        setTimeout(() => {
          try {
            const db = load();
            const out = actions[action](db, data || {});
            save(db);
            resolve(JSON.parse(JSON.stringify(out)));
          } catch (e) {
            resolve({ error: e.message });
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
