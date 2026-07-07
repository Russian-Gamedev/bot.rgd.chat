# Протокол RGD BAR

## Подключение

### Endpoint

```
wss://bot.rgd.chat/bar
```

### Транспорт

- **Протокол**: WebSocket
- **Формат данных**: JSON

## Changelog

<details>
<summary>2026-07-07 - Relay mode and initial data</summary>

- Добавлен relay-режим: клиент отправляет `type: "relay"`, сервер пересылает событие `relay` всем остальным подключенным клиентам.
- Добавлено серверное событие `error` для ошибок валидации клиентских сообщений.
- Для relay включены ограничения: JSON text only, payload до 16 KiB, rate-limit 60 сообщений в секунду на подключение.
- В `connected` добавлено поле `client_id` с ID текущего WebSocket-подключения.
- В `connected` добавлено поле `clients[]` со всеми подключенными BAR клиентами.
- Добавлены события `client_connected`, `client_disconnected` и `client_count`.
- В `connected` добавлено поле `guilds[].members[]` с активными участниками сервера.
- `connected.guilds[].channels[]` теперь содержит только каналы, доступные роли `@everyone` для просмотра и отправки сообщений/подключения.
- `connected.guilds[].channels[]` исключает неподдержанные типы каналов и сортируется в порядке Discord.
- В `BarMember` добавлено поле `is_bot`.

</details>

---

### Голосовые события

Для получения событий `member_speaking` (когда участники говорят в голосовых каналах), бот должен быть подключен к голосовому каналу.

**Подключение бота к голосовому каналу:**

1. Зайдите в голосовой канал на Discord сервере
2. Выполните команду `/bar-join` в любом текстовом канале
3. Бот присоединится к вашему голосовому каналу и начнёт отправлять события `member_speaking`

## Формат сообщений

Все сообщения передаются в формате JSON со следующей структурой:

```json
{
  "type": "название_события",
  "data": {
    /* полезная нагрузка */
  },
  "ts": 1 /* когда событие сработало */
}
```

## События от сервера к клиенту

### Начальная синхронизация

При успешном подключении сервер отправляет клиенту последние события (по умолчанию 50, но количество может меняться). Это позволяет клиенту синхронизировать состояние без потери данных.

События отправляются в хронологическом порядке (от старых к новым), начиная с события `connected`.

---

### `connected`

Отправляется сразу после успешного подключения. Содержит информацию о доступных серверах, каналах и активных участниках.

**Payload:**

```json
{
  "type": "connected",
  "data": {
    "client_id": "lq3x9h2q",
    "clients": [
      {
        "client_id": "lq3x9h2q"
      },
      {
        "client_id": "m8v2c1aa"
      }
    ],
    "guilds": [
      {
        "id": "123456789",
        "name": "Мой сервер",
        "icon_url": "https://cdn.discord.com/icons/123456789/abc123.png",
        "channels": [
          {
            "id": "987654321",
            "name": "общий",
            "type": "text"
          },
          {
            "id": "987654322",
            "name": "Голосовой",
            "type": "voice"
          }
        ],
        "members": [
          {
            "id": "111222333",
            "username": "Иван",
            "avatar_url": "https://cdn.discord.com/avatars/111222333/def456.png",
            "is_bot": false
          }
        ]
      }
    ]
  },
  "ts": 1700000000000
}
```

**Поля:**

- `client_id` (string) - ID текущего WebSocket-клиента, сгенерированный сервером для этого подключения
- `clients[]` - массив всех подключенных BAR клиентов на момент подключения, включая текущего клиента
  - `client_id` (string) - ID подключенного WebSocket-клиента
- `guilds[]` - массив Discord серверов
  - `id` (string) - ID сервера
  - `name` (string) - название сервера
  - `icon_url` (string) - URL иконки сервера
  - `channels[]` - массив поддержанных каналов, доступных роли `@everyone`, в порядке Discord. Для текстовых каналов требуется `SendMessages`, для тредов - `SendMessagesInThreads`, для голосовых каналов - `Connect`
    - `id` (string) - ID канала
    - `name` (string) - название канала
    - `type` (string) - тип канала: `"text"`, `"voice"`, `"category"`, `"thread"`
  - `members[]` - массив активных участников сервера
    - `id` (string) - Discord ID участника
    - `username` (string) - отображаемое имя участника
    - `avatar_url` (string) - URL аватара
    - `is_bot` (boolean) - `true`, если участник является ботом

---

### `client_connected`

BAR клиент подключился. Событие отправляется всем подключенным клиентам, включая нового клиента.

**Payload:**

```json
{
  "type": "client_connected",
  "data": {
    "client_id": "m8v2c1aa"
  },
  "ts": 1700000000200
}
```

**Поля:**

- `client_id` (string) - ID подключившегося WebSocket-клиента

---

### `client_disconnected`

BAR клиент отключился. Событие отправляется всем оставшимся подключенным клиентам.

**Payload:**

```json
{
  "type": "client_disconnected",
  "data": {
    "client_id": "m8v2c1aa"
  },
  "ts": 1700000000300
}
```

**Поля:**

- `client_id` (string) - ID отключившегося WebSocket-клиента

---

### `client_count`

Текущее количество подключенных BAR клиентов. Отправляется всем подключенным клиентам после подключения или отключения клиента.

**Payload:**

```json
{
  "type": "client_count",
  "data": {
    "count": 3
  },
  "ts": 1700000000400
}
```

**Поля:**

- `count` (number) - текущее количество подключенных BAR клиентов

---

### `relay`

Произвольные данные, отправленные одним клиентом в relay-режиме. Сервер пересылает событие всем остальным подключенным клиентам, кроме отправителя.

> **Важно**: Сервер сейчас не требует авторизации. Любые `relay` данные нужно считать недоверенным пользовательским вводом и валидировать на стороне клиента-получателя.

**Payload:**

```json
{
  "type": "relay",
  "data": {
    "client_id": "lq3x9h2q",
    "payload": {
      "action": "cursor_move",
      "x": 120,
      "y": 80
    }
  },
  "ts": 1700000000500
}
```

**Поля:**

- `client_id` (string) - ID WebSocket-клиента, сгенерированный сервером для текущего подключения
- `payload` (any JSON) - данные, которые отправитель передал в `data`

**Ограничения:**

- relay глобальный для всех подключенных BAR клиентов, без разделения по серверу или каналу
- бинарные сообщения не поддерживаются
- максимальный размер `payload` после JSON-сериализации - 16 KiB
- лимит отправки - 60 relay сообщений в секунду на одно подключение
- relay события не сохраняются в истории последних broadcast-событий и не отправляются новым клиентам при подключении

---

### `error`

Ошибка обработки клиентского сообщения. Отправляется только клиенту, который отправил невалидное сообщение.

**Payload:**

```json
{
  "type": "error",
  "data": {
    "code": "payload_too_large",
    "message": "Relay payload must be at most 16384 bytes."
  },
  "ts": 1700000000600
}
```

**Коды ошибок:**

- `invalid_message` - сообщение не является JSON-объектом нужной формы или отправлено как бинарное
- `invalid_json` - сообщение не удалось распарсить как JSON
- `invalid_payload` - relay сообщение не содержит поле `data`
- `payload_too_large` - входящее сообщение или relay payload превышает лимит размера
- `rate_limited` - превышен лимит relay сообщений для подключения
- `unknown_event` - клиент отправил неподдерживаемый `type`

---

### `member_start_typing`

Участник начал печатать сообщение в текстовом канале.

**Payload:**

```json
{
  "type": "member_start_typing",
  "data": {
    "guild_id": "123456789",
    "channel_id": "987654321",
    "member": {
      "id": "111222333",
      "username": "Иван",
      "avatar_url": "https://cdn.discord.com/avatars/111222333/def456.png"
    }
  },
  "ts": 1700000001234
}
```

**Поля:**

- `guild_id` (string) - ID сервера
- `channel_id` (string) - ID канала
- `member` (BarMember) - информация об участнике

---

### `message_create`

Новое сообщение создано в текстовом канале.

**Payload:**

```json
{
  "type": "message_create",
  "data": {
    "guild_id": "123456789",
    "channel_id": "987654321",
    "message": {
      "id": "999888777",
      "content": "Привет, мир!"
    },
    "member": {
      "id": "111222333",
      "username": "Иван",
      "avatar_url": "https://cdn.discord.com/avatars/111222333/def456.png"
    }
  },
  "ts": 1700000002456
}
```

**Поля:**

- `guild_id` (string) - ID сервера
- `channel_id` (string) - ID канала
- `message` (object) - данные сообщения
  - `id` (string) - ID сообщения
  - `content` (string) - текст сообщения
- `member` (BarMember) - автор сообщения

---

### `member_join_voice`

Участник присоединился к голосовому каналу.

**Payload:**

```json
{
  "type": "member_join_voice",
  "data": {
    "guild_id": "123456789",
    "channel_id": "987654322",
    "member": {
      "id": "111222333",
      "username": "Иван",
      "avatar_url": "https://cdn.discord.com/avatars/111222333/def456.png"
    }
  },
  "ts": 1700000003789
}
```

**Поля:**

- `guild_id` (string) - ID сервера
- `channel_id` (string) - ID голосового канала
- `member` (BarMember) - участник

---

### `member_leave_voice`

Участник покинул голосовой канал.

**Payload:**

```json
{
  "type": "member_leave_voice",
  "data": {
    "guild_id": "123456789",
    "channel_id": "987654322",
    "member": {
      "id": "111222333",
      "username": "Иван",
      "avatar_url": "https://cdn.discord.com/avatars/111222333/def456.png"
    }
  },
  "ts": 1700000004012
}
```

**Поля:**

- `guild_id` (string) - ID сервера
- `channel_id` (string) - ID голосового канала
- `member` (BarMember) - участник

---

### `member_move_voice`

Участник переместился между голосовыми каналами.

**Payload:**

```json
{
  "type": "member_move_voice",
  "data": {
    "guild_id": "123456789",
    "old_channel_id": "987654322",
    "new_channel_id": "987654323",
    "member": {
      "id": "111222333",
      "username": "Иван",
      "avatar_url": "https://cdn.discord.com/avatars/111222333/def456.png"
    }
  },
  "ts": 1700000005345
}
```

**Поля:**

- `guild_id` (string) - ID сервера
- `old_channel_id` (string) - ID предыдущего канала
- `new_channel_id` (string) - ID нового канала
- `member` (BarMember) - участник

---

### `voice_state_update`

Обновление голосового состояния участника (mute/deafen).

**Payload:**

```json
{
  "type": "voice_state_update",
  "data": {
    "guild_id": "123456789",
    "channel_id": "987654322",
    "member": {
      "id": "111222333",
      "username": "Иван",
      "avatar_url": "https://cdn.discord.com/avatars/111222333/def456.png"
    },
    "self_mute": false,
    "self_deaf": true
  },
  "ts": 1700000006678
}
```

**Поля:**

- `guild_id` (string) - ID сервера
- `channel_id` (string) - ID голосового канала
- `member` (BarMember) - участник
- `self_mute` (boolean) - микрофон выключен
- `self_deaf` (boolean) - звук выключен

---

### `member_reaction_add`

Участник добавил реакцию к сообщению.

**Payload:**

```json
{
  "type": "member_reaction_add",
  "data": {
    "guild_id": "123456789",
    "channel_id": "987654321",
    "message_id": "999888777",
    "member": {
      "id": "111222333",
      "username": "Иван",
      "avatar_url": "https://cdn.discord.com/avatars/111222333/def456.png"
    },
    "emoji": {
      "name": "👍",
      "url": "https://cdn.discord.com/emojis/123456789.png"
    }
  },
  "ts": 1700000007901
}
```

**Поля:**

- `guild_id` (string) - ID сервера
- `channel_id` (string) - ID канала
- `message_id` (string) - ID сообщения
- `member` (BarMember) - участник
- `emoji` (object) - информация об эмодзи
  - `name` (string) - название/символ эмодзи
  - `url` (string) - URL пользовательского эмодзи (если применимо)

---

### `member_speaking`

Участник начал или закончил говорить в голосовом канале.

> **⚠️ Важно**: Это событие отправляется только если бот подключен к голосовому каналу. Для подключения используйте команду `/bar-join` в Discord на сервере.

**Payload:**

```json
{
  "type": "member_speaking",
  "data": {
    "guild_id": "123456789",
    "channel_id": "987654322",
    "member": {
      "id": "111222333",
      "username": "Иван",
      "avatar_url": "https://cdn.discord.com/avatars/111222333/def456.png"
    },
    "speaking": true
  },
  "ts": 1700000008234
}
```

**Поля:**

- `guild_id` (string) - ID сервера
- `channel_id` (string) - ID голосового канала
- `member` (BarMember) - участник
- `speaking` (boolean) - `true` если начал говорить, `false` если закончил

**Примечание:**

- Бот должен находиться в том же голосовом канале, что и участник
- Используйте команду `/bar-join` в Discord для подключения бота к голосовому каналу

---

## События от клиента к серверу

### `ping`

Keepalive сообщение для поддержания соединения.

**Payload:**

```json
{
  "type": "ping"
}
```

**Ответ:** Сервер не отвечает на ping сообщения, но использует их для определения активности клиента.

---

### `relay`

Отправка произвольных JSON-данных всем остальным подключенным BAR клиентам.

**Payload:**

```json
{
  "type": "relay",
  "data": {
    "action": "cursor_move",
    "x": 120,
    "y": 80
  }
}
```

**Поля:**

- `data` (any JSON) - произвольные JSON-данные размером до 16 KiB после сериализации

**Ответ:** сервер не отправляет подтверждение отправителю. Остальные клиенты получают серверное событие `relay`.

---

## Общие типы данных

### BarMember

Информация об участнике сервера.

```typescript
{
  "id": string,           // Discord ID участника
  "username": string,     // Имя пользователя
  "avatar_url": string,   // URL аватара
  "is_bot": boolean       // Является ли участник ботом
}
```

### ChannelType

Типы каналов Discord:

| Значение   | Описание        |
| ---------- | --------------- |
| `text`     | Текстовый канал |
| `voice`    | Голосовой канал |
| `category` | Категория       |
| `thread`   | Тред (ветка)    |

---
