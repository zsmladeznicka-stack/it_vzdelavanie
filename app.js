(() => {
  'use strict';

  const CFG = window.APP_CONFIG;
  const DEMO = !CFG.API_URL;
  const $ = (s) => document.querySelector(s);
  const VIEWS = ['loading', 'login', 'home', 'video', 'quiz', 'result', 'cert'];
  const YT_PLAYING = 1, YT_PAUSED = 2, YT_ENDED = 0, YT_BUFFERING = 3;
  const HEARTBEAT_MS = 20000;

  let session = store('session');
  let state = null;

  // ---------- Pomocné ----------

  function store(key, value) {
    try {
      if (value === undefined) return sessionStorage.getItem('kurz-' + key);
      if (value === null) sessionStorage.removeItem('kurz-' + key);
      else sessionStorage.setItem('kurz-' + key, value);
    } catch (e) { /* úložisko nedostupné */ }
    return null;
  }

  function show(view) {
    VIEWS.forEach((v) => { $('#view-' + v).hidden = v !== view; });
    window.scrollTo(0, 0);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
    const mm = h ? String(m).padStart(2, '0') : m;
    return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
  }

  function fmtLong(sec) {
    const h = Math.floor(sec / 3600), m = Math.round(sec / 60) % 60;
    return (h ? h + ' h ' : '') + m + ' min';
  }

  function showError(msg) {
    const el = $('#error');
    el.textContent = msg || '';
    el.hidden = !msg;
  }

  async function api(action, data) {
    let out;
    if (DEMO) {
      out = await window.DemoApi.call(action, data);
    } else {
      const res = await fetch(CFG.API_URL, {
        method: 'POST',
        body: JSON.stringify(Object.assign({ action: action, session: session }, data)),
      });
      out = await res.json();
    }
    if (out.error === 'SESSION_EXPIRED') {
      logout('Platnosť prihlásenia vypršala. Prihláste sa znova – váš priebeh je uložený.');
      throw new Error('Platnosť prihlásenia vypršala.');
    }
    if (out.error) throw new Error(out.error);
    return out;
  }

  // ---------- Prihlásenie ----------

  function initLogin() {
    $('#login-domain').textContent = '@' + CFG.DOMAIN;
    if (DEMO) {
      $('#demo-login').hidden = false;
      $('#demo-login').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          onLogin(await api('login', { name: $('#demo-name').value.trim() }));
        } catch (err) {
          $('#login-msg').textContent = err.message;
        }
      });
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      google.accounts.id.initialize({
        client_id: CFG.GOOGLE_CLIENT_ID,
        hd: CFG.DOMAIN,
        auto_select: true,
        callback: async (resp) => {
          $('#login-msg').textContent = 'Overujem prihlásenie…';
          try {
            onLogin(await api('login', { idToken: resp.credential }));
          } catch (err) {
            $('#login-msg').textContent = err.message;
          }
        },
      });
      google.accounts.id.renderButton($('#gsi-button'), { theme: 'filled_blue', size: 'large', text: 'signin_with', locale: 'sk' });
    };
    document.head.appendChild(s);
  }

  function onLogin(r) {
    session = r.session;
    store('session', session);
    $('#login-msg').textContent = '';
    setState(r);
    renderHome();
  }

  function logout(msg) {
    closePlayer();
    session = null;
    state = null;
    store('session', null);
    if (!DEMO && window.google) google.accounts.id.disableAutoSelect();
    $('#user-box').hidden = true;
    $('#login-msg').textContent = msg || '';
    show('login');
  }

  function setState(r) {
    state = {
      user: r.user, school: r.school, course: r.course, passPercent: r.passPercent,
      quizMinutes: r.quizMinutes, videos: r.videos, certificate: r.certificate,
    };
    $('#course-name').textContent = state.course;
    document.title = state.course;
    $('#user-name').textContent = state.user.name;
    $('#user-box').hidden = false;
  }

  // ---------- Prehľad ----------

  function currentIndex() {
    return state.videos.findIndex((v) => !v.quizPassed); // -1 = všetko splnené
  }

  function renderHome() {
    showError('');
    const cur = currentIndex();
    $('#hello-name').textContent = state.user.name;
    const icon = (cls, n) => `<span class="icon">${cls === 'done' ? '✓' : n}</span>`;
    let html = '';
    let n = 1;
    state.videos.forEach((v, i) => {
      const vCls = v.videoDone ? 'done' : i === cur ? 'current' : '';
      const progress = !v.videoDone && v.watched > 0 ? ` · pozreté ${fmt(v.watched)}` : '';
      html += `<li class="${vCls}">${icon(vCls, n++)}<span>Video ${i + 1}: ${esc(v.title)}
        <span class="sub">${fmt(v.duration)}${progress}</span></span></li>`;
      const qCls = v.quizPassed ? 'done' : i === cur && v.videoDone ? 'current' : '';
      const qSub = v.quizPassed ? `splnený (${v.best} %)` : v.tries ? `pokusy: ${v.tries}, najlepšie ${v.best} %` : `${state.quizMinutes} min, potrebných ${state.passPercent} %`;
      html += `<li class="${qCls}">${icon(qCls, n++)}<span>Test k videu ${i + 1}<span class="sub">${qSub}</span></span></li>`;
    });
    const cCls = state.certificate ? 'done' : cur === -1 ? 'current' : '';
    html += `<li class="${cCls}">${icon(cCls, n)}<span>Osvedčenie</span></li>`;
    $('#steps').innerHTML = html;

    const btn = $('#next-action');
    if (cur === -1) {
      btn.textContent = 'Zobraziť osvedčenie';
      btn.onclick = openCert;
    } else if (state.videos[cur].videoDone) {
      btn.textContent = `Spustiť test k videu ${cur + 1}`;
      btn.onclick = () => openQuiz(cur);
    } else {
      btn.textContent = state.videos[cur].watched > 0 ? `Pokračovať vo videu ${cur + 1}` : `Spustiť video ${cur + 1}`;
      btn.onclick = () => openVideo(cur);
    }
    show('home');
  }

  // ---------- Video ----------

  const ytApi = new Promise((resolve) => { window.onYouTubeIframeAPIReady = resolve; });
  let player = null, tick = null, vIndex = -1, maxWatched = 0, lastBeatAt = 0, beatBusy = false, beatAgain = false;

  function loadYouTube() {
    if (document.querySelector('script[src*="youtube.com/iframe_api"]')) return;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  }

  function setNotice(msg, kind) {
    const el = $('#video-notice');
    el.textContent = msg || '';
    el.className = 'banner' + (kind ? ' ' + kind : '');
    el.hidden = !msg;
  }

  function isPlaying() {
    const s = player && player.getPlayerState ? player.getPlayerState() : -1;
    return s === YT_PLAYING || s === YT_BUFFERING;
  }

  async function openVideo(i) {
    loadYouTube();
    closePlayer();
    vIndex = i;
    const v = state.videos[i];
    maxWatched = v.watched;
    $('#video-title').textContent = `Video ${i + 1}: ${v.title}`;
    $('#to-quiz').hidden = !v.videoDone;
    setNotice(v.watched > 0 && !v.videoDone ? `Pokračujete od ${fmt(v.watched)}.` : '');
    updateBar(maxWatched);
    show('video');
    await ytApi;
    if (vIndex !== i) return;
    $('#yt-host').innerHTML = '<div id="yt"></div>';
    const p = new YT.Player('yt', {
      videoId: v.youtubeId,
      width: '100%',
      height: '100%',
      playerVars: {
        controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, iv_load_policy: 3,
        playsinline: 1, start: Math.floor(Math.max(0, maxWatched - 3)),
      },
      events: {
        onReady: () => {
          if (player !== p) return; // medzitým zatvorené
          p.setVolume(Number($('#volume').value));
          tick = setInterval(onTick, 250);
        },
        onStateChange: (e) => { if (player === p) onPlayerState(e); },
      },
    });
    player = p;
  }

  function closePlayer() {
    clearInterval(tick);
    tick = null;
    if (player) {
      if (isPlaying()) player.pauseVideo();
      if (vIndex >= 0) heartbeat();
      try { player.destroy(); } catch (e) { /* už zrušený */ }
    }
    player = null;
    $('#yt-host').innerHTML = '';
    if (document.fullscreenElement) document.exitFullscreen();
  }

  function onTick() {
    if (!player || !player.getCurrentTime) return;
    if (player.getPlaybackRate && player.getPlaybackRate() !== 1) player.setPlaybackRate(1);
    const t = player.getCurrentTime();
    if (t > maxWatched + 2) {
      // pokus o posun dopredu – vrátiť na najďalšie pozreté miesto
      player.seekTo(maxWatched, true);
      return;
    }
    if (t > maxWatched) maxWatched = t;
    if (isPlaying() && Date.now() - lastBeatAt > HEARTBEAT_MS) heartbeat();
    updateBar(t);
  }

  function updateBar(t) {
    const v = state.videos[vIndex];
    const dur = (player && player.getDuration && player.getDuration()) || v.duration || 1;
    $('#bar-watched').style.width = Math.min(100, maxWatched / dur * 100) + '%';
    $('#bar-current').style.width = Math.min(100, t / dur * 100) + '%';
    $('#time').textContent = fmt(t) + ' / ' + fmt(dur);
  }

  function onPlayerState(e) {
    $('#play').textContent = e.data === YT_PLAYING || e.data === YT_BUFFERING ? '❚❚ Pozastaviť' : '▶ Prehrať';
    if (e.data === YT_PLAYING) setNotice('');
    if (e.data === YT_PLAYING || e.data === YT_PAUSED) heartbeat();
    if (e.data === YT_ENDED) {
      maxWatched = Math.max(maxWatched, player.getDuration());
      heartbeat();
    }
  }

  async function heartbeat() {
    if (beatBusy) { beatAgain = true; return; }
    beatBusy = true;
    lastBeatAt = Date.now();
    const i = vIndex;
    try {
      const r = await api('heartbeat', { video: i, position: Math.floor(maxWatched) });
      const v = state.videos[i];
      v.watched = r.watched;
      if (r.videoDone && !v.videoDone) setNotice('Video je dopozerané. Môžete pokračovať na test.', 'ok');
      v.videoDone = r.videoDone;
      if (i === vIndex) {
        $('#to-quiz').hidden = !v.videoDone;
        if (!r.videoDone && player && player.getPlayerState() === YT_ENDED) {
          // server nezaznamenal celé pozretie (napr. výpadok spojenia)
          maxWatched = r.watched;
          player.seekTo(r.watched, true);
          player.pauseVideo();
          setNotice(`Časť videa sa nepodarilo zaznamenať. Dopozerajte ju, prosím, od ${fmt(r.watched)}.`, 'warn');
        }
      }
    } catch (err) {
      if (session) setNotice('Priebeh sa nepodarilo uložiť: ' + err.message, 'warn');
    } finally {
      beatBusy = false;
      if (beatAgain) { beatAgain = false; heartbeat(); }
    }
  }

  function togglePlay() {
    if (!player || !player.getPlayerState) return;
    if (isPlaying()) player.pauseVideo();
    else player.playVideo();
  }

  function pauseBecauseLeft() {
    if (player && isPlaying()) {
      player.pauseVideo();
      setNotice('Video sa pozastavilo, pretože ste opustili okno. Pokračujte tlačidlom Prehrať.', 'warn');
    }
  }

  // ---------- Test ----------

  let quiz = null;

  async function openQuiz(i) {
    closePlayer();
    showError('');
    let r;
    try {
      r = await api('quiz', { video: i });
    } catch (err) {
      showError(err.message);
      return;
    }
    quiz = { index: i, questions: r.questions, endsAt: Date.now() + r.seconds * 1000, timer: null };
    $('#quiz-title').textContent = `Test k videu ${i + 1}`;
    $('#quiz-form').innerHTML = r.questions.map((q, k) => `
      <fieldset class="question">
        <legend>${k + 1}. ${esc(q.text)}</legend>
        ${q.options.map((o, j) => `<label><input type="radio" name="q${k}" value="${j}"> <span>${esc(o)}</span></label>`).join('')}
      </fieldset>`).join('');
    $('#quiz-submit').disabled = false;
    updateTimer();
    quiz.timer = setInterval(updateTimer, 500);
    show('quiz');
  }

  function updateTimer() {
    const left = Math.max(0, Math.round((quiz.endsAt - Date.now()) / 1000));
    $('#timer').textContent = fmt(left);
    $('#timer').classList.toggle('low', left <= 60);
    if (left === 0) submitQuiz(true);
  }

  async function submitQuiz(auto) {
    if (!quiz || $('#quiz-submit').disabled) return;
    const answers = quiz.questions.map((q, k) => {
      const c = document.querySelector(`input[name="q${k}"]:checked`);
      return c ? Number(c.value) : -1;
    });
    if (!auto && answers.includes(-1) && !confirm('Niektoré otázky nemáte zodpovedané. Naozaj chcete test odovzdať?')) return;
    clearInterval(quiz.timer);
    $('#quiz-submit').disabled = true;
    const i = quiz.index;
    let r;
    try {
      r = await api('submit', { video: i, answers: answers });
    } catch (err) {
      showError('Test sa nepodarilo odovzdať: ' + err.message);
      $('#quiz-submit').disabled = false;
      return;
    }
    quiz = null;
    const v = state.videos[i];
    v.tries++;
    v.best = Math.max(v.best, r.score);
    v.quizPassed = v.quizPassed || r.passed;
    showResult(i, r);
  }

  function showResult(i, r) {
    const last = i === state.videos.length - 1;
    let html = `<h1>Test k videu ${i + 1}</h1>
      <div class="score ${r.passed ? 'ok' : 'bad'}">${r.score} %</div>
      <p>Správne odpovede: ${r.correct} z ${r.total}</p>`;
    if (r.late) html += '<p class="banner warn">Test bol odovzdaný po uplynutí času.</p>';
    if (r.passed) {
      html += `<p>Test ste úspešne splnili.</p>
        <button class="btn primary big" id="result-next">${last ? 'Získať osvedčenie' : `Pokračovať na video ${i + 2}`}</button>`;
    } else {
      html += `<p>Na splnenie je potrebných ${state.passPercent} %. Test môžete zopakovať.</p>
        <button class="btn primary big" id="result-retry">Skúsiť znova</button>
        <p><button class="link" id="result-home">Späť na prehľad</button></p>`;
    }
    $('#result-box').innerHTML = html;
    show('result');
    if (r.passed) $('#result-next').onclick = last ? openCert : () => openVideo(i + 1);
    else {
      $('#result-retry').onclick = () => openQuiz(i);
      $('#result-home').onclick = renderHome;
    }
  }

  // ---------- Osvedčenie ----------

  async function openCert() {
    showError('');
    try {
      state.certificate = (await api('certificate')).certificate;
    } catch (err) {
      showError(err.message);
      return;
    }
    const c = state.certificate;
    const total = state.videos.reduce((s, v) => s + v.duration, 0);
    $('#cert-school').textContent = state.school;
    $('#cert-name').textContent = c.name;
    $('#cert-course').textContent = '„' + state.course + '“';
    $('#cert-text').textContent = `Vzdelávanie v rozsahu ${fmtLong(total)} pozostávalo z ${state.videos.length} videí `
      + `a ${state.videos.length} testov, každý splnený s úspešnosťou najmenej ${state.passPercent} %.`;
    $('#cert-date').textContent = c.date;
    $('#cert-id').textContent = c.id;
    show('cert');
  }

  async function downloadPdf() {
    const btn = $('#cert-pdf');
    btn.disabled = true;
    btn.textContent = 'Pripravujem…';
    try {
      const canvas = await html2canvas($('#certificate'), { scale: 3, backgroundColor: '#ffffff' });
      const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
      const slug = state.certificate.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-');
      pdf.save(`osvedcenie-${slug}.pdf`);
    } catch (err) {
      showError('PDF sa nepodarilo vytvoriť. Použite tlačidlo Tlačiť → Uložiť ako PDF.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Stiahnuť PDF';
    }
  }

  // ---------- Udalosti ----------

  $('#logout').onclick = () => { if (DEMO) window.DemoApi.reset(); logout(); };
  $('#video-back').onclick = () => { closePlayer(); renderHome(); };
  $('#to-quiz').onclick = () => openQuiz(vIndex);
  $('#play').onclick = togglePlay;
  $('#shield').onclick = togglePlay;
  $('#volume').oninput = (e) => { if (player && player.setVolume) player.setVolume(Number(e.target.value)); };
  $('#fullscreen').onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else $('#player-box').requestFullscreen();
  };
  $('#quiz-submit').onclick = () => submitQuiz(false);
  $('#quiz-form').onsubmit = (e) => e.preventDefault();
  $('#cert-back').onclick = renderHome;
  $('#cert-print').onclick = () => window.print();
  $('#cert-pdf').onclick = downloadPdf;

  // Video sa zastaví pri prepnutí karty, minimalizácii alebo prechode do iného okna.
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseBecauseLeft(); });
  window.addEventListener('blur', pauseBecauseLeft);

  window.addEventListener('pagehide', () => {
    if (!player || DEMO || vIndex < 0) return;
    navigator.sendBeacon(CFG.API_URL, JSON.stringify({ action: 'heartbeat', session: session, video: vIndex, position: Math.floor(maxWatched) }));
  });

  // ---------- Štart ----------

  (async () => {
    initLogin();
    if (session) {
      try {
        setState(await api('state'));
        renderHome();
        return;
      } catch (err) { /* prihlásenie neplatné */ }
    }
    show('login');
  })();
})();
