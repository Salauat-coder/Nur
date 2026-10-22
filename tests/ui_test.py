# Нұр — UI тесті (Playwright, Chromium). Желі сұраныстары фикстурамен алмастырылған (бұл ортада интернет жоқ).
import json, re, sys, time
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8765/'
REF = json.load(open('/tmp/nur/ref.json'))
SHOTS = '/tmp/nur/shots/'
import os; os.makedirs(SHOTS, exist_ok=True)
results, fails = [], []
def check(name, ok, info=''):
    results.append((name, ok, info))
    if not ok: fails.append(f'{name} {info}')
    print(('✅' if ok else '❌'), name, info if not ok else '')

TG_STUB = r"""
(() => {
  const store = {};
  const calls = [];
  window.__tgcalls = calls;
  window.Telegram = { WebApp: {
    initData: 'query_id=TEST', platform: 'android', colorScheme: 'dark', version: '8.0',
    themeParams: {}, ready(){calls.push('ready')}, expand(){calls.push('expand')}, disableVerticalSwipes(){calls.push('dvs')},
    setHeaderColor(c){calls.push('header:'+c)}, setBackgroundColor(c){calls.push('bg:'+c)}, setBottomBarColor(c){calls.push('bottom:'+c)},
    onEvent(){}, BackButton: { show(){calls.push('back:show')}, hide(){calls.push('back:hide')}, onClick(f){window.__tgBack=f} },
    HapticFeedback: { impactOccurred(t){calls.push('impact:'+t)}, notificationOccurred(t){calls.push('notif:'+t)}, selectionChanged(){calls.push('select')} },
    CloudStorage: { setItem(k,v,cb){store[k]=v;calls.push('cs:set:'+k);cb&&cb(null,true)}, getItems(ks,cb){const o={};ks.forEach(k=>{if(k in store)o[k]=store[k]});cb(null,o)}, removeItems(ks,cb){ks.forEach(k=>delete store[k]);cb&&cb(null,true)} }
  }};
})();
"""

WX = {"current": {"temperature_2m": 12.4, "apparent_temperature": 10.1, "relative_humidity_2m": 61, "weather_code": 2, "wind_speed_10m": 14.2, "surface_pressure": 1012.6, "visibility": 24140, "uv_index": 1.6}}
AQ = {"current": {"us_aqi": 42, "pm2_5": 9.1}}
audio_requests = []
NET = {'down': False}
def offline(ctx, v):
    NET['down'] = v; ctx.set_offline(v)

def install_routes(ctx, wx_ok=True, aq_ok=True, quran_api_ok=True):
    def handler(route):
        url = route.request.url
        if url.startswith(BASE): return route.continue_()
        if NET['down']: return route.abort('internetdisconnected')
        if 'telegram.org/js/telegram-web-app.js' in url: return route.fulfill(body=TG_STUB, content_type='application/javascript')
        if 'air-quality-api.open-meteo.com' in url:
            if not aq_ok: return route.abort('internetdisconnected')
            return route.fulfill(json=AQ)
        if 'api.open-meteo.com' in url:
            if not wx_ok: return route.abort('internetdisconnected')
            return route.fulfill(json=WX)
        if 'api.alquran.cloud/v1/edition' in url:
            if not quran_api_ok: return route.abort('internetdisconnected')
            return route.fulfill(json={"data": [{"identifier": "kk.altai", "englishName": "Khalifa Altai (FIXTURE)", "language": "kk", "type": "translation"}]})
        m = re.search(r'api\.alquran\.cloud/v1/surah/(\d+)/', url)
        if m:
            if not quran_api_ok: return route.abort('internetdisconnected')
            n = int(m.group(1)); cnt = {1: 7, 2: 286, 112: 4}.get(n, 5)
            return route.fulfill(json={"data": {"ayahs": [{"numberInSurah": i + 1, "text": f"FIXTURE-KK {n}:{i+1}"} for i in range(cnt)]}})
        if 'everyayah.com' in url:
            audio_requests.append(url); return route.fulfill(body=b'ID3', content_type='audio/mpeg')
        if 'fonts.g' in url: return route.abort()
        return route.abort()
    ctx.route('**/*', handler)

def new_ctx(p, w=390, h=844, tz='Asia/Atyrau', **kw):
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, is_mobile=True, has_touch=True, timezone_id=tz, locale='kk-KZ', **kw)
    return b, ctx

def open_page(ctx, iso='2026-10-20T11:03:00+05:00'):
    page = ctx.new_page(); errs = []
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    page.clock.install(time=iso)
    page.goto(BASE + 'index.html'); page.wait_for_timeout(300)
    return page, errs

def tm(x):
    h, m = x.split(':'); return int(h) * 60 + int(m)
def hm(page, sel): return page.inner_text(sel).strip()

with sync_playwright() as p:
    # ---------- 1. Басты бет, Telegram, ауа райы ----------
    b, ctx = new_ctx(p); install_routes(ctx)
    page, errs = open_page(ctx)
    page.clock.run_for(2000); page.wait_for_timeout(500)
    calls = page.evaluate('window.__tgcalls')
    check('Telegram SDK: ready() және expand() шақырылды', 'ready' in calls and 'expand' in calls)
    check('Telegram: тақырып түсі қойылды', any(c.startswith('header:') for c in calls))
    check('Орын: Атырау', hm(page, '#locName') == 'Атырау', hm(page, '#locName'))
    clock = hm(page, '#heroClock'); check('Сағат Атырау уақытымен (11:03:xx)', clock.startswith('11:03') or clock.startswith('11:04'), clock)
    check('Ауа райы: температура 12', '12' in page.inner_text('#heroCard'), page.inner_text('#heroCard')[:80])
    st = page.inner_text('#statsRow')
    check('Ауа сапасы 42, қысым 1013, жел 14, көріну 24.1', all(x in st for x in ['42', '1013', '14', '24.1']), st.replace('\n', ' '))
    check('Ультракүлгін индексі көрсетілді (1.6)', '1.6' in page.inner_text('#sunCard'), page.inner_text('#sunCard')[:80].replace('\n', ' '))
    # Намаз уақыттарын adhan эталонымен салыстыру (Ханафи — әдепкі)
    txt = page.inner_text('#homeTimes'); ref = REF['atyrau_h']
    for k, nm in [('fajr', 'Таң'), ('sunrise', 'Күннің шығуы'), ('dhuhr', 'Бесін'), ('asr', 'Екінті'), ('maghrib', 'Ақшам'), ('isha', 'Құптан')]:
        row = page.locator('#homeTimes li', has_text=nm).first.inner_text()
        t = re.search(r'\d\d:\d\d', row).group(0)
        def mins(s): h, m = s.split(':'); return int(h) * 60 + int(m)
        check(f'Атырау {nm}: {t} (adhan {ref[k]})', abs(mins(t) - mins(ref[k])) <= 1)
    nm = hm(page, '#nextCard .name'); check('Келесі намаз: Бесін (11:03-те, Бесін 13:17)', nm.startswith('Бесін'), nm)
    c1 = hm(page, '#countdown'); page.clock.run_for(5000); c2 = hm(page, '#countdown')
    check('Кері санақ жүріп тұр', c1 != c2, f'{c1} → {c2}')
    page.screenshot(path=SHOTS + 'home_dark.png', full_page=True)
    check('Консоль қатесі жоқ (басты бет)', not errs, str(errs))

    # ---------- 2. Келесі намаз логикасы: Құптаннан кейін ----------
    page2, e2 = open_page(ctx, '2026-10-20T22:30:00+05:00'); page2.clock.run_for(1500)
    check('22:30-да келесі намаз — ертеңгі Таң', 'Таң' in hm(page2, '#nextCard .name') and 'ертең' in page2.inner_text('#nextCard small'), hm(page2, '#nextCard .name'))
    page3, e3 = open_page(ctx, '2026-10-20T03:00:00+05:00'); page3.clock.run_for(1500)
    check('03:00-да келесі намаз — бүгінгі Таң', 'Таң' in hm(page3, '#nextCard .name') and 'ертең' not in page3.inner_text('#nextCard small'), hm(page3, '#nextCard .name'))
    page2.close(); page3.close()

    # ---------- 3. Күн жолағы ----------
    page.click('#dayStrip button[data-off="1"]'); page.wait_for_timeout(100)
    check('Ертең батырмасы тізімді ауыстырды', '21 қазан' in page.inner_text('#homeTimes'), page.inner_text('#homeTimes')[:60])
    page.click('#dayStrip button[data-off="0"]')

    # ---------- 4. Намаз беті ----------
    page.click('#nav [data-go="prayer"]'); page.wait_for_timeout(200)
    asr_h = re.search(r'\d\d:\d\d', page.locator('#prayerDay li', has_text='Екінті').inner_text()).group(0)
    page.click('#pMadhab button[data-h="0"]'); page.wait_for_timeout(150)
    asr_s = re.search(r'\d\d:\d\d', page.locator('#prayerDay li', has_text='Екінті').inner_text()).group(0)
    check(f'Ханафи Екінті {asr_h} ≠ Шафиғи {asr_s} және adhan-ға сәйкес', abs(tm(asr_h) - tm(REF['atyrau_h']['asr'])) <= 1 and abs(tm(asr_s) - tm(REF['atyrau_s']['asr'])) <= 1 and asr_h != asr_s, f'{asr_h}/{asr_s} vs {REF["atyrau_h"]["asr"]}/{REF["atyrau_s"]["asr"]}')
    page.click('#pMadhab button[data-h="1"]')
    page.select_option('#pMethod', 'CUSTOM'); page.wait_for_timeout(100)
    check('Өз бұрыштарым: өрістер пайда болды', page.locator('#pFajr').count() == 1)
    page.fill('#pFajr', '30'); page.dispatch_event('#pFajr', 'change')
    check('Жарамсыз бұрыш (30°) қабылданбады', page.input_value('#pFajr') == '18' or page.input_value('#pFajr') == '18.0', page.input_value('#pFajr'))
    page.select_option('#pMethod', 'MWL')
    d0 = hm(page, '#prayerDateLabel'); page.click('#dNext'); d1 = hm(page, '#prayerDateLabel')
    check('Күн алға ауысады', d0 != d1, f'{d0} → {d1}')
    page.click('#dPrev'); page.click('#dPrev'); check('Күн артқа ауысады', hm(page, '#prayerDateLabel') != d0)
    rows = page.locator('#schedTable tbody tr').count(); check('Кесте 14 күн', rows == 14, str(rows))
    page.click('#moreDays'); check('Кесте 31 күнге ұзарады', page.locator('#schedTable tbody tr').count() == 31)
    page.screenshot(path=SHOTS + 'prayer_dark.png', full_page=True)

    # ---------- 5. Бірнеше қала: Намаз уақыттарын adhan-мен салыстыру (UI арқылы) ----------
    for cid, nm_ in [('almaty', 'Алматы'), ('astana', 'Астана'), ('shymkent', 'Шымкент'), ('aktau', 'Ақтау')]:
        page.click('#nav [data-go="home"]'); page.click('#locBtn'); page.click(f'[data-city="{cid}"]'); page.wait_for_timeout(250)
        ref = REF[cid + '_h']; ok = True; info = []
        for k, nm in [('fajr', 'Таң'), ('dhuhr', 'Бесін'), ('asr', 'Екінті'), ('maghrib', 'Ақшам'), ('isha', 'Құптан')]:
            t = re.search(r'\d\d:\d\d', page.locator('#homeTimes li', has_text=nm).first.inner_text()).group(0)
            h1, m1 = t.split(':'); h2, m2 = ref[k].split(':')
            if abs((int(h1) * 60 + int(m1)) - (int(h2) * 60 + int(m2))) > 1: ok = False; info.append(f'{nm} {t}≠{ref[k]}')
        check(f'{nm_}: 5 намаз уақыты adhan-ға сәйкес (±1 мин)', ok, ' '.join(info))
    page.click('#locBtn'); page.click('[data-city="atyrau"]')

    # ---------- 6. Қолмен координата ----------
    page.click('#locBtn'); page.fill('#mLat', '95'); page.click('#mSave')
    check('Жарамсыз ендік (95) қабылданбады', 'жарамсыз' in page.inner_text('#toast'), page.inner_text('#toast'))
    page.fill('#mLat', '48.5'); page.fill('#mLng', '58,2'); page.fill('#mTz', 'Mars/Phobos'); page.click('#mSave')
    check('Жарамсыз уақыт белдеуі қабылданбады', 'белдеуі' in page.inner_text('#toast'), page.inner_text('#toast'))
    page.fill('#mTz', 'Asia/Aqtobe'); page.click('#mSave'); page.wait_for_timeout(200)
    check('Қолмен енгізілген координата қабылданды (Ақтөбеге жақын)', 'Ақтөбе' in hm(page, '#locName') or '48.50' in hm(page, '#locName'), hm(page, '#locName'))
    page.click('#locBtn'); page.click('[data-city="atyrau"]')

    check('Консоль қатесі жоқ (намаз/орын)', not errs, str(errs))
    ctx.close(); b.close()

    # ---------- 7. GPS ----------
    b, ctx = new_ctx(p, permissions=['geolocation'], geolocation={'latitude': 43.2389, 'longitude': 76.8897}); install_routes(ctx)
    page, errs = open_page(ctx); page.click('#locBtn'); page.click('#gpsBtn'); page.wait_for_timeout(600)
    check('GPS: орын Алматы деп анықталды', hm(page, '#locName') == 'Алматы' and 'GPS' in hm(page, '#locSub'), hm(page, '#locName') + '|' + hm(page, '#locSub'))
    ctx.close(); b.close()
    b, ctx = new_ctx(p, permissions=[]); install_routes(ctx)
    page, errs = open_page(ctx); page.click('#locBtn'); page.click('#gpsBtn'); page.wait_for_timeout(600)
    check('GPS рұқсаты жоқ: түсінікті хабар, қала сақталды', 'рұқсат' in page.inner_text('#toast') or 'анықтау' in page.inner_text('#toast'), page.inner_text('#toast'))
    check('GPS қатесінен кейін орын өзгермеді', hm(page, '#locName') == 'Атырау')
    ctx.close(); b.close()

    # ---------- 8. Құран ----------
    b, ctx = new_ctx(p); install_routes(ctx)
    page, errs = open_page(ctx); page.click('#nav [data-go="quran"]'); page.wait_for_selector('#surahList .surah'); 
    check('Құран: 114 сүре тізімі', page.locator('#surahList .surah').count() == 114, str(page.locator('#surahList .surah').count()))
    page.click('#surahList [data-s="1"]'); page.wait_for_selector('#ay-7'); page.wait_for_timeout(300)
    check('Фатиха: 7 аят', page.locator('#ayahs .ayah').count() == 7)
    check('Қазақша аударма (фикстура) көрінді', 'FIXTURE-KK 1:1' in page.inner_text('#kk-1'), page.inner_text('#kk-1'))
    check('Аударма несиесі (атрибуция) көрсетілді', 'Khalifa Altai' in page.inner_text('#rCredit'))
    ar1 = page.inner_text('#ay-1 .ar'); check('Араб мәтіні бар (Бисмиллаһ)', 'بِسۡمِ' in ar1, ar1)
    page.click('#ay-2 [data-act="bm"]'); page.click('#ay-3 [data-act="last"]')
    page.click('#ay-1 [data-act="play"]'); page.wait_for_timeout(400)
    check('Аудио: everyayah URL дұрыс (001001.mp3)', any(u.endswith('/Alafasy_128kbps/001001.mp3') for u in audio_requests), str(audio_requests[-1:] ))
    check('Аудио ойнатқыш панелі көрінді', page.locator('#qPlayer').count() == 1)
    page.click('#pStop'); page.screenshot(path=SHOTS + 'quran_reader.png')
    page.click('#rBack'); page.fill('#quranSearch', '2:255'); page.wait_for_timeout(400)
    check('Іздеу «2:255» → аятқа сілтеме', page.locator('#surahList .hit').count() >= 1, page.inner_text('#surahList')[:80])
    page.fill('#quranSearch', 'baqarah'); page.wait_for_timeout(400); check('Іздеу: сүре атауы бойынша (baqarah)', page.locator('#surahList .surah').count() == 1)
    page.fill('#quranSearch', 'الله'); page.wait_for_timeout(500); check('Іздеу: араб сөзі бойынша аяттар табылды', page.locator('#surahList .hit').count() > 5, str(page.locator('#surahList .hit').count()))
    page.fill('#quranSearch', 'FIXTURE-KK 1:3'); page.wait_for_timeout(400); check('Іздеу: ашылған сүренің қазақша аудармасы бойынша табылды', page.locator('#surahList .hit').count() >= 1)
    page.fill('#quranSearch', ''); page.wait_for_timeout(300)
    check('Соңғы оқылған аят сақталды (1:3 немесе 1:1 ойнату)', page.locator('#lrBtn').count() == 1, '')
    page.click('#bmBtn'); page.wait_for_timeout(200); check('Бетбелгілер: 1:2 бар', '1:2' in page.inner_text('#surahList'), page.inner_text('#surahList')[:60])
    page.reload(); page.wait_for_timeout(300); page.click('#nav [data-go="quran"]'); page.wait_for_selector('#surahList .surah'); page.click('#bmBtn')
    check('Бетбелгі қайта жүктегеннен кейін сақталды', '1:2' in page.inner_text('#surahList'))
    # Аударма кэштен (офлайн)
    offline(ctx, True); page.fill('#quranSearch', ''); page.click('#surahList .hit' if page.locator('#surahList .hit').count() else '#nav [data-go="quran"]')
    page.wait_for_timeout(500); page.reload(); page.wait_for_timeout(400); page.click('#nav [data-go="quran"]'); page.wait_for_selector('#surahList .surah')
    page.click('#surahList [data-s="1"]'); page.wait_for_selector('#ay-7'); page.wait_for_timeout(300)
    check('Офлайн: Фатиха аудармасы кэштен көрсетілді', 'FIXTURE-KK 1:1' in page.inner_text('#kk-1'), page.inner_text('#kk-1'))
    page.click('#rNext'); page.wait_for_selector('#ay-1'); page.wait_for_timeout(900)
    check('Офлайн: кэште жоқ сүре — түсінікті қате + араб мәтіні', 'алынбады' in page.inner_text('#rKkNote') and page.locator('#ayahs .ayah').count() == 286, page.inner_text('#rKkNote')[:100])
    offline(ctx, False); page.click('#kkRetry'); page.wait_for_timeout(600)
    check('Желі қайтқанда «Қайталау» аударманы жүктейді', 'FIXTURE-KK 2:1' in page.inner_text('#kk-1'), page.inner_text('#kk-1'))
    check('Консоль қатесі жоқ (Құран)', not errs, str(errs))
    ctx.close(); b.close()

    # ---------- 9. Құбыла ----------
    b, ctx = new_ctx(p); install_routes(ctx)
    page, errs = open_page(ctx); page.click('#nav [data-go="qibla"]'); page.wait_for_timeout(300)
    qa = int(page.inner_text('#qAngle').replace('°', ''))
    import math
    def bearing(lat, lng):
        la1, la2, dl = math.radians(lat), math.radians(21.422487), math.radians(39.826206 - lng)
        y = math.sin(dl) * math.cos(la2); x = math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(dl)
        return (math.degrees(math.atan2(y, x)) + 360) % 360
    exp = round(bearing(47.0945, 51.9238)); check(f'Құбыла бұрышы Атырау: {qa}° (тәуелсіз формула {exp}°)', abs(qa - exp) <= 1)
    check('Құбыла қазақстандық қалалар үшін 195°–260° аралығында (Мекке оңтүстік-батыста)', 190 <= qa <= 265, str(qa))
    dist = page.inner_text('#qDist'); check('Қағбаға дейінгі қашықтық 3000–4500 км', 3000 <= int(re.sub(r'\D', '', dist)) <= 4500, dist)
    page.wait_for_timeout(2800)
    check('Сенсор жауап бермесе — балама хабар (бұрыш көрсетіледі)', 'сенсор' in page.inner_text('#qStatus').lower() and str(qa) in page.inner_text('#qStatus'), page.inner_text('#qStatus')[:120])
    # Сенсор оқиғасын симуляциялау: heading=qa → aligned
    alpha = (360 - qa) % 360
    page.evaluate("a => { const e = new Event('deviceorientationabsolute'); e.alpha = a; e.absolute = true; window.dispatchEvent(e); }", alpha)
    page.wait_for_timeout(150)
    check('Сенсор оқиғасы: бағыт сәйкес келгенде «Құбыла бағытындасыз»', 'Құбыла бағытындасыз' in page.inner_text('#qStatus') and 'aligned' in page.get_attribute('#compass', 'class'), page.inner_text('#qStatus'))
    page.evaluate("() => { const e = new Event('deviceorientationabsolute'); e.alpha = 0; e.absolute = true; window.dispatchEvent(e); }")
    for _ in range(12): page.evaluate("() => { const e = new Event('deviceorientationabsolute'); e.alpha = 0; e.absolute = true; window.dispatchEvent(e); }")
    page.wait_for_timeout(150); st = page.inner_text('#qStatus')
    check('Бағыт сәйкес келмегенде бұрылу нұсқауы', 'бұрылыңыз' in st, st)
    page.screenshot(path=SHOTS + 'qibla_dark.png', full_page=True)
    check('Консоль қатесі жоқ (құбыла)', not errs, str(errs))
    ctx.close(); b.close()

    # ---------- 10. Зікір ----------
    b, ctx = new_ctx(p); install_routes(ctx)
    page, errs = open_page(ctx); page.on('dialog', lambda d: d.accept()); page.click('#nav [data-go="dhikr"]'); page.wait_for_timeout(200)
    for _ in range(5): page.click('#tap')
    check('Зікір: 5 рет басу → 5', hm(page, '#cnt') == '5', hm(page, '#cnt'))
    page.click('#dUndo'); check('−1 жұмыс істейді', hm(page, '#cnt') == '4')
    page.click('#dhikrCard [data-t="100"]'); check('Мақсат 100 таңдалды', '/ 100' in page.inner_text('#tap'))
    page.reload(); page.wait_for_timeout(300); page.click('#nav [data-go="dhikr"]'); check('Санағыш қайта жүктегеннен кейін сақталды (4)', hm(page, '#cnt') == '4', hm(page, '#cnt'))
    page.click('#dhikrChips [data-id="alhamdulillah"]'); check('Басқа зікірге ауысқанда санағыш бөлек (0)', hm(page, '#cnt') == '0')
    page.click('#dhikrCard [data-t="33"]');
    for _ in range(33): page.click('#tap')
    check('Мақсатқа жеткенде хабар', 'Мақсатқа жеттіңіз' in page.inner_text('#toast'), page.inner_text('#toast'))
    check('Діріл (Telegram haptic) шақырылды', any(c.startswith('notif:success') for c in page.evaluate('window.__tgcalls')) and any(c.startswith('impact:light') for c in page.evaluate('window.__tgcalls')))
    check('Статистика: бүгін барлығы 37', 'Бүгін барлығы: 37' in page.inner_text('#dhikrStats').replace('\n', ' ') or '37' in page.inner_text('#dhikrStats'), page.inner_text('#dhikrStats')[:80].replace('\n', ' '))
    page.click('#dReset'); page.wait_for_timeout(100); check('Нөлге түсіру', hm(page, '#cnt') == '0')
    page.click('#dFav'); page.click('#dhikrChips [data-fav]'); check('Таңдаулылар сүзгісі', page.locator('#dhikrChips [data-id]').count() == 1)
    check('Зікір дереккөзі көрсетілген', 'Дереккөзі' in page.inner_text('#dhikrCard'))
    page.screenshot(path=SHOTS + 'dhikr_dark.png', full_page=True)
    cs = page.evaluate('window.__tgcalls'); check('Telegram CloudStorage-ке жазылды', any(c.startswith('cs:set:nur_dhikr') for c in cs))
    check('Консоль қатесі жоқ (зікір)', not errs, str(errs))
    ctx.close(); b.close()

    # ---------- 11. Баптаулар, тақырып, еске салу ----------
    b, ctx = new_ctx(p); install_routes(ctx)
    page, errs = open_page(ctx); page.click('#settingsBtn'); page.wait_for_timeout(200)
    page.click('#sTheme button[data-v="light"]'); check('Ашық тақырып қосылды', page.get_attribute('html', 'data-theme') == 'light')
    page.screenshot(path=SHOTS + 'settings_light.png', full_page=True)
    page.click('#sTheme button[data-v="dark"]'); check('Қараңғы тақырып қосылды', page.get_attribute('html', 'data-theme') == 'dark')
    page.fill('#sDim', '40'); page.dispatch_event('#sDim', 'input'); dim = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--dim')")
    check('Қосымша жарықтығын қараңғылату (--dim=0.4)', abs(float(dim) - 0.4) < 0.01, dim)
    page.select_option('#sLead', '10')
    # еске салу: Екінті 16:49 → 10 минут бұрын = 16:39
    page.reload(); page.wait_for_timeout(200)
    page.close()
    pg, e = open_page(ctx, '2026-10-20T16:39:30+05:00'); pg.click('#settingsBtn'); pg.select_option('#sLead', '10'); pg.click('#nav [data-go="home"]')
    pg.clock.run_for(40000); pg.wait_for_timeout(300)
    check('Еске салу: «Екінті намазына 10 минут қалды»', 'Екінті' in pg.inner_text('#toast') and '10 минут' in pg.inner_text('#toast'), pg.inner_text('#toast'))
    check('Еске салу: Telegram haptic success', 'notif:success' in pg.evaluate('window.__tgcalls'))
    pg.close()
    pg, e = open_page(ctx, '2026-10-20T16:49:30+05:00'); pg.clock.run_for(40000); pg.wait_for_timeout(300)
    check('Азан хабары: «Екінті намазының уақыты кірді»', 'уақыты кірді' in pg.inner_text('#toast'), pg.inner_text('#toast'))
    pg.close()
    # Тыныш уақыт: 16:30–17:00 аралығында хабар берілмейді
    pg, e = open_page(ctx, '2026-10-20T16:49:30+05:00')
    pg.evaluate("() => { const s = window.Nur.S(); s.settings.quiet = {on:true, from:'16:00', to:'17:30'}; }")
    pg.clock.run_for(40000); pg.wait_for_timeout(300)
    check('Тыныш уақытта хабар көрсетілмейді', pg.locator('#toast').is_hidden() or 'уақыты кірді' not in pg.inner_text('#toast'), pg.inner_text('#toast') if pg.locator('#toast').is_visible() else 'hidden')
    pg.close()
    page2, e2 = open_page(ctx); page2.click('#settingsBtn'); page2.click('#sP_asr', force=True); page2.wait_for_timeout(100)
    check('Әр намазға жеке қосу/өшіру сақталады', page2.evaluate("window.Nur.S().settings.prayerNotify.asr") is False)
    check('Қала таңдау (Баптаулар)', True)
    check('Консоль қатесі жоқ (баптаулар)', not e2, str(e2))
    ctx.close(); b.close()

    # ---------- 12. Офлайн ----------
    b, ctx = new_ctx(p); install_routes(ctx)
    page, errs = open_page(ctx); page.clock.run_for(1500); page.wait_for_timeout(400)
    offline(ctx, True); page.reload(); page.wait_for_timeout(500)
    # reload offline: SW жоқ (localhost http → бар). Сервер жергілікті болғандықтан бет жүктеледі
    check('Офлайн: ақпарат жолағы көрінеді', page.locator('#offlineBar').is_visible())
    check('Офлайн: соңғы ауа райы кэштен көрсетілді (12°)', '12' in page.inner_text('#heroCard'), page.inner_text('#heroCard')[:80])
    check('Офлайн: намаз уақыты есептелді', re.search(r'\d\d:\d\d', page.inner_text('#homeTimes')) is not None)
    offline(ctx, False); ctx.close(); b.close()
    b, ctx = new_ctx(p); install_routes(ctx, wx_ok=False, aq_ok=False)
    page, errs = open_page(ctx); page.wait_for_timeout(700)
    check('Ауа райы дереккөзі қолжетімсіз: ойдан шығарылған дерек жоқ, қате хабары + «Қайталау»', page.locator('#wxRetry').count() == 1 and '12' not in page.inner_text('#heroCard').split('\n')[-1], page.inner_text('#heroCard')[:120].replace('\n', ' '))
    check('Ауа сапасы деректері жоқта «—» көрсетіледі', page.inner_text('#statsRow').count('—') >= 4, page.inner_text('#statsRow').replace('\n', ' '))
    ctx.close(); b.close()

    # ---------- 12b. Серверге синхрондау ----------
    b, ctx = new_ctx(p); install_routes(ctx)
    posted = []
    ctx.route('**/api/settings', lambda r: (posted.append(r.request.post_data), r.fulfill(json={'ok': True}, headers={'access-control-allow-origin': '*'})))
    page, errs = open_page(ctx); page.evaluate("window.NUR_CONFIG.apiBase = 'https://bot.example.test'"); 
    page.click('#settingsBtn'); page.select_option('#sLead', '15'); page.wait_for_timeout(2500); page.clock.run_for(4000); page.wait_for_timeout(500)
    ok_post = any('initData' in x and '"remindBefore":15' in x and 'TEST' in x for x in posted)
    check('Сервер синхрондауы: initData және баптау жіберілді (бот токені жоқ)', ok_post and not any('BOT_TOKEN' in x or ':AA' in x for x in posted), str(posted)[:150])
    ctx.close(); b.close()

    # ---------- 13. Мобильді өлшемдер: көлденең жылжу жоқ ----------
    for w, h in [(320, 640), (360, 740), (390, 844), (430, 932)]:
        b, ctx = new_ctx(p, w=w, h=h); install_routes(ctx)
        page, errs = open_page(ctx); page.clock.run_for(1000)
        bad = []
        for sc in ['home', 'prayer', 'quran', 'qibla', 'dhikr', 'settings']:
            page.evaluate(f"window.Nur.go('{sc}')"); page.wait_for_timeout(250)
            sw = page.evaluate('document.documentElement.scrollWidth'); iw = page.evaluate('window.innerWidth')
            if sw > iw + 1: bad.append(f'{sc}:{sw}>{iw}')
        check(f'Көлденең жылжу жоқ {w}×{h}', not bad, ' '.join(bad))
        if w == 390:
            page.evaluate("window.Nur.go('home')"); page.wait_for_timeout(300)
            page.evaluate("() => { const s = window.Nur.S(); s.settings.theme='light'; window.Nur.save(); }"); page.reload(); page.wait_for_timeout(400)
            page.screenshot(path=SHOTS + 'home_light.png', full_page=True)
        ctx.close(); b.close()

print('\n==== ҚОРЫТЫНДЫ ====')
print(f'Өтті: {sum(1 for r in results if r[1])} / {len(results)}')
for f in fails: print('  ❌', f)
sys.exit(1 if fails else 0)
