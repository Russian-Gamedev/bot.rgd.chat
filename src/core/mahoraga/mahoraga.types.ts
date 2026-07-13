import { EmbedBuilder } from 'discord.js';

export enum MahoragaCaseStatus {
  Observed = 'observed',
  Active = 'active',
  Pardoned = 'pardoned',
}

export enum MahoragaDetectionMode {
  Off = 'off',
  Monitor = 'monitor',
  On = 'on',
}

export enum MahoragaReason {
  Honeypot = 'honeypot',
  TextRepeat = 'text_repeat',
  LinkRepeat = 'link_repeat',
  ImageRepeat = 'image_repeat',
  Manual = 'manual',
}

export interface MahoragaEvidence {
  reason: MahoragaReason;
  guildId?: string;
  channelId?: string;
  messageId?: string;
  actorId?: string;
  matchedValue?: string;
  textHash?: string;
  url?: string;
  imageHash?: string;
  contentPreview?: string;
  note?: string;
  createdAt: string;
}

export interface MahoragaSoftbanResult {
  guildId: string;
  status: 'applied' | 'failed';
  detail?: string;
  cleanup?: MahoragaMessageCleanupSummary;
}

export interface MahoragaMessageCleanupSummary {
  alreadyDeleted: number;
  manuallyDeleted: number;
  failed: number;
}

export interface MahoragaDetectionSettings {
  textRepeatLimit: number;
  textWindowSeconds: number;
  linkRepeatLimit: number;
  linkWindowSeconds: number;
  imageRepeatLimit: number;
  imageWindowSeconds: number;
  messageTrackingWindowSeconds: number;
  honeypotMode: MahoragaDetectionMode;
  repeatMode: MahoragaDetectionMode;
}

export interface MahoragaDetection {
  userId: string;
  guildId: string;
  channelId: string;
  status: MahoragaCaseStatus;
  reason: MahoragaReason;
  evidence: MahoragaEvidence;
  settings: MahoragaDetectionSettings;
}

export interface MahoragaRegisterCaseInput {
  userId: string;
  status: MahoragaCaseStatus;
  reason: MahoragaReason;
  evidence: MahoragaEvidence;
}

export interface MahoragaRegisterCaseResult {
  case: import('./entities/mahoraga-case.entity').MahoragaCaseEntity;
  shouldApplySoftban: boolean;
  shouldNotifyMonitor: boolean;
}

export function getMahoragaDetectorMode(
  settings: MahoragaDetectionSettings,
  reason: MahoragaReason,
): MahoragaDetectionMode {
  switch (reason) {
    case MahoragaReason.Honeypot:
      return settings.honeypotMode;
    case MahoragaReason.TextRepeat:
    case MahoragaReason.LinkRepeat:
    case MahoragaReason.ImageRepeat:
      return settings.repeatMode;
    default:
      return MahoragaDetectionMode.On;
  }
}

export function createHoneypotEmbed(count: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle('НЕ ПИШИТЕ СЮДА СООБЩЕНИЯ')
    .setDescription(
      'Этот канал для рыбалки спам ботов. За любое сообщение вы получите softban. (если вы глупенький и написали, разбана не будет)',
    )
    .setFooter({ text: `Поймано спаммеров: ${count}` });
}
