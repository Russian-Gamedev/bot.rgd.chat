import {
  BaseImageURLOptions,
  GuildMember,
  Message,
  parseEmoji,
  User,
} from 'discord.js';

import { DISCORD_CDN } from '#config/constants';

/** Checks whether a string looks like a Discord snowflake ID. */
export function isDiscordId(value: string): boolean {
  return /^\d{17,21}$/.test(value);
}

export interface DiscordMessageLink {
  guildId: string;
  channelId: string;
  messageId: string;
}

const DISCORD_MESSAGE_URL_PATTERN =
  /^https:\/\/(?:[a-z]+\.)?discord(?:app)?\.com\/channels\/(\d{15,21})\/(\d{15,21})\/(\d{15,21})$/i;

/** Parses a discord.com/channels message link; returns null for other URLs. */
export function parseDiscordMessageUrl(url: string): DiscordMessageLink | null {
  const match = DISCORD_MESSAGE_URL_PATTERN.exec(url.trim());
  if (!match) return null;

  return {
    guildId: match[1],
    channelId: match[2],
    messageId: match[3],
  };
}

/** Extracts the snowflake ID from a custom emoji tag like `<:name:id>` or `<a:name:id>`. */
export function getEmojiId(emoji: string): string {
  const parsed = parseEmoji(emoji);
  if (!parsed?.id) {
    throw new Error(`Not a custom emoji tag: ${emoji}`);
  }
  return parsed.id;
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

const IMAGE_EXTENSION_RE = /\.(?:png|jpe?g|gif|webp)(?=$|[?#])/i;

/** Replaces the image extension of a URL, preserving any query string. */
export function replaceImageExtension(url: string, extension: string): string {
  return url.replace(IMAGE_EXTENSION_RE, `.${extension}`);
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
