import type { BotEntity } from '#core/bots/entities/bot.entity';

export enum Permission {
  WalletReadOwn = 'wallet:read:own',
  WalletManage = 'wallet:manage',
  GuildRead = 'guild:read',
  GuildEventsRead = 'guild_events:read',
  ReadMessages = 'read:messages',
  SendMessages = 'send:messages',
  MahoragaManage = 'manage:mahoraga',
  GamesReview = 'games:review',
}

export enum ActorType {
  User = 'user',
  Bot = 'bot',
}

export interface UserActor {
  type: ActorType.User;
  id: string;
  username: string;
}

export interface BotActor {
  type: ActorType.Bot;
  id: string;
  bot: BotEntity;
}

export type AuthenticatedActor = UserActor | BotActor;

export interface PermissionContext {
  guildId?: string;
  targetUserId?: string;
}
