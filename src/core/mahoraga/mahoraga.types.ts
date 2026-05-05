export enum MahoragaCaseStatus {
  Observed = 'observed',
  PendingVerification = 'pending_verification',
  Active = 'active',
  Pardoned = 'pardoned',
}

export enum MahoragaEnforcementMode {
  Enforce = 'enforce',
  Monitor = 'monitor',
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
  status: 'applied' | 'already_applied' | 'skipped' | 'failed';
  detail?: string;
}

export interface MahoragaDetectionSettings {
  textRepeatLimit: number;
  textWindowSeconds: number;
  linkRepeatLimit: number;
  linkWindowSeconds: number;
  imageRepeatLimit: number;
  imageWindowSeconds: number;
  youngAccountMonths: number;
  verificationTimeoutMinutes: number;
  enforcementMode: MahoragaEnforcementMode;
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
  verificationTimeoutMinutes?: number;
}

export interface MahoragaRegisterCaseResult {
  case: import('./entities/mahoraga-case.entity').MahoragaCaseEntity;
  shouldApplySoftban: boolean;
  shouldSendVerification: boolean;
}
