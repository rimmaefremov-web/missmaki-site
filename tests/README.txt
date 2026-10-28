Локальные тесты, без живых Telegram/GAS запросов.
Node.js: node tests/server.cjs; node tests/static.cjs.
Для browser.cjs/layout.cjs нужен Playwright и установленный Chromium/WebKit. В данной среде Chromium /usr/bin/chromium, WebKit запускается MM_BROWSER=webkit с локальными библиотеками. Все внешние запросы перехватываются; реальный POST в рабочий deployment не выполняется.
JSON-файлы содержат фактические результаты. iphone-layout-preview.png — снимок Chromium при 390×844, не фотография физического iPhone.
Подтверждённый владельцем успешный рабочий заказ относится к предыдущей установленной версии; этот новый пакет требует отдельной согласованной проверки.
