import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '#core/permissions/permissions.decorator';
import { PermissionGuard } from '#core/permissions/permissions.guard';
import { Permission } from '#core/permissions/permissions.types';

import { GuildService } from './guild.service';

@Controller('guilds')
export class GuildController {
  constructor(private readonly guildService: GuildService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.GuildRead)
  async getGuilds() {
    return this.guildService.getGuilds();
  }

  @Get('/:guildId/roles')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.GuildRead)
  async getGuildRoles(@Param('guildId') guildId: bigint) {
    return this.guildService.getGuildRoles(guildId);
  }
}
