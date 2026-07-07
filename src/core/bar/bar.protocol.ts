/// Shared types and enums

export enum ChannelType {
  text = 0,
  voice = 2,
  category = 4,
  thread = 11,
}

export interface BarMember {
  id: string;
  username: string;
  avatar_url: string;
  is_bot: boolean;
}

/// Server to Client Events & Payloads

export interface ServerToClient {
  connected: ConnectedPayload;
  relay: RelayPayload;
  error: ErrorPayload;
  client_connected: ClientPresencePayload;
  client_disconnected: ClientPresencePayload;
  client_count: ClientCountPayload;
  member_start_typing: MemberStartTypingPayload;
  message_create: MessageCreatePayload;
  member_join_voice: MemberJoinVoicePayload;
  member_leave_voice: MemberLeaveVoicePayload;
  member_move_voice: MemberMoveVoicePayload;
  voice_state_update: VoiceStateUpdatePayload;
  member_reaction_add: MemberReactionPayload;
  member_speaking: MemberSpeakingPayload;
}

export interface ConnectedPayload {
  client_id: string;
  clients: ClientPresencePayload[];
  guilds: {
    id: string;
    name: string;
    icon_url: string;
    channels: { id: string; name: string; type: keyof typeof ChannelType }[];
    members: BarMember[];
  }[];
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface RelayPayload {
  client_id: string;
  payload: JsonValue;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface ClientPresencePayload {
  client_id: string;
}

export interface ClientCountPayload {
  count: number;
}

export interface MemberStartTypingPayload {
  guild_id: string;
  channel_id: string;
  member: BarMember;
}

export interface MessageCreatePayload {
  guild_id: string;
  channel_id: string;
  message: {
    id: string;
    content: string;
  };
  member: BarMember;
}

export interface MemberJoinVoicePayload {
  guild_id: string;
  channel_id: string;
  member: BarMember;
}

export interface MemberLeaveVoicePayload {
  guild_id: string;
  channel_id: string;
  member: BarMember;
}

export interface MemberMoveVoicePayload {
  guild_id: string;
  old_channel_id: string;
  new_channel_id: string;
  member: BarMember;
}

export interface VoiceStateUpdatePayload {
  guild_id: string;
  channel_id: string;
  member: BarMember;
  self_mute: boolean;
  self_deaf: boolean;
}

export interface MemberReactionPayload {
  guild_id: string;
  channel_id: string;
  message_id: string;
  member: BarMember;
  emoji: {
    name: string;
    url: string;
  };
}

export interface MemberSpeakingPayload {
  guild_id: string;
  channel_id: string;
  member: BarMember;
  speaking: boolean;
}

/// Client to Server Events & Payloads

export interface ClientToServer {
  ping: never;
  relay: JsonValue;
}

/// Util Types

export type ServerToClientEvents = keyof ServerToClient;
export type ServerToClientPayload<T extends ServerToClientEvents> =
  ServerToClient[T];
