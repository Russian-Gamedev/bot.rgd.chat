import { Injectable, Logger } from '@nestjs/common';
import { MessageFlags } from 'discord.js';
import {
  Button,
  type ButtonContext,
  ComponentParam,
  Context,
  type ContextOf,
  On,
} from 'necord';

import { MahoragaService } from './mahoraga.service';

@Injectable()
export class MahoragaWatcher {
  private readonly logger = new Logger(MahoragaWatcher.name);

  constructor(private readonly mahoragaService: MahoragaService) {}

  @On('messageCreate')
  async onMessageCreate(@Context() [message]: ContextOf<'messageCreate'>) {
    try {
      await this.mahoragaService.inspectMessage(message);
    } catch (error) {
      this.logger.error('Failed to inspect message for spam:', error);
    }
  }

  @On('guildMemberAdd')
  async onGuildMemberAdd(@Context() [member]: ContextOf<'guildMemberAdd'>) {
    try {
      await this.mahoragaService.handleMemberJoin(member);
    } catch (error) {
      this.logger.error('Failed to apply Mahoraga softban on join:', error);
    }
  }

  @Button('mahoraga_verify/:token')
  async onVerificationButton(
    @Context() [interaction]: ButtonContext,
    @ComponentParam('token') token: string,
  ) {
    const result = await this.mahoragaService.verifyByToken(
      token,
      interaction.user.id,
    );

    switch (result) {
      case 'verified':
        return interaction.update({
          content: 'Проверка пройдена. Softban снят на доступных серверах.',
          components: [],
        });
      case 'wrong_user':
        return interaction.reply({
          content: 'Эта проверка предназначена для другого пользователя.',
          flags: MessageFlags.Ephemeral,
        });
      case 'expired':
        return interaction.update({
          content: 'Время проверки истекло. Обратитесь к модераторам.',
          components: [],
        });
      case 'processed':
        return interaction.update({
          content: 'Эта проверка уже обработана.',
          components: [],
        });
      default:
        return interaction.update({
          content: 'Проверка не найдена или уже недействительна.',
          components: [],
        });
    }
  }
}
