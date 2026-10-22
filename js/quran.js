/* Нұр — Құран: 114 сүре, араб мәтіні (қолданбамен бірге, офлайн), қазақша аударма (API), қари аудиосы, бетбелгілер, іздеу */
(function () {
  'use strict';
  var N = window.Nur, $ = N.$, $$ = N.$$, esc = N.esc, DATA = window.NurData;
  var AR = null, loading = null, view = 'list', cur = null; // cur = { n }
  var KK_ED = 'nur.kk.edition.v1', KK_PRE = 'nur.kk.v1.';
  var AUDIO_BASE = 'https://everyayah.com/data/';
  var audio = null, playing = null; // { n, a }

  function S() { return N.S(); }
  function loadAr() {
    if (AR) return Promise.resolve(AR);
    if (loading) return loading;
    loading = fetch('data/quran-ar.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { if (!Array.isArray(j) || j.length !== 114) throw new Error('Құран деректерінің құрылымы дұрыс емес'); AR = j; return AR; })
      .catch(function (e) { loading = null; throw e; });
    return loading;
  }
  function norm(s) { // араб мәтінін іздеу үшін қалыпқа келтіру
    return String(s).replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '').replace(/[ٱآأإ]/g, 'ا').replace(/ى/g, 'ي').replace(/ی/g, 'ي');
  }
  var typeKk = { meccan: 'Мекке', medinan: 'Мәдина' };

  /* ---------- Тізім ---------- */
  function show() {
    var root = $('#quranList');
    if (!AR) { root.querySelector('#surahList').innerHTML = '<div class="card"><div class="skeleton" style="width:60%"></div></div>'; }
    loadAr().then(function () { if (view === 'list') renderList(); }).catch(function (e) {
      $('#surahList').innerHTML = '<div class="card err"><p>Құран мәтіні жүктелмеді: ' + esc(e.message) + '. Қолданбаны веб-серверден (https) іске қосыңыз — <code>file://</code> арқылы ашпаңыз.</p><button class="btn" id="qrRetry">Қайталау</button></div>';
      $('#qrRetry').onclick = show;
    });
    if (view === 'reader') { $('#quranList').hidden = true; $('#quranReader').hidden = false; }
    else { $('#quranList').hidden = false; $('#quranReader').hidden = true; }
  }
  function lastReadHTML() {
    var lr = S().lastRead; if (!lr || !AR) return '';
    var s = AR[lr.n - 1]; if (!s) return '';
    return '<button class="surah" id="lrBtn" style="margin-bottom:10px;border-color:var(--accent-b)"><span class="no">★</span><span class="nm"><b>Соңғы оқылған</b><small>' + esc(s.transliteration) + ' · ' + lr.n + ':' + lr.a + '</small></span><span class="ar">' + esc(s.name) + '</span></button>';
  }
  function surahBtn(s) {
    return '<button class="surah" data-s="' + s.id + '"><span class="no">' + s.id + '</span><span class="nm"><b>' + esc(s.transliteration) + '</b><small>' + (typeKk[s.type] || '') + ' · ' + s.total_verses + ' аят</small></span><span class="ar">' + esc(s.name) + '</span></button>';
  }
  function renderList(filterQ) {
    var q = (filterQ != null ? filterQ : $('#quranSearch').value || '').trim();
    var list = $('#surahList'); $('#lastRead').innerHTML = q ? '' : lastReadHTML();
    var lr = $('#lrBtn'); if (lr) lr.onclick = function () { openReader(S().lastRead.n, S().lastRead.a); };
    if (!q) { list.innerHTML = AR.map(surahBtn).join(''); bindList(); return; }
    var out = '', m;
    if ((m = /^(\d{1,3})\s*[:.\-\s]\s*(\d{1,3})$/.exec(q))) { // 2:255 түріндегі тікелей сілтеме
      var n = +m[1], a = +m[2], s = AR[n - 1];
      if (s && a >= 1 && a <= s.total_verses) out += '<button class="hit" data-open="' + n + ':' + a + '"><b>' + esc(s.transliteration) + ' ' + n + ':' + a + '</b><span class="ar">' + esc(s.verses[a - 1].text) + '</span></button>';
    }
    var ql = q.toLowerCase(), qn = norm(q);
    var byName = AR.filter(function (s) { return String(s.id) === q || s.transliteration.toLowerCase().indexOf(ql) >= 0 || norm(s.name).indexOf(qn) >= 0; });
    if (byName.length) out += '<div class="group-title">Сүрелер</div>' + byName.map(surahBtn).join('');
    var hits = [];
    if (q.length >= 2 && !/^\d+$/.test(q)) {
      var arabic = /[؀-ۿ]/.test(q);
      AR.forEach(function (s) {
        s.verses.forEach(function (v) {
          if (hits.length >= 40) return;
          var kk = readKk(s.id), k = kk && kk[v.id - 1];
          if (arabic ? norm(v.text).indexOf(qn) >= 0 : (k && k.toLowerCase().indexOf(ql) >= 0)) hits.push({ n: s.id, a: v.id, ar: v.text, kk: k });
        });
      });
    }
    if (hits.length) out += '<div class="group-title">Аяттар' + (hits.length >= 40 ? ' (алғашқы 40)' : '') + '</div>' + hits.map(function (h) { return '<button class="hit" data-open="' + h.n + ':' + h.a + '"><b>' + esc(AR[h.n - 1].transliteration) + ' ' + h.n + ':' + h.a + '</b><span class="ar">' + esc(h.ar) + '</span>' + (h.kk ? '<span class="muted small">' + esc(h.kk) + '</span>' : '') + '</button>'; }).join('');
    if (!out) out = '<div class="card muted">Ештеңе табылмады. Араб мәтінімен, сүре атауымен (мысалы, Al-Baqarah), нөмірімен немесе «2:255» түрінде іздеп көріңіз. Қазақша аударма бойынша тек бұрын ашылған сүрелерден іздейді.</div>';
    list.innerHTML = out; bindList();
  }
  function bindList() {
    $$('#surahList [data-s]').forEach(function (b) { b.onclick = function () { openReader(+b.getAttribute('data-s')); }; });
    $$('#surahList [data-open]').forEach(function (b) { b.onclick = function () { var p = b.getAttribute('data-open').split(':'); openReader(+p[0], +p[1]); }; });
  }

  /* ---------- Қазақша аударма ---------- */
  var kkMemory = {};
  function readKk(n) {
    if (kkMemory[n]) return kkMemory[n];
    var r = N.lsGet(KK_PRE + n); if (!r) return null;
    try { var j = JSON.parse(r); if (Array.isArray(j.t)) { kkMemory[n] = j.t; return j.t; } } catch (e) { /* бүлінген кэш */ }
    return null;
  }
  function kkEdition() {
    var c = N.lsGet(KK_ED); if (c) { try { return Promise.resolve(JSON.parse(c)); } catch (e) { /* қайта сұраймыз */ } }
    return N.fetchJSON('https://api.alquran.cloud/v1/edition?language=kk&type=translation').then(function (r) {
      var list = r && r.data; if (!Array.isArray(list) || !list.length) throw new Error('Қазақша аударма басылымы табылмады');
      var pick = list.filter(function (e) { return /altai/i.test(e.identifier); })[0] || list[0];
      var ed = { id: pick.identifier, name: pick.englishName || pick.name };
      N.lsSet(KK_ED, JSON.stringify(ed)); return ed;
    });
  }
  function fetchKk(n) {
    var c = readKk(n); if (c) return Promise.resolve(c);
    return kkEdition().then(function (ed) {
      return N.fetchJSON('https://api.alquran.cloud/v1/surah/' + n + '/' + encodeURIComponent(ed.id)).then(function (r) {
        var ay = r && r.data && r.data.ayahs; if (!Array.isArray(ay)) throw new Error('Жауап форматы күтілмеген');
        if (ay.length !== AR[n - 1].total_verses) throw new Error('Аят саны сәйкес емес (' + ay.length + ' / ' + AR[n - 1].total_verses + ')');
        var t = ay.map(function (a) { return String(a.text || ''); });
        N.lsSet(KK_PRE + n, JSON.stringify({ t: t, ed: ed.name })); kkMemory[n] = t; return t;
      });
    });
  }
  function kkEditionName() { var c = N.lsGet(KK_ED); try { return c ? JSON.parse(c).name : ''; } catch (e) { return ''; } }

  /* ---------- Оқу режимі ---------- */
  function inBM(n, a) { return S().bookmarks.indexOf(n + ':' + a) >= 0; }
  function openReader(n, a) {
    view = 'reader'; cur = { n: n }; stopAudio(); $('#quranList').hidden = true; $('#quranReader').hidden = false; N.updateBack();
    var s = AR[n - 1];
    $('#quranReader').innerHTML = '<div class="reader-head"><button class="icon-btn" id="rBack" aria-label="Артқа">‹</button><div class="t"><b>' + esc(s.transliteration) + ' · ' + esc(s.name) + '</b><small>' + n + '-сүре · ' + s.total_verses + ' аят · ' + (typeKk[s.type] || '') + '</small></div>' +
      '<button class="icon-btn" id="rPrev" aria-label="Алдыңғы сүре">«</button><button class="icon-btn" id="rNext" aria-label="Келесі сүре">»</button></div>' +
      '<div id="rKkNote"></div>' + (n !== 1 && n !== 9 ? '<div class="bismillah">' + esc(AR[0].verses[0].text) + '</div>' : '') +
      '<div id="ayahs">' + s.verses.map(function (v) { return ayahHTML(n, v); }).join('') + '</div><p class="muted small" id="rCredit"></p>';
    $('#rBack').onclick = closeReader;
    $('#rPrev').onclick = function () { if (n > 1) openReader(n - 1); }; $('#rNext').onclick = function () { if (n < 114) openReader(n + 1); };
    bindAyahs(); window.scrollTo(0, 0);
    if (S().settings.showKk) applyKk(n);
    else $('#rCredit').textContent = 'Араб мәтіні: quran-json (Tanzil негізінде, CC BY-SA 4.0).';
    if (a) { var el = $('#ay-' + a); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('playing'); setTimeout(function () { el.classList.remove('playing'); }, 1600); } }
  }
  function ayahHTML(n, v) {
    return '<div class="ayah" id="ay-' + v.id + '" data-a="' + v.id + '"><div class="meta"><span class="num">' + v.id + '</span><span class="acts">' +
      '<button data-act="play" aria-label="Тыңдау">▶</button><button data-act="bm" class="' + (inBM(n, v.id) ? 'on' : '') + '" aria-label="Бетбелгі">' + (inBM(n, v.id) ? '★' : '☆') + '</button><button data-act="last" aria-label="Осы жерде тоқтадым">🔖</button></span></div>' +
      '<div class="ar" lang="ar" dir="rtl">' + esc(v.text) + '</div><div class="kk" id="kk-' + v.id + '"></div></div>';
  }
  function applyKk(n) {
    var note = $('#rKkNote'); note.innerHTML = '<p class="muted small">Қазақша аударма жүктелуде…</p>';
    fetchKk(n).then(function (t) {
      if (!cur || cur.n !== n) return;
      note.innerHTML = ''; t.forEach(function (x, i) { var el = $('#kk-' + (i + 1)); if (el) el.textContent = x; });
      $('#rCredit').textContent = 'Қазақша аударма: ' + (kkEditionName() || 'alquran.cloud') + ' (alquran.cloud). Араб мәтіні: quran-json (CC BY-SA 4.0).';
    }).catch(function (e) {
      if (!cur || cur.n !== n) return;
      note.innerHTML = '<div class="card err"><p>Қазақша аударма алынбады' + (navigator.onLine === false ? ' (интернет жоқ)' : '') + ': ' + esc(e.message) + '. Араб мәтіні көрсетіліп тұр.</p><button class="btn" id="kkRetry">Қайталау</button></div>';
      $('#kkRetry').onclick = function () { applyKk(n); };
    });
  }
  function bindAyahs() {
    $$('#ayahs .ayah').forEach(function (el) {
      var a = +el.getAttribute('data-a');
      $$('button', el).forEach(function (b) {
        b.onclick = function () {
          var act = b.getAttribute('data-act'), n = cur.n, key = n + ':' + a, bm = S().bookmarks;
          if (act === 'play') { if (playing && playing.n === n && playing.a === a && audio && !audio.paused) { audio.pause(); updateBtn(); } else playAyah(n, a); }
          if (act === 'bm') { var i = bm.indexOf(key); if (i >= 0) bm.splice(i, 1); else bm.push(key); N.save(); b.classList.toggle('on', i < 0); b.textContent = i < 0 ? '★' : '☆'; N.haptic('select'); N.toast(i < 0 ? 'Бетбелгі қосылды' : 'Бетбелгі өшірілді', 1500); }
          if (act === 'last') { S().lastRead = { n: n, a: a }; N.save(); N.haptic('success'); N.toast('Соңғы оқылған аят сақталды: ' + key, 2000); }
        };
      });
    });
  }
  function closeReader() { stopAudio(); view = 'list'; cur = null; $('#quranReader').hidden = true; $('#quranList').hidden = false; N.updateBack(); renderList(); window.scrollTo(0, 0); }

  /* ---------- Аудио (everyayah.com, аят бойынша) ---------- */
  function p3(x) { return ('00' + x).slice(-3); }
  function ensurePlayer() {
    var p = $('#qPlayer'); if (p) return p;
    p = document.createElement('div'); p.id = 'qPlayer'; p.className = 'player';
    p.innerHTML = '<button id="pPrev" aria-label="Алдыңғы аят">⏮</button><div class="info"><b id="pTitle">—</b><span class="muted" id="pSub"></span></div><button id="pToggle" aria-label="Ойнату/кідірту">⏸</button><button id="pNext" aria-label="Келесі аят">⏭</button><button id="pStop" aria-label="Тоқтату" style="background:var(--input)">✕</button>';
    $('#app').appendChild(p);
    $('#pToggle').onclick = function () { if (!audio) return; if (audio.paused) audio.play().catch(function () {}); else audio.pause(); updateBtn(); };
    $('#pNext').onclick = function () { stepAyah(1); }; $('#pPrev').onclick = function () { stepAyah(-1); }; $('#pStop').onclick = stopAudio;
    return p;
  }
  function stepAyah(d) {
    if (!playing) return; var s = AR[playing.n - 1], a = playing.a + d;
    if (a < 1 || a > s.total_verses) { stopAudio(); return; } playAyah(playing.n, a);
  }
  function playAyah(n, a) {
    var rec = S().settings.reciter; ensurePlayer();
    if (audio) { audio.onended = audio.onerror = null; audio.pause(); }
    audio = new Audio(AUDIO_BASE + encodeURIComponent(rec) + '/' + p3(n) + p3(a) + '.mp3'); audio.volume = Math.max(0.05, S().settings.volume / 100);
    playing = { n: n, a: a };
    audio.onended = function () { if (S().settings.autoNext) stepAyah(1); else { updateBtn(); } };
    audio.onerror = function () { N.toast('Аудио жүктелмеді (интернет немесе қари файлы қолжетімсіз). Басқа қариді таңдап көріңіз.', 5000); updateBtn(); };
    audio.play().then(function () { updateBtn(); }).catch(function () { updateBtn(); });
    S().lastRead = { n: n, a: a }; N.save(); $$('#ayahs .ayah').forEach(function (e) { e.classList.toggle('playing', +e.getAttribute('data-a') === a); });
    var el = $('#ay-' + a); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    $('#pTitle').textContent = AR[n - 1].transliteration + ' · ' + n + ':' + a; $('#pSub').textContent = (DATA.RECITERS.filter(function (r) { return r.id === rec; })[0] || {}).name || '';
  }
  function updateBtn() { var b = $('#pToggle'); if (b && audio) b.textContent = audio.paused ? '▶' : '⏸'; }
  function stopAudio() { if (audio) { audio.onended = audio.onerror = null; audio.pause(); audio = null; } playing = null; var p = $('#qPlayer'); if (p) p.remove(); $$('#ayahs .ayah.playing').forEach(function (e) { e.classList.remove('playing'); }); }

  function showBookmarks() {
    var bm = S().bookmarks.slice().reverse(); view = 'list';
    if (!bm.length) { $('#surahList').innerHTML = '<div class="card muted">Бетбелгі жоқ. Аяттың жанындағы ☆ белгісін басыңыз.</div>'; $('#lastRead').innerHTML = ''; return; }
    $('#lastRead').innerHTML = ''; $('#surahList').innerHTML = '<div class="group-title">Бетбелгілер</div>' + bm.map(function (k) {
      var p = k.split(':'), s = AR[+p[0] - 1]; if (!s) return '';
      return '<button class="hit" data-open="' + k + '"><b>' + esc(s.transliteration) + ' ' + k + '</b><span class="ar">' + esc(s.verses[+p[1] - 1].text) + '</span></button>';
    }).join(''); bindList();
  }

  var t = null;
  $('#quranSearch').addEventListener('input', function () { clearTimeout(t); var v = this.value; t = setTimeout(function () { if (AR) renderList(v); }, 200); });
  $('#bmBtn').onclick = function () { if (AR) showBookmarks(); };
  window.NurQuran = { show: show, inReader: function () { return view === 'reader'; }, closeReader: closeReader, _norm: norm };
})();
