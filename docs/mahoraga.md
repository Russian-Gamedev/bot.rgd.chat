# Mahoraga anti-spam

Mahoraga - система мягкого антиспама для Discord-серверов RGD. Она отслеживает подозрительную активность, создаёт единый кейс на пользователя и при необходимости выдаёт softban-роль на всех серверах, где Mahoraga включён.

## Что делает Mahoraga

Mahoraga реагирует на четыре типа событий:

- `honeypot` - сообщение отправлено в honeypot-канал.
- `text_repeat` - пользователь повторяет одинаковый нормализованный текст.
- `link_repeat` - пользователь повторяет одинаковые нормализованные ссылки.
- `image_repeat` - пользователь повторяет одинаковые изображения.
- `manual` - кейс создан вручную через API.

Боты, webhook-сообщения, сообщения вне guild и участники с `Administrator` или `Manage Guild` игнорируются.

## Режимы работы

Режим задаётся настройкой `mahoraga_enforcement_mode`.

- `enforce` - Mahoraga применяет softban и запускает verification-flow для молодых аккаунтов.
- `monitor` - Mahoraga только создаёт observed-кейсы и пишет в лог, что softban был бы применён.

Если настройка отсутствует или имеет неизвестное значение, используется `enforce`.

## Статусы кейса

| Статус | Значение |
| --- | --- |
| `observed` | Детект сработал в monitor-режиме. Softban не применяется. |
| `pending_verification` | Молодой аккаунт получил шанс пройти DM-проверку. |
| `active` | Активный spammer-кейс. Softban должен быть применён. |
| `pardoned` | Пользователь разбанен через API, slash-команду или verification. |

На пользователя хранится один кейс в таблице `mahoraga_cases`. Повторные срабатывания обновляют кейс, увеличивают `detection_count` и добавляют evidence.

## Настройки guild

Все настройки хранятся как guild settings.

| Key | Тип | Default | Назначение |
| --- | --- | --- | --- |
| `mahoraga_enabled` | boolean | `false` | Включает Mahoraga на сервере. |
| `mahoraga_enforcement_mode` | string | `enforce` | `enforce` или `monitor`. |
| `mahoraga_honeypot_channel_id` | string | `null` | Канал-ловушка. Любое сообщение там создаёт детект. |
| `mahoraga_softban_role_id` | string | `null` | Роль, которая выдаётся при softban. |
| `mahoraga_log_channel_id` | string | `null` | Канал для логов Mahoraga. |
| `mahoraga_text_repeat_limit` | number | `3` | Сколько одинаковых текстов нужно для срабатывания. |
| `mahoraga_text_window_seconds` | number | `30` | Окно повторов текста. |
| `mahoraga_link_repeat_limit` | number | `3` | Сколько одинаковых ссылок нужно для срабатывания. |
| `mahoraga_link_window_seconds` | number | `60` | Окно повторов ссылок. |
| `mahoraga_image_repeat_limit` | number | `2` | Сколько одинаковых изображений нужно для срабатывания. |
| `mahoraga_image_window_seconds` | number | `600` | Окно повторов изображений. |
| `mahoraga_young_account_months` | number | `3` | Аккаунты моложе этого значения получают verification-flow. |
| `mahoraga_verification_timeout_minutes` | number | `30` | Сколько действует кнопка проверки в DM. |

Числовые настройки меньше `1` считаются невалидными и заменяются default-значением.

## Detection logic

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

Softban - это выдача роли `mahoraga_softban_role_id`.

Когда кейс становится `active`, Mahoraga пытается выдать softban-роль пользователю на всех серверах, где включён `mahoraga_enabled`. Возможные результаты по каждому серверу:

- `applied` - роль выдана или снята.
- `already_applied` - роль уже была на пользователе.
- `skipped` - сервер, роль или участник недоступны.
- `failed` - Discord API вернул ошибку.

Если пользователь с активным кейсом заходит на сервер позже, Mahoraga повторно пытается применить softban для этого сервера.

## Verification для молодых аккаунтов

В `enforce`-режиме аккаунт моложе `mahoraga_young_account_months` сначала получает статус `pending_verification`.

Mahoraga отправляет пользователю DM с кнопкой `Пройти проверку`. Если пользователь нажимает кнопку до `verification_expires_at`, кейс становится `pardoned`, а softban снимается на всех включённых серверах.

Если DM не удалось отправить или срок проверки истёк, кейс переводится в `active`. Истёкшие проверки обрабатываются cron-задачей каждые 5 минут.

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

- `status` - `observed`, `pending_verification`, `active`, `pardoned`.
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

`guild_id` и `reason` опциональны. Кейс создаётся как `active` с причиной `manual`.

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

Кейс переводится в `pardoned`, verification token сбрасывается, softban-роль снимается на всех включённых серверах.

### Синхронизировать softban

```http
POST /mahoraga/spammers/:user_id/sync-softban
```

Повторно применяет softban на всех включённых серверах. Для кейсов `observed` и `pardoned` endpoint возвращает ошибку.

## Slash-команды

### `/mahoraga unban`

Доступна в guild-контексте пользователям с `Administrator`.

Параметры:

- `user` - Discord user для удаления из Mahoraga.
- `reason` - опциональная причина.

Команда вызывает тот же pardon-flow, что и REST endpoint: переводит кейс в `pardoned` и снимает softban-роль на всех включённых серверах.

## Логи

Если задан `mahoraga_log_channel_id`, Mahoraga пишет туда события:

- detection в `monitor` и `enforce` режимах;
- успешный или пропущенный softban;
- ошибки применения softban;
- отправку, прохождение и истечение verification;
- manual softban и unban.

Сообщения логов обрезаются до 1900 символов, `allowedMentions` отключён.

## Минимальная настройка сервера

1. Создать softban-роль и настроить ей ограничения прав на сервере.
2. Записать ID роли в `mahoraga_softban_role_id`.
3. Включить `mahoraga_enabled`.
4. Опционально задать `mahoraga_log_channel_id`.
5. Опционально создать honeypot-канал и записать его ID в `mahoraga_honeypot_channel_id`.
6. Для тестового запуска поставить `mahoraga_enforcement_mode = monitor`.
7. После проверки логов переключить `mahoraga_enforcement_mode = enforce`.
