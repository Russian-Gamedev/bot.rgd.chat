import { BaseImageURLOptions, GuildMember, Message, User } from 'discord.js';

import { DISCORD_CDN } from '#config/constants';

export function noop() {
  // nothing, as how make game in rgd
}

export function cast<T>(value: unknown) {
  return value as T;
}

export function getDefaultAvatar(userId: string) {
  const id = (BigInt(userId) >> 2n) % 6n;
  return DISCORD_CDN + `/embed/avatars/${id}.png`;
}

export function getDisplayAvatar(
  user: User | GuildMember,
  extension: BaseImageURLOptions['extension'] = 'webp',
  size: BaseImageURLOptions['size'] = 1024,
) {
  const avatar = user.avatarURL({ extension, size });
  if (avatar) return avatar;
  return getDefaultAvatar(user.id);
}

export function getDisplayBanner(
  user: User,
  extension: BaseImageURLOptions['extension'] = 'webp',
) {
  return user.bannerURL({ size: 1024, extension });
}

export function pickRandom<T>(array: readonly T[]): T {
  const { length } = array;
  return array[Math.floor(Math.random() * length)];
}

export function getRelativeFormat(timestamp: number) {
  return `<t:${Math.floor(timestamp / 1_000)}:R>`;
}

export function messageLink(message: Message<true>) {
  return messageLinkRaw(message.guildId, message.channelId, message.id);
}

export function messageLinkRaw(
  guildId: string,
  channelId: string,
  message: string,
) {
  return `https://discord.com/channels/${guildId}/${channelId}/${message}`;
}

export function getTimeInfo(t: number) {
  const days = Math.floor(t / 86400);
  t -= days * 86400;
  const hours = Math.floor(t / 3600);
  t -= hours * 3600;
  const minutes = Math.floor(t / 60);
  t -= minutes * 60;
  const seconds = t;

  return {
    days,
    hours,
    minutes,
    seconds,
    toString: () =>
      `${hours} ч ${minutes.toString().padStart(2, '0')} мин ${seconds
        .toString()
        .padStart(2, '0')} сек`,
  };
}

export function formatTime(t: number) {
  const time = getTimeInfo(t);
  let result = '';
  if (time.days > 0) {
    result += `${time.days} д `;
  }
  if (time.hours > 0) {
    result += `${time.hours} ч `;
  }
  if (time.minutes > 0) {
    result += `${time.minutes} мин `;
  }
  if (time.seconds > 0 || result === '') {
    result += `${time.seconds} сек`;
  }
  return result.trim();
}

type PluralizeForms = [string, string, string];

export function pluralize(count: number, [one, few, many]: PluralizeForms) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return few;
  }

  return many;
}

export function hashStringToInt(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

export function formatCoins(amount: bigint): string {
  return Number(amount).toLocaleString('ru-RU');
}

export function choose<T>(array: readonly T[]): T {
  const index = Math.floor(Math.random() * array.length);
  return array[index];
}

export function hideEmbedLink(url: string) {
  if (url.startsWith('https://')) {
    return `[\`](${url})`;
  }
  return url;
}
