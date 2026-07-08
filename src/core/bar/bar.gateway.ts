import { type BeforeApplicationShutdown, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';

import {
  ErrorPayload,
  JsonValue,
  RelayPayload,
  ServerToClientEvents,
  ServerToClientPayload,
} from './bar.protocol';
import { ServerEventMetadata, Socket } from './bar.type';
import { BarWatcher } from './bar.watcher';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  path: '/bar/',
})
export class BarGateway
  implements OnGatewayConnection, OnGatewayDisconnect, BeforeApplicationShutdown
{
  private readonly logger = new Logger(BarGateway.name);
  private clients: Socket[] = [];
  private nextSeq = 1;

  private readonly maxLastBroadcastEvents = 50;
  private readonly maxRelayPayloadBytes = 16 * 1024;
  private readonly maxRelayFrameBytes = this.maxRelayPayloadBytes + 1024;
  private readonly relayRateLimit = 60;
  private readonly relayRateLimitWindowMs = 1000;

  private relayRateLimits = new Map<
    Bun.WebSocket,
    { windowStartedAt: number; count: number }
  >();

  private lastBroadcastEvents: ({
    event: ServerToClientEvents;
    data: ServerToClientPayload<ServerToClientEvents>;
  } & ServerEventMetadata)[] = [];

  constructor(private readonly barWatcher: BarWatcher) {
    barWatcher.barGateway = this;
  }

  async handleConnection(client: Bun.WebSocket, req: Request) {
    const socket = new Socket(client);
    const requestWithSocket = req as Request & {
      socket?: { remoteAddress?: string };
    };
    const ip =
      req?.headers?.['x-forwarded-for'] ??
      requestWithSocket.socket?.remoteAddress ??
      'unknown';
    this.logger.log(`Client[${socket.id}] connected ${ip}`);

    const initialData = await this.barWatcher
      .getInitialData()
      .catch((error) => {
        this.logger.error(
          `Failed to build initial data for Client[${socket.id}]`,
          error,
        );
        return { guilds: [] };
      });
    socket.send(
      'connected',
      {
        client_id: socket.id,
        clients: [...this.getClientPresenceList(), { client_id: socket.id }],
        ...initialData,
      },
      this.createEventMetadata(),
    );

    for (const { event, data, seq, ts } of this.lastBroadcastEvents) {
      socket.send(event, data, { seq, ts });
    }

    this.clients.push(socket);
    this.bindClientMessages(socket);

    this.broadcastPresenceEvent('client_connected', { client_id: socket.id });
    this.broadcastPresenceEvent('client_count', { count: this.clients.length });
  }

  handleDisconnect(client: Bun.WebSocket) {
    const socket = this.clients.find((s) => s.rawSocket === client);
    if (!socket) return;
    this.clients = this.clients.filter((s) => s.rawSocket !== client);
    this.relayRateLimits.delete(client);
    this.logger.log(`Client[${socket.id}] disconnected`);
    this.broadcastPresenceEvent('client_disconnected', {
      client_id: socket.id,
    });
    this.broadcastPresenceEvent('client_count', { count: this.clients.length });
  }

  beforeApplicationShutdown() {
    const clients = this.clients;
    this.clients = [];
    this.relayRateLimits.clear();

    for (const socket of clients) {
      try {
        const rawSocket = socket.rawSocket as Bun.WebSocket & {
          close?: (code?: number, reason?: string) => void;
        };
        rawSocket.close?.(1001, 'Server shutdown');
      } catch (error) {
        this.logger.warn(
          `Failed to close Client[${socket.id}] during shutdown: ${String(error)}`,
        );
      }
    }

    if (clients.length > 0) {
      this.logger.log(`Closed ${clients.length} bar client(s) on shutdown`);
    }
  }

  public broadcast<
    Event extends ServerToClientEvents,
    Payload extends ServerToClientPayload<Event>,
  >(event: Event, data: Payload) {
    const metadata = this.createEventMetadata();

    for (const client of this.clients) {
      client.send(event, data, metadata);
    }

    this.lastBroadcastEvents.push({ event, data, ...metadata });
    if (this.lastBroadcastEvents.length > this.maxLastBroadcastEvents) {
      this.lastBroadcastEvents.shift();
    }
  }

  private bindClientMessages(socket: Socket) {
    const rawSocket = socket.rawSocket as Bun.WebSocket & {
      on?: (
        event: 'message',
        listener: (data: unknown, isBinary?: boolean) => void,
      ) => void;
    };

    rawSocket.on?.('message', (data) => {
      this.handleClientMessage(socket, data);
    });
  }

  private handleClientMessage(socket: Socket, rawData: unknown) {
    const rawText = this.readTextMessage(rawData);
    if (rawText === null) {
      this.sendError(socket, {
        code: 'invalid_message',
        message: 'Only JSON text messages are supported.',
      });
      return;
    }
    const text = this.stripTrailingNullTerminators(rawText);

    if (this.getTextBytes(text) > this.maxRelayFrameBytes) {
      this.sendError(socket, {
        code: 'payload_too_large',
        message: `Relay message must be at most ${this.maxRelayPayloadBytes} bytes.`,
      });
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch (error) {
      this.logger.warn(
        `Invalid JSON from Client[${socket.id}] ${JSON.stringify(this.createInvalidJsonLogPayload(text, error))}`,
      );
      this.sendError(socket, {
        code: 'invalid_json',
        message: 'Message must be valid JSON.',
      });
      return;
    }

    if (!this.isRecord(message) || typeof message.type !== 'string') {
      this.sendError(socket, {
        code: 'invalid_message',
        message: 'Message must include a string type.',
      });
      return;
    }

    if (message.type === 'ping') {
      return;
    }

    if (message.type !== 'relay') {
      this.sendError(socket, {
        code: 'unknown_event',
        message: 'Unsupported client event type.',
      });
      return;
    }

    if (!('data' in message)) {
      this.sendError(socket, {
        code: 'invalid_payload',
        message: 'Relay message must include data.',
      });
      return;
    }

    const payloadText = JSON.stringify(message.data);
    if (
      payloadText === undefined ||
      this.getTextBytes(payloadText) > this.maxRelayPayloadBytes
    ) {
      this.sendError(socket, {
        code: 'payload_too_large',
        message: `Relay payload must be at most ${this.maxRelayPayloadBytes} bytes.`,
      });
      return;
    }

    if (!this.consumeRelayRateLimit(socket.rawSocket)) {
      this.sendError(socket, {
        code: 'rate_limited',
        message: 'Too many relay messages.',
      });
      return;
    }

    this.relay(socket, message.data as JsonValue);
  }

  private relay(sender: Socket, payload: JsonValue) {
    const metadata = this.createEventMetadata();
    const data: RelayPayload = {
      client_id: sender.id,
      payload,
    };

    for (const client of this.clients) {
      if (client === sender) continue;
      client.send('relay', data, metadata);
    }
  }

  private getClientPresenceList() {
    return this.clients.map((client) => ({ client_id: client.id }));
  }

  private broadcastPresenceEvent<
    Event extends 'client_connected' | 'client_disconnected' | 'client_count',
  >(event: Event, data: ServerToClientPayload<Event>) {
    const metadata = this.createEventMetadata();

    for (const client of this.clients) {
      client.send(event, data, metadata);
    }
  }

  private sendError(socket: Socket, data: ErrorPayload) {
    socket.send('error', data, this.createEventMetadata());
  }

  private createEventMetadata(): ServerEventMetadata {
    return {
      seq: this.nextSeq++,
      ts: Date.now(),
    };
  }

  private consumeRelayRateLimit(client: Bun.WebSocket) {
    const now = Date.now();
    const limit = this.relayRateLimits.get(client);

    if (!limit || now - limit.windowStartedAt >= this.relayRateLimitWindowMs) {
      this.relayRateLimits.set(client, { windowStartedAt: now, count: 1 });
      return true;
    }

    if (limit.count >= this.relayRateLimit) {
      return false;
    }

    limit.count += 1;
    return true;
  }

  private readTextMessage(rawData: unknown) {
    if (typeof rawData === 'string') return rawData;
    if (rawData instanceof Buffer) return rawData.toString('utf8');
    if (rawData instanceof ArrayBuffer) {
      return new TextDecoder().decode(rawData);
    }

    return null;
  }

  private createInvalidJsonLogPayload(text: string, error: unknown) {
    const preview = text.slice(0, 200);

    return {
      error: String(error),
      textLength: text.length,
      byteLength: this.getTextBytes(text),
      textPreview: JSON.stringify(preview),
      hexPreview: Buffer.from(preview, 'utf8').toString('hex'),
    };
  }

  private stripTrailingNullTerminators(text: string) {
    return text.replace(/\0+$/, '');
  }

  private getTextBytes(text: string) {
    return Buffer.byteLength(text, 'utf8');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
