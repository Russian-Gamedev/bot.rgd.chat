import { afterEach, describe, expect, it, mock } from 'bun:test';

import type { MetricsService } from '#common/metrics/metrics.service';
import { BarGateway } from './bar.gateway';
import { BarWatcher } from './bar.watcher';

const originalDateNow = Date.now;

function setNow(now: number) {
  Date.now = mock(() => now);
}

function createRawSocket() {
  let messageListener: ((data: unknown, isBinary?: boolean) => void) | null =
    null;
  const sent: string[] = [];

  return {
    sent,
    send: mock((message: string) => {
      sent.push(message);
    }),
    close: mock(() => undefined),
    on: mock(
      (
        event: 'message',
        listener: (data: unknown, isBinary?: boolean) => void,
      ) => {
        if (event === 'message') {
          messageListener = listener;
        }
      },
    ),
    emitMessage(data: unknown, isBinary = false) {
      if (!messageListener) throw new Error('message listener is not bound');
      messageListener(data, isBinary);
    },
  };
}

function createMetrics() {
  return {
    recordBarEvent: mock(() => undefined),
    setBarClientCount: mock(() => undefined),
  } as unknown as MetricsService;
}

function createGateway(
  getInitialData = mock(async () => ({ guilds: [] })),
  metrics?: MetricsService,
) {
  const watcher = {
    getInitialData,
  } as unknown as BarWatcher;

  return new BarGateway(watcher, metrics);
}

async function connect(
  gateway: BarGateway,
  socket: ReturnType<typeof createRawSocket>,
) {
  await gateway.handleConnection(
    socket as unknown as Bun.WebSocket,
    {
      headers: {},
    } as Request,
  );
}

function parseSent(socket: ReturnType<typeof createRawSocket>) {
  return socket.sent.map((message) => JSON.parse(message));
}

function expectConnected(message: unknown) {
  expect(typeof (message as { seq: unknown }).seq).toBe('number');
  expect(message).toMatchObject({
    type: 'connected',
    data: { guilds: [] },
    ts: 1000,
  });
  expect(
    typeof (message as { data: { client_id: unknown } }).data.client_id,
  ).toBe('string');
  expect(
    Array.isArray((message as { data: { clients: unknown } }).data.clients),
  ).toBe(true);
}

function getConnectedMessage(socket: ReturnType<typeof createRawSocket>) {
  return parseSent(socket).find((message) => message.type === 'connected');
}

describe('BarGateway relay', () => {
  afterEach(() => {
    Date.now = originalDateNow;
  });

  it('broadcasts valid relay messages to other clients only', async () => {
    setNow(1000);
    const gateway = createGateway();
    const sender = createRawSocket();
    const receiver = createRawSocket();

    await connect(gateway, sender);
    await connect(gateway, receiver);

    sender.emitMessage(
      JSON.stringify({ type: 'relay', data: { action: 'wave' } }),
    );

    const senderMessages = parseSent(sender);
    const receiverMessages = parseSent(receiver);
    const relayMessage = receiverMessages.at(-1);

    expectConnected(senderMessages[0]);
    expect(relayMessage).toMatchObject({
      type: 'relay',
      data: {
        payload: { action: 'wave' },
      },
      ts: 1000,
      seq: 7,
    });
    expect(typeof relayMessage.data.client_id).toBe('string');
  });

  it('accepts JSON relay messages sent as buffers', async () => {
    setNow(1000);
    const gateway = createGateway();
    const sender = createRawSocket();
    const receiver = createRawSocket();

    await connect(gateway, sender);
    await connect(gateway, receiver);

    sender.emitMessage(
      Buffer.from(JSON.stringify({ type: 'relay', data: { kind: 'cursor' } })),
      true,
    );

    expect(parseSent(receiver).at(-1)).toMatchObject({
      type: 'relay',
      data: {
        payload: { kind: 'cursor' },
      },
      ts: 1000,
      seq: 7,
    });
  });

  it('accepts null-terminated JSON relay messages', async () => {
    setNow(1000);
    const gateway = createGateway();
    const sender = createRawSocket();
    const receiver = createRawSocket();

    await connect(gateway, sender);
    await connect(gateway, receiver);

    sender.emitMessage(
      `${JSON.stringify({
        type: 'relay',
        data: { kind: 'cursor', x: 143.0, y: 84.0 },
      })}\0`,
    );

    expect(parseSent(receiver).at(-1)).toMatchObject({
      type: 'relay',
      data: {
        payload: { kind: 'cursor', x: 143.0, y: 84.0 },
      },
      ts: 1000,
      seq: 7,
    });
  });

  it('does not replay relay messages to new clients', async () => {
    setNow(1000);
    const gateway = createGateway();
    const sender = createRawSocket();
    const receiver = createRawSocket();
    const lateClient = createRawSocket();

    await connect(gateway, sender);
    await connect(gateway, receiver);
    sender.emitMessage(JSON.stringify({ type: 'relay', data: 'transient' }));
    await connect(gateway, lateClient);

    const lateClientMessages = parseSent(lateClient);

    expect(
      lateClientMessages.filter((message) => message.type === 'relay'),
    ).toEqual([]);
    expectConnected(lateClientMessages[0]);
  });

  it('sends client list on connect and broadcasts presence events', async () => {
    setNow(1000);
    const gateway = createGateway();
    const first = createRawSocket();
    const second = createRawSocket();

    await connect(gateway, first);

    const firstConnected = getConnectedMessage(first);
    const firstClientId = firstConnected.data.client_id;

    expect(firstConnected).toMatchObject({
      type: 'connected',
      data: {
        clients: [{ client_id: firstClientId }],
      },
      ts: 1000,
      seq: 1,
    });
    expect(parseSent(first).slice(1)).toEqual([
      {
        type: 'client_connected',
        data: { client_id: firstClientId },
        ts: 1000,
        seq: 2,
      },
      { type: 'client_count', data: { count: 1 }, ts: 1000, seq: 3 },
    ]);

    await connect(gateway, second);

    const secondConnected = getConnectedMessage(second);
    const secondClientId = secondConnected.data.client_id;

    expect(secondConnected).toMatchObject({
      type: 'connected',
      data: {
        clients: [{ client_id: firstClientId }, { client_id: secondClientId }],
      },
      ts: 1000,
      seq: 4,
    });
    expect(parseSent(first).slice(-2)).toEqual([
      {
        type: 'client_connected',
        data: { client_id: secondClientId },
        ts: 1000,
        seq: 5,
      },
      { type: 'client_count', data: { count: 2 }, ts: 1000, seq: 6 },
    ]);
    expect(parseSent(second).slice(1)).toEqual([
      {
        type: 'client_connected',
        data: { client_id: secondClientId },
        ts: 1000,
        seq: 5,
      },
      { type: 'client_count', data: { count: 2 }, ts: 1000, seq: 6 },
    ]);

    gateway.handleDisconnect(first as unknown as Bun.WebSocket);

    expect(parseSent(second).slice(-2)).toEqual([
      {
        type: 'client_disconnected',
        data: { client_id: firstClientId },
        ts: 1000,
        seq: 7,
      },
      { type: 'client_count', data: { count: 1 }, ts: 1000, seq: 8 },
    ]);
  });

  it('updates websocket client and relay metrics', async () => {
    setNow(1000);
    const metrics = createMetrics();
    const gateway = createGateway(
      mock(async () => ({ guilds: [] })),
      metrics,
    );
    const sender = createRawSocket();
    const receiver = createRawSocket();

    await connect(gateway, sender);
    await connect(gateway, receiver);
    sender.emitMessage(JSON.stringify({ type: 'relay', data: 'ok' }));
    gateway.handleDisconnect(sender as unknown as Bun.WebSocket);

    expect(metrics.setBarClientCount).toHaveBeenCalledWith(1);
    expect(metrics.setBarClientCount).toHaveBeenCalledWith(2);
    expect(metrics.setBarClientCount).toHaveBeenCalledWith(1);
    expect(metrics.recordBarEvent).toHaveBeenCalledWith('connect', 'success');
    expect(metrics.recordBarEvent).toHaveBeenCalledWith('relay', 'success');
    expect(metrics.recordBarEvent).toHaveBeenCalledWith(
      'disconnect',
      'success',
    );
  });

  it('assigns increasing seq values to consecutive server messages in the same millisecond', async () => {
    setNow(1000);
    const gateway = createGateway();
    const socket = createRawSocket();

    await connect(gateway, socket);

    const messages = parseSent(socket);
    expect(messages.map((message) => message.ts)).toEqual([1000, 1000, 1000]);
    expect(messages.map((message) => message.seq)).toEqual([1, 2, 3]);
  });

  it('replays broadcast history with original seq values', async () => {
    setNow(1000);
    const gateway = createGateway();
    const first = createRawSocket();
    const late = createRawSocket();

    await connect(gateway, first);
    gateway.broadcast('client_count', { count: 10 });
    await connect(gateway, late);

    const firstMessages = parseSent(first);
    const lateMessages = parseSent(late);
    const broadcast = firstMessages.find(
      (message) => message.type === 'client_count' && message.data.count === 10,
    );

    expect(broadcast).toMatchObject({
      type: 'client_count',
      data: { count: 10 },
      ts: 1000,
      seq: 4,
    });
    expect(lateMessages[0]).toMatchObject({
      type: 'connected',
      seq: 5,
    });
    expect(lateMessages[1]).toEqual(broadcast);
  });

  it('replays broadcasts emitted while initial data is pending after connected', async () => {
    setNow(1000);
    let resolveInitialData: (value: { guilds: [] }) => void = () => undefined;
    const initialData = new Promise<{ guilds: [] }>((resolve) => {
      resolveInitialData = resolve;
    });
    const gateway = createGateway(mock(async () => initialData));
    const socket = createRawSocket();

    const pendingConnection = connect(gateway, socket);
    gateway.broadcast('client_count', { count: 42 });
    resolveInitialData({ guilds: [] });
    await pendingConnection;

    const messages = parseSent(socket);
    expect(messages[0]).toMatchObject({
      type: 'connected',
      seq: 2,
    });
    expect(messages[1]).toEqual({
      type: 'client_count',
      data: { count: 42 },
      ts: 1000,
      seq: 1,
    });
  });

  it('rejects oversized relay payloads without broadcasting', async () => {
    setNow(1000);
    const gateway = createGateway();
    const sender = createRawSocket();
    const receiver = createRawSocket();

    await connect(gateway, sender);
    await connect(gateway, receiver);

    sender.emitMessage(
      JSON.stringify({ type: 'relay', data: 'x'.repeat(16 * 1024 + 1) }),
    );

    expect(
      parseSent(receiver).filter((message) => message.type === 'relay'),
    ).toEqual([]);
    expect(parseSent(sender).at(-1)).toMatchObject({
      type: 'error',
      data: { code: 'payload_too_large' },
      ts: 1000,
      seq: 7,
    });
  });

  it('rejects malformed JSON and invalid envelopes', async () => {
    setNow(1000);
    const gateway = createGateway();
    const socket = createRawSocket();

    await connect(gateway, socket);

    socket.emitMessage('');
    socket.emitMessage('{');
    socket.emitMessage(Buffer.from([1, 2, 3]), true);
    socket.emitMessage(JSON.stringify([]));
    socket.emitMessage(JSON.stringify({ type: 'relay' }));

    const errors = parseSent(socket).filter(
      (message) => message.type === 'error',
    );

    expect(errors).toMatchObject([
      {
        type: 'error',
        data: { code: 'invalid_json' },
        seq: 4,
      },
      {
        type: 'error',
        data: { code: 'invalid_json' },
        seq: 5,
      },
      {
        type: 'error',
        data: { code: 'invalid_json' },
        seq: 6,
      },
      {
        type: 'error',
        data: { code: 'invalid_message' },
        seq: 7,
      },
      {
        type: 'error',
        data: { code: 'invalid_payload' },
        seq: 8,
      },
    ]);
  });

  it('rate-limits relay messages per client', async () => {
    setNow(1000);
    const gateway = createGateway();
    const sender = createRawSocket();
    const receiver = createRawSocket();

    await connect(gateway, sender);
    await connect(gateway, receiver);

    for (let i = 0; i < 61; i++) {
      sender.emitMessage(JSON.stringify({ type: 'relay', data: i }));
    }

    const receiverRelayMessages = parseSent(receiver).filter(
      (message) => message.type === 'relay',
    );

    expect(receiverRelayMessages).toHaveLength(60);
    expect(receiverRelayMessages.map((message) => message.seq)).toEqual(
      Array.from({ length: 60 }, (_, i) => i + 7),
    );
    expect(parseSent(sender).at(-1)).toMatchObject({
      type: 'error',
      data: { code: 'rate_limited' },
      seq: 67,
    });
  });

  it('accepts ping without response', async () => {
    setNow(1000);
    const gateway = createGateway();
    const socket = createRawSocket();

    await connect(gateway, socket);
    socket.emitMessage(JSON.stringify({ type: 'ping' }));

    const messages = parseSent(socket);

    expectConnected(messages[0]);
    expect(messages.filter((message) => message.type === 'error')).toEqual([]);
  });

  it('keeps the connection when initial data cannot be built', async () => {
    setNow(1000);
    const gateway = createGateway(
      mock(async () => {
        throw new Error('Discord rate limited');
      }),
    );
    const socket = createRawSocket();

    await connect(gateway, socket);

    const messages = parseSent(socket);

    expectConnected(messages[0]);
  });

  it('closes active clients and clears relay state on shutdown', async () => {
    setNow(1000);
    const gateway = createGateway();
    const first = createRawSocket();
    const second = createRawSocket();

    await connect(gateway, first);
    await connect(gateway, second);
    first.emitMessage(JSON.stringify({ type: 'relay', data: 'hello' }));

    gateway.beforeApplicationShutdown();
    gateway.broadcast('client_count', { count: 10 });

    expect(first.close).toHaveBeenCalledWith(1001, 'Server shutdown');
    expect(second.close).toHaveBeenCalledWith(1001, 'Server shutdown');
    expect(
      parseSent(first).filter((message) => message.data?.count === 10),
    ).toEqual([]);
    expect(
      (gateway as unknown as { relayRateLimits: Map<unknown, unknown> })
        .relayRateLimits.size,
    ).toBe(0);
  });

  it('does not fail shutdown without clients', () => {
    const gateway = createGateway();

    expect(() => gateway.beforeApplicationShutdown()).not.toThrow();
  });
});
