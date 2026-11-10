import { EmbedBuilder } from 'discord.js';

import { Colors } from '#config/constants';
import { getRelativeFormat } from '#lib/utils/discord';
import { formatTime } from '#lib/utils/time';

import { GuildInviteEntity } from './invite/entities/invite.entity';

export type MemberLeaveReason = 'leave' | 'kick' | 'ban';

interface JoinLogParams {
  memberId: string;
  memberName: string;
  invite: GuildInviteEntity | null;
}

interface LeaveLogParams {
  memberId: string;
  memberName: string;
  reason: MemberLeaveReason;
  moderatorId?: string | null;
  joinedAt: Date | null;
  durationSec: number;
  messageScore: number;
}

/** Member joined: which invite was used, whose it is and its alias. */
export function buildJoinLogEmbed(params: JoinLogParams): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.Success)
    .setTitle('Вход на сервер')
    .addFields({
      name: 'Участник',
      value: `<@${params.memberId}> · **${params.memberName}**`,
    });

  if (params.invite) {
    embed.addFields(
      {
        name: 'Приглашение',
        value: params.invite.name
          ? `\`${params.invite.id}\` — ${params.invite.name}`
          : `\`${params.invite.id}\``,
      },
      { name: 'Пригласил', value: `<@${params.invite.inviter_id}>` },
    );
  } else {
    embed.addFields({ name: 'Приглашение', value: 'не определено' });
  }

  return embed;
}

/** Member left: reason, time on the server and their message stats. */
export function buildLeaveLogEmbed(params: LeaveLogParams): EmbedBuilder {
  const moderator = params.moderatorId ? `<@${params.moderatorId}>` : null;
  const reason =
    params.reason === 'ban'
      ? `Забанен ${moderator ?? 'неизвестным'}`
      : params.reason === 'kick'
        ? `Кикнут ${moderator ?? 'неизвестным'}`
        : 'Покинул сервер';

  const embed = new EmbedBuilder()
    .setColor(Colors.Danger)
    .setTitle('Выход с сервера')
    .addFields(
      {
        name: 'Участник',
        value: `<@${params.memberId}> · **${params.memberName}**`,
      },
      { name: 'Причина', value: reason },
    );

  if (params.joinedAt) {
    embed.addFields(
      {
        name: 'Зашёл',
        value: getRelativeFormat(Math.floor(params.joinedAt.getTime() / 1000)),
      },
      {
        name: 'На сервере',
        value: formatTime(params.durationSec, 2) || 'меньше минуты',
      },
    );
  }

  embed.addFields({ name: 'Написал слов', value: String(params.messageScore) });

  return embed;
}
