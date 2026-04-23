import { Injectable, Logger } from '@nestjs/common';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  RESTJSONErrorCodes,
} from 'discord.js';
import {
  Context,
  NumberOption,
  Options,
  type SlashCommandContext,
  Subcommand,
} from 'necord';

import { PruneGroupDecorator } from '#core/discord/commands/utils/prune.command';

import { UserService } from '../users.service';

class PruneUsersDto {
  @NumberOption({
    name: 'days',
    description: 'Количество дней неактивности для кика',
    required: true,
    min_value: 30,
  })
  days: number;
}

@PruneGroupDecorator()
@Injectable()
export class PruneCommand {
  private readonly logger = new Logger(PruneCommand.name);
  constructor(private readonly userService: UserService) {}

  @Subcommand({
    name: 'users',
    description: 'Кикнуть пользователей, которые давно не проявляли активность',
  })
  async pruneUsers(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: PruneUsersDto,
  ) {
    const guild = interaction.guild;
    if (!guild) {
      return interaction.reply({
        content: 'Эту команду можно использовать только в гильдии.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const botId = interaction.client.user?.id;
    if (!botId) {
      return interaction.reply({
        content: 'Бот не готов. Попробуйте позже.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const guildID = BigInt(interaction.guildId!);
    const cutoffDate = new Date(Date.now() - dto.days * 86_400_000);

    const targetList = await this.userService.getInactiveUsers(
      guildID,
      cutoffDate,
      [botId],
    );

    if (targetList.length === 0) {
      return interaction.reply({
        content: `Нет пользователей, не проявлявших активность в течение ${dto.days} дней.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const confirmId = `confirm_prune_${interaction.id}`;
    const cancelId = `cancel_prune_${interaction.id}`;

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel('Подтвердить')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel('Отменить')
        .setStyle(ButtonStyle.Secondary),
    );

    const confirm = await interaction.reply({
      content: `Вы уверены, что хотите кикнуть ${targetList.length} пользователей, не проявлявших активность в течение ${dto.days} дней?`,
      flags: MessageFlags.Ephemeral,
      components: [buttons],
    });

    try {
      const response = await confirm.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 15_000,
      });

      if (response.customId === cancelId) {
        return response.update({
          content: 'Операция отменена.',
          components: [],
        });
      }

      await response.update({
        content: 'Начинаю кик пользователей...',
        components: [],
      });
    } catch {
      this.logger.warn('Prune confirmation timed out');
      return interaction.editReply({
        content: 'Время для подтверждения истекло. Операция отменена.',
        components: [],
      });
    }

    let kicked = 0;
    let failed = 0;
    const chunkSize = 10;

    for (let i = 0; i < targetList.length; i += chunkSize) {
      const chunk = targetList.slice(i, i + chunkSize);

      for (const user of chunk) {
        try {
          await guild.members.kick(
            String(user.user_id),
            `Pruned for inactivity of ${dto.days} days`,
          );
          try {
            await this.userService.leaveGuild(user);
          } catch (dbError) {
            // User is kicked from Discord but DB state is inconsistent.
            // They won't be re-pruned (kick would 404) but will show as
            // still in guild until they rejoin and the watcher corrects it.
            this.logger.error(
              `User ${user.user_id} kicked but leaveGuild failed:`,
              dbError,
            );
          }
          kicked++;
        } catch (error) {
          const code =
            error instanceof Error &&
            'code' in error &&
            (error as { code: number }).code;
          if (code === RESTJSONErrorCodes.UnknownMember) {
            // Member already left — mark them in DB to stay consistent
            try {
              await this.userService.leaveGuild(user);
            } catch {
              // Best-effort DB cleanup
            }
            this.logger.warn(`User ${user.user_id} already left, marked in DB`);
          } else {
            failed++;
            this.logger.error(`Failed to kick user ${user.user_id}:`, error);
          }
        }
      }

      // Rate-limit backoff between chunks
      if (i + chunkSize < targetList.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    const parts = [
      `Кикнуто ${kicked} из ${targetList.length} пользователей, не проявлявших активность в течение ${dto.days} дней.`,
    ];
    if (failed > 0) parts.push(`Ошибок: ${failed}.`);

    return interaction.editReply({ content: parts.join(' ') });
  }
}
