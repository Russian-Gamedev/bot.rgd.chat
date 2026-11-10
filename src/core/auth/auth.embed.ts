import { EmbedBuilder } from 'discord.js';

import { Colors } from '#config/constants';

interface AuthLogParams {
  userId: string;
  username: string;
  siteUrl?: string | null;
}

/** A member signed in on rgd.chat. */
export function buildAuthLogEmbed(params: AuthLogParams): EmbedBuilder {
  const site = params.siteUrl ? `[rgd.chat](${params.siteUrl})` : 'rgd.chat';
  return new EmbedBuilder()
    .setColor(Colors.Primary)
    .setTitle('Авторизация на сайте')
    .setDescription(
      `<@${params.userId}> · **${params.username}** авторизовался на ${site}`,
    );
}
