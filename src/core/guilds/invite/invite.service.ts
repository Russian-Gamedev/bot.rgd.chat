import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { Client, Invite } from 'discord.js';

import { UserEntity } from '#core/users/entities/user.entity';

import { GuildInviteEntity } from './entities/invite.entity';
import { GuildInviteHistoryEntity } from './entities/invite-history.entity';

@Injectable()
export class GuildInviteService {
  private readonly logger = new Logger(GuildInviteService.name);

  constructor(
    @InjectRepository(GuildInviteEntity)
    private readonly inviteRepository: EntityRepository<GuildInviteEntity>,
    @InjectRepository(GuildInviteHistoryEntity)
    private readonly inviteHistoryRepository: EntityRepository<GuildInviteHistoryEntity>,
    private readonly entityManager: EntityManager,
    private readonly discord: Client,
  ) {}

  public async create(invite: Invite) {
    const inviteEntity = new GuildInviteEntity();
    inviteEntity.id = invite.code;
    inviteEntity.guild_id = invite.guild?.id ?? '0';
    inviteEntity.uses = invite.uses ?? 0;
    inviteEntity.inviter_id = invite.inviter?.id ?? '0';
    await this.entityManager.persist(inviteEntity).flush();
    this.logger.log(
      `Created invite with ID: ${inviteEntity.id} by ${inviteEntity.inviter_id}`,
    );
    return inviteEntity;
  }

  async syncGuildInvites(guildId: string) {
    const guild = await this.discord.guilds.fetch(guildId);
    const invites = await guild.invites.fetch();
    const inviteEntities = await this.inviteRepository.find({
      guild_id: guildId,
    });

    /// delete invites that no longer exist
    for (const inviteEntity of inviteEntities) {
      if (!invites.has(inviteEntity.id)) {
        await this.entityManager.remove(inviteEntity).flush();
        this.logger.log(`Deleted invite with ID: ${inviteEntity.id}`);
      }
    }

    let updated = 0;

    /// update existing invites and create new ones
    for (const invite of invites.values()) {
      const inviteEntity = inviteEntities.find((i) => i.id === invite.code);
      if (inviteEntity) {
        inviteEntity.uses = invite.uses ?? inviteEntity.uses;
        await this.entityManager.flush();
        updated++;
      } else {
        await this.create(invite);
      }
    }
    this.logger.log(`Updated ${updated} invites for guild ID: ${guildId}`);
  }

  async findInviteWithUpdatedUses(guild_id: string) {
    const inviteEntities = await this.inviteRepository.find({ guild_id });

    const invites = await this.discord.guilds
      .fetch(guild_id)
      .then((guild) => guild.invites.fetch());

    for (const invite of invites.values()) {
      const inviteEntity = inviteEntities.find((i) => i.id === invite.code);
      if (inviteEntity && inviteEntity.uses < invite.uses!) {
        inviteEntity.uses = invite.uses!;
        await this.entityManager.persist(inviteEntity).flush();
        return inviteEntity;
      }
    }
  }

  public async delete(invite: Invite) {
    const inviteEntity = await this.inviteRepository.findOne({
      id: invite.code,
    });
    if (inviteEntity) {
      await this.entityManager.remove(inviteEntity).flush();
      this.logger.log(`Deleted invite with ID: ${inviteEntity.id}`);
    }
  }

  async trackJoin(user: UserEntity, inviteCode: string) {
    const inviteEntity = await this.inviteRepository.findOne({
      id: inviteCode,
    });
    if (!inviteEntity) return;

    const inviteHistory = new GuildInviteHistoryEntity();
    inviteHistory.invite_code = inviteEntity.id;
    inviteHistory.user_id = user.user_id;
    inviteHistory.guild_id = inviteEntity.guild_id;
    inviteHistory.invite_user = inviteEntity.inviter_id;

    await this.entityManager.persist(inviteHistory).flush();
  }

  async trackLeave(user: UserEntity) {
    const inviteHistory = await this.inviteHistoryRepository.findOne(
      {
        user_id: user.user_id,
        guild_id: user.guild_id,
        leftAt: null,
      },
      { orderBy: { joinedAt: 'DESC' } },
    );
    if (!inviteHistory) return;

    inviteHistory.leftAt = new Date();
    await this.entityManager.persist(inviteHistory).flush();
  }
}
