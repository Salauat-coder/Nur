/* Нұр — зікір және тасбих санағышы */
(function () {
  'use strict';
  var N = window.Nur, $ = N.$, $$ = N.$$, esc = N.esc, DATA = window.NurData;
  var TARGETS = [33, 99, 100, 500, 1000];
  var favOnly = false;

  function D() { return N.S().dhikr; }
  function item(id) { return DATA.ADHKAR.filter(function (a) { return a.id === id; })[0] || DATA.ADHKAR[0]; }
  function target(a) { return D().targets[a.id] || a.target; }
  function dayKey() { var y = N.todayYMD(); return y.y + '-' + N.pad(y.m) + '-' + N.pad(y.d); }

  function chips() {
    var d = D(), list = DATA.ADHKAR.filter(function (a) { return !favOnly || d.favs.indexOf(a.id) >= 0; });
    $('#dhikrChips').innerHTML = '<button class="chip ' + (favOnly ? 'on' : '') + '" data-fav="1">★ Таңдаулылар</button>' + list.map(function (a) { return '<button class="chip ' + (d.sel === a.id ? 'on' : '') + '" data-id="' + a.id + '">' + esc(a.short) + '</button>'; }).join('') +
      (favOnly && !list.length ? '<span class="muted small" style="align-self:center">Таңдаулы зікір жоқ</span>' : '');
    $$('#dhikrChips [data-id]').forEach(function (b) { b.onclick = function () { d.sel = b.getAttribute('data-id'); N.save(); N.haptic('select'); render(); }; });
    $('#dhikrChips [data-fav]').onclick = function () { favOnly = !favOnly; chips(); };
  }
  function card() {
    var d = D(), a = item(d.sel), cnt = d.counts[a.id] || 0, tg = target(a), C = 2 * Math.PI * 100, frac = Math.min(1, cnt / tg), fav = d.favs.indexOf(a.id) >= 0;
    $('#dhikrCard').innerHTML =
      '<div style="display:flex;justify-content:flex-end"><button class="chip" id="dFav">' + (fav ? '★ Таңдаулы' : '☆ Таңдаулыға қосу') + '</button></div>' +
      '<div class="dhikr-ar" lang="ar" dir="rtl">' + esc(a.ar) + '</div><div class="dhikr-kk">' + esc(a.kk) + '</div><div class="dhikr-mean">' + esc(a.mean) + '</div>' +
      '<div class="tasbih-wrap"><svg viewBox="0 0 230 230"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8e44f5"/><stop offset="1" stop-color="#ff4d6d"/></linearGradient></defs><circle class="ring-bg" cx="115" cy="115" r="100"/><circle class="ring-fg" id="ringFg" cx="115" cy="115" r="100" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - frac)).toFixed(1) + '"/></svg>' +
      '<button class="tap" id="tap" aria-label="Санау"><span><span id="cnt">' + cnt + '</span><small>/ ' + tg + '</small></span></button></div>' +
      '<div class="chips" style="justify-content:center;flex-wrap:wrap">' + TARGETS.map(function (t) { return '<button class="chip ' + (t === tg ? 'on' : '') + '" data-t="' + t + '">' + t + '</button>'; }).join('') + '<button class="chip ' + (TARGETS.indexOf(tg) < 0 ? 'on' : '') + '" id="tCustom">Өз санын енгізу</button></div>' +
      '<div class="row-btns" style="justify-content:center"><button class="btn" id="dUndo">−1</button><button class="btn danger" id="dReset">Нөлге түсіру</button></div>' +
      '<div class="src"><b>Дереккөзі:</b> ' + esc(a.src) + '. <i>Нақты хадис нөмірлері мен мәтінді діни маманмен тексеру ұсынылады.</i></div>';
    $('#tap').onclick = tap;
    $('#dFav').onclick = function () { var i = d.favs.indexOf(a.id); if (i >= 0) d.favs.splice(i, 1); else d.favs.push(a.id); N.save(); N.haptic('select'); render(); };
    $$('#dhikrCard [data-t]').forEach(function (b) { b.onclick = function () { d.targets[a.id] = +b.getAttribute('data-t'); N.save(); render(); }; });
    $('#tCustom').onclick = function () {
      var v = parseInt(prompt('Мақсатты санды енгізіңіз (1–100000):', String(tg)), 10);
      if (!isFinite(v) || v < 1 || v > 100000) { if (!isNaN(v)) N.toast('Сан 1 мен 100000 аралығында болуы керек'); return; }
      d.targets[a.id] = v; N.save(); render();
    };
    $('#dUndo').onclick = function () { if ((d.counts[a.id] || 0) > 0) { d.counts[a.id]--; var day = d.stats[dayKey()]; if (day && day[a.id] > 0) day[a.id]--; N.save(); update(); stats(); } };
    $('#dReset').onclick = function () { if (!(d.counts[a.id] || 0)) return; if (confirm('«' + a.kk + '» санағышын нөлге түсіресіз бе?')) { d.counts[a.id] = 0; N.save(); N.haptic('warn'); render(); } };
  }
  function update() {
    var d = D(), a = item(d.sel), cnt = d.counts[a.id] || 0, tg = target(a), C = 2 * Math.PI * 100;
    $('#cnt').textContent = cnt; $('#ringFg').setAttribute('stroke-dashoffset', (C * (1 - Math.min(1, cnt / tg))).toFixed(1));
  }
  function tap() {
    var d = D(), a = item(d.sel), tg = target(a); d.counts[a.id] = (d.counts[a.id] || 0) + 1;
    var k = dayKey(); d.stats[k] = d.stats[k] || {}; d.stats[k][a.id] = (d.stats[k][a.id] || 0) + 1;
    var c = d.counts[a.id];
    if (c === tg) { N.haptic('success'); N.beep(); N.toast('Мақсатқа жеттіңіз: ' + tg + ' · ' + a.kk, 3000); }
    else { N.haptic('light'); if (N.S().settings.remindSound) N.beep('click'); }
    N.save(); update(); stats();
  }
  function stats() {
    var d = D(), days = [], today = N.todayYMD(), P = window.NurPrayer;
    for (var i = 6; i >= 0; i--) { var y = P.addDays(today, -i), k = y.y + '-' + N.pad(y.m) + '-' + N.pad(y.d), o = d.stats[k] || {}, tot = Object.keys(o).reduce(function (s, id) { return s + o[id]; }, 0); days.push({ k: k, y: y, tot: tot, o: o }); }
    var max = Math.max.apply(null, days.map(function (x) { return x.tot; }).concat([1])), td = days[6];
    var rows = Object.keys(td.o).filter(function (id) { return td.o[id] > 0; }).map(function (id) { return '<div class="set-row"><span>' + esc(item(id).kk) + '</span><b>' + td.o[id] + '</b></div>'; }).join('');
    $('#dhikrStats').innerHTML = '<h3 class="h3">Күнделікті статистика</h3><div class="muted small">Бүгін барлығы: <b style="color:var(--text)">' + td.tot + '</b></div>' +
      '<div class="bars">' + days.map(function (x) { return '<div><i style="height:' + Math.max(3, Math.round(x.tot / max * 70)) + 'px" title="' + x.tot + '"></i>' + window.NurData.WEEKDAYS_SHORT[new Date(Date.UTC(x.y.y, x.y.m - 1, x.y.d)).getUTCDay()] + '<br><b style="color:var(--text)">' + x.tot + '</b></div>'; }).join('') + '</div>' +
      (rows ? '<div style="margin-top:10px">' + rows + '</div>' : '<p class="muted small">Бүгін әлі санақ жоқ.</p>');
  }
  function render() { chips(); card(); stats(); }
  window.NurDhikr = { show: render, _tap: tap };
})();
