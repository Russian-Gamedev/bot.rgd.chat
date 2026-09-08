import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { GuildEvents, GuildEventsParameters } from '#config/guilds';
import { getActorUserId } from '#core/permissions/actor-user-id';
import { Actor } from '#core/permissions/permissions.decorator';
import { ActorAuthGuard } from '#core/permissions/permissions.guard';
import { type AuthenticatedActor } from '#core/permissions/permissions.types';
import { WalletService } from '#core/wallet/wallet.service';

import { CreateEventDto, UpdateEventDto } from './dto/guild-event.dto';
import { GUILD_EVENT_COST } from './guild-events.constants';
import { GuildEventService } from './guild-events.service';

@Controller('events')
@UseGuards(ActorAuthGuard)
export class GuildEventsController {
  constructor(
    private readonly guildEventService: GuildEventService,
    private readonly walletService: WalletService,
  ) {}

  @Get()
  async getEventsList() {
    return Object.values(GuildEvents);
  }

  @Get('list')
  async listEvents() {
    return this.guildEventService.listEvents();
  }

  @Get(':event')
  async getRandomEvent(
    @Param('event') event: string,
    @Query() params: Record<string, string>,
  ) {
    const eventTemplate = await this.guildEventService.getRandom(
      event as GuildEvents,
      params,
    );
    if (!eventTemplate)
      throw new NotFoundException(`No templates found for event "${event}"`);

    return { message: eventTemplate };
  }

  @Post()
  async addEvent(
    @Actor() actor: AuthenticatedActor,
    @Body() dto: CreateEventDto,
  ) {
    const missingParams = GuildEventService.validateTemplate(
      dto.message,
      GuildEventsParameters[dto.event],
    );

    if (missingParams.length) {
      throw new BadRequestException(
        `The template is missing the following parameters: ${missingParams.join(', ')}`,
      );
    }

    const userId = getActorUserId(actor);
    const tx = await this.walletService.debit(
      userId,
      GUILD_EVENT_COST,
      'events:add',
    );
    const template = await this.guildEventService.addEvent(
      dto.event,
      dto.message,
      dto.attachments ?? null,
      BigInt(userId),
    );

    return {
      id: template.id,
      event: template.event,
      message: template.message,
      attachments: template.attachments,
      author: template.author,
      balance_after: tx.balance_after.toString(),
    };
  }

  @Patch(':id')
  async updateEvent(
    @Actor() actor: AuthenticatedActor,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    const authorId = BigInt(getActorUserId(actor));
    const updated = await this.guildEventService.updateEvent(id, dto, authorId);
    if (!updated) throw new NotFoundException('Event template not found');
    return updated;
  }

  @Delete(':id')
  async removeEvent(
    @Actor() actor: AuthenticatedActor,
    @Param('id') id: string,
  ) {
    const authorId = BigInt(getActorUserId(actor));
    const removed = await this.guildEventService.removeEvent(id, authorId);
    if (!removed) throw new NotFoundException('Event template not found');
    return { removed };
  }
}
