# River Ice App 🧊

Интерактивная система для мониторинга ледовой обстановки и прохождения ледохода на реке Лена (Якутия). 

Приложение предоставляет визуализацию спутниковых и векторных карт, отслеживание кромок льда, заторов и изменение уровня воды по населенным пунктам.

## 🌟 Основные возможности

- **Интерактивная карта (MapLibre)**: Переключение между Спутником, 3D-рельефом, Векторной картой и гидрологическими бассейнами.
- **Временная шкала ледохода**: Анимация прохождения "головы" ледохода.
- **Панель населенных пунктов**: При клике на город открывается статистика по уровню воды (sparkline графики) и отображается история скорости прохождения по участкам (между городами).
- **Динамический расчет маршрута и скоростей**: Скорость движения льда рассчитывается автоматически по речной геометрии (Turf.js).
- **Режим администратора**: Скрыт под PIN-кодом (`1234`). Позволяет указывать новые кромки, отмечать заторы (слабый, средний, критичный) и устранять их.
- **Offline / PWA**: Приложение работает стабильно даже при плохом интернете. Все фрагменты просмотренной карты, включая 3D-рельеф, кэшируются через Service Worker (стратегия Cache First).

## 🛠 Технологический стек

- **Frontend Framework**: React 19 + Vite
- **Стилизация**: Tailwind CSS (v4)
- **Управление состоянием**: Zustand (глобальный стейт приложения `useAppStore` и бизнес-логика ледохода `useIceStore`)
- **Карты и Геометрия**: `@vis.gl/react-maplibre`, Turf.js
- **Графики и визуализация данных**: Recharts, date-fns
- **Offline**: vite-plugin-pwa (Workbox)
- **Иконки**: Lucide React

## 🚀 Установка и запуск

**Требования:** Node.js v18+

1. Установите все зависимости проекта:
   ```bash
   npm install
   ```

2. (Опционально) Установите `API_KEY` в файлом `.env.local` на ваш API-ключ, если используются AI-функции.

3. Запустите dev-сервер:
   ```bash
   npm run dev
   ```

## 🗂 Архитектура и Оптимизация

- **Разделение состояния**: UI-состояние (`isAdmin`, `pickMode`, `mapCenter`) вынесено в `appStore.ts`, а логика расчетов картографии и данных наблюдений вынесена в `iceStore.ts`.
- **Zustand вместо Context**: Решает проблемы "prop-drilling", позволяя любым компонентам реактивно реагировать на перемещение кромки льда и появление заторов.
- **Кэширование и производительность**: Тяжелые GeoJSON данные (границы улусов Якутии) вынесены в `public/` для асинхронного парсинга, что снизило размер первоначального JS бандла на 300+ КБ. Тайлы карт кэшируются до 30 дней.

## 🤝 Разработка
В корне проекта находится `vite.config.ts`, в котором уже настроены `tailwindcss` плагины и конфигурации `VitePWA` (Workbox): кэширование same-origin путей `/tiles`, `/terrain`, `/fonts`, `/api` и опционально внешних хостов из `VITE_TILE_CACHE_HOSTS`.

## 🐳 Деплой через Docker (внешний HTTP, один порт)

Снаружи открывается **один** порт: по умолчанию **`3030` на хосте → `3030` в контейнере `gateway`** (HTTP, без TLS). Внутри сети Docker работают:

- **`webapp`** — статика Vite (`/`).
- **`internal-data-api`** — опционально: локальные Excel из `./internal-data` (`/api/disk/*`), если включён режим `VITE_DATA_SOURCE=internal`.
- **`gateway`** — `nginx` без TLS, маршрутизация на сервисы выше.

По умолчанию в образе включены **`VITE_DATA_SOURCE=yandex`** и **`VITE_ENABLE_EXTERNAL_NETWORK=true`**: автоподтягивание Excel с **публичной папки Яндекс.Диска** (браузер пользователя должен иметь исходящий HTTPS до `cloud-api.yandex.net` и ссылку из `VITE_YANDEX_PUBLIC_KEY`, см. `deploy/server.env.example`). Раз в 5 минут обновляются и уровни воды, и ледовые наблюдения.

### Файлы
- `Dockerfile` — сборка фронта; аргументы `VITE_*` задаются из `.env` (см. `deploy/server.env.example`).
- `deploy/Dockerfile.internal-data-api` — Node-сервис `/api/disk/*`.
- `docker-compose.yml` — три сервиса + опциональный `optional-lint`.
- `deploy/default.conf.template` — шаблон `gateway`: HTTP на `${GATEWAY_HTTP_PORT}` (= `PUBLIC_PORT`), `location /api/` → `internal-data-api:8787`, остальное → `webapp:8080`.
- `deploy/webapp.nginx.conf` — статика в образе `webapp`.
- `deploy/server.env.example` — шаблон переменных для `docker compose`.
- `deploy/init-certs.sh` — опционально, если снова включите HTTPS для gateway и положите PEM в `deploy/certs/`.

### Быстрый запуск
1. Скопируйте переменные и при необходимости поправьте порт (на стенде без root часто удобно `PUBLIC_PORT=8443`):
   ```bash
   cp deploy/server.env.example .env
   ```
2. (Опционально) Для HTTPS-режима gateway раньше использовались `deploy/certs/` — сейчас по умолчанию HTTP, сертификаты не нужны.
3. Если используете режим **`internal`**, положите файлы `.xlsx` / `.xls` / `.csv` в каталог `internal-data/` на хосте (он монтируется в API только на чтение). Для **`yandex`** этот шаг не обязателен.
4. Поднимите стек:
   ```bash
   docker compose --env-file .env up -d --build
   ```
5. Проверка:
   ```bash
   docker compose ps
   docker compose logs --tail=100 gateway webapp internal-data-api
   ```

### Опциональные проверки
Профиль `optional-checks` не влияет на основной запуск:
```bash
docker compose --profile optional-checks run --rm optional-lint
```

### Smoke-проверки
- UI: `http://<SERVER_HOST>:3030/` (или другой порт, если задали `PUBLIC_PORT`).
- База уровней: `http://<SERVER_HOST>:3030/database.html`
- PWA: `http://<SERVER_HOST>:3030/manifest.webmanifest`, `http://<SERVER_HOST>:3030/sw.js`
- Internal API (тот же origin): `http://<SERVER_HOST>:3030/api/health`
