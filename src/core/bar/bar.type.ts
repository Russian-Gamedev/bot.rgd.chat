import { ServerToClientEvents, ServerToClientPayload } from './bar.protocol';

export interface ServerEventMetadata {
  seq: number;
  ts: number;
}

export class Socket {
  id = (Date.now() * Math.random()).toString(36).replace('.', '');

  constructor(public readonly rawSocket: Bun.WebSocket) {}

  send<
    Event extends ServerToClientEvents,
    Payload extends ServerToClientPayload<Event>,
  >(event: Event, data: Payload, metadata: ServerEventMetadata) {
    this.rawSocket.send(JSON.stringify({ type: event, data, ...metadata }));
  }
}
