import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';

import { ServerToClientEvents, ServerToClientPayload } from './bar.protocol';
import { Socket } from './bar.type';
import { BarWatcher } from './bar.watcher';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  path: '/bar/',
})
export class BarGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(BarGateway.name);
  private clients: Socket[] = [];

  private readonly maxLastBroadcastEvents = 50;

  private lastBroadcastEvents: {
    event: ServerToClientEvents;
    data: ServerToClientPayload<ServerToClientEvents>;
    ts: number;
  }[] = [];

  constructor(private readonly barWatcher: BarWatcher) {
    barWatcher.barGateway = this;
  }

  handleConnection(client: Bun.WebSocket, req: Request) {
    const socket = new Socket(client);
    this.clients.push(socket);
    const ip =
      req?.headers?.['x-forwarded-for'] ??
      ///@ts-expect-error -- Bun.WebSocket extends WebSocket but TS doesn't know about it yet
      req.socket.remoteAddress ??
      'unknown';
    this.logger.log(`Client[${socket.id}] connected ${ip}`);

    const initialData = this.barWatcher.getInitialData();
    socket.send('connected', initialData);

    for (const { event, data, ts } of this.lastBroadcastEvents) {
      socket.send(event, data, ts);
    }
  }
  handleDisconnect(client: Bun.WebSocket) {
    const socket = this.clients.find((s) => s.rawSocket === client);
    if (!socket) return;
    this.clients = this.clients.filter((s) => s.rawSocket !== client);
    this.logger.log(`Client[${socket.id}] disconnected`);
  }

  public broadcast<
    Event extends ServerToClientEvents,
    Payload extends ServerToClientPayload<Event>,
  >(event: Event, data: Payload) {
    const ts = Date.now();

    for (const client of this.clients) {
      client.send(event, data, ts);
    }

    this.lastBroadcastEvents.push({ event, data, ts });
    if (this.lastBroadcastEvents.length > this.maxLastBroadcastEvents) {
      this.lastBroadcastEvents.shift();
    }
  }
}
