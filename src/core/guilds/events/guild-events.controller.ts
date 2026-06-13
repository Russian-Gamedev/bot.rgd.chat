import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';

import { GuildEvents } from '#config/guilds';
import { RequirePermissions } from '#core/permissions/permissions.decorator';
import { PermissionGuard } from '#core/permissions/permissions.guard';
import { Permission } from '#core/permissions/permissions.types';

import { GuildEventService } from './guild-events.service';

@Controller('guilds/:guild_id/events')
export class GuildEventsController {
  constructor(private readonly guildEventService: GuildEventService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.GuildEventsRead)
  async getEventsList() {
    return Object.values(GuildEvents);
  }

  @Get('/:event')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.GuildEventsRead)
  async getRandomEvent(
    @Param('guild_id') guild_id: string,
    @Param('event') event: string,
    @Query() params: Record<string, string>,
  ) {
    const eventTemplate = await this.guildEventService.getRandom(
      guild_id,
      event as GuildEvents,
      params,
    );
    if (!eventTemplate)
      throw new NotFoundException(
        `No templates found for event "${event}" in this guild`,
      );

    return { message: eventTemplate };
  }
}
