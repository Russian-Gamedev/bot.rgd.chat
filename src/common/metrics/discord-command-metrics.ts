import type {
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  GuildMember,
} from 'discord.js';

import { MetricsService } from './metrics.service';
import { getRoleSegment } from './metrics.types';

type CommandInteraction =
  | ChatInputCommandInteraction
  | ContextMenuCommandInteraction;

export async function recordDiscordCommand<T>(
  metrics: MetricsService,
  command: string,
  interaction: CommandInteraction,
  handler: () => Promise<T>,
): Promise<T> {
  try {
    const result = await handler();
    metrics.recordDiscordCommand({
      command,
      guildId: interaction.guildId,
      roleSegment: getRoleSegment(interaction.member as GuildMember | null),
      status: 'success',
    });
    return result;
  } catch (error) {
    metrics.recordDiscordCommand({
      command,
      guildId: interaction.guildId,
      roleSegment: getRoleSegment(interaction.member as GuildMember | null),
      status: 'error',
    });
    throw error;
  }
}
