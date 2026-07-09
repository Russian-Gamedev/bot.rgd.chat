import { type GuildMember, PermissionFlagsBits } from 'discord.js';

export const ROLE_SEGMENTS = [
  'admin',
  'moderator',
  'member',
  'bot',
  'unknown',
] as const;

export type RoleSegment = (typeof ROLE_SEGMENTS)[number];

export type MetricsStatus = 'success' | 'error' | 'skipped';

const ROLE_SEGMENT_SET = new Set<string>(ROLE_SEGMENTS);
const MAX_LABEL_LENGTH = 80;

export function normalizeMetricLabel(value: unknown): string {
  if (value === null || value === undefined) return 'unknown';

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9_:-]+/g, '_')
    .replaceAll(/_+/g, '_')
    .replaceAll(/^_+|_+$/g, '');

  return (normalized || 'unknown').slice(0, MAX_LABEL_LENGTH);
}

export function normalizeRoleSegment(value: unknown): RoleSegment {
  const normalized = normalizeMetricLabel(value);
  return ROLE_SEGMENT_SET.has(normalized)
    ? (normalized as RoleSegment)
    : 'unknown';
}

export function getRoleSegment(member?: GuildMember | null): RoleSegment {
  if (!member) return 'unknown';
  if (member.user?.bot) return 'bot';
  if (typeof member.permissions?.has !== 'function') return 'unknown';
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return 'admin';

  if (
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions.has(PermissionFlagsBits.ManageMessages) ||
    member.permissions.has(PermissionFlagsBits.KickMembers) ||
    member.permissions.has(PermissionFlagsBits.BanMembers)
  ) {
    return 'moderator';
  }

  return 'member';
}
