# Mahoraga anti-spam

Mahoraga - система мягкого антиспама для Discord-серверов RGD. Она отслеживает подозрительную активность, создаёт единый кейс на пользователя и при необходимости применяет временный ban только на сервере, где произошло нарушение.

## Что делает Mahoraga

Mahoraga реагирует на пять типов событий:

- `honeypot` - сообщение отправлено в honeypot-канал.
- `text_repeat` - пользователь повторяет одинаковый нормализованный текст.
- `link_repeat` - пользователь повторяет одинаковые нормализованные ссылки.
- `image_repeat` - пользователь повторяет одинаковые изображения.
- `manual` - кейс создан вручную через API.

Боты, webhook-сообщения, сообщения вне guild и участники с `Administrator` или `Manage Guild` игнорируются.

## Режимы работы

У типов детектов есть режим работы (`off`, `monitor`, `on`).

- `off` - детекты этого типа полностью отключены.
- `monitor` - Mahoraga создаёт `observed`-кейс и пишет один лог о том, что sanction был бы применён.
- `on` - Mahoraga применяет temporary softban.

Режимы задаются настройками `mahoraga_honeypot_mode` и `mahoraga_repeat_mode`. Если настройка отсутствует или имеет неизвестное значение, используется `on`.

## Статусы кейса

| Статус | Значение |
| --- | --- |
| `observed` | Детект сработал в monitor-режиме. Softban не применяется. |
| `active` | Активный spammer-кейс. Temporary softban был или должен быть применён в source guild. |
| `pardoned` | Пользователь разбанен через API или slash-команду. |

На пользователя хранится один кейс в таблице `mahoraga_cases`. Повторные срабатывания обновляют кейс, увеличивают `detection_count` и добавляют evidence.

## Настройки guild

Все настройки хранятся как guild settings.

| Key | Тип | Default | Назначение |
| --- | --- | --- | --- |
| `mahoraga_enabled` | boolean | `false` | Включает Mahoraga на сервере. |
| `mahoraga_honeypot_channel_id` | string | `null` | Канал-ловушка. Любое сообщение там создаёт детект. |
| `mahoraga_honeypot_mode` | string | `on` | Режим honeypot: `off`, `monitor`, `on`. |
| `mahoraga_repeat_mode` | string | `on` | Режим повторов (text/link/image): `off`, `monitor`, `on`. |
| `mahoraga_log_channel_id` | string | `null` | Канал для логов Mahoraga. |
| `mahoraga_text_repeat_limit` | number | `3` | Сколько одинаковых текстов нужно для срабатывания. |
| `mahoraga_text_window_seconds` | number | `30` | Окно повторов текста. |
| `mahoraga_link_repeat_limit` | number | `3` | Сколько одинаковых ссылок нужно для срабатывания. |
| `mahoraga_link_window_seconds` | number | `60` | Окно повторов ссылок. |
| `mahoraga_image_repeat_limit` | number | `2` | Сколько одинаковых изображений нужно для срабатывания. |
| `mahoraga_image_window_seconds` | number | `600` | Окно повторов изображений. |
| `mahoraga_message_tracking_window_seconds` | number | `600` | Окно хранения последних сообщений пользователя для проверки после temporary ban. |

Числовые настройки меньше `1` считаются невалидными и заменяются default-значением.

## Detection logic

Перед проверками Mahoraga атомарно отмечает Discord-сообщение в Redis:

```text
mahoraga:processed-message:{guildId}:{messageId}
```

Одно сообщение обрабатывается только один раз, даже если событие `messageCreate` было доставлено повторно или одновременно попало в несколько процессов. TTL ключа равен максимальному из настроенных окон text/link/image/message tracking.

### Honeypot

Если `mahoraga_honeypot_channel_id` задан и сообщение пришло в этот канал, Mahoraga сразу создаёт detection с причиной `honeypot`.

### Повтор ссылок

Из текста извлекаются URL, нормализуются и считаются через Redis fixed-window counter:

```text
mahoraga:detector:link:{guildId}:{userId}:{hash}
```

При достижении `mahoraga_link_repeat_limit` внутри `mahoraga_link_window_seconds` создаётся кейс с причиной `link_repeat`.

### Повтор изображений

Mahoraga проверяет только image attachments. Файл скачивается, если размер не больше 8 MiB, затем хешируется. Повтор считается через Redis key:

```text
mahoraga:detector:image:{guildId}:{userId}:{hash}
```

При достижении `mahoraga_image_repeat_limit` внутри `mahoraga_image_window_seconds` создаётся кейс с причиной `image_repeat`.

### Повтор текста

Текст нормализуется. Сообщения с нормализованной длиной меньше 4 символов не учитываются. Повтор считается через Redis key:

```text
mahoraga:detector:text:{guildId}:{userId}:{hash}
```

При достижении `mahoraga_text_repeat_limit` внутри `mahoraga_text_window_seconds` создаётся кейс с причиной `text_repeat`.

## Softban

Softban - это temporary Discord ban в source guild:

1. `guild.bans.create(userId, { reason, deleteMessageSeconds: 3600 })`.
2. Через 5 секунд `guild.bans.remove(userId, reason)`.
3. После unban Mahoraga проверяет Redis-tracked messages для `mahoraga:messages:{guildId}:{userId}`.
4. Если Discord ban не удалил сообщение, Mahoraga удаляет его вручную.

Sanction применяется только к одному серверу - guild, где произошло нарушение. Если уже `active` пользователь снова триггерит honeypot или repeat-spam detection, Mahoraga снова применяет temporary ban в source guild и после unban проверяет/чистит tracked messages. Новое spam alert при повторном active detection не отправляется.

Если пользователь с активным кейсом позже заходит на сервер, Mahoraga только пишет уведомление в log channel. Rejoin-ban больше не применяется. `pardoned` кейсы rejoin-уведомления не создают.

## REST API

Все endpoints требуют actor-auth и permission:

```text
manage:mahoraga
```

Для bot-token владелец бота используется как actor для manual/unban evidence.

### Список кейсов

```http
GET /mahoraga/spammers
```

Query params:

- `status` - `observed`, `active`, `pardoned`.
- `guild_id` - Discord guild ID.
- `reason` - `honeypot`, `text_repeat`, `link_repeat`, `image_repeat`, `manual`.
- `limit` - от `1` до `100`, default `50`.
- `offset` - default `0`.

### Получить кейс пользователя

```http
GET /mahoraga/spammers/:user_id
```

`user_id` - Discord user ID.

### Создать manual softban

```http
POST /mahoraga/spammers
```

Body:

```json
{
  "user_id": "111111111111111111",
  "guild_id": "222222222222222222",
  "reason": "manual review note"
}
```

`guild_id` и `reason` опциональны. Если `guild_id` задан и кейс впервые становится `active`, Mahoraga применяет temporary softban в этом guild.

### Разбанить пользователя

```http
POST /mahoraga/spammers/:user_id/unban
```

Body:

```json
{
  "reason": "appeal accepted"
}
```

Кейс переводится в `pardoned`.

### Синхронизировать softban

```http
POST /mahoraga/spammers/:user_id/sync-softban
```

Повторно применяет temporary softban только в `source_guild_id` кейса. Для кейсов `observed`, `pardoned` и кейсов без `source_guild_id` endpoint возвращает ошибку.

## Slash-команды

### `/mahoraga unban`

Доступна в guild-контексте пользователям с `Administrator`.

Параметры:

- `user` - Discord user для удаления из Mahoraga.
- `reason` - опциональная причина.

Команда вызывает тот же pardon-flow, что и REST endpoint: переводит кейс в `pardoned`.

## Логи

Если задан `mahoraga_log_channel_id`, Mahoraga пишет туда события:

- первый detection в `monitor` режиме;
- агрегированный результат temporary softban;
- rejoin пользователя с активным Mahoraga case;
- unban/pardon.

Сообщение temporary softban включает количество затронутых каналов и cleanup counters: сколько сообщений уже удалил Discord ban, сколько удалено вручную и сколько не удалось проверить или удалить.

## Минимальная настройка сервера

1. Включить `mahoraga_enabled`.
2. Опционально задать `mahoraga_log_channel_id`.
3. Опционально создать honeypot-канал и записать его ID в `mahoraga_honeypot_channel_id`.
4. После проверки логов переключить `mahoraga_honeypot_mode` и `mahoraga_repeat_mode` на `on`.
