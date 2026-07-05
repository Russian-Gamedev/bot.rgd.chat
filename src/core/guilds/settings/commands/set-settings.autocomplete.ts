import { Injectable } from '@nestjs/common';
import { AutocompleteInteraction } from 'discord.js';
import { AutocompleteInterceptor } from 'necord';

import { GuildSettings } from '#config/guilds';

@Injectable()
export class SetSettingsAutocompleteInterceptor extends AutocompleteInterceptor {
  async transformOptions(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name === 'key') {
      const query = focused.value.toLowerCase();

      const choices = Object.values(GuildSettings)
        .filter((value) => value.toLowerCase().includes(query))
        .map((value) => ({ name: value, value }));

      return interaction.respond(choices);
    }
  }
}
