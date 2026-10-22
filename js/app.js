/* Нұр — негізгі модуль: күй, Telegram, орын, басты бет, намаз, баптаулар, еске салу, маршрутизатор */
(function () {
  'use strict';
  var P = window.NurPrayer, DATA = window.NurData;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------- Telegram ---------- */
  var tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  var inTelegram = !!(tg && tg.initData !== undefined && tg.platform && tg.platform !== 'unknown');
  function tgTry(fn) { try { return fn(); } catch (e) { return undefined; } }
  if (tg) {
    tgTry(function () { tg.ready(); });
    tgTry(function () { tg.expand(); });
    tgTry(function () { if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); });
  }

  /* ---------- Күй және сақтау ---------- */
  var LS = 'nur.state.v1';
  var DEFAULTS = {
    settings: {
      theme: 'auto', dim: 0, volume: 70, remindSound: true, azanNotice: true, remindBefore: 10, vibrate: true, notify: true,
      quiet: { on: false, from: '23:00', to: '04:30' },
      prayerNotify: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true },
      loc: { mode: 'city', cityId: 'atyrau', lat: 47.0945, lng: 51.9238, tz: 'Asia/Atyrau', name: 'Атырау' },
      method: 'MWL', hanafi: true, fajrAngle: 18, ishaAngle: 17,
      reciter: 'Alafasy_128kbps', showKk: true, qfs: 28, autoNext: true
    },
    dhikr: { sel: 'subhanallah', counts: {}, targets: {}, stats: {}, favs: [] },
    bookmarks: [], lastRead: null
  };
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function merge(base, over) {
    if (over == null || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over;
    var out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    Object.keys(over).forEach(function (k) { out[k] = (base && typeof base[k] === 'object' && !Array.isArray(base[k])) ? merge(base[k], over[k]) : over[k]; });
    return out;
  }
  var S = clone(DEFAULTS);
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  (function load() {
    var raw = lsGet(LS);
    if (raw) { try { S = merge(clone(DEFAULTS), JSON.parse(raw)); } catch (e) { /* бүлінген деректі елемейміз */ } }
  })();
  var saveT = null;
  function flushSave() {
    clearTimeout(saveT); saveT = null;
    var keys = Object.keys(S.dhikr.stats).sort(); // 30 күннен асқан статистиканы тазалау
    while (keys.length > 30) delete S.dhikr.stats[keys.shift()];
    lsSet(LS, JSON.stringify(S));
    cloudSave(); serverSync();
  }
  /* Қосымша жабық кезде бот арқылы еске салу үшін баптауды серверге жіберу (тек apiBase және Telegram initData болса) */
  var syncT = null;
  function serverSync() {
    var base = window.NUR_CONFIG && window.NUR_CONFIG.apiBase; if (!base || !inTelegram || !tg.initData) return;
    clearTimeout(syncT); syncT = setTimeout(function () {
      var s = S.settings;
      fetch(base.replace(/\/$/, '') + '/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ initData: tg.initData, settings: { notify: s.notify, azanNotice: s.azanNotice, remindBefore: s.remindBefore, loc: s.loc, method: s.method, hanafi: s.hanafi, fajrAngle: s.fajrAngle, ishaAngle: s.ishaAngle, quiet: s.quiet, prayerNotify: s.prayerNotify } }) })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); }).catch(function () { /* сервер қолжетімсіз — жергілікті еске салу жұмысын жалғастырады */ });
    }, 1500);
  }
  function save() { clearTimeout(saveT); saveT = setTimeout(flushSave, 250); }
  /* Қосымша жабылғанда/жасырылғанда күту уақытындағы өзгерісті жоғалтпау үшін */
  window.addEventListener('pagehide', function () { if (saveT) flushSave(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && saveT) flushSave(); });
  function cloudSave() {
    var cs = tg && tg.CloudStorage; if (!cs || !inTelegram) return;
    tgTry(function () {
      cs.setItem('nur_settings', JSON.stringify(S.settings));
      cs.setItem('nur_dhikr', JSON.stringify({ sel: S.dhikr.sel, counts: S.dhikr.counts, targets: S.dhikr.targets, favs: S.dhikr.favs }));
      cs.setItem('nur_bm', JSON.stringify({ b: S.bookmarks.slice(-250), l: S.lastRead }));
    });
  }
  function cloudLoad() {
    var cs = tg && tg.CloudStorage; if (!cs || !inTelegram || lsGet(LS)) return; // жаңа құрылғыда ғана
    tgTry(function () {
      cs.getItems(['nur_settings', 'nur_dhikr', 'nur_bm'], function (err, v) {
        if (err || !v) return;
        try {
          if (v.nur_settings) S.settings = merge(S.settings, JSON.parse(v.nur_settings));
          if (v.nur_dhikr) S.dhikr = merge(S.dhikr, JSON.parse(v.nur_dhikr));
          if (v.nur_bm) { var b = JSON.parse(v.nur_bm); S.bookmarks = b.b || []; S.lastRead = b.l || null; }
          save(); applyTheme(); renderAll();
        } catch (e) { /* ескеру */ }
      });
    });
  }

  /* ---------- Тақырып, жарықтық ---------- */
  function effectiveTheme() {
    if (S.settings.theme === 'light' || S.settings.theme === 'dark') return S.settings.theme;
    if (tg && tg.colorScheme) return tg.colorScheme === 'light' ? 'light' : 'dark';
    return (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  }
  function applyTheme() {
    var t = effectiveTheme();
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.style.setProperty('--dim', String(Math.min(0.6, Math.max(0, S.settings.dim / 100))));
    if (tg) {
      var c = t === 'light' ? '#f5f1ff' : '#0b0d1f';
      tgTry(function () { tg.setHeaderColor(c); }); tgTry(function () { tg.setBackgroundColor(c); }); tgTry(function () { tg.setBottomBarColor(c); });
    }
  }
  if (tg && tg.onEvent) tgTry(function () { tg.onEvent('themeChanged', applyTheme); });

  /* ---------- Дыбыс, діріл, хабар ---------- */
  var actx = null;
  function audioCtx() {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { actx = null; }
    return actx;
  }
  document.addEventListener('pointerdown', function () { audioCtx(); }, { once: true, passive: true });
  function beep(kind) {
    var c = audioCtx(); if (!c) return false;
    var vol = Math.max(0, Math.min(1, S.settings.volume / 100)) * 0.35; if (vol <= 0) return false;
    var seq = kind === 'click' ? [[1200, 0, .035]] : [[784, 0, .22], [988, .24, .22], [1319, .48, .38]];
    seq.forEach(function (n) {
      var o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + n[1];
      o.type = 'sine'; o.frequency.value = n[0];
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + n[2]);
      o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + n[2] + 0.05);
    });
    return true;
  }
  function haptic(kind) {
    if (!S.settings.vibrate) return;
    var hf = tg && tg.HapticFeedback;
    if (hf && inTelegram) {
      tgTry(function () {
        if (kind === 'success') hf.notificationOccurred('success');
        else if (kind === 'warn') hf.notificationOccurred('warning');
        else if (kind === 'select') hf.selectionChanged();
        else hf.impactOccurred(kind === 'heavy' ? 'heavy' : 'light');
      });
      return;
    }
    if (navigator.vibrate) tgTry(function () { navigator.vibrate(kind === 'success' ? [40, 60, 40] : kind === 'heavy' ? 60 : 15); });
  }
  var toastT = null;
  function toast(msg, ms) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, ms || 3500);
  }

  /* ---------- Орын ---------- */
  function loc() { return S.settings.loc; }
  function deviceTZ() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Almaty'; } catch (e) { return 'Asia/Almaty'; } }
  function setCity(id) {
    var c = DATA.CITIES.filter(function (x) { return x.id === id; })[0]; if (!c) return;
    S.settings.loc = { mode: 'city', cityId: c.id, lat: c.lat, lng: c.lng, tz: c.tz, name: c.name };
    onLocChanged();
  }
  function setCoords(lat, lng, tz, mode, name) {
    lat = +lat; lng = +lng;
    if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
    if (!name) {
      var near = nearestCity(lat, lng);
      name = (near && near.d < 80) ? near.c.name : ((mode === 'gps' ? 'GPS: ' : '') + lat.toFixed(2) + ', ' + lng.toFixed(2));
    }
    S.settings.loc = { mode: mode || 'manual', cityId: null, lat: lat, lng: lng, tz: tz || deviceTZ(), name: name };
    onLocChanged(); return true;
  }
  function nearestCity(lat, lng) {
    var best = null;
    DATA.CITIES.forEach(function (c) {
      var dLat = (c.lat - lat) * Math.PI / 180, dLng = (c.lng - lng) * Math.PI / 180;
      var a = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(lat * Math.PI / 180) * Math.cos(c.lat * Math.PI / 180) * Math.pow(Math.sin(dLng / 2), 2);
      var d = 2 * 6371 * Math.asin(Math.sqrt(a));
      if (!best || d < best.d) best = { c: c, d: d };
    });
    return best;
  }
  function onLocChanged() {
    save(); firedClear(); weatherCache = null; renderAll(); loadWeather(true);
    if (window.NurQibla) window.NurQibla.refresh();
  }
  function requestGPS(cb) {
    if (!navigator.geolocation) { toast('Бұл құрылғыда GPS қолжетімсіз. Қаланы таңдаңыз немесе координатаны қолмен енгізіңіз.'); cb && cb(false); return; }
    toast('Орналасқан жер анықталуда…', 8000);
    navigator.geolocation.getCurrentPosition(function (p) {
      var ok = setCoords(p.coords.latitude, p.coords.longitude, deviceTZ(), 'gps');
      toast(ok ? 'Орналасқан жер анықталды' : 'GPS координатасы жарамсыз'); cb && cb(ok);
    }, function (err) {
      var msg = err && err.code === 1 ? 'Орналасқан жерге рұқсат берілмеген. Қаланы таңдаңыз немесе координатаны қолмен енгізіңіз.'
        : 'Орналасқан жерді анықтау мүмкін болмады. Қаланы таңдаңыз немесе координатаны қолмен енгізіңіз.';
      toast(msg, 6000); cb && cb(false);
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  }

  /* ---------- Намаз есептеу көмекшілері ---------- */
  function pOpts() { var s = S.settings; return { method: s.method, hanafi: s.hanafi, fajrAngle: +s.fajrAngle, ishaAngle: +s.ishaAngle }; }
  function timesFor(ymd) { var l = loc(); return P.timesForDate(ymd.y, ymd.m, ymd.d, l.lat, l.lng, pOpts()); }
  function todayYMD(now) { return P.ymdInTZ(now || new Date(), loc().tz); }
  function fmtT(d) { return P.fmt(d, loc().tz); }
  function weekdayOf(ymd) { return DATA.WEEKDAYS[new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)).getUTCDay()]; }
  function dateText(ymd, withWd) { return (withWd ? cap(weekdayOf(ymd)) + ', ' : '') + ymd.d + ' ' + DATA.MONTHS[ymd.m - 1]; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function hijriText(date) {
    try {
      var parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: loc().tz }).formatToParts(date), o = {};
      parts.forEach(function (p) { o[p.type] = p.value; });
      var m = parseInt(o.month, 10); if (!m || !o.day || !o.year) return '';
      return o.day + ' ' + DATA.HIJRI_MONTHS[m - 1] + ' ' + parseInt(o.year, 10) + ' һ.';
    } catch (e) { return ''; }
  }
  function clockText(now, secs) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: loc().tz, hour: '2-digit', minute: '2-digit', second: secs ? '2-digit' : undefined, hour12: false }).format(now);
  }
  function hms(ms) {
    ms = Math.max(0, Math.floor(ms / 1000)); var h = Math.floor(ms / 3600), m = Math.floor(ms % 3600 / 60), s = ms % 60;
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }
  function currentKey(now, times) { // ағымдағы уақыт аралығы (күн шыққаннан кейін — 'sunrise')
    var k = null; P.KEYS.forEach(function (key) { if (times[key] && times[key] <= now) k = key; });
    return k;
  }

  /* ---------- Ауа райы ---------- */
  var weatherCache = null, weatherBusy = false;
  var WKEY = 'nur.weather.v1';
  function wxKey() { var l = loc(); return l.lat.toFixed(2) + ',' + l.lng.toFixed(2); }
  (function () { var r = lsGet(WKEY); if (r) { try { weatherCache = JSON.parse(r); } catch (e) { weatherCache = null; } } })();
  function fetchJSON(url, ms) {
    var ctl = ('AbortController' in window) ? new AbortController() : null, t = ctl && setTimeout(function () { ctl.abort(); }, ms || 10000);
    return fetch(url, ctl ? { signal: ctl.signal } : undefined).then(function (r) { if (t) clearTimeout(t); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function loadWeather(force) {
    var l = loc(), key = wxKey();
    if (!force && weatherCache && weatherCache.key === key && Date.now() - weatherCache.ts < 20 * 60000) { renderHome(); return; }
    if (weatherBusy) return; weatherBusy = true;
    var base = 'https://api.open-meteo.com/v1/forecast?latitude=' + l.lat + '&longitude=' + l.lng + '&timezone=auto&wind_speed_unit=kmh&current=';
    var full = 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,surface_pressure,visibility,uv_index';
    var min = 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,surface_pressure';
    var aqUrl = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + l.lat + '&longitude=' + l.lng + '&current=us_aqi,pm2_5';
    Promise.all([
      fetchJSON(base + full).catch(function () { return fetchJSON(base + min); }),
      fetchJSON(aqUrl).catch(function () { return null; })
    ]).then(function (r) {
      var c = r[0] && r[0].current; if (!c) throw new Error('Жауап форматы күтілмеген');
      weatherCache = { key: key, ts: Date.now(), w: c, aq: r[1] && r[1].current ? r[1].current : null };
      lsSet(WKEY, JSON.stringify(weatherCache)); weatherErr = null;
    }).catch(function (e) { weatherErr = e && e.message ? e.message : 'қате'; })
      .then(function () { weatherBusy = false; renderHome(); });
  }
  var weatherErr = null;
  function aqiLabel(v) { return v == null ? '' : v <= 50 ? 'Жақсы' : v <= 100 ? 'Қанағаттанарлық' : v <= 150 ? 'Сезімтал топқа зиянды' : v <= 200 ? 'Зиянды' : v <= 300 ? 'Өте зиянды' : 'Қауіпті'; }
  function aqiColor(v) { return v == null ? '' : v <= 50 ? 'var(--good)' : v <= 100 ? 'var(--warn)' : 'var(--bad)'; }
  function uvLabel(v) { return v == null ? '' : v < 3 ? 'Төмен' : v < 6 ? 'Орташа' : v < 8 ? 'Жоғары' : v < 11 ? 'Өте жоғары' : 'Шектен тыс'; }

  /* ---------- Басты бет ---------- */
  var homeDay = 0; // -1, 0, 1
  var ICONS = {
    air: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 15c0-4 3-6 8-6 0 4-2 7-6 7-1 0-2-.4-2-1zM8 16l4-4"/></svg>',
    gauge: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m12 12 4-3M7 16h10"/></svg>',
    wind: '<svg class="ico" viewBox="0 0 24 24"><path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h6"/></svg>',
    eye: '<svg class="ico" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    bell: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7zM10 20a2 2 0 0 0 4 0"/></svg>'
  };
  function renderDayStrip() {
    var base = todayYMD(), labels = ['Кеше', 'Бүгін', 'Ертең'];
    $('#dayStrip').innerHTML = [-1, 0, 1].map(function (o, i) {
      var y = P.addDays(base, o);
      return '<button data-off="' + o + '" class="' + (homeDay === o ? 'on' : '') + '">' + labels[i] + '<b>' + y.d + ' ' + DATA.MONTHS[y.m - 1] + '</b></button>';
    }).join('');
  }
  function renderHero(now) {
    var ymd = todayYMD(now), c = weatherCache && weatherCache.key === wxKey() ? weatherCache : null, w = c && c.w, wc = w ? (DATA.WEATHER_CODES[w.weather_code] || ['—', '🌡️']) : null;
    var html = '<div><div class="muted small" id="heroDate">' + esc(dateText(ymd, true)) + (hijriText(now) ? ' · ' + esc(hijriText(now)) : '') + '</div>' +
      '<div class="t big" id="heroClock">' + clockText(now, true) + '</div>';
    if (w) html += '<div class="d">' + esc(wc[0]) + (w.apparent_temperature != null ? ' · сезілуі ' + Math.round(w.apparent_temperature) + '°' : '') + '</div>' +
      '<div class="hum">💧 Ылғалдылық ' + Math.round(w.relative_humidity_2m) + '%</div>';
    else if (weatherErr) html += '<div class="d">Ауа райы алынбады · ' + (navigator.onLine === false ? 'интернет жоқ' : 'дереккөзге қосылу мүмкін болмады') + ' <button class="chip" id="wxRetry">Қайталау</button></div>';
    else html += '<div class="skeleton" style="width:150px;margin-top:10px"></div>';
    html += '</div>';
    if (w) html += '<div style="text-align:right"><div class="e">' + wc[1] + '</div><div class="t">' + Math.round(w.temperature_2m) + '<sup>°C</sup></div></div>';
    var el = $('#heroCard'); el.innerHTML = html;
    if (w && c) { var ago = Math.round((Date.now() - c.ts) / 60000); if (ago > 40) el.firstChild.insertAdjacentHTML('beforeend', '<div class="muted small">Соңғы жаңарту: ' + (ago >= 120 ? Math.round(ago / 60) + ' сағат' : ago + ' минут') + ' бұрын' + (weatherErr ? ' (жаңарту сәтсіз)' : '') + '</div>'); }
    var rb = $('#wxRetry'); if (rb) rb.onclick = function () { weatherErr = null; renderHero(new Date()); loadWeather(true); };
  }
  function renderStats() {
    var c = weatherCache && weatherCache.key === wxKey() ? weatherCache : null, w = c && c.w, aq = c && c.aq;
    var aqi = aq && aq.us_aqi != null ? Math.round(aq.us_aqi) : null;
    function cell(ic, v, u, lab, sub, col) { return '<div class="stat">' + ic + '<b' + (col ? ' style="color:' + col + '"' : '') + '>' + v + (u ? '<small>' + u + '</small>' : '') + '</b><span>' + lab + '</span>' + (sub ? '<i style="color:' + col + '">' + sub + '</i>' : '') + '</div>'; }
    var dash = '—';
    $('#statsRow').className = 'stats card';
    $('#statsRow').innerHTML =
      cell(ICONS.air, aqi != null ? aqi : dash, '', 'Ауа сапасы', aqiLabel(aqi), aqiColor(aqi)) +
      cell(ICONS.gauge, w && w.surface_pressure != null ? Math.round(w.surface_pressure) : dash, w && w.surface_pressure != null ? ' гПа' : '', 'Қысым') +
      cell(ICONS.wind, w && w.wind_speed_10m != null ? Math.round(w.wind_speed_10m) : dash, w && w.wind_speed_10m != null ? ' км/сағ' : '', 'Жел') +
      cell(ICONS.eye, w && w.visibility != null ? (w.visibility / 1000).toFixed(1) : dash, w && w.visibility != null ? ' км' : '', 'Көріну');
  }
  function renderSun(now) {
    var ymd = todayYMD(now), t = timesFor(ymd), c = weatherCache && weatherCache.key === wxKey() ? weatherCache : null;
    var uv = c && c.w && c.w.uv_index != null ? c.w.uv_index : null;
    if (!t.sunrise || !t.maghrib) { $('#sunCard').innerHTML = '<div class="muted">Бұл орында күн шығуы/батуы есептелмеді (полярлық аймақ).</div>'; return; }
    var frac = (now - t.sunrise) / (t.maghrib - t.sunrise), up = frac >= 0 && frac <= 1, f = Math.max(0, Math.min(1, frac));
    var x = (1 - f) * (1 - f) * 20 + 2 * (1 - f) * f * 150 + f * f * 280, y = (1 - f) * (1 - f) * 86 + 2 * (1 - f) * f * -50 + f * f * 86;
    $('#sunCard').innerHTML =
      '<div class="sun-top"><div><b>' + fmtT(t.sunrise) + '</b><span>Күннің шығуы</span></div><div class="r"><b>' + fmtT(t.maghrib) + '</b><span>Күннің батуы</span></div></div>' +
      '<svg class="arc" viewBox="0 0 300 92" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path class="track" d="M20 86 Q150 -50 280 86" pathLength="100"/>' +
      (up ? '<path class="done" d="M20 86 Q150 -50 280 86" pathLength="100" stroke-dasharray="' + (f * 100).toFixed(1) + ' 100"/><text x="' + x.toFixed(1) + '" y="' + (y + 7).toFixed(1) + '" font-size="22" text-anchor="middle">☀️</text>'
        : '<text x="150" y="60" font-size="22" text-anchor="middle">🌙</text>') + '</svg>' +
      '<div class="uv"><b>' + (uv != null ? uv.toFixed(1).replace(/\.0$/, '') : '—') + '</b><div class="uvbar">' + (uv != null ? '<i style="left:' + Math.min(100, uv / 11 * 100).toFixed(0) + '%"></i>' : '') + '</div><span>Ультракүлгін индексі' + (uv != null ? ' · ' + uvLabel(uv) : ' (дерек жоқ)') + '</span></div>';
  }
  function renderNext(now) {
    var l = loc(), nx = P.nextPrayer(now, l.lat, l.lng, l.tz, pOpts()), name = DATA.PRAYER_NAMES[nx.key];
    var prev = P.previousPrayerTime(now, nx, l.lat, l.lng, l.tz, pOpts());
    var total = nx.time && prev ? nx.time - prev : 0, pr = total > 0 ? Math.max(0, Math.min(100, (now - prev) / total * 100)) : 0;
    var enabled = S.settings.notify && S.settings.prayerNotify[nx.key];
    $('#nextCard').innerHTML = '<div class="row"><div><small>Келесі намаз' + (nx.tomorrow ? ' (ертең)' : '') + '</small><div class="name">' + name + ' · ' + fmtT(nx.time) + '</div></div>' +
      '<div class="count" id="countdown">' + (nx.time ? hms(nx.time - now) : '—') + '</div></div>' +
      '<div class="progress"><i id="nextProg" style="width:' + pr.toFixed(1) + '%"></i></div>' +
      '<div class="remind"><span>' + ICONS.bell.replace('class="ico"', 'class="ico" style="width:16px;height:16px;vertical-align:-3px"') + ' ' + (enabled ? (S.settings.remindBefore ? S.settings.remindBefore + ' минут бұрын еске салу қосулы' : 'Уақыты кіргенде хабарлау қосулы') : 'Еске салу өшірулі') + '</span>' +
      '<button class="chip" id="nextToggle" style="background:rgba(255,255,255,.2);color:#fff;border:0">' + (enabled ? 'Өшіру' : 'Қосу') + '</button></div>';
    $('#nextToggle').onclick = function () { S.settings.prayerNotify[nx.key] = !S.settings.prayerNotify[nx.key]; if (S.settings.prayerNotify[nx.key]) S.settings.notify = true; save(); renderNext(new Date()); renderHomeTimes(new Date()); toast(DATA.PRAYER_NAMES[nx.key] + ': еске салу ' + (S.settings.prayerNotify[nx.key] ? 'қосылды' : 'өшірілді')); };
    nextInfo = nx;
  }
  var nextInfo = null;
  function prayerListHTML(ymd, now, isToday) {
    var t = timesFor(ymd), cur = isToday ? currentKey(now, t) : null;
    var keys = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
    return '<ul class="plist">' + keys.map(function (k) {
      var bell = P.ORDER.indexOf(k) >= 0
        ? '<button class="bell ' + (S.settings.prayerNotify[k] && S.settings.notify ? 'on' : '') + '" data-bell="' + k + '" aria-label="' + DATA.PRAYER_NAMES[k] + ' хабарламасы">' + ICONS.bell + '</button>' : '<span style="width:36px"></span>';
      return '<li class="' + (cur === k ? 'now' : '') + '"><span class="em">' + DATA.PRAYER_ICONS[k] + '</span><span class="n">' + DATA.PRAYER_NAMES[k] + (cur === k ? '<small>' + (k === 'sunrise' ? 'Таң намазының уақыты аяқталды' : 'Қазір') + '</small>' : '') + '</span><span class="tm">' + fmtT(t[k]) + '</span>' + bell + '</li>';
    }).join('') + '</ul>';
  }
  function bindBells(root) {
    $$('[data-bell]', root).forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-bell'); S.settings.prayerNotify[k] = !S.settings.prayerNotify[k];
        if (S.settings.prayerNotify[k]) S.settings.notify = true;
        save(); haptic('select'); renderHomeTimes(new Date()); if (screen === 'prayer') renderPrayerDay(); renderNext(new Date());
      };
    });
  }
  function renderHomeTimes(now) {
    var ymd = P.addDays(todayYMD(now), homeDay);
    $('#homeTimes').innerHTML = '<h3 class="h3">Бес уақыт намаз · ' + esc(dateText(ymd, false)) + '</h3>' + prayerListHTML(ymd, now, homeDay === 0) +
      (timesFor(ymd).approx ? '<p class="muted small">Жоғары ендік: Таң/Құптан түннің жетінші бөлігі әдісімен жуықталған.</p>' : '');
    bindBells($('#homeTimes'));
  }
  function renderLoc() {
    var l = loc(); $('#locName').textContent = l.name;
    $('#locSub').textContent = l.mode === 'gps' ? 'GPS · ' + l.tz : l.mode === 'manual' ? 'Қолмен енгізілген · ' + l.tz : 'Қазақстан';
  }
  function renderHome() {
    var now = new Date(); renderLoc(); renderDayStrip(); renderHero(now); renderStats(); renderSun(now); renderNext(now); renderHomeTimes(now);
    bindDayStrip();
  }
  function bindDayStrip() {
    $$('#dayStrip button').forEach(function (b) {
      b.onclick = function () { homeDay = +b.getAttribute('data-off'); haptic('select'); renderDayStrip(); renderHomeTimes(new Date()); bindDayStrip(); };
    });
  }

  /* ---------- Намаз беті ---------- */
  var pDate = null;
  function renderPrayerSettings() {
    var s = S.settings, opts = Object.keys(P.METHODS).map(function (k) { return '<option value="' + k + '"' + (s.method === k ? ' selected' : '') + '>' + P.METHODS[k].name + (k !== 'CUSTOM' ? ' (' + P.METHODS[k].fajr + '° / ' + P.METHODS[k].isha + '°)' : '') + '</option>'; }).join('');
    $('#prayerSettings').innerHTML = '<div class="field"><label>Есептеу әдісі (Таң / Құптан бұрыштары)</label><select id="pMethod">' + opts + '</select></div>' +
      (s.method === 'CUSTOM' ? '<div class="field" style="grid-template-columns:1fr 1fr;gap:10px"><div><label class="muted small">Таң бұрышы °</label><input type="number" id="pFajr" step="0.5" min="10" max="25" value="' + s.fajrAngle + '"></div><div><label class="muted small">Құптан бұрышы °</label><input type="number" id="pIsha" step="0.5" min="10" max="25" value="' + s.ishaAngle + '"></div></div>' : '') +
      '<div class="field"><label>Екінті намазының уақыты (мәзһаб)</label><div class="seg" id="pMadhab"><button data-h="1" class="' + (s.hanafi ? 'on' : '') + '">Ханафи (көлеңке 2 есе)</button><button data-h="0" class="' + (!s.hanafi ? 'on' : '') + '">Шафиғи / жұмһур (1 есе)</button></div></div>' +
      '<p class="muted small" style="margin:0">Орын: ' + esc(loc().name) + ' · ' + esc(loc().tz) + '. Есептеу құрылғыда жасалады (интернетсіз де жұмыс істейді). Жергілікті мешіт кестесімен салыстырып, қажет болса әдісті өзгертіңіз.</p>';
    $('#pMethod').onchange = function () { S.settings.method = this.value; save(); firedClear(); renderPrayerSettings(); renderPrayerAll(); renderHome(); };
    var f = $('#pFajr'), i = $('#pIsha');
    if (f) f.onchange = function () { var v = parseFloat(this.value); if (v >= 10 && v <= 25) { S.settings.fajrAngle = v; save(); renderPrayerAll(); renderHome(); } else { this.value = S.settings.fajrAngle; toast('Бұрыш 10°–25° аралығында болуы керек'); } };
    if (i) i.onchange = function () { var v = parseFloat(this.value); if (v >= 10 && v <= 25) { S.settings.ishaAngle = v; save(); renderPrayerAll(); renderHome(); } else { this.value = S.settings.ishaAngle; toast('Бұрыш 10°–25° аралығында болуы керек'); } };
    $$('#pMadhab button').forEach(function (b) { b.onclick = function () { S.settings.hanafi = b.getAttribute('data-h') === '1'; save(); firedClear(); renderPrayerSettings(); renderPrayerAll(); renderHome(); }; });
  }
  function renderPrayerDay() {
    var now = new Date(), t0 = todayYMD(now); pDate = pDate || t0;
    var iso = pDate.y + '-' + pad(pDate.m) + '-' + pad(pDate.d), isToday = iso === (t0.y + '-' + pad(t0.m) + '-' + pad(t0.d));
    $('#prayerDate').value = iso; $('#prayerDateLabel').textContent = dateText(pDate, true) + (isToday ? ' · бүгін' : '');
    $('#prayerDay').innerHTML = prayerListHTML(pDate, now, isToday); bindBells($('#prayerDay'));
    $('#prayerNote').textContent = timesFor(pDate).approx ? 'Жоғары ендік: Таң/Құптан түннің жетінші бөлігі әдісімен жуықталған.' : 'Жергілікті уақыт белдеуі: ' + loc().tz;
  }
  var schedDays = 14;
  function renderSchedule() {
    var base = todayYMD(), rows = '';
    for (var i = 0; i < schedDays; i++) {
      var y = P.addDays(base, i), t = timesFor(y);
      rows += '<tr class="' + (i === 0 ? 'today' : '') + '"><td>' + y.d + ' ' + DATA.MONTHS[y.m - 1].slice(0, 3) + ' <span class="muted small">' + DATA.WEEKDAYS_SHORT[new Date(Date.UTC(y.y, y.m - 1, y.d)).getUTCDay()] + '</span></td>' + ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map(function (k) { return '<td>' + fmtT(t[k]) + '</td>'; }).join('') + '</tr>';
    }
    $('#schedTable').innerHTML = '<thead><tr><th>Күн</th><th>Таң</th><th>Шығу</th><th>Бесін</th><th>Екінті</th><th>Ақшам</th><th>Құптан</th></tr></thead><tbody>' + rows + '</tbody>' +
      (schedDays < 31 ? '<tfoot><tr><td colspan="7"><button class="chip" id="moreDays" style="margin-top:8px">Айдың соңына дейін көрсету (31 күн)</button></td></tr></tfoot>' : '');
    var mb = $('#moreDays'); if (mb) mb.onclick = function () { schedDays = 31; renderSchedule(); };
  }
  function renderPrayerAll() { renderPrayerDay(); renderSchedule(); }
  function bindPrayerScreen() {
    $('#dPrev').onclick = function () { pDate = P.addDays(pDate || todayYMD(), -1); renderPrayerDay(); };
    $('#dNext').onclick = function () { pDate = P.addDays(pDate || todayYMD(), 1); renderPrayerDay(); };
    $('#prayerDate').onchange = function () { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.value); if (m) { pDate = { y: +m[1], m: +m[2], d: +m[3] }; renderPrayerDay(); } };
  }

  /* ---------- Орын таңдау парағы ---------- */
  function openSheet(html, onMount) {
    var sh = $('#sheet'); sh.innerHTML = '<div class="panel">' + html + '</div>'; sh.hidden = false;
    sh.onclick = function (e) { if (e.target === sh) closeSheet(); };
    updateBack(); onMount && onMount(sh);
  }
  function closeSheet() { var sh = $('#sheet'); sh.hidden = true; sh.innerHTML = ''; updateBack(); }
  function openLocSheet() {
    var l = loc();
    openSheet('<h3 class="h3">Орынды таңдау</h3><button class="btn primary" id="gpsBtn" style="width:100%">📍 GPS арқылы анықтау</button>' +
      '<div class="group-title">Қазақстан қалалары</div><div class="city-grid">' + DATA.CITIES.map(function (c) { return '<button class="chip ' + (l.cityId === c.id ? 'on' : '') + '" data-city="' + c.id + '">' + c.name + '</button>'; }).join('') + '</div>' +
      '<div class="group-title">Координатаны қолмен енгізу</div><div class="field" style="grid-template-columns:1fr 1fr;gap:10px"><div><label class="muted small">Ендік (−90…90)</label><input id="mLat" type="text" inputmode="decimal" placeholder="47.0945" value="' + l.lat + '"></div><div><label class="muted small">Бойлық (−180…180)</label><input id="mLng" type="text" inputmode="decimal" placeholder="51.9238" value="' + l.lng + '"></div></div>' +
      '<div class="field"><label>Уақыт белдеуі (IANA, мысалы Asia/Almaty)</label><input id="mTz" type="text" value="' + esc(l.tz) + '"></div>' +
      '<div class="row-btns"><button class="btn primary" id="mSave">Сақтау</button><button class="btn" id="mClose">Жабу</button></div>',
      function (sh) {
        $('#gpsBtn', sh).onclick = function () { requestGPS(function (ok) { if (ok) closeSheet(); }); };
        $$('[data-city]', sh).forEach(function (b) { b.onclick = function () { setCity(b.getAttribute('data-city')); closeSheet(); toast('Қала: ' + loc().name); }; });
        $('#mClose', sh).onclick = closeSheet;
        $('#mSave', sh).onclick = function () {
          var lat = parseFloat($('#mLat', sh).value.replace(',', '.')), lng = parseFloat($('#mLng', sh).value.replace(',', '.')), tz = $('#mTz', sh).value.trim();
          try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch (e) { toast('Уақыт белдеуі жарамсыз. Мысалы: Asia/Almaty'); return; }
          if (!setCoords(lat, lng, tz, 'manual')) { toast('Координата жарамсыз: ендік −90…90, бойлық −180…180'); return; }
          closeSheet(); toast('Орын сақталды');
        };
      });
  }

  /* ---------- Баптаулар ---------- */
  function swRow(label, sub, id, on) { return '<div class="set-row"><div>' + label + (sub ? '<small>' + sub + '</small>' : '') + '</div><label class="switch"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><i></i></label></div>'; }
  function renderSettings() {
    var s = S.settings, cityOpts = DATA.CITIES.map(function (c) { return '<option value="' + c.id + '"' + (s.loc.cityId === c.id ? ' selected' : '') + '>' + c.name + '</option>'; }).join('');
    var rec = DATA.RECITERS.map(function (r) { return '<option value="' + r.id + '"' + (s.reciter === r.id ? ' selected' : '') + '>' + r.name + '</option>'; }).join('');
    var lead = [0, 5, 10, 15, 30].map(function (m) { return '<option value="' + m + '"' + (s.remindBefore === m ? ' selected' : '') + '>' + (m ? m + ' минут бұрын' : 'Алдын ала еске салусыз') + '</option>'; }).join('');
    $('#settingsBody').innerHTML =
      '<div class="group-title">Көрініс</div><div class="card">' +
      '<div class="field"><label>Интерфейс тілі</label><select disabled><option>Қазақша</option></select></div>' +
      '<div class="field"><label>Тақырып</label><div class="seg" id="sTheme">' + [['auto', 'Авто'], ['light', 'Ашық'], ['dark', 'Қараңғы']].map(function (x) { return '<button data-v="' + x[0] + '" class="' + (s.theme === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="set-row"><div>Қосымша жарықтығы<small>Қосымша ішінде экранды қараңғылату (0–60%). Құрылғының жарықтығын Telegram/браузер басқара алмайды — оны жүйе баптауынан өзгертіңіз.</small></div><input type="range" id="sDim" min="0" max="60" value="' + s.dim + '"></div></div>' +
      '<div class="group-title">Орын және намаз есебі</div><div class="card">' +
      '<div class="field"><label>Қала</label><select id="sCity"><option value="">' + (s.loc.cityId ? 'Қала таңдаңыз' : esc(s.loc.name) + ' (' + (s.loc.mode === 'gps' ? 'GPS' : 'қолмен') + ')') + '</option>' + cityOpts + '</select></div>' +
      '<div class="row-btns" style="margin:0 0 12px"><button class="btn" id="sGps">📍 GPS</button><button class="btn" id="sManual">Координата / уақыт белдеуі</button></div>' +
      '<div class="muted small">Уақыт белдеуі: ' + esc(s.loc.tz) + ' · Әдіс: ' + esc(P.METHODS[s.method].name) + ' · Екінті: ' + (s.hanafi ? 'Ханафи' : 'Шафиғи') + ' (бұл параметрлерді «Намаз» бөлімінде өзгертесіз)</div></div>' +
      '<div class="group-title">Хабарландыру және дыбыс</div><div class="card">' +
      swRow('Хабарландырулар', 'Қосымша ашық тұрғанда ғана хабар көрсетеді', 'sNotify', s.notify) +
      swRow('Азан уақыты кіргенде хабарлау', 'Намаз уақыты кірген сәтте', 'sAzan', s.azanNotice) +
      '<div class="field" style="margin-top:12px"><label>Алдын ала еске салу</label><select id="sLead">' + lead + '</select></div>' +
      swRow('Еске салу дыбысы', 'Қысқа сигнал', 'sSound', s.remindSound) +
      '<div class="set-row"><div>Дыбыс деңгейі<small>Сигналдар мен зікір санағышы үшін</small></div><input type="range" id="sVol" min="0" max="100" value="' + s.volume + '"></div>' +
      swRow('Діріл', 'Telegram/құрылғы қолдаса', 'sVib', s.vibrate) +
      swRow('Тыныш уақыт аралығы', 'Осы уақытта хабар мен сигнал берілмейді', 'sQuiet', s.quiet.on) +
      '<div class="field" style="grid-template-columns:1fr 1fr;gap:10px;margin-top:10px"><div><label class="muted small">Басталуы</label><input type="time" id="sQFrom" value="' + s.quiet.from + '"></div><div><label class="muted small">Аяқталуы</label><input type="time" id="sQTo" value="' + s.quiet.to + '"></div></div>' +
      '<div class="group-title" style="margin:10px 0 4px">Әр намазға жеке хабарлама</div>' +
      P.ORDER.map(function (k) { return swRow(DATA.PRAYER_NAMES[k], '', 'sP_' + k, s.prayerNotify[k]); }).join('') +
      '<p class="muted small">Қосымша жабық тұрғанда хабар жіберу үшін Telegram бот сервері қажет (серверлік бөлім: <code>server/</code> қалтасы, бот токені мен хостинг баптауы керек).</p></div>' +
      '<div class="group-title">Құран</div><div class="card">' +
      '<div class="field"><label>Қари</label><select id="sRec">' + rec + '</select></div>' +
      swRow('Қазақша аударманы көрсету', '', 'sKk', s.showKk) + swRow('Аудионы автоматты түрде келесі аятқа ауыстыру', '', 'sAuto', s.autoNext) +
      '<div class="set-row"><div>Араб қарпінің өлшемі</div><input type="range" id="sQfs" min="22" max="44" value="' + s.qfs + '"></div></div>' +
      '<div class="group-title">Деректер</div><div class="card"><p class="muted small" style="margin-top:0">Таңдаулар құрылғыда (және Telegram бұлтында) сақталады. Қажет болса, бәрін бастапқы күйге қайтарыңыз.</p><button class="btn danger" id="sReset">Барлық деректі тазалау</button></div>';
    bindSettings();
  }
  function bindSettings() {
    var s = S.settings;
    $$('#sTheme button').forEach(function (b) { b.onclick = function () { s.theme = b.getAttribute('data-v'); save(); applyTheme(); renderSettings(); }; });
    $('#sDim').oninput = function () { s.dim = +this.value; applyTheme(); save(); };
    $('#sCity').onchange = function () { if (this.value) { setCity(this.value); toast('Қала: ' + loc().name); renderSettings(); } };
    $('#sGps').onclick = function () { requestGPS(function () { renderSettings(); }); };
    $('#sManual').onclick = openLocSheet;
    function sw(id, fn) { $(id).onchange = function () { fn(this.checked); save(); haptic('select'); }; }
    sw('#sNotify', function (v) { s.notify = v; renderNext(new Date()); renderHomeTimes(new Date()); });
    sw('#sAzan', function (v) { s.azanNotice = v; }); sw('#sSound', function (v) { s.remindSound = v; if (v) beep(); });
    sw('#sVib', function (v) { s.vibrate = v; if (v) haptic('heavy'); }); sw('#sQuiet', function (v) { s.quiet.on = v; });
    sw('#sKk', function (v) { s.showKk = v; }); sw('#sAuto', function (v) { s.autoNext = v; });
    P.ORDER.forEach(function (k) { sw('#sP_' + k, function (v) { s.prayerNotify[k] = v; renderHomeTimes(new Date()); renderNext(new Date()); }); });
    $('#sLead').onchange = function () { s.remindBefore = +this.value; firedClear(); save(); renderNext(new Date()); };
    $('#sVol').onchange = function () { s.volume = +this.value; save(); beep('click'); };
    $('#sQFrom').onchange = function () { if (this.value) { s.quiet.from = this.value; save(); } }; $('#sQTo').onchange = function () { if (this.value) { s.quiet.to = this.value; save(); } };
    $('#sRec').onchange = function () { s.reciter = this.value; save(); };
    $('#sQfs').oninput = function () { s.qfs = +this.value; document.documentElement.style.setProperty('--qfs', s.qfs + 'px'); save(); };
    $('#sReset').onclick = function () {
      if (!confirm('Барлық баптау, зікір санағыштары мен бетбелгілер өшіріледі. Жалғастырасыз ба?')) return;
      S = clone(DEFAULTS); try { localStorage.removeItem(LS); localStorage.removeItem(WKEY); } catch (e) { /* ескеру */ }
      var cs = tg && tg.CloudStorage; if (cs && inTelegram) tgTry(function () { cs.removeItems(['nur_settings', 'nur_dhikr', 'nur_bm']); });
      weatherCache = null; save(); applyTheme(); renderAll(); loadWeather(true); toast('Деректер тазаланды');
    };
  }

  /* ---------- Еске салу қозғалтқышы ---------- */
  var fired = {};
  function firedClear() { fired = {}; }
  function inQuiet(now) {
    var q = S.settings.quiet; if (!q.on) return false;
    var parts = clockText(now, false).split(':'), cur = +parts[0] * 60 + +parts[1];
    var f = q.from.split(':'), t = q.to.split(':'), a = +f[0] * 60 + +f[1], b = +t[0] * 60 + +t[1];
    return a === b ? false : (a < b ? (cur >= a && cur < b) : (cur >= a || cur < b));
  }
  function checkReminders(now) {
    var s = S.settings; if (!s.notify) return;
    var ymd = todayYMD(now), t = timesFor(ymd), tomorrow = timesFor(P.addDays(ymd, 1));
    P.ORDER.concat(['fajr2']).forEach(function (k) {
      var key = k === 'fajr2' ? 'fajr' : k, T = k === 'fajr2' ? tomorrow.fajr : t[key]; // ертеңгі Таңға алдын ала еске салу үшін
      if (!T || !s.prayerNotify[key]) return;
      [['at', 0, s.azanNotice], ['pre', s.remindBefore * 60000, s.remindBefore > 0]].forEach(function (m) {
        if (!m[2]) return;
        var at = T.getTime() - m[1], id = ymd.y + '-' + ymd.m + '-' + ymd.d + k + m[0];
        if (now.getTime() >= at && now.getTime() - at < 90000 && !fired[id]) {
          fired[id] = 1; if (inQuiet(now)) return;
          var name = DATA.PRAYER_NAMES[key];
          toast(m[0] === 'at' ? name + ' намазының уақыты кірді (' + fmtT(T) + ')' : name + ' намазына ' + s.remindBefore + ' минут қалды (' + fmtT(T) + ')', 9000);
          haptic('success'); if (s.remindSound) beep();
        }
      });
    });
  }

  /* ---------- Тік ---------- */
  var lastMinute = -1;
  function tick() {
    var now = new Date(), el;
    if ((el = $('#heroClock'))) el.textContent = clockText(now, true);
    if (nextInfo && nextInfo.time) {
      if (nextInfo.time <= now) { renderNext(now); renderHomeTimes(now); } // келесі намазға ауысу
      else if ((el = $('#countdown'))) {
        el.textContent = hms(nextInfo.time - now);
        var l = loc(), prev = P.previousPrayerTime(now, nextInfo, l.lat, l.lng, l.tz, pOpts()), tot = nextInfo.time - prev;
        if ((el = $('#nextProg')) && tot > 0) el.style.width = Math.max(0, Math.min(100, (now - prev) / tot * 100)).toFixed(1) + '%';
      }
    }
    var m = Math.floor(now.getTime() / 60000);
    if (m !== lastMinute) {
      lastMinute = m; renderSun(now); renderLoc(); if (!$('#sheet').hasChildNodes()) { if (screen === 'home') { renderDayStrip(); bindDayStrip(); renderHomeTimes(now); } }
      if (weatherCache && Date.now() - weatherCache.ts > 20 * 60000 && navigator.onLine !== false) loadWeather(true);
    }
    checkReminders(now);
  }

  /* ---------- Маршрутизатор ---------- */
  var screen = 'home';
  var SCREENS = ['home', 'prayer', 'quran', 'qibla', 'dhikr', 'settings'];
  function go(name, opts) {
    if (SCREENS.indexOf(name) < 0) name = 'home';
    if (name !== 'qibla' && window.NurQibla) window.NurQibla.stop();
    screen = name;
    SCREENS.forEach(function (n) { var e = $('#screen-' + n); if (e) e.hidden = n !== name; });
    $$('#nav button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-go') === name); });
    if (name === 'prayer') { renderPrayerSettings(); renderPrayerAll(); }
    if (name === 'settings') renderSettings();
    if (name === 'quran' && window.NurQuran) window.NurQuran.show();
    if (name === 'qibla' && window.NurQibla) window.NurQibla.show();
    if (name === 'dhikr' && window.NurDhikr) window.NurDhikr.show();
    if (name === 'home') { renderHome(); }
    if (!(opts && opts.keepScroll)) window.scrollTo(0, 0);
    if (location.hash !== '#' + name) { try { history.replaceState(null, '', '#' + name); } catch (e) { /* file:// */ } }
    updateBack();
  }
  function updateBack() {
    if (!tg || !tg.BackButton) return;
    var need = screen !== 'home' || !$('#sheet').hidden || (window.NurQuran && window.NurQuran.inReader());
    tgTry(function () { need ? tg.BackButton.show() : tg.BackButton.hide(); });
  }
  function back() {
    if (!$('#sheet').hidden) { closeSheet(); return; }
    if (screen === 'quran' && window.NurQuran && window.NurQuran.inReader()) { window.NurQuran.closeReader(); return; }
    go('home');
  }
  if (tg && tg.BackButton) tgTry(function () { tg.BackButton.onClick(back); });

  function renderAll() { renderHome(); if (screen === 'prayer') { renderPrayerSettings(); renderPrayerAll(); } if (screen === 'settings') renderSettings(); }

  function init() {
    applyTheme(); document.documentElement.style.setProperty('--qfs', S.settings.qfs + 'px');
    $$('#nav button').forEach(function (b) { b.onclick = function () { haptic('select'); go(b.getAttribute('data-go')); }; });
    $('#settingsBtn').onclick = function () { go('settings'); };
    $('#locBtn').onclick = openLocSheet;
    bindPrayerScreen();
    function net() { $('#offlineBar').hidden = navigator.onLine !== false; if (navigator.onLine !== false) loadWeather(false); }
    window.addEventListener('online', net); window.addEventListener('offline', net);
    var start = (location.hash || '').replace('#', ''); go(SCREENS.indexOf(start) >= 0 ? start : 'home');
    net(); loadWeather(false); cloudLoad();
    setInterval(tick, 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { tick(); renderHome(); if (navigator.onLine !== false) loadWeather(false); } });
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) navigator.serviceWorker.register('sw.js').catch(function () { /* міндетті емес */ });
    window.addEventListener('hashchange', function () { var n = (location.hash || '').replace('#', ''); if (n !== screen && SCREENS.indexOf(n) >= 0) go(n); });
  }

  window.Nur = { S: function () { return S; }, save: save, esc: esc, $: $, $$: $$, toast: toast, haptic: haptic, beep: beep, loc: loc, go: go, tg: tg, inTelegram: inTelegram,
    deviceTZ: deviceTZ, requestGPS: requestGPS, setCoords: setCoords, openLocSheet: openLocSheet, fetchJSON: fetchJSON, lsGet: lsGet, lsSet: lsSet, todayYMD: todayYMD,
    openSheet: openSheet, closeSheet: closeSheet, updateBack: updateBack, clone: clone, pad: pad };
  window.__nurDebug = { timesFor: timesFor, tick: tick, getWeather: function () { return weatherCache; } };
  /* Модульдер (quran.js, qibla.js, dhikr.js) app.js-тен кейін жүктеледі; init — DOMContentLoaded-те */
  if (document.readyState === 'complete') init(); else document.addEventListener('DOMContentLoaded', init);
})();
