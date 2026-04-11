import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'discord.js';
import { Context, type ContextOf, On } from 'necord';

import { NicknameService } from './nickname.service';

@Injectable()
export class NicknameWatcher {
  private readonly logger = new Logger(NicknameWatcher.name);

  constructor(
    private readonly nicknameService: NicknameService,
    private readonly client: Client,
  ) {}

  @On('guildMemberUpdate')
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
