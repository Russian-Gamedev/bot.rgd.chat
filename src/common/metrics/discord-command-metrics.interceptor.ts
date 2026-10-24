import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type {
  ChatInputCommandInteraction,
  GuildMember,
  MessageContextMenuCommandInteraction,
  UserContextMenuCommandInteraction,
} from 'discord.js';
import { type Observable, tap } from 'rxjs';

import { MetricsService } from './metrics.service';
import { getRoleSegment } from './metrics.types';

type CommandInteraction =
  | ChatInputCommandInteraction
  | MessageContextMenuCommandInteraction
  | UserContextMenuCommandInteraction;

@Injectable()
export class DiscordCommandMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType<string>() !== 'necord') {
      return next.handle();
    }

    const interaction = context.getArgByIndex<unknown>(0);
    if (!interaction || !isCommandInteraction(interaction)) {
      return next.handle();
    }

    const command = getCommandName(interaction);

    return next.handle().pipe(
      tap({
        next: () => this.record(interaction, command, 'success'),
        error: () => this.record(interaction, command, 'error'),
      }),
    );
  }

  private record(
    interaction: CommandInteraction,
    command: string,
    status: 'success' | 'error',
  ) {
    this.metrics.recordDiscordCommand({
      command,
      guildId: interaction.guildId,
      roleSegment: getRoleSegment(interaction.member as GuildMember | null),
      status,
    });
  }
}

function isCommandInteraction(
  interaction: unknown,
): interaction is CommandInteraction {
  if (typeof interaction !== 'object' || interaction === null) return false;

  const candidate = interaction as {
    isChatInputCommand?: () => boolean;
    isContextMenuCommand?: () => boolean;
  };

  if (typeof candidate.isChatInputCommand !== 'function') return false;
  if (candidate.isChatInputCommand()) return true;

  return (
    typeof candidate.isContextMenuCommand === 'function' &&
    candidate.isContextMenuCommand()
  );
}

function getCommandName(interaction: CommandInteraction): string {
  if (!interaction.isChatInputCommand()) return interaction.commandName;

  const subcommand = interaction.options.getSubcommand(false);
  return subcommand
    ? `${interaction.commandName}_${subcommand}`
    : interaction.commandName;
}
