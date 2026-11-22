<div align='center'>
<img src='https://assets.rgd.chat/banner.jpg'  alt='rgd logo'>

# Russian GameDev Bot

[![Discord Link](https://dcbadge.limes.pink/api/server/5kZhhWD)](https://discord.gg/5kZhhWD)

</div>

## Возможности

### Активность и статистика

Учёт сообщений, реакций и времени в голосовых каналах, стрики и ежедневные начисления. Крон в 15:00 МСК начисляет монеты, выдаёт и снимает роль активного и публикует сводки за день, неделю (по субботам) и месяц при включённой настройке `post_activity_messages`.

- **Команды:** `/activity`, `/top voice|chat|coins`, `/user`, `/prune users <days>`
- **REST:** `GET /activity/me`, `GET /activity/users/:userId`, `GET /activity/overview`

### Экономика и монеты

Внутренняя валюта: баланс, переводы, запросы на перевод с кнопками подтверждения, история транзакций и ежедневные награды за активность.

- **Команды:** `/coins transfer`, `/coins request`, `/coins history`
- **REST:** `GET /wallet/balance`, `GET /wallet/history`, `GET /wallet/balance/:userId`, `GET /wallet/history/:userId`, `POST /wallet/credit`, `POST /wallet/debit`, `POST /wallet/transfer`

### Мини-игры

Казино со ставками от 1 до 100 000 монет: монетка, слот-машина и рулетка, а также статистика по серверу, игроку и игре.

- **Команды:** `/flip`, `/slot`, `/roulette`, `/minigames stats`

### Предметы

Создание предметов за монеты: редкость, цвет, изображение, передаваемость и история передач.

- **Команды:** `/item list`, `/item create`

### Никнеймы

Смена никнейма с платной блокировкой на время, досрочное снятие блокировки и история смен.

- **Команды:** `/rn`, `!rn`, `/rn-unlock`, `/nickhistory`

### События гильдии

Шаблонные сообщения на первый вход, вход, выход, бан, кик и смену никнейма, розыгрыш за активность и вложения. Поддерживают плейсхолдеры `${active}`, `${irandom,min,max}`, `${choose,a,b,c}`.

- **Команды:** `/events add` (за монеты), `/events fake`
- **REST:** `GET /events`, `GET /events/list`, `GET /events/:event`, `POST /events`, `PATCH /events/:id`, `DELETE /events/:id`

### Приглашения

Учёт приглашений и их использований, alias'ы для ссылок и отслеживание, кто кого пригласил. Синхронизация приглашений раз в час.

- **Команды:** `/invites create`, `/invites alias set|clear`, `/invites list`

### Роли

Реакционные роли (эмодзи ↔ роль), автороль активных по порогам и сохранение/восстановление ролей при выходе и возвращении участника.

- **Настройки:** `active_role_id`, `active_auto_role`, `active_auto_role_threshold`, `active_auto_remove_role_threshold`

### Дни рождения

Дата рождения участника, список ближайших именинников, ежедневное поздравление в 08:00 и выдача праздничной роли на день.

- **Команды:** `/birthday-set`, `/birthdays`

### MOTD

Пользовательские статусы бота за монеты; в очереди чередуются со встроенными шутками.

- **Команды:** `/motd add`

### Таро

Расклад Таро на три карты с LLM-интерпретацией в контексте вопроса (3 расклада в день).

- **Команды:** `/tarot`

### Пересказ сообщений

Пересказ переписки через LLM с map-reduce: диапазон или последние N сообщений, темы и решения (3 раза в день, администраторы без лимита).

- **Команды:** `/summarize`, контекстное меню «Пересказать сообщение»

### Утилиты

Служебные команды и автоисправление видео-embed'ов: бот подавляет оригинальный embed и отвечает fix-ссылкой (fxtwitter, kkinstagram, dtnktok), только если ссылка ведёт на видео.

- **Команды:** `/ping`, `/avatar`, `/version`, `/commands`, `/prune messages`; контекстные меню «Edit a Bot message», «Get User Avatar»

### Настройки и логи

Управление настройками гильдии и audit log канал с embed-логами входов, выходов и авторизаций на сайте.

- **Команды:** `/set-settings set-raw`

### Mahoraga

Антиспам: honeypot-канал, детект повторов текста, ссылок и изображений, режимы `off|monitor|on`, softban с очисткой сообщений, логи и ручные кейсы. Подробности — в [docs/mahoraga.md](docs/mahoraga.md).

- **Команды:** `/honeypot set`, `/mahoraga unban`
- **REST:** `GET /mahoraga/spammers`, `GET /mahoraga/spammers/:user_id`, `POST /mahoraga/spammers`, `POST /mahoraga/spammers/:user_id/unban`, `POST /mahoraga/spammers/:user_id/sync-softban`

### Порталы

Двусторонняя пересылка сообщений между каналами и серверами через вебхуки с сохранением автора, ответов и форвардов. Чёрный список и отказ от проксирования.

- **Команды:** `/portal create|delete|list`, `/portal blacklist-add|blacklist-remove|blacklist-list`, `/portal-dont-proxy-me`

### Проекты

Каталог проектов с типами (игра, сервис, инструмент, другое): ревизии, процесс ревью, лайки, теги, загрузка баннеров и вложений в S3.

- **REST:** `GET /projects`, `POST /projects`, `GET /projects/:id_or_slug`, `PATCH /projects/:id`, `DELETE /projects/:id`, `GET /projects/mine`, `GET /projects/review`, `POST /projects/:id/submit-review`, `POST /projects/:id/review/publish`, `POST /projects/:id/review/request-changes`, `GET|PUT|DELETE /projects/:id/like`, `GET /projects/tags`, `GET /projects/tags/popular`, `POST /projects/uploads`, `POST /projects/uploads/:id/complete`, `DELETE /projects/uploads/:id`

### Golder

Медиагалерея с тегами, поиском и слагами: загрузка в S3 и импорт из сообщений Discord или по URL (Tenor, Open Graph).

- **Команды:** контекстное меню «Загрузить в Golder»
- **REST:** `GET /golder`, `GET /golder/:slug`, `PATCH /golder/:slug`, `DELETE /golder/:slug`, `GET /golder/tags`, `POST /golder/uploads`, `POST /golder/uploads/:id/complete`, `POST /golder/import`, `GET /golder/import/resolve`

### Профили

Публичные профили с аватаром, баннером, about/ссылками, тегами (включая донат) и стриками; поиск и проекты пользователя.

- **REST:** `GET /users/me`, `PATCH /users/me`, `GET /users/search`, `GET /users/:id`, `GET /users/:id_or_username/projects`

### Авторизация на сайте

Вход через Discord OAuth2, JWT в httpOnly cookie и лог авторизаций в audit log серверов.

- **REST:** `GET /auth/discord`, `GET /auth/discord/callback`, `POST /auth/discord/token`, `POST /auth/logout`

### Гильдии

Список серверов и ролей для сайта.

- **REST:** `GET /guilds`, `GET /guilds/:guildId/roles`

### Discord-эндпоинты

Прокси эмодзи, список участников и информация об инвайте.

- **REST:** `GET /discord/emoji/:emoji`, `GET /discord/members`, `GET /discord/invite/:code`

### Bot API

Бот-акторы с токенами и permission-моделью (`wallet:read:own`, `wallet:manage`, `guild:read`, `guild_events:read`, `read:messages`, `send:messages`, `manage:mahoraga`, `projects:review`).

- **Команды:** `!createbot`
- **REST:** `GET /bots/me`

### BAR

WebSocket-протокол для клиентов BAR: снимок гильдий, каналов и участников, события сообщений, typing, голосовых состояний и relay с упорядочиванием по `seq`. Спецификация — в [docs/rgd-bar-protocol.md](docs/rgd-bar-protocol.md).

- **Команды:** `/bar-join`
- **WebSocket:** `wss://bot.rgd.chat/bar`

### Мониторинг

Проверка живости сервиса и Prometheus-метрики.

- **REST:** `GET /health`, `GET /metrics`

## Разработка

После клонирования проекта и установки зависимостей с помощью `bun i`, запустите бота разработки:

> Мы используем _[bun](https://bun.com)_ для разработки

```bash
bun start:dev
```

Для работы необходим PostgreSQL и Redis, их можно установить самостоятельно установить, или же воспльзоваться командой для запуска в докере

```bash
bun compose:dev
```

Так же стоит скопировать файл `.env.example` в `.env.development` и заполнить их данными.
