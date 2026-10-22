// Серверлік логиканы жергілікті тексеру (Telegram-ға қосылусыз): initData қолтаңбасы, баптау тазалау, еске салу кестесі
const crypto = require('crypto'); const B = require('../server/bot.js'); let fail = 0;
const ok = (n, c, i) => { console.log((c ? '✅' : '❌') + ' ' + n + (c ? '' : ' ' + (i || ''))); if (!c) fail++; };
const TOKEN = '123456:TEST_TOKEN_NOT_REAL';
function sign(fields, token) {
  const check = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}
const now = Math.floor(Date.now() / 1000), user = JSON.stringify({ id: 42, first_name: 'T' });
const good = sign({ auth_date: now, user, query_id: 'q' }, TOKEN);
ok('Дұрыс initData қабылданады', (B.validateInitData(good, TOKEN) || {}).id === 42);
ok('Басқа токенмен қол қойылған — қабылданбайды', B.validateInitData(sign({ auth_date: now, user }, 'other:token'), TOKEN) === null);
ok('Өзгертілген деректер — қабылданбайды', B.validateInitData(good.replace('query_id=q', 'query_id=x'), TOKEN) === null);
ok('Ескірген auth_date — қабылданбайды', B.validateInitData(sign({ auth_date: now - 200000, user }, TOKEN), TOKEN) === null);
ok('hash жоқ — қабылданбайды', B.validateInitData('auth_date=1&user=%7B%7D', TOKEN) === null);
ok('Бос токен — қабылданбайды', B.validateInitData(good, '') === null);
const s = { notify: true, azanNotice: true, remindBefore: 10, loc: { lat: 47.0945, lng: 51.9238, tz: 'Asia/Atyrau', name: 'Атырау' }, method: 'MWL', hanafi: true, quiet: { on: false }, prayerNotify: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true } };
ok('Дұрыс баптау тазаланады', B.sanitize(s) && B.sanitize(s).loc.tz === 'Asia/Atyrau');
ok('Жарамсыз ендік қабылданбайды', B.sanitize({ ...s, loc: { ...s.loc, lat: 120 } }) === null);
ok('Жарамсыз уақыт белдеуі қабылданбайды', B.sanitize({ ...s, loc: { ...s.loc, tz: 'Mars/X' } }) === null);
ok('Артық өрістер лақтырылады', !('evil' in B.sanitize({ ...s, evil: 1 })));
const db = { 42: { settings: B.sanitize(s) } }, P = require('../js/prayer.js');
const t = P.timesForDate(2026, 10, 20, 47.0945, 51.9238, { method: 'MWL', hanafi: true });
const at = (d, offMin) => new Date(d.getTime() + offMin * 60000 + 5000);
ok('Асрға 10 минут қалғанда хабар', B.dueMessages(db, at(t.asr, -10)).some(m => /Екінті намазына 10 минут/.test(m.text)));
ok('Асрдың уақыты кіргенде хабар', B.dueMessages(db, at(t.asr, 0)).some(m => /Екінті намазының уақыты кірді/.test(m.text)));
ok('Басқа минутта хабар жоқ', B.dueMessages(db, at(t.asr, -3)).length === 0);
ok('Күннің шығуына хабар жоқ (намаз емес)', B.dueMessages(db, at(t.sunrise, 0)).length === 0);
const q = { 42: { settings: B.sanitize({ ...s, quiet: { on: true, from: '16:00', to: '17:30' } }) } };
ok('Тыныш уақытта хабар жоқ', B.dueMessages(q, at(t.asr, 0)).length === 0);
const off = { 42: { settings: B.sanitize({ ...s, prayerNotify: { ...s.prayerNotify, asr: false } }) } };
ok('Өшірілген намазға хабар жоқ', B.dueMessages(off, at(t.asr, 0)).length === 0);
process.exit(fail ? 1 : 0);
