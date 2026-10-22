/* Нұр — намаз уақыты, күн және құбыла есептеуі (тәуелсіз, офлайн жұмыс істейді).
   Браузерде window.NurPrayer, Node-та require арқылы қолданылады. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NurPrayer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  var sin = function (d) { return Math.sin(d * D2R); };
  var cos = function (d) { return Math.cos(d * D2R); };
  var tan = function (d) { return Math.tan(d * D2R); };
  var asin = function (x) { return Math.asin(x) * R2D; };
  var acos = function (x) { return Math.acos(x) * R2D; };
  var atan = function (x) { return Math.atan(x) * R2D; };
  var fix = function (a, b) { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };

  /* Есептеу әдістері: Таң және Құптан бұрыштары (градус) */
  var METHODS = {
    MWL:     { name: 'Мұсылман әлемі лигасы (MWL)', fajr: 18, isha: 17 },
    EGYPT:   { name: 'Египет бас басқармасы', fajr: 19.5, isha: 17.5 },
    KARACHI: { name: 'Карачи ислам ғылымдары университеті', fajr: 18, isha: 18 },
    ISNA:    { name: 'Солтүстік Америка (ISNA)', fajr: 15, isha: 15 },
    CUSTOM:  { name: 'Өз бұрыштарым', fajr: 18, isha: 17 }
  };

  function julian(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    var A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }

  /* Күннің ауытқуы (decl) және уақыт теңдеуі (eqt, сағат) */
  function sunPosition(jd) {
    var D = jd - 2451545.0;
    var g = fix(357.529 + 0.98560028 * D, 360);
    var q = fix(280.459 + 0.98564736 * D, 360);
    var L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360);
    var e = 23.439 - 0.00000036 * D;
    var RA = fix(Math.atan2(cos(e) * sin(L), cos(L)) * R2D / 15, 24);
    var eqt = q / 15 - RA;
    eqt = eqt - 24 * Math.round(eqt / 24);
    return { decl: asin(sin(e) * sin(L)), eqt: eqt };
  }

  /* (y, m, d) күні үшін UTC сағаттарымен уақыттар (сол күннің 00:00 UTC-нен). */
  function computeHours(y, m, d, lat, lng, opts) {
    var jd0 = julian(y, m, d) - lng / 360;
    var meth = opts.method === 'CUSTOM'
      ? { fajr: opts.fajrAngle, isha: opts.ishaAngle }
      : (METHODS[opts.method] || METHODS.MWL);
    var transit = 12 - lng / 15;
    for (var i = 0; i < 4; i++) transit = 12 - sunPosition(jd0 + transit / 24).eqt - lng / 15;

    function byAngle(angle, before) {
      var g = transit, out = NaN;
      for (var k = 0; k < 4; k++) {
        var sp = sunPosition(jd0 + g / 24);
        var c = (-sin(angle) - sin(lat) * sin(sp.decl)) / (cos(lat) * cos(sp.decl));
        if (c > 1 || c < -1) return NaN;
        var t = acos(c) / 15;
        out = before ? transit - t : transit + t;
        g = out;
      }
      return out;
    }
    var sunrise = byAngle(0.833, true), sunset = byAngle(0.833, false);
    var fajr = byAngle(meth.fajr, true), isha = byAngle(meth.isha, false);

    var asr = NaN, g = transit + 3, factor = opts.hanafi ? 2 : 1;
    for (var k = 0; k < 4; k++) {
      var sp = sunPosition(jd0 + g / 24);
      var a = atan(1 / (factor + tan(Math.abs(lat - sp.decl)))); /* Асрдағы күн биіктігі (оң) */
      var c = (sin(a) - sin(lat) * sin(sp.decl)) / (cos(lat) * cos(sp.decl));
      if (c > 1 || c < -1) { asr = NaN; break; }
      asr = transit + acos(c) / 15; g = asr;
    }

    /* Жоғары ендікте (Таң/Құптан бұрышы жетпесе) — түннің жетінші бөлігі */
    var approx = false;
    if (!isNaN(sunrise) && !isNaN(sunset)) {
      var portion = fix(sunrise - sunset, 24) / 7;
      if (isNaN(fajr) || (sunrise - fajr) > portion) { fajr = sunrise - portion; approx = true; }
      if (isNaN(isha) || (isha - sunset) > portion) { isha = sunset + portion; approx = true; }
    }
    return { fajr: fajr, sunrise: sunrise, dhuhr: transit, asr: asr, maghrib: sunset, isha: isha, approx: approx };
  }

  var KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

  /* Жергілікті күнтізбе күні (y, mo, d) үшін Date нысандары (минутқа дейін дөңгелектелген) */
  function timesForDate(y, mo, d, lat, lng, opts) {
    opts = opts || {};
    var h = computeHours(y, mo, d, lat, lng, {
      method: opts.method || 'MWL', hanafi: !!opts.hanafi, fajrAngle: opts.fajrAngle, ishaAngle: opts.ishaAngle
    });
    var adj = opts.adjust || {};
    var base = Date.UTC(y, mo - 1, d);
    var out = { approx: h.approx };
    KEYS.forEach(function (k) {
      var v = h[k];
      if (isNaN(v)) { out[k] = null; return; }
      var min = Math.round(v * 60) + (adj[k] || 0);
      out[k] = new Date(base + min * 60000);
    });
    return out;
  }

  /* Құбыла: Қағбаға бағыт, солтүстіктен сағат тілімен (градус) */
  var KAABA = { lat: 21.422487, lng: 39.826206 };
  function qibla(lat, lng) {
    var dl = (KAABA.lng - lng) * D2R, p1 = lat * D2R, p2 = KAABA.lat * D2R;
    var y = Math.sin(dl) * Math.cos(p2);
    var x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return fix(Math.atan2(y, x) * R2D, 360);
  }
  function distanceToKaaba(lat, lng) {
    var R = 6371, dLat = (KAABA.lat - lat) * D2R, dLng = (KAABA.lng - lng) * D2R;
    var a = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(lat * D2R) * Math.cos(KAABA.lat * D2R) * Math.pow(Math.sin(dLng / 2), 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function ymdInTZ(date, tz) {
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    var o = {}; p.forEach(function (x) { o[x.type] = x.value; });
    return { y: +o.year, m: +o.month, d: +o.day };
  }
  function addDays(ymd, n) {
    var t = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + n));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  function fmt(date, tz) {
    if (!date) return '—';
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }

  var ORDER = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

  /* Жергілікті (tz) күнтізбе күні бойынша: Date нысандары — UTC күн жылжуын ескереді.
     Қазақстанда Таң кейде алдыңғы UTC күніне түседі, бірақ мс арифметикасы дұрыс жұмыс істейді. */
  function nextPrayer(now, lat, lng, tz, opts) {
    var ymd = ymdInTZ(now, tz);
    var today = timesForDate(ymd.y, ymd.m, ymd.d, lat, lng, opts);
    for (var i = 0; i < ORDER.length; i++) {
      var t = today[ORDER[i]];
      if (t && t > now) return { key: ORDER[i], time: t, today: today, tomorrow: false };
    }
    var n = addDays(ymd, 1);
    var tm = timesForDate(n.y, n.m, n.d, lat, lng, opts);
    return { key: 'fajr', time: tm.fajr, today: today, tomorrow: true };
  }

  /* Алдыңғы намаз (ағымдағы уақыт аралығының басы) — прогресс сызығы үшін */
  function previousPrayerTime(now, nextInfo, lat, lng, tz, opts) {
    var ymd = ymdInTZ(now, tz);
    var today = nextInfo.today;
    var idx = ORDER.indexOf(nextInfo.key);
    if (!nextInfo.tomorrow && idx > 0) return today[ORDER[idx - 1]];
    var y = addDays(ymd, nextInfo.tomorrow ? 0 : -1);
    var prev = timesForDate(y.y, y.m, y.d, lat, lng, opts);
    return prev.isha;
  }

  return { METHODS: METHODS, KEYS: KEYS, ORDER: ORDER, KAABA: KAABA, julian: julian, sunPosition: sunPosition,
           timesForDate: timesForDate, qibla: qibla, distanceToKaaba: distanceToKaaba, ymdInTZ: ymdInTZ,
           addDays: addDays, fmt: fmt, nextPrayer: nextPrayer, previousPrayerTime: previousPrayerTime };
});
