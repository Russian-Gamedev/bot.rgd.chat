import { BaseImageURLOptions, GuildMember, Message, User } from 'discord.js';

import { DISCORD_CDN } from '#config/constants';

/** Checks whether a string looks like a Discord snowflake ID. */
export function isDiscordId(value: string): boolean {
  return /^\d{17,21}$/.test(value);
}

/** Builds a Discord CDN avatar URL from a user ID and avatar hash. Falls back to default avatar. */
export function getAvatarUrl(
  userId: string,
  avatarHash: string | null | undefined,
): string {
  if (!avatarHash) return getDefaultAvatar(userId);

  const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `${DISCORD_CDN}/avatars/${userId}/${avatarHash}.${ext}`;
}

/** Builds the default Discord avatar URL for a user ID. */
export function getDefaultAvatar(userId: string) {
  const id = (BigInt(userId) >> 2n) % 6n;
  return DISCORD_CDN + `/embed/avatars/${id}.png`;
}

/** Returns a user's custom avatar URL, falling back to the default avatar. */
export function getDisplayAvatar(
  user: User | GuildMember,
  extension: BaseImageURLOptions['extension'] = 'webp',
  size: BaseImageURLOptions['size'] = 1024,
) {
  return user.displayAvatarURL({ extension, size });
}

/** Returns a user's banner URL with a consistent default size. */
export function getDisplayBanner(
  user: User,
  extension: BaseImageURLOptions['extension'] = 'webp',
) {
  return user.bannerURL({ size: 1024, extension });
}

/** Formats a millisecond timestamp as a Discord relative-time tag. */
export function getRelativeFormat(timestamp: number) {
  return `<t:${Math.floor(timestamp / 1_000)}:R>`;
}

/** Builds a Discord message URL from a guild message object. */
export function messageLink(message: Message<true>) {
  return messageLinkRaw(message.guildId, message.channelId, message.id);
}

/** Builds a Discord message URL from raw Discord snowflake IDs. */
export function messageLinkRaw(
  guildId: string,
  channelId: string,
  message: string,
) {
  return `https://discord.com/channels/${guildId}/${channelId}/${message}`;
}

/** Detects image-like Discord attachment metadata. */
export function isImageAttachment(input: {
  contentType?: string | null;
  name?: string | null;
  url?: string | null;
}): boolean {
  if (input.contentType?.toLowerCase().startsWith('image/')) return true;

  const source = input.name ?? input.url ?? '';
  return /\.(?:png|jpe?g|gif|webp|avif)(?:\?.*)?$/i.test(source);
}
