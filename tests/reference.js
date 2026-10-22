// adhan-дан тәуелсіз эталон кесте (2026-10-20), қала бойынша — UI тестімен салыстыру үшін
const adhan = require(process.env.ADHAN_PATH || 'adhan');
const cities = { atyrau:[47.0945,51.9238,'Asia/Atyrau'], astana:[51.1694,71.4491,'Asia/Almaty'], almaty:[43.2389,76.8897,'Asia/Almaty'], shymkent:[42.3417,69.5901,'Asia/Almaty'], aktau:[43.6532,51.1975,'Asia/Aqtau'] };
const out = {};
for (const [id,[lat,lng,tz]] of Object.entries(cities)) for (const hanafi of [true,false]) {
  const p = adhan.CalculationMethod.MuslimWorldLeague(); p.madhab = hanafi ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
  const t = new adhan.PrayerTimes(new adhan.Coordinates(lat,lng), new Date(2026,9,20), p);
  const f = d => new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
  out[id+(hanafi?'_h':'_s')] = {fajr:f(t.fajr),sunrise:f(t.sunrise),dhuhr:f(t.dhuhr),asr:f(t.asr),maghrib:f(t.maghrib),isha:f(t.isha)};
}
console.log(JSON.stringify(out));
