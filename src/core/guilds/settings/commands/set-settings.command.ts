import { Injectable, UseInterceptors } from '@nestjs/common';
import { MessageFlags } from 'discord.js';
import { Context, Options, type SlashCommandContext, Subcommand } from 'necord';

import { GuildSettings } from '#config/guilds';

import { SetSettingDto } from '../dto/set-setting.dto';
import { GuildSettingsService } from '../guild-settings.service';
import { SettingsCommandDecorator } from './group.decorator';
import { SetSettingsAutocompleteInterceptor } from './set-settings.autocomplete';

@SettingsCommandDecorator()
@Injectable()
export class SetGuildSettingsCommand {
  constructor(private readonly guildSettingsService: GuildSettingsService) {}

  @UseInterceptors(SetSettingsAutocompleteInterceptor)
  @Subcommand({
    name: 'set-raw',
    description: 'Set a guild setting',
  })
  public async setRawSettings(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: SetSettingDto<string>,
  ) {
    const { key, value } = dto;

    const validSettingKey = Object.values(GuildSettings).some(
      (setting) => setting === (key as GuildSettings),
    );
    if (!validSettingKey) {
      return await interaction.reply({
        content: 'Invalid setting key.',
        flags: [MessageFlags.Ephemeral],
      });
    }

    await this.guildSettingsService.setSetting(
      BigInt(interaction.guildId!),
      key,
      value,
    );
    await interaction.reply(`Setting \`${key}\` updated to \`${value}\`.`);
  }
}
