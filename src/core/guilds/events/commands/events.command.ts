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
import { UserService } from '#core/users/users.service';
import { WalletService } from '#core/wallet/wallet.service';
import { cast, formatCoins } from '#lib/utils';

import { GUILD_EVENT_COST } from '../guild-events.constants';
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
  constructor(
    private readonly guildEventService: GuildEventService,
    private readonly userService: UserService,
    private readonly walletService: WalletService,
  ) {}

  @Subcommand({
    name: 'fake',
    description: 'Trigger a fake event (for testing purposes)',
  })
  async fakeEvent(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: FakeEventDto,
  ) {
    const event = await this.guildEventService.getRandom(dto.event, {
      user: `<@${interaction.user.id}>`,
    });
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
    description: `Добавить новое событие за ${GUILD_EVENT_COST} монет`,
  })
  async addEvent(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: AddEventDto,
  ) {
    const guildId = interaction.guildId;
    if (!guildId) return null;

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

    const user = await this.userService.findOrCreate(
      guildId,
      interaction.user.id,
    );
    const balance = await this.walletService.getBalance(user.user_id);

    if (balance < GUILD_EVENT_COST) {
      return interaction.reply({
        content: `У вас недостаточно монет. Добавление события стоит ${formatCoins(GUILD_EVENT_COST)} монет, а у вас ${formatCoins(balance)}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await this.walletService.debit(
      user.user_id,
      GUILD_EVENT_COST,
      'events:add',
      {
        guildId: user.guild_id,
      },
    );

    const template = await this.guildEventService.addEvent(
      dto.event,
      dto.template,
      dto.attachmentUrl ? [dto.attachmentUrl] : null,
      BigInt(interaction.user.id),
    );

    let response = `New event \`${template.event}\` added with \`${template.message}\``;

    if (dto.attachmentUrl) {
      response += ` and attachment \`${dto.attachmentUrl}\``;
    }

    response += `. Списано ${formatCoins(GUILD_EVENT_COST)} монет.`;

    await interaction.reply({
      content: response,
      flags: MessageFlags.Ephemeral,
    });
  }
}
