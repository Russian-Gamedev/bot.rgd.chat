export enum CrossPostSourceKind {
  DiscordChannel = 'discord_channel',
  TelegramChannel = 'telegram_channel',
}

export enum CrossPostTargetKind {
  DiscordWebhook = 'discord_webhook',
}

export type CrossPostEventKind = 'create' | 'edit' | 'delete';

export type CrossPostSourceConfig = Record<string, unknown>;

export interface CrossPostTarget {
  id: string;
  kind: CrossPostTargetKind;
  enabled: boolean;
  [key: string]: unknown;
}

export interface CrossPostSettings {
  relayEdits: boolean;
  relayDeletes: boolean;
  allowedMentions: 'none';
}

export interface CrossPostEvent {
  kind: CrossPostEventKind;
  sourceKind: CrossPostSourceKind;
  sourceKey: string;
  sourceMessageId: string;
  text: string;
  attachmentUrls: string[];
  authorName: string;
  authorAvatarUrl?: string | null;
}

export interface DiscordWebhookMessageResponse {
  id: string;
}

export interface CrossPostSourceAdapter<
  Config extends CrossPostSourceConfig = CrossPostSourceConfig,
> {
  readonly kind: CrossPostSourceKind;
  normalizeConfig(config: CrossPostSourceConfig): Config;
  buildSourceKey(config: Config): string;
}

export interface CrossPostTargetAdapter<
  Target extends CrossPostTarget = CrossPostTarget,
> {
  readonly kind: CrossPostTargetKind;
  normalizeTarget(target: Partial<CrossPostTarget>): Target;
  create(target: Target, event: CrossPostEvent): Promise<string>;
  edit(
    target: Target,
    targetMessageId: string,
    event: CrossPostEvent,
  ): Promise<void>;
  delete(target: Target, targetMessageId: string): Promise<void>;
}
