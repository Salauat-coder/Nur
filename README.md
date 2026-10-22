# Нұр — Telegram Mini App (прототип)

Іске қосу (жергілікті): `python3 -m http.server 8765` → http://localhost:8765
Telegram-да ашу үшін қалтаны **https** хостингке (GitHub Pages, Netlify, Vercel...) жүктеңіз.

## Telegram бот баптау
1. @BotFather → /newbot → токен алыңыз (токенді ешқайда жарияламаңыз).
2. @BotFather → /mybots → бот → Bot Settings → Menu Button (немесе /newapp) → https мекенжайыңызды қойыңыз.
3. Серверлік еске салу керек болса: `BOT_TOKEN=... WEBAPP_URL=https://... node server/bot.js`,
   сервердің https мекенжайын `js/config.js` ішіндегі `apiBase`-ке жазыңыз.

## Тесттер
`node tests/server.test.js` · `ADHAN_PATH=<npm adhan жолы> node tests/prayer.test.js` · `python3 tests/ui_test.py` (Playwright)

## Деректер лицензиясы
Араб мәтіні: quran-json (CC BY-SA 4.0) — data/QURAN-DATA-LICENSE.txt
