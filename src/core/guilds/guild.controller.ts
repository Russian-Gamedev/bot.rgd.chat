import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ApiActorAuth } from '#core/permissions/openapi-auth.decorator';
import { RequirePermissions } from '#core/permissions/permissions.decorator';
import { PermissionGuard } from '#core/permissions/permissions.guard';
import { Permission } from '#core/permissions/permissions.types';

import { GuildDto, GuildRoleDto } from './dto/guild.dto';
import { GuildService } from './guild.service';

@ApiTags('Guilds')
@Controller('guilds')
export class GuildController {
  constructor(private readonly guildService: GuildService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.GuildRead)
  @ApiActorAuth()
  @ApiOperation({
    summary: 'Get available guilds',
    description: 'User or bot endpoint. Requires `guild:read` permission.',
  })
  @ApiOkResponse({ type: [GuildDto] })
  async getGuilds() {
    return this.guildService.getGuilds();
  }

  @Get('/:guildId/roles')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.GuildRead)
  @ApiActorAuth()
  @ApiOperation({
    summary: 'Get guild roles',
    description: 'User or bot endpoint. Requires `guild:read` permission.',
  })
  @ApiParam({ name: 'guildId', description: 'Discord Guild ID.' })
  @ApiOkResponse({ type: [GuildRoleDto] })
  async getGuildRoles(@Param('guildId') guildId: bigint) {
    return this.guildService.getGuildRoles(guildId);
  }
}
