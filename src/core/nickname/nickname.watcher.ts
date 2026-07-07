import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { Client } from 'discord.js';
import { Context, type ContextOf, On } from 'necord';

import { NicknameService } from './nickname.service';

@Injectable()
export class NicknameWatcher {
  constructor(
    readonly em: EntityManager,
    private readonly nicknameService: NicknameService,
    readonly _client: Client,
  ) {}

  @On('guildMemberUpdate')
  @EnsureRequestContext()
  async onGuildMemberUpdate(
    @Context() [oldMember, newMember]: ContextOf<'guildMemberUpdate'>,
  ) {
    if (!newMember.guild) return;
    if (newMember.user.bot) return;

    const oldNickname = oldMember.nickname;
    const newNickname = newMember.nickname;

    if (oldNickname === newNickname) return;

    const guildId = BigInt(newMember.guild.id);
    const userId = BigInt(newMember.id);

    const hasLocked = await this.nicknameService.hasLockedNickname(
      guildId,
      userId,
    );

    if (hasLocked) {
      const lockedNickname = await this.nicknameService.getLockedNickname(
        guildId,
        userId,
      );
      if (lockedNickname && newNickname !== lockedNickname) {
        await newMember.setNickname(lockedNickname, 'Nickname is locked');
      }
      return;
    }

    await this.nicknameService.recordChange(
      guildId,
      userId,
      oldNickname,
      newNickname ?? newMember.user.username,
      userId,
    );
  }
}
