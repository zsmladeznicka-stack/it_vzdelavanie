/**
 * Backend kurzu pre učiteľov – Google Apps Script naviazaný na Google tabuľku.
 * Tabuľka slúži zároveň ako administrácia: videá, otázky, priebeh učiteľov, osvedčenia.
 * Postup nasadenia je v README.md.
 */
const CONFIG = {
  CLIENT_ID: '360446448624-q4u3huhlgho4ce4taptuofp0e4dveujp.apps.googleusercontent.com',
  DOMAIN: 'koharysuli.sk',
  SCHOOL_NAME: 'Základná škola Štefana Koháriho II. s VJM - II. Koháry István Alapiskola',
  COURSE_NAME: 'Zvýšenie digitálnych zručností pedagogických a odborných zamestnancov',
  COURSE_HOURS: 10, // rozsah vzdelávania uvedený na osvedčení
  CERT_PREFIX: 'OSV',
  // Účty, ktoré si môžu zapnúť testovací režim (god mode)
  ADMINS: ['fazekas.csaba@koharysuli.sk'],
  PASS_PERCENT: 80,
  WATCH_PERCENT: 98, // koľko percent videa treba pozrieť, aby sa odomkol test
  HOURS_LIMIT: 24, // celý kurz treba dokončiť do tohto počtu hodín od prvého prihlásenia
};

const SHEET = { VIDEOS: 'Videa', QUESTIONS: 'Otazky', PROGRESS: 'Priebeh', CERTS: 'Osvedcenia', USERS: 'Ucastnici', SETTINGS: 'Nastavenia' };

// Stĺpce hárku Priebeh (jeden riadok = jeden učiteľ × jedno video)
const P = { EMAIL: 0, NAME: 1, VIDEO: 2, WATCHED: 3, DURATION: 4, DONE: 5, BEAT: 6, QUIZ_START: 7, TRIES: 8, BEST: 9, PASSED: 10, PASSED_AT: 11 };
const PROGRESS_HEADER = ['E-mail', 'Meno', 'Video', 'Pozreté (s)', 'Dĺžka (s)', 'Video dopozerané', 'Posledný záznam',
  'Test spustený', 'Pokusy', 'Najlepšie skóre (%)', 'Test splnený', 'Splnené dňa'];

const SESSION_SECONDS = 6 * 3600; // maximum CacheService

/** Spustite raz ručne z editora – vytvorí hárky s ukážkovými údajmi. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  const make = (name, header, rows) => {
    if (ss.getSheetByName(name)) return;
    const sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    if (name === SHEET.VIDEOS) sh.getRange('C:C').setNumberFormat('@'); // YouTube ID ako text
    if (rows && rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  };
  make(SHEET.VIDEOS, ['Poradie', 'Názov', 'YouTube ID', 'Dĺžka (sekundy)'], [
    [1, 'Vitajte v spleti sociálnych sietí', '8Y-4Xv8t68M', 4440],
    [2, 'Úvod do informačnej bezpečnosti', '1W2Una0nT1U', 3500],
    [3, 'Nástroje Canvy využívajúce umelú inteligenciu', 'OAN3jZFkdfk', 4457],
    [4, 'Využitie QR kódov a rozšírenej reality vo vyučovaní', 'Ye0Ed6noRGI', 3510],
    [5, 'Kolaborácia žiakov na digitálnych boardoch počas a mimo vyučovania', 'GdD_emxfcWM', 3576],
  ]);
  const q = [];
  for (let v = 1; v <= 5; v++) {
    q.push([v, 'Ukážková otázka 1 k videu ' + v, 'Správna odpoveď', 'Nesprávna', 'Nesprávna', 'Nesprávna', 'A']);
    q.push([v, 'Ukážková otázka 2 k videu ' + v, 'Nesprávna', 'Správna odpoveď', 'Nesprávna', '', 'B']);
  }
  make(SHEET.QUESTIONS, ['Video', 'Otázka', 'A', 'B', 'C', 'D', 'Správna (A–D)'], q);
  make(SHEET.PROGRESS, PROGRESS_HEADER);
  make(SHEET.CERTS, ['Číslo', 'E-mail', 'Meno', 'Dátum vydania']);
  make(SHEET.USERS, ['E-mail', 'Meno', 'Prvé prihlásenie', 'Termín ukončenia']);
  make(SHEET.SETTINGS, ['Nastavenie', 'Hodnota'], [['Vzdelávanie aktívne', 1]]);
}

function doGet() {
  return ContentService.createTextOutput('Kurz API beží.');
}

function doPost(e) {
  let out;
  try {
    out = handle_(JSON.parse(e.postData.contents));
  } catch (err) {
    out = { error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(req) {
  if (req.action === 'login') return login_(req.idToken);
  const user = getSession_(req.session);
  if (!user) return { error: 'SESSION_EXPIRED' };
  if (req.action === 'state') return state_(user);
  if (req.action === 'certificate') return withLock_(() => certificate_(user)); // splnený kurz platí aj po termíne
  if (String(req.action).indexOf('god') === 0) {
    if (!isAdmin_(user)) return { error: 'Nemáte oprávnenie.' };
    return withLock_(() => god_(user, req));
  }
  if (!courseOpen_(user)) return { error: 'INACTIVE' };
  if (Date.now() > deadline_(user)) return { error: 'DEADLINE' };
  switch (req.action) {
    case 'heartbeat': return withLock_(() => heartbeat_(user, Number(req.video), Number(req.position)));
    case 'quiz': return withLock_(() => startQuiz_(user, Number(req.video)));
    case 'submit': return withLock_(() => submitQuiz_(user, Number(req.video), req.answers));
  }
  return { error: 'Neznáma akcia.' };
}

// ---------- Prihlásenie ----------

function login_(idToken) {
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken || ''),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { error: 'Prihlásenie sa nepodarilo overiť.' };
  const t = JSON.parse(res.getContentText());
  if (t.aud !== CONFIG.CLIENT_ID) return { error: 'Prihlásenie nepatrí tejto aplikácii.' };
  if (t.hd !== CONFIG.DOMAIN || String(t.email_verified) !== 'true') {
    return { error: 'Prihláste sa školským účtom @' + CONFIG.DOMAIN + '.' };
  }
  const user = { email: String(t.email).toLowerCase(), name: t.name || t.email };
  const session = Utilities.getUuid();
  CacheService.getScriptCache().put('s_' + session, JSON.stringify(user), SESSION_SECONDS);
  if (courseOpen_(user)) withLock_(() => deadline_(user));
  return Object.assign({ session: session }, state_(user));
}

/**
 * Termín ukončenia kurzu (ms). Pri prvom prihlásení do aktívneho vzdelávania sa učiteľ
 * zapíše do hárku Ucastnici. S create = false sa nič nezapisuje a bez záznamu vráti null.
 */
function deadline_(user, create) {
  const row = rows_(SHEET.USERS).find(r => String(r[0]).toLowerCase() === user.email);
  if (row && row[3] instanceof Date) return row[3].getTime();
  if (create === false) return null;
  const first = new Date();
  const deadline = new Date(first.getTime() + CONFIG.HOURS_LIMIT * 3600 * 1000);
  sheet_(SHEET.USERS).appendRow([user.email, user.name, first, deadline]);
  return deadline.getTime();
}

function getSession_(session) {
  if (!session) return null;
  const cache = CacheService.getScriptCache();
  const raw = cache.get('s_' + session);
  if (!raw) return null;
  cache.put('s_' + session, raw, SESSION_SECONDS); // predĺženie pri aktivite
  return JSON.parse(raw);
}

// ---------- Údaje ----------

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Chýba hárok „' + name + '“. Spustite funkciu setup.');
  return sh;
}

function rows_(name) {
  const v = sheet_(name).getDataRange().getValues();
  v.shift();
  return v;
}

function videos_() {
  return rows_(SHEET.VIDEOS)
    .filter(r => r[0] !== '' && String(r[2]).trim())
    .map(r => ({ order: Number(r[0]), title: String(r[1]), youtubeId: String(r[2]).trim(), duration: Number(r[3]) || 0 }))
    .sort((a, b) => a.order - b.order);
}

function questions_(order) {
  return rows_(SHEET.QUESTIONS)
    .filter(r => Number(r[0]) === order && String(r[1]).trim())
    .map(r => ({
      text: String(r[1]),
      options: [r[2], r[3], r[4], r[5]].map(String).filter(s => s.trim() !== ''),
      correct: 'ABCD'.indexOf(String(r[6]).trim().toUpperCase()),
    }));
}

function progress_(user) {
  const data = sheet_(SHEET.PROGRESS).getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][P.EMAIL]).toLowerCase() === user.email) map[Number(data[i][P.VIDEO])] = { row: i + 1, v: data[i] };
  }
  return map;
}

function ensureRow_(user, video, map) {
  if (map[video.order]) return map[video.order];
  const sh = sheet_(SHEET.PROGRESS);
  const v = [user.email, user.name, video.order, 0, video.duration, false, '', '', 0, 0, false, ''];
  sh.appendRow(v);
  return (map[video.order] = { row: sh.getLastRow(), v: v });
}

function save_(rec) {
  sheet_(SHEET.PROGRESS).getRange(rec.row, 1, 1, rec.v.length).setValues([rec.v]);
}

function ms_(value) {
  return value instanceof Date ? value.getTime() : 0;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Video i je dostupné, len ak sú splnené testy všetkých predchádzajúcich videí. */
function requireUnlocked_(vids, map, i) {
  if (!vids[i]) throw new Error('Neznáme video.');
  for (let k = 0; k < i; k++) {
    const r = map[vids[k].order];
    if (!r || r.v[P.PASSED] !== true) throw new Error('Najprv dokončite predchádzajúce video a test.');
  }
}

function state_(user) {
  const map = progress_(user);
  const videos = videos_().map(v => {
    const r = map[v.order];
    return {
      title: v.title,
      youtubeId: v.youtubeId,
      duration: v.duration,
      watched: r ? Number(r.v[P.WATCHED]) || 0 : 0,
      videoDone: r ? r.v[P.DONE] === true : false,
      quizPassed: r ? r.v[P.PASSED] === true : false,
      best: r ? Number(r.v[P.BEST]) || 0 : 0,
      tries: r ? Number(r.v[P.TRIES]) || 0 : 0,
    };
  });
  return {
    user: user,
    school: CONFIG.SCHOOL_NAME,
    course: CONFIG.COURSE_NAME,
    courseHours: CONFIG.COURSE_HOURS,
    passPercent: CONFIG.PASS_PERCENT,
    watchPercent: CONFIG.WATCH_PERCENT,
    hoursLimit: CONFIG.HOURS_LIMIT,
    active: isActive_(),
    canStart: courseOpen_(user),
    deadline: deadline_(user, courseOpen_(user)),
    now: Date.now(),
    videos: videos,
    certificate: findCert_(user.email),
  };
}

// ---------- Video ----------

/**
 * Priebežný záznam pozretia. Server prijme posun len o toľko, koľko reálneho času
 * uplynulo od posledného záznamu – video sa tak nedá „dopozerať“ rýchlejšie.
 */
function heartbeat_(user, i, position) {
  const vids = videos_();
  const map = progress_(user);
  requireUnlocked_(vids, map, i);
  const video = vids[i];
  const rec = ensureRow_(user, video, map);
  const now = Date.now();
  const last = ms_(rec.v[P.BEAT]);
  const watched = Number(rec.v[P.WATCHED]) || 0;
  const elapsed = last ? Math.min((now - last) / 1000, 300) : 10;
  const allowed = watched + elapsed * 1.1 + 5;
  const pos = Math.max(0, Math.min(position || 0, allowed, video.duration));
  if (pos > watched) rec.v[P.WATCHED] = Math.round(pos);
  rec.v[P.BEAT] = new Date(now);
  if (Number(rec.v[P.WATCHED]) >= video.duration * CONFIG.WATCH_PERCENT / 100) rec.v[P.DONE] = true;
  save_(rec);
  return { watched: Number(rec.v[P.WATCHED]), videoDone: rec.v[P.DONE] === true };
}

// ---------- Test ----------

function startQuiz_(user, i) {
  const vids = videos_();
  const map = progress_(user);
  requireUnlocked_(vids, map, i);
  const rec = map[vids[i].order];
  if (!rec || rec.v[P.DONE] !== true) throw new Error('Najprv dopozerajte video.');
  if (rec.v[P.PASSED] === true) throw new Error('Tento test už máte splnený.');
  rec.v[P.QUIZ_START] = new Date();
  save_(rec);
  return { questions: questions_(vids[i].order).map(q => ({ text: q.text, options: q.options })) };
}

function submitQuiz_(user, i, answers) {
  const vids = videos_();
  const map = progress_(user);
  requireUnlocked_(vids, map, i);
  const rec = map[vids[i].order];
  const start = rec && ms_(rec.v[P.QUIZ_START]);
  if (!start) throw new Error('Test nebol spustený.');
  answers = Array.isArray(answers) ? answers : [];

  const qs = questions_(vids[i].order);
  let correct = 0;
  qs.forEach((q, k) => { if (Number(answers[k]) === q.correct) correct++; });
  const score = qs.length ? Math.round(correct / qs.length * 100) : 100;
  const passed = score >= CONFIG.PASS_PERCENT;

  rec.v[P.QUIZ_START] = '';
  rec.v[P.TRIES] = (Number(rec.v[P.TRIES]) || 0) + 1;
  rec.v[P.BEST] = Math.max(score, Number(rec.v[P.BEST]) || 0);
  if (passed) {
    rec.v[P.PASSED] = true;
    rec.v[P.PASSED_AT] = new Date();
  }
  save_(rec);
  return { score: score, correct: correct, total: qs.length, passed: passed };
}

// ---------- Nastavenia ----------

/** Hodnota z hárku Nastavenia podľa názvu v stĺpci A (bez ohľadu na veľké písmená). */
function setting_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET.SETTINGS);
  if (!sh) return null;
  const row = sh.getDataRange().getValues().find(r => String(r[0]).trim().toLowerCase() === name.toLowerCase());
  return row ? row[1] : null;
}

/** Vzdelávanie je aktívne, ak je v Nastaveniach 1 (bez hárku sa berie ako aktívne). */
function isActive_() {
  const v = setting_('Vzdelávanie aktívne');
  return v === null || v === '' || v === true || String(v).trim() === '1';
}

/** Administrátori môžu aplikáciu používať aj pri neaktívnom vzdelávaní (testovanie). */
function courseOpen_(user) {
  return isActive_() || isAdmin_(user);
}

// ---------- Testovací režim (god mode) ----------

function isAdmin_(user) {
  return CONFIG.ADMINS.some(e => String(e).toLowerCase() === user.email);
}

function god_(user, req) {
  const vids = videos_();
  const map = progress_(user);
  const i = Number(req.video);
  switch (req.action) {
    case 'godmode':
      return { ok: true };
    case 'godSkipVideo': {
      if (!vids[i]) throw new Error('Neznáme video.');
      const rec = ensureRow_(user, vids[i], map);
      rec.v[P.WATCHED] = vids[i].duration;
      rec.v[P.DONE] = true;
      save_(rec);
      return state_(user);
    }
    case 'godPassQuiz': {
      if (!vids[i]) throw new Error('Neznáme video.');
      const rec = ensureRow_(user, vids[i], map);
      rec.v[P.WATCHED] = vids[i].duration;
      rec.v[P.DONE] = true;
      rec.v[P.PASSED] = true;
      rec.v[P.BEST] = 100;
      rec.v[P.PASSED_AT] = new Date();
      save_(rec);
      return state_(user);
    }
    case 'godAnswers':
      if (!vids[i]) throw new Error('Neznáme video.');
      return { correct: questions_(vids[i].order).map(q => q.correct) };
    case 'godReset':
      deleteUserRows_(SHEET.PROGRESS, 0, user.email);
      deleteUserRows_(SHEET.USERS, 0, user.email);
      deleteUserRows_(SHEET.CERTS, 1, user.email);
      return state_(user); // vytvorí nový 24-hodinový termín
  }
  return { error: 'Neznáma akcia.' };
}

function deleteUserRows_(name, col, email) {
  const sh = sheet_(name);
  const data = sh.getDataRange().getValues();
  for (let r = data.length - 1; r >= 1; r--) {
    if (String(data[r][col]).toLowerCase() === email) sh.deleteRow(r + 1);
  }
}

// ---------- Osvedčenie ----------

function findCert_(email) {
  const row = rows_(SHEET.CERTS).find(r => String(r[1]).toLowerCase() === email);
  if (!row) return null;
  return { id: String(row[0]), name: String(row[2]), date: formatDate_(row[3]) };
}

function certificate_(user) {
  const vids = videos_();
  const map = progress_(user);
  const done = vids.length && vids.every(v => map[v.order] && map[v.order].v[P.PASSED] === true);
  if (!done) throw new Error('Kurz ešte nie je dokončený.');
  let cert = findCert_(user.email);
  if (!cert) {
    const sh = sheet_(SHEET.CERTS);
    const now = new Date();
    const last = rows_(SHEET.CERTS).reduce((m, r) => Math.max(m, Number(String(r[0]).split('-').pop()) || 0), 0);
    const id = CONFIG.CERT_PREFIX + '-' + now.getFullYear() + '-' + String(last + 1).padStart(4, '0');
    sh.appendRow([id, user.email, user.name, now]);
    cert = { id: id, name: user.name, date: formatDate_(now) };
  }
  return { certificate: cert };
}

function formatDate_(d) {
  return d instanceof Date ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'd. M. yyyy') : String(d);
}
