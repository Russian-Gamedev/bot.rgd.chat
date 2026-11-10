import { describe, expect, it } from 'bun:test';
import { buildJoinLogEmbed, buildLeaveLogEmbed } from './guild-watcher.embed';
import { GuildInviteEntity } from './invite/entities/invite.entity';

const DAY_MS = 86_400_000;

function field(
  embed: { data: { fields?: { name: string; value: string }[] } },
  name: string,
) {
  return embed.data.fields?.find((f) => f.name === name)?.value;
}

describe('guild watcher log embeds', () => {
  it('join embed shows the invite, its alias and the inviter', () => {
    const invite = {
      id: 'abc123',
      name: 'закреплено в соседнем сервере',
      inviter_id: '42',
    } as GuildInviteEntity;

    const embed = buildJoinLogEmbed({
      memberId: '111',
      memberName: 'Newcomer',
      invite,
    });

    expect(embed.data.title).toBe('Вход на сервер');
    expect(field(embed, 'Участник')).toContain('<@111>');
    expect(field(embed, 'Приглашение')).toContain('`abc123`');
    expect(field(embed, 'Приглашение')).toContain(invite.name!);
    expect(field(embed, 'Пригласил')).toBe('<@42>');
  });

  it('join embed notes an undefined invite', () => {
    const embed = buildJoinLogEmbed({
      memberId: '111',
      memberName: 'Newcomer',
      invite: null,
    });

    expect(field(embed, 'Приглашение')).toBe('не определено');
    expect(embed.data.fields?.some((f) => f.name === 'Пригласил')).toBe(false);
  });

  it('leave embed shows the ban reason, time on server and word score', () => {
    const joinedAt = new Date(Date.now() - 90 * DAY_MS);

    const embed = buildLeaveLogEmbed({
      memberId: '111',
      memberName: 'Spammer',
      reason: 'ban',
      moderatorId: '222',
      joinedAt,
      durationSec: 90 * 86_400,
      messageScore: 1234,
    });

    expect(embed.data.title).toBe('Выход с сервера');
    expect(field(embed, 'Причина')).toContain('<@222>');
    expect(field(embed, 'Зашёл')).toContain('<t:');
    expect(field(embed, 'На сервере')).toContain('мес.');
    expect(field(embed, 'Написал слов')).toBe('1234');
  });

  it('leave embed keeps plain leave reason and zero score', () => {
    const embed = buildLeaveLogEmbed({
      memberId: '111',
      memberName: 'Guest',
      reason: 'leave',
      joinedAt: null,
      durationSec: 0,
      messageScore: 0,
    });

    expect(field(embed, 'Причина')).toBe('Покинул сервер');
    expect(embed.data.fields?.some((f) => f.name === 'Зашёл')).toBe(false);
    expect(field(embed, 'Написал слов')).toBe('0');
  });
});
