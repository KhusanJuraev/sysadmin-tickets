# Marketing Tickets

Telegram Mini App для внутренних маркетинговых заявок TURON TELECOM.

## Что внутри

- Next.js App Router, React, TypeScript, Tailwind.
- Mini App на русском языке: новая заявка, мои заявки, панель маркетинга.
- Google Sheets остается через Service Account.
- Вложения загружаются в Supabase Storage отдельным flow, без отправки бинарных файлов через `/api/requests`.
- Заявки, статусы, история, комментарии и Telegram-уведомления сохранены.
- Graceful fallback: если вложение не загрузилось, заявка все равно создается без файла и с понятным предупреждением.
- Локальный запуск строго на порту `3055`.

## Запуск

```bash
npm install
npm run dev
```

Mini App: `http://localhost:3055`

Production:

```bash
npm run build
npm run start
```

`dev` и `start` используют порт `3055`.

## Переменные окружения

Скопируйте `.env.example` в `.env.local` и заполните значения.

```bash
cp .env.example .env.local
```

Основные группы:

- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_MARKETING_CHAT_ID`, `TELEGRAM_MARKETING_IDS`, `TELEGRAM_MARKETING_HEAD_IDS`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEETS_ID`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`
- `GOOGLE_DRIVE_PARENT_FOLDER_ID`
- `GOOGLE_OAUTH_TOKEN_FILE`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`
- `INIT_SECRET`
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`

## Google Sheets

Sheets работает через Service Account.

1. Создайте Google Spreadsheet.
2. Создайте Service Account в Google Cloud.
3. Выдайте Service Account право редактора на Spreadsheet.
4. Заполните `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEETS_ID`.
5. Запустите приложение на `3055`.
6. Инициализируйте структуру:

```bash
npm run init:sheets
```

Листы:

- `Заявки`
- `История_статусов`
- `Справочники`
- `Пользователи`
- `Настройки`

Схема мягко расширена для Drive OAuth:

- `attachments_urls`
- `drive_folder_url`
- `upload_warnings`

## Google Drive OAuth

Google Drive OAuth оставлен как admin-only интеграция, если она нужна в административном кабинете. Пользовательский поток создания заявки больше не зависит от Google Drive и не пытается загружать вложения в Drive.

Используется Google OAuth 2.0 Web Server flow:

1. В Google Cloud откройте APIs & Services.
2. Включите Google Drive API.
3. Настройте OAuth consent screen.
4. Создайте OAuth Client ID типа Web application.
5. Добавьте redirect URI:

```text
http://localhost:3055/api/google/oauth/callback
```

Для production добавьте production URI:

```text
https://your-domain.com/api/google/oauth/callback
```

6. Заполните:

```env
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3055/api/google/oauth/callback
GOOGLE_DRIVE_PARENT_FOLDER_ID=
GOOGLE_OAUTH_TOKEN_FILE=.data/google-drive-oauth.json
```

7. Откройте Mini App под ролью маркетинга.
8. В панели маркетинга нажмите “Подключить Google Drive”.
9. Выберите Google-аккаунт администратора/маркетинга.
10. После callback статус станет “Подключено”.

Refresh token хранится server-side в `.data/<имя файла из GOOGLE_OAUTH_TOKEN_FILE>`. Папка `.data/` добавлена в `.gitignore`.

## Почему scope Drive широкий

Для сценария с заранее заданной папкой `GOOGLE_DRIVE_PARENT_FOLDER_ID` выбран scope:

```text
https://www.googleapis.com/auth/drive
```

`drive.file` подходит для файлов, созданных или явно открытых приложением, но для стабильного создания папок и файлов внутри заранее указанной существующей папки без Google Picker он может быть недостаточен. Поэтому MVP использует `drive` и ограничивает операции на уровне кода только нужной родительской папкой.

Также используется:

```text
https://www.googleapis.com/auth/userinfo.email
```

Он нужен, чтобы показать в панели маркетинга email подключенного аккаунта.

## Supabase Storage для вложений

Вложения больше не отправляются в основной route создания заявки. Это важно для Vercel: `/api/requests` теперь получает только JSON с полями заявки и metadata вложений, поэтому не упирается в лимит размера request body.

Flow:

1. Mini App запрашивает signed upload URL через `POST /api/storage/signed-upload`.
2. Сервер проверяет Telegram-профиль, валидирует имя, тип и размер файла.
3. Сервер через `SUPABASE_SERVICE_ROLE_KEY` создает signed upload URL.
4. Браузер загружает файл напрямую в Supabase Storage через anon client.
5. В `/api/requests` отправляются только `name`, `size`, `mimeType`, `storagePath`, `publicUrl`.

Переменные:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=request-attachments
```

Настройка bucket:

1. В Supabase откройте Storage.
2. Создайте bucket `request-attachments`.
3. Для MVP можно сделать bucket public, чтобы ссылки из Sheets, Mini App и admin panel открывались напрямую.
4. Если bucket private, понадобится отдельный signed read URL flow для просмотра файлов. Текущий MVP сохраняет `publicUrl`.

Важно:

- `SUPABASE_SERVICE_ROLE_KEY` используется только на сервере.
- В браузер передается только anon key и только после успешной проверки Telegram-профиля.
- Если загрузка файла не удалась, пользователь увидит предупреждение и сможет отправить заявку без вложения.

## Telegram

1. Создайте бота через BotFather.
2. Укажите `TELEGRAM_BOT_TOKEN`.
3. В BotFather настройте Web App URL на `NEXT_PUBLIC_APP_URL`.
4. Для production установите webhook:

```text
https://your-domain.com/api/telegram/webhook
```

Для локального теста вне Telegram:

- `http://localhost:3055?role=employee`
- `http://localhost:3055?role=marketing`
- `http://localhost:3055?role=marketing_head`

Для реального Telegram Mini App значение `NEXT_PUBLIC_APP_URL` должно быть публичным HTTPS URL. Если URL невалидный или не HTTPS, бот залогирует проблему и отправит пользователю понятный текст без кнопки Web App, чтобы onboarding не зависал молча.

## Onboarding сотрудников

Новый сотрудник сначала проходит регистрацию в Telegram-боте через `/start`.

Flow регистрации:

1. ФИО: бот просит написать полное имя минимум из двух слов.
2. Телефон: бот показывает кнопку с `request_contact`.
3. Геолокация: бот показывает кнопку с `request_location`.
4. Должность: inline keyboard из утвержденного справочника.
5. Отдел: inline keyboard из утвержденного справочника.
6. Офис / филиал: inline keyboard из утвержденного справочника.
7. Подтверждение: бот показывает summary и кнопки `Подтвердить` / `Заполнить заново`.

После подтверждения в листе `Пользователи` сохраняются:

- `telegram_id`
- `username`
- `telegram_first_name`
- `telegram_last_name`
- `fio`
- `phone`
- `position`
- `department`
- `office_location`
- `geo_lat`
- `geo_lng`
- `registration_status`
- `onboarding_step`
- `created_at`
- `updated_at`

Системные поля `role` и `is_active` остаются в листе для прав доступа и отключения сотрудников.

Если профиль не завершен, `GET /api/me` возвращает ошибку `PROFILE_NOT_COMPLETED`, а Mini App показывает экран “Сначала завершите регистрацию в Telegram”. Создание заявок через API также требует завершенный профиль.

При создании заявки сервер автоматически подставляет из профиля сотрудника ФИО, телефон, должность, отдел и офис / филиал. Эти поля нельзя надежно подменить из Mini App payload.

Webhook оптимизирован для runtime:

- структура Google Sheets не инициализируется на каждый Telegram update;
- пользователь читается из Sheets один раз за update;
- callback `Подтвердить` отвечает через `answerCallbackQuery` сразу и не молчит при ошибках;
- основные этапы пишутся в console logs: входящий update, message/callback, callback data, шаг onboarding, обновление пользователя, отправка Telegram-сообщения и длительность webhook.

## Админ-панель

Пользовательский Mini App предназначен только для заявителей. Любой сотрудник, включая сотрудников отдела маркетинга, видит только свои заявки.

Общая очередь заявок и управление статусами вынесены в отдельный кабинет:

```text
http://localhost:3055/admin
```

Для входа используются:

```env
ADMIN_USERNAME=
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
```

В админ-панели можно:

- видеть все заявки;
- фильтровать очередь;
- открыть карточку заявки;
- менять статус;
- добавлять комментарий для заявителя;
- подключать Google Drive для вложений.

Изменение статуса пишет историю в `История_статусов` и отправляет Telegram-уведомление заявителю.

Важно: доступ к `GET /api/requests?scope=all`, изменению статуса и Google Drive OAuth теперь требует admin session. Telegram-профиль пользователя больше не дает доступа к общей очереди.

## API

- `POST /api/init`
- `POST /api/admin/login`
- `GET /api/admin/me`
- `POST /api/admin/logout`
- `GET /api/me`
- `GET /api/dictionaries`
- `POST /api/requests`
- `GET /api/requests?scope=mine`
- `GET /api/requests?scope=all`
- `GET /api/requests/:requestId`
- `POST /api/requests/:requestId/status`
- `POST /api/requests/:requestId/clarification`
- `POST /api/storage/signed-upload`
- `POST /api/google/oauth/start`
- `GET /api/google/oauth/callback`
- `GET /api/google/oauth/status`
- `POST /api/google/oauth/disconnect`
- `POST /api/telegram/webhook`

## Поведение вложений

- В пользовательском Mini App файл сначала загружается в Supabase Storage.
- Основной route создания заявки получает только metadata вложений.
- В Sheets сохраняются ссылки на файлы и JSON metadata.
- Если один файл не загрузился, остальные продолжают загружаться.
- Если Storage не настроен или недоступен, заявка создается без вложений, а в `upload_warnings` записывается причина.

## Проверка

```bash
npm run lint
npm run build
```

Для ручной проверки:

1. Откройте `http://localhost:3055?role=employee`.
2. Создайте заявку без вложения.
3. Создайте заявку с небольшим вложением.
4. Проверьте строку в Sheets и ссылку на файл из Supabase Storage.
5. Временно уберите Supabase env или укажите неверный bucket.
6. Создайте заявку с вложением еще раз и проверьте, что заявка создана, а предупреждение записано.

## Архитектура

- `src/app/api` — API routes.
- `src/app/api/google/oauth` — Google Drive OAuth endpoints.
- `src/lib/google/auth.ts` — Service Account OAuth для Sheets.
- `src/lib/google/oauth.ts` — user OAuth для Drive.
- `src/lib/google/drive.ts` — Drive upload через user OAuth.
- `src/lib/storage/supabase.ts` — signed upload URL для Supabase Storage.
- `src/lib/storage/attachments.ts` — валидация и нормализация metadata вложений.
- `src/lib/google/sheets.ts` — Sheets adapter.
- `src/lib/repositories.ts` — репозитории поверх Sheets.
- `src/components/app` — Mini App, заявки, панель маркетинга.
- `src/components/ui` — базовые UI-компоненты.
- `src/config` — статусы, справочники, продуктовые константы.
