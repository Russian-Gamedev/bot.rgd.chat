import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { Client, Guild } from 'discord.js';
import { Once } from 'necord';

import { DiscordID } from '#root/lib/types';

import { GuildEntity } from './entities/guild.entity';
import { RoleEntity } from './entities/role.entity';

@Injectable()
export class GuildService {
  private readonly logger = new Logger(GuildService.name);

  constructor(
    @InjectRepository(GuildEntity)
    private readonly guildRepository: EntityRepository<GuildEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepository: EntityRepository<RoleEntity>,
    private readonly em: EntityManager,
    private readonly client: Client,
  ) {}

  @EnsureRequestContext()
  @Once('clientReady')
  async onReady() {
    await this.fetchGuilds();
    this.logger.log('Fetched guilds from Discord');
  }

  async getGuildById(id: DiscordID) {
    return this.guildRepository.findOne({ id });
  }

  async getGuilds() {
    return this.guildRepository.findAll();
  }

  async getGuildRoles(guildId: DiscordID) {
    return this.roleRepository.find({ guild_id: guildId });
  }

  private async fetchGuilds() {
    const guilds = await this.client.guilds.fetch();
    for (const [id, guild] of guilds) {
      let existing = await this.guildRepository.findOne({ id: BigInt(id) });
      const guildData = await guild.fetch();
      if (!existing) {
        existing = new GuildEntity();
        existing.id = BigInt(id);
      }
      existing.name = guild.name;
      existing.owner_id = BigInt(guildData.ownerId);
      existing.icon_url = guild.iconURL() ?? undefined;
      await this.guildRepository.upsert(existing);

      await this.syncRoles(guildData);
    }
  }

  private async syncRoles(guild: Guild) {
    const roles = await guild.roles.fetch();
    const roleEntities = await this.roleRepository.find({
      guild_id: BigInt(guild.id),
    });

    /// delete if not exists
    for (const roleEntity of roleEntities) {
      if (!roles.has(roleEntity.role_id.toString())) {
        void this.roleRepository.nativeDelete({ id: roleEntity.id });
      }
    }

    /// adding or updating roles

    for (const role of roles.values()) {
      if (role.name === '@everyone') continue;
      if (role.tags) continue; // skip bot roles

      let roleEntity = roleEntities.find((r) => r.role_id === BigInt(role.id));
      if (!roleEntity) {
        roleEntity = new RoleEntity();
        roleEntity.guild_id = BigInt(guild.id);
        roleEntity.role_id = BigInt(role.id);
      }
      roleEntity.name = role.name;
      roleEntity.color = role.hexColor;
      roleEntity.position = role.position;
      void this.roleRepository.upsert(roleEntity);
    }

    await this.em.flush();
  }
}
