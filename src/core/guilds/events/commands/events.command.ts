import { Injectable } from '@nestjs/common';
import {
  InteractionContextType,
  MessageFlags,
  SendableChannels,
} from 'discord.js';
import {
  Context,
  createCommandGroupDecorator,
  Options,
  type SlashCommandContext,
  Subcommand,
} from 'necord';

import { GuildEventsParameters } from '#config/guilds';
import { cast } from '#root/lib/utils';

import { GuildEventService } from '../guild-events.service';

import { AddEventDto, FakeEventDto } from './events.dto';

const EventsGroupDecorator = createCommandGroupDecorator({
  name: 'events',
  description: 'Commands related to events',
  contexts: [InteractionContextType.Guild],
  defaultMemberPermissions: 'Administrator',
});

@Injectable()
@EventsGroupDecorator()
export class GuildEventsCommands {
  constructor(private readonly guildEventService: GuildEventService) {}

  @Subcommand({
    name: 'fake',
    description: 'Trigger a fake event (for testing purposes)',
  })
  async fakeEvent(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: FakeEventDto,
  ) {
    const event = await this.guildEventService.getRandom(
      interaction.guild!.id,
      dto.event,
      { user: `<@${interaction.user.id}>` },
    );
    const silent = Boolean(dto.silent);

    if (!event) {
      await interaction.reply({
        content: 'No event templates found for this event.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (silent) {
      await cast<SendableChannels>(interaction.channel).send(event);
      await interaction.reply({
        content: 'Event triggered silently.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply(event);
  }

  @Subcommand({
    name: 'add',
    description: 'Add a new event template',
  })
  async addEvent(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: AddEventDto,
  ) {
    const missingParams = GuildEventService.validateTemplate(
      dto.template,
      GuildEventsParameters[dto.event],
    );

    if (missingParams.length) {
      await interaction.reply({
        content: `The template is missing the following parameters: ${missingParams
          .map((p) => `\`${p}\``)
          .join(', ')}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const template = await this.guildEventService.addEvent(
      dto.event,
      dto.template,
      dto.attachmentUrl ? [dto.attachmentUrl] : [],
      dto?.global ? undefined : interaction.guild!.id,
    );

    if (!template) {
      await interaction.reply({
        content: `Failed to add new event template.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let response = `New event \`${template.event}\` added with \`${template.message}\``;

    if (dto.attachmentUrl) {
      response += ` and attachment \`${dto.attachmentUrl}\``;
    }

    response += dto?.global ? ` as a global template.` : ' for this guild.';

    await interaction.reply({
      content: response,
      flags: MessageFlags.Ephemeral,
    });
  }
}
