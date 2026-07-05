import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { GuildEvents } from '#config/guilds';
import { ApiActorAuth } from '#core/permissions/openapi-auth.decorator';
import { RequirePermissions } from '#core/permissions/permissions.decorator';
import { PermissionGuard } from '#core/permissions/permissions.guard';
import { Permission } from '#core/permissions/permissions.types';

import { GuildEventMessageDto } from './dto/guild-event.dto';
import { GuildEventService } from './guild-events.service';

@ApiTags('Guild Events')
@Controller('guilds/:guild_id/events')
export class GuildEventsController {
  constructor(private readonly guildEventService: GuildEventService) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.GuildEventsRead)
  @ApiActorAuth()
  @ApiOperation({
    summary: 'Get supported guild event names',
    description:
      'User or bot endpoint. Requires `guild_events:read` permission.',
  })
  @ApiParam({ name: 'guild_id', description: 'Discord Guild ID.' })
  @ApiOkResponse({
    description: 'Array of event names.',
    schema: {
      items: { enum: Object.values(GuildEvents), type: 'string' },
      type: 'array',
    },
  })
  async getEventsList() {
    return Object.values(GuildEvents);
  }

  @Get('/:event')
  @UseGuards(PermissionGuard)
  @RequirePermissions(Permission.GuildEventsRead)
  @ApiActorAuth()
  @ApiOperation({
    summary: 'Get a random message template for a guild event',
    description:
      'User or bot endpoint. Requires `guild_events:read` permission. Extra query parameters are passed to the event template renderer.',
  })
  @ApiParam({ name: 'guild_id', description: 'Discord Guild ID.' })
  @ApiParam({ name: 'event', enum: GuildEvents })
  @ApiQuery({
    name: 'params',
    required: false,
    description:
      'Optional template parameters. Any query key is accepted by the renderer.',
    style: 'form',
  })
  @ApiOkResponse({ type: GuildEventMessageDto })
  @ApiNotFoundResponse({
    description: 'No templates found for the requested event in this guild.',
  })
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
