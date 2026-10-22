// Өз есептеуімізді тәуелсіз `adhan` кітапханасымен салыстыру (npm: adhan)
const path = require('path');
const P = require('../js/prayer.js');
let adhan;
try { adhan = require(process.env.ADHAN_PATH || 'adhan'); } catch (e) { console.log('adhan табылмады:', e.message); process.exit(2); }
const CITIES = [
  ['Атырау', 47.0945, 51.9238, 'Asia/Atyrau'], ['Астана', 51.1605, 71.4704, 'Asia/Almaty'],
  ['Алматы', 43.2389, 76.8897, 'Asia/Almaty'], ['Шымкент', 42.3417, 69.5901, 'Asia/Almaty'],
  ['Ақтау', 43.6532, 51.1975, 'Asia/Aqtau'], ['Петропавл', 54.8753, 69.1628, 'Asia/Almaty'],
  ['Орал', 51.2278, 51.3865, 'Asia/Oral']
];
const DATES = [[2026,10,20],[2026,12,21],[2026,3,20],[2026,6,21]];
const METHS = [['MWL','MuslimWorldLeague'],['EGYPT','Egyptian'],['KARACHI','Karachi'],['ISNA','NorthAmerica']];
let worst = 0, n = 0, bad = [];
for (const [city, lat, lng, tz] of CITIES) for (const [y,m,d] of DATES) for (const [mk, an] of METHS) for (const hanafi of [false, true]) {
  const params = adhan.CalculationMethod[an]();
  params.madhab = hanafi ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
  params.highLatitudeRule = adhan.HighLatitudeRule.SeventhOfTheNight;
  const ref = new adhan.PrayerTimes(new adhan.Coordinates(lat, lng), new Date(y, m-1, d), params);
  const mine = P.timesForDate(y, m, d, lat, lng, { method: mk, hanafi });
  const adj = params.methodAdjustments.dhuhr || 0;
  for (const [k, rk] of [['fajr','fajr'],['sunrise','sunrise'],['dhuhr','dhuhr'],['asr','asr'],['maghrib','maghrib'],['isha','isha']]) {
    if (!mine[k]) { bad.push(`${city} ${y}-${m}-${d} ${mk} ${k}: null`); continue; }
    // adhan-ның Maghrib/Isha ерекшеліктерін ескеру: dhuhr әдіс түзетуі (адхан +1 мин MWL үшін) өз кодымызда жоқ
    let diff = Math.abs(mine[k] - ref[rk]) / 60000;
    if (k === 'dhuhr') diff = Math.abs(diff - 0) ;
    n++; if (diff > worst) worst = diff;
    if (diff > 2.01) bad.push(`${city} ${y}-${m}-${d} ${mk}${hanafi?'+H':''} ${k}: мен ${P.fmt(mine[k], tz)} / adhan ${P.fmt(ref[rk], tz)} (${diff.toFixed(1)} мин)`);
  }
}
console.log(`Салыстырылған мән: ${n}, ең үлкен айырма: ${worst.toFixed(2)} мин, ауытқулар (>2 мин): ${bad.length}`);
bad.slice(0, 25).forEach(b => console.log('  ' + b));
process.exit(bad.length ? 1 : 0);
