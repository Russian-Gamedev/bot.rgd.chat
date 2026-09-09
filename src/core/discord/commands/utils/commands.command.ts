import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type ApplicationCommandOption,
  ApplicationCommandOptionType,
  Client,
  MessageFlags,
} from 'discord.js';
import { Context, SlashCommand, type SlashCommandContext } from 'necord';

type SubcommandOption = Extract<
  ApplicationCommandOption,
  {
    type:
      | ApplicationCommandOptionType.Subcommand
      | ApplicationCommandOptionType.SubcommandGroup;
  }
>;

function isSubcommandOption(
  option: ApplicationCommandOption,
): option is SubcommandOption {
  return (
    option.type === ApplicationCommandOptionType.Subcommand ||
    option.type === ApplicationCommandOptionType.SubcommandGroup
  );
}

@Injectable()
export class CommandsCommand {
  constructor(
    private readonly config: ConfigService,
    private readonly client: Client,
  ) {}

  @SlashCommand({
    name: 'commands',
    description:
      'List all registered commands with IDs and mentions (owner only)',
    defaultMemberPermissions: 'Administrator',
  })
  public async onCommands(@Context() [interaction]: SlashCommandContext) {
    const whitelist = this.config.get<string[]>('API_ACCESS_WHITELIST', []);
    if (!whitelist.includes(interaction.user.id)) {
      await interaction.reply({
        content: 'You do not have permission to use this command.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const app = this.client.application;
    if (!app) {
      await interaction.editReply({ content: 'Application is not available.' });
      return;
    }

    const commands = await app.commands.fetch();

    const lines: string[] = [];
    for (const cmd of commands.values()) {
      const subs = (cmd.options ?? []).filter(isSubcommandOption);

      if (subs.length === 0) {
        lines.push(`${cmd.name} - ${cmd.id} - </${cmd.name}:${cmd.id}>`);
        continue;
      }

      for (const sub of subs) {
        if (sub.type === ApplicationCommandOptionType.Subcommand) {
          lines.push(
            `${cmd.name} ${sub.name} - ${cmd.id} - </${cmd.name} ${sub.name}:${cmd.id}>`,
          );
          continue;
        }

        for (const nested of sub.options ?? []) {
          lines.push(
            `${cmd.name} ${sub.name} ${nested.name} - ${cmd.id} - </${cmd.name} ${sub.name} ${nested.name}:${cmd.id}>`,
          );
        }
      }
    }

    const wrap = (text: string) => `\`\`\`\n${text}\n\`\`\``;
    const joined = lines.join('\n');

    if (joined.length <= 2000) {
      await interaction.editReply({ content: wrap(joined) });
      return;
    }

    const chunks: string[] = [];
    let current = '';
    const maxLen = 1900 - '```\n\n```'.length;
    for (const line of lines) {
      if (current.length + line.length + 1 > maxLen) {
        chunks.push(current);
        current = line;
      } else {
        current += (current ? '\n' : '') + line;
      }
    }
    if (current) chunks.push(current);

    for (let i = 0; i < chunks.length; i++) {
      const payload = { content: wrap(chunks[i]) };
      if (i === 0) {
        await interaction.editReply(payload);
      } else {
        await interaction.followUp(payload);
      }
    }
  }
}
