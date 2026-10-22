/* Нұр — Telegram бот сервері (тәуелділіксіз, Node 18+).
   Міндеттері: /start → Mini App түймесі; initData қол қоюын тексеру; пайдаланушы баптауын сақтау;
   намаз уақыты кіргенде/алдын ала бот арқылы хабар жіберу (қосымша жабық болса да).
   БОТ ТОКЕНІ тек осы серверде, ортa айнымалысында (BOT_TOKEN) сақталады — клиент кодына ЕШҚАШАН қосылмайды. */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const P = require('../js/prayer.js');

const NAMES = { fajr: 'Таң', dhuhr: 'Бесін', asr: 'Екінті', maghrib: 'Ақшам', isha: 'Құптан' };
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'users.json');

/* Telegram Mini Apps құжаты бойынша initData тексеру: secret = HMAC_SHA256("WebAppData", token) */
function validateInitData(initData, token, maxAgeSec = 86400, nowSec = Math.floor(Date.now() / 1000)) {
  if (!initData || !token) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash'); if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
  const a = Buffer.from(calc, 'hex'), b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const authDate = +params.get('auth_date'); if (!authDate || nowSec - authDate > maxAgeSec) return null;
  try { return JSON.parse(params.get('user')); } catch (e) { return null; }
}

function loadDB() { try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { return {}; } }
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db)); }

/* Баптауды тексеру (клиентке сенбейміз) */
function sanitize(s) {
  if (!s || typeof s !== 'object') return null;
  const l = s.loc || {}, lat = +l.lat, lng = +l.lng;
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  try { new Intl.DateTimeFormat('en', { timeZone: l.tz }); } catch (e) { return null; }
  const q = s.quiet || {}, okT = (t) => /^\d\d:\d\d$/.test(t || '');
  const pn = {}; Object.keys(NAMES).forEach(k => pn[k] = !!(s.prayerNotify || {})[k]);
  return { notify: !!s.notify, azanNotice: !!s.azanNotice, remindBefore: [0, 5, 10, 15, 30].includes(+s.remindBefore) ? +s.remindBefore : 10,
    loc: { lat, lng, tz: l.tz, name: String(l.name || '').slice(0, 60) }, method: P.METHODS[s.method] ? s.method : 'MWL', hanafi: !!s.hanafi,
    fajrAngle: Math.min(25, Math.max(10, +s.fajrAngle || 18)), ishaAngle: Math.min(25, Math.max(10, +s.ishaAngle || 17)),
    quiet: { on: !!q.on, from: okT(q.from) ? q.from : '23:00', to: okT(q.to) ? q.to : '04:30' }, prayerNotify: pn };
}
function inQuiet(s, now) {
  if (!s.quiet.on) return false;
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: s.loc.tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now).split(':').map(Number);
  const cur = h * 60 + m, [fh, fm] = s.quiet.from.split(':').map(Number), [th, tm] = s.quiet.to.split(':').map(Number), a = fh * 60 + fm, b = th * 60 + tm;
  return a === b ? false : (a < b ? cur >= a && cur < b : cur >= a || cur < b);
}
/* Қазіргі минутта жіберілуі керек хабарлар */
function dueMessages(db, now) {
  const out = [], minute = Math.floor(now.getTime() / 60000);
  for (const [uid, u] of Object.entries(db)) {
    const s = u.settings; if (!s || !s.notify || inQuiet(s, now)) continue;
    const ymd = P.ymdInTZ(now, s.loc.tz), t = P.timesForDate(ymd.y, ymd.m, ymd.d, s.loc.lat, s.loc.lng, s),
      n = P.addDays(ymd, 1), tm = P.timesForDate(n.y, n.m, n.d, s.loc.lat, s.loc.lng, s);
    for (const k of Object.keys(NAMES)) {
      if (!s.prayerNotify[k]) continue;
      for (const T of (k === 'fajr' ? [t.fajr, tm.fajr] : [t[k]])) {
        if (!T) continue;
        const tMin = Math.floor(T.getTime() / 60000);
        if (s.azanNotice && minute === tMin) out.push({ uid, text: `🕌 ${NAMES[k]} намазының уақыты кірді (${P.fmt(T, s.loc.tz)}). ${s.loc.name}` });
        if (s.remindBefore > 0 && minute === tMin - s.remindBefore) out.push({ uid, text: `⏰ ${NAMES[k]} намазына ${s.remindBefore} минут қалды (${P.fmt(T, s.loc.tz)}). ${s.loc.name}` });
      }
    }
  }
  return out;
}

async function tgCall(token, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!j.ok) throw new Error(`${method}: ${j.description}`); return j.result;
}

function start() {
  const token = process.env.BOT_TOKEN, appUrl = process.env.WEBAPP_URL, port = +process.env.PORT || 8787, origin = process.env.ALLOW_ORIGIN || appUrl;
  if (!token || !appUrl) { console.error('BOT_TOKEN және WEBAPP_URL (https://...) ортa айнымалылары қажет.'); process.exit(1); }
  const send = (uid, text) => tgCall(token, 'sendMessage', { chat_id: uid, text }).catch(e => console.error('sendMessage қатесі', uid, e.message));
  tgCall(token, 'setChatMenuButton', { menu_button: { type: 'web_app', text: 'Нұр', web_app: { url: appUrl } } }).catch(e => console.error(e.message));

  // Минут сайын еске салу тексеру
  let lastMinute = 0;
  setInterval(() => {
    const now = new Date(), m = Math.floor(now.getTime() / 60000); if (m === lastMinute) return; lastMinute = m;
    dueMessages(loadDB(), now).forEach(x => send(x.uid, x.text));
  }, 5000);

  // Long polling: /start
  let offset = 0;
  (async function poll() {
    for (;;) {
      try {
        const ups = await tgCall(token, 'getUpdates', { offset, timeout: 30, allowed_updates: ['message'] });
        for (const u of ups) {
          offset = u.update_id + 1; const msg = u.message;
          if (msg && msg.text && msg.text.startsWith('/start'))
            await tgCall(token, 'sendMessage', { chat_id: msg.chat.id, text: 'Нұр — намаз уақыттары, Құран, құбыла және зікір.', reply_markup: { inline_keyboard: [[{ text: '🕌 Нұрды ашу', web_app: { url: appUrl } }]] } });
        }
      } catch (e) { console.error('poll қатесі:', e.message); await new Promise(r => setTimeout(r, 3000)); }
    }
  })();

  // Баптауларды қабылдау: POST /api/settings  { initData, settings }
  http.createServer((req, res) => {
    const cors = { 'access-control-allow-origin': origin || '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (req.method !== 'POST' || req.url !== '/api/settings') { res.writeHead(404, cors); return res.end(); }
    let body = ''; req.on('data', c => { body += c; if (body.length > 20000) req.destroy(); });
    req.on('end', () => {
      let j; try { j = JSON.parse(body); } catch (e) { res.writeHead(400, cors); return res.end('{"ok":false}'); }
      const user = validateInitData(j.initData, token), s = sanitize(j.settings);
      if (!user) { res.writeHead(401, cors); return res.end('{"ok":false,"error":"initData жарамсыз"}'); }
      if (!s) { res.writeHead(400, cors); return res.end('{"ok":false,"error":"баптау жарамсыз"}'); }
      const db = loadDB(); db[user.id] = { settings: s, updated: Date.now() }; saveDB(db);
      res.writeHead(200, { ...cors, 'content-type': 'application/json' }); res.end('{"ok":true}');
    });
  }).listen(port, () => console.log('Нұр сервері жұмыс істеп тұр, порт', port));
}

module.exports = { validateInitData, sanitize, dueMessages, inQuiet };
if (require.main === module) start();
