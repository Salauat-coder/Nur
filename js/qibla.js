/* Нұр — құбыла компасы: Қағба бағыты (үлкен шеңбер), құрылғы сенсоры, GPS, қолмен енгізу */
(function () {
  'use strict';
  var N = window.Nur, $ = N.$, P = window.NurPrayer, esc = N.esc;
  var heading = null, smooth = null, running = false, gotEvent = false, alignedOnce = false, timer = null, perm = 'unknown';

  function qAngle() { var l = N.loc(); return P.qibla(l.lat, l.lng); }
  function drawTicks() {
    var g = $('#ticks'); if (g.childNodes.length) return; var s = '';
    for (var a = 0; a < 360; a += 10) { var r = a % 90 === 0 ? 8 : 5, rad = a * Math.PI / 180; s += '<line class="' + (a % 30 === 0 ? 'm' : '') + '" x1="' + (Math.sin(rad) * (100 - r)).toFixed(2) + '" y1="' + (-Math.cos(rad) * (100 - r)).toFixed(2) + '" x2="' + (Math.sin(rad) * 100).toFixed(2) + '" y2="' + (-Math.cos(rad) * 100).toFixed(2) + '"/>'; }
    g.innerHTML = s;
  }
  function diff(a, b) { var d = ((a - b + 540) % 360) - 180; return d; }
  function render() {
    var l = N.loc(), q = qAngle(), dist = P.distanceToKaaba(l.lat, l.lng);
    $('#qAngle').textContent = Math.round(q) + '°'; $('#qDist').textContent = Math.round(dist).toLocaleString('en-US').replace(/,/g, ' ') + ' км';
    $('#qiblaMark').setAttribute('transform', 'rotate(' + q.toFixed(1) + ')');
    var h = smooth == null ? 0 : smooth;
    $('#dial').setAttribute('transform', 'rotate(' + (-h).toFixed(1) + ')');
    $('#qHeading').textContent = smooth == null ? '—' : Math.round(smooth) + '°';
    var st = $('#qStatus'), comp = $('#compass');
    if (smooth == null) { comp.classList.remove('aligned'); return; }
    var d = Math.abs(diff(q, smooth));
    if (d <= 3) { comp.classList.add('aligned'); st.className = 'q-status ok'; st.textContent = '✓ Құбыла бағытындасыз'; if (!alignedOnce) { alignedOnce = true; N.haptic('success'); } }
    else { comp.classList.remove('aligned'); alignedOnce = false; var dir = diff(q, smooth); st.className = 'q-status'; st.textContent = (dir > 0 ? 'Оңға' : 'Солға') + ' ' + Math.round(Math.abs(dir)) + '° бұрылыңыз'; }
  }
  function onOrient(e) {
    var hd = null;
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) hd = e.webkitCompassHeading; // iOS (солтүстікке қатысты)
    else if (e.alpha != null && (e.absolute === true || e.type === 'deviceorientationabsolute')) {
      hd = (360 - e.alpha) % 360; var ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0; hd = (hd + ang + 360) % 360;
    }
    if (hd == null) return;
    gotEvent = true; heading = hd;
    if (smooth == null) smooth = hd; else smooth = (smooth + diff(hd, smooth) * 0.25 + 360) % 360;
    render();
  }
  function attach() {
    if (running) return; running = true;
    window.addEventListener('deviceorientationabsolute', onOrient, true);
    window.addEventListener('deviceorientation', onOrient, true);
    clearTimeout(timer); timer = setTimeout(function () {
      if (!gotEvent) {
        var st = $('#qStatus'); st.className = 'q-status warn';
        st.innerHTML = 'Құрылғы бағыт сенсоры жауап бермеді (сенсор жоқ, рұқсат берілмеген немесе браузер қолдамайды). Төмендегі бұрышты пайдаланыңыз: <b>' + Math.round(qAngle()) + '°</b> — солтүстіктен сағат тілімен өлшегенде Қағба бағыты. Ақиқат компаспен немесе картамен тексеріңіз.';
      }
    }, 2500);
  }
  function detach() { running = false; window.removeEventListener('deviceorientationabsolute', onOrient, true); window.removeEventListener('deviceorientation', onOrient, true); clearTimeout(timer); }
  function enableSensor() {
    var D = window.DeviceOrientationEvent;
    if (!D) { var st = $('#qStatus'); st.className = 'q-status warn'; st.textContent = 'Бұл құрылғыда бағыт сенсоры қолжетімсіз. Бұрышты қолмен пайдаланыңыз: ' + Math.round(qAngle()) + '°'; return; }
    if (typeof D.requestPermission === 'function') {
      D.requestPermission().then(function (r) {
        perm = r; if (r === 'granted') { attach(); N.toast('Сенсор қосылды'); }
        else { var st = $('#qStatus'); st.className = 'q-status warn'; st.textContent = 'Сенсорға рұқсат берілмеді. iOS баптауларынан (Safari/Telegram → Қозғалыс және бағдар) рұқсат беріңіз немесе бұрышты қолмен пайдаланыңыз: ' + Math.round(qAngle()) + '°'; }
      }).catch(function () { var st = $('#qStatus'); st.className = 'q-status warn'; st.textContent = 'Сенсор рұқсатын сұрау мүмкін болмады. Бұрыш: ' + Math.round(qAngle()) + '°'; });
    } else attach();
  }
  function manualCard() {
    var l = N.loc();
    $('#qManual').innerHTML = '<h3 class="h3">Орналасқан жер</h3><p class="muted" style="margin-top:0">' + esc(l.name) + ' · ' + l.lat.toFixed(4) + ', ' + l.lng.toFixed(4) + '. GPS-ке рұқсат бермесеңіз, қаланы таңдаңыз немесе координатаны қолмен енгізіңіз.</p><button class="btn" id="qChange">Қала / координата таңдау</button>';
    $('#qChange').onclick = N.openLocSheet;
  }
  function refresh() { drawTicks(); render(); manualCard(); }
  function show() {
    drawTicks(); refresh(); alignedOnce = false;
    var D = window.DeviceOrientationEvent, needBtn = D && typeof D.requestPermission === 'function';
    $('#qEnable').hidden = !D || (!needBtn && running && gotEvent);
    if (D && !needBtn) attach();
    else if (!D) { $('#qStatus').className = 'q-status warn'; $('#qStatus').textContent = 'Бағыт сенсоры қолжетімсіз. Құбыла бұрышы: ' + Math.round(qAngle()) + '° (солтүстіктен сағат тілімен).'; }
    else if (perm !== 'granted') { $('#qStatus').className = 'q-status'; $('#qStatus').textContent = 'Компасты қосу үшін «Сенсорды қосу» түймесін басыңыз.'; }
    else attach();
  }
  $('#qEnable').onclick = enableSensor;
  $('#qLoc').onclick = function () { N.requestGPS(function () { refresh(); }); };
  window.NurQibla = { show: show, stop: detach, refresh: function () { if (!$('#screen-qibla').hidden) refresh(); }, _onOrient: onOrient };
})();
