import type { Client } from 'discord.js';
import type Redis from 'ioredis';

import { formatTime, pluralize } from '#lib/utils';
import type { GuildSettingsService } from '../settings/guild-settings.service';

export interface RuntimeMotdCtx {
  redis: Redis;
  client: Client;
  guildSettingsService: GuildSettingsService;
}

export default (ctx: RuntimeMotdCtx) => [
  () => `🎲 Твой шанс сегодня: ${Math.floor(Math.random() * 100)}%`,
  () => `👥 Онлайн: ${Math.floor(Math.random() * 1000)} (да, мы тоже не верим)`,
  () => {
    const h = new Date().getHours();
    if (h < 6) return '🌙 Ты вообще спишь?';
    if (h < 12) return '☀️ Утро. Ты снова здесь';
    if (h < 18) return '💼 Днем работаешь? Не верю';
    return '🌆 Вечер. Время ломать билд';
  },
  () => `🎮 FPS: ${Math.floor(20 + Math.random() * 120)} (нормально)`,
  () => {
    const hours = Math.floor(Math.random() * 48);
    const plural = pluralize(hours, ['час', 'часа', 'часов']);
    return `⏳ До релиза: ${hours} ${plural}`;
  },
  () => {
    const win = Math.random() > 0.8;
    return win ? '🎉 Ты выиграл ничего' : '💀 Ты проиграл всё';
  },
  async () => {
    const remaining = await ctx.redis.llen(`motd:queue`);
    return `⏳ Осталось ${remaining} что-то там в очереди...`;
  },
  () => {
    const days = Math.floor(Math.random() * 30) + 10;
    const plural = pluralize(days, ['день', 'дня', 'дней']);
    return `🎉 Следующий джем через ${days} ${plural}!`;
  },
  () =>
    `Я жив уже ${formatTime(Math.floor(process.uptime()), 2)}. Чувствую себя отлично!`,
  () => {
    const botBirthday = new Date('2020-07-21');
    const now = new Date();
    const age = Math.floor(
      (now.getTime() - botBirthday.getTime()) / (1000 * 60 * 60 * 24 * 365),
    );
    const plural = pluralize(age, ['год', 'года', 'лет']);
    return `🎂 Мне уже ${age} ${plural}!`;
  },
  () => {
    const rgdBirthday = new Date('2018-10-24');
    const now = new Date();
    const age = Math.floor(
      (now.getTime() - rgdBirthday.getTime()) / (1000 * 60 * 60 * 24 * 365),
    );
    const plural = pluralize(age, ['год', 'года', 'лет']);
    return `🎉 RGD уже ${age} ${plural}!`;
  },
  () => `Новый проект #${Math.floor(Math.random() * 1000) + 100}!`,
  () =>
    `Опечаток в чате: ${Math.floor(Math.random() * 10) + 1} (autofix не помог)`,
  () => {
    const chars = '•၊၊||၊|။||||||||။၊|';
    let voice = '';
    for (let i = 0; i < 12; i++) {
      voice += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const seconds = Math.floor(1 + Math.random() * 58)
      .toString()
      .padStart(2, '0');
    return `▶︎ •${voice}• 00:${seconds}`;
  },
  async () => {
    const emojis = [
      '😎',
      '🤬',
      '🤡',
      '💩',
      '☠️',
      '😼',
      '🧠',
      '🦊',
      '🙈',
      '🌈',
      '💨',
      '🏆',
      '🎰',
      '🎮',
      '💸',
      '💰',
      '🔫',
      '❤️',
      '💯',
      '⚠️',
    ];

    const guilds = [...ctx.client.guilds.cache.values()];

    const activeRoles = await Promise.all(
      guilds.map((guild) => ctx.guildSettingsService.getActiveRole(guild.id)),
    );

    const eligibleMembers = guilds.flatMap((guild) =>
      guild.members.cache
        .filter((member) =>
          member.roles.cache.some((role) => activeRoles.includes(role)),
        )
        .map((member) => member.user.displayName),
    );

    if (eligibleMembers.length === 0) {
      return '🤷 Nobody found';
    }

    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    const randomMember =
      eligibleMembers[Math.floor(Math.random() * eligibleMembers.length)];

    return `${randomEmoji} ${randomMember}`;
  },
];
