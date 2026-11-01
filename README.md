# MissMaki

Существующий сайт доставки суши и роллов на GitHub Pages. Меню, фотографии и корзина сохранены.

В ветке `codex/missmaki-kitchen` подготовлена система «MissMaki Кухня» на Supabase. **Новая интеграция выключена до настройки и реальной приёмки.**

- [Владельцу: короткие шаги с iPhone](docs/ВЛАДЕЛЬЦУ.md)
- [Развёртывание и архитектура](docs/РАЗВЁРТЫВАНИЕ.md)
- [Список реальной приёмки](docs/ПРИЁМКА.md)
- [Отчёт о тестах и непроверенных функциях](docs/ТЕСТЫ.md)
- [SQL схемы и прав доступа](supabase/migrations/001_kitchen.sql)
- [SQL существующего меню](supabase/migrations/002_catalog.sql)

Панель — `kitchen/index.html`, интеграция магазина — `shared/customer.js`, публичная конфигурация — `shared/config.js`. Пароли и служебные ключи не нужны в репозитории.

Для локальных проверок: `npm ci`, `npm test`, `npx playwright install chromium`, `npm run test:browser`.
