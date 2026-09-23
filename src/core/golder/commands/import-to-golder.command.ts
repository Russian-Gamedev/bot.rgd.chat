import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActionRowBuilder,
  type Message,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import Redis from 'ioredis';
import type { MessageCommandContext, ModalContext } from 'necord';
import { Context, Fields, MessageCommand, Modal, TargetMessage } from 'necord';

import { EnvironmentVariables } from '#config/env';
import { stripTrailingSlash } from '#lib/utils';
import { parseTagsCsv } from '../golder.constants';
import { GolderService } from '../golder.service';

const IMPORT_MODAL_ID = 'golder-import';
const PENDING_TTL_SECONDS = 10 * 60;

@Injectable()
export class ImportToGolderCommand {
  private readonly logger = new Logger(ImportToGolderCommand.name);

  constructor(
    private readonly golderService: GolderService,
    private readonly redis: Redis,
    private readonly config: ConfigService<EnvironmentVariables>,
  ) {}

  @MessageCommand({ name: 'Загрузить в Golder' })
  public async onImport(
    @Context() [interaction]: MessageCommandContext,
    @TargetMessage() message: Message,
  ) {
    await this.redis.set(
      `golder:import-pending:${interaction.user.id}`,
      JSON.stringify({ channelId: message.channelId, messageId: message.id }),
      'EX',
      PENDING_TTL_SECONDS,
    );

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(IMPORT_MODAL_ID)
        .setTitle('Загрузить в Golder')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('slug')
              .setLabel('Название (slug)')
              .setPlaceholder('naprimer-moya-kartinka')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(64),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('tags')
              .setLabel('Теги через запятую')
              .setPlaceholder('мем, арт, гайд')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(256),
          ),
        ),
    );
  }

  @Modal(IMPORT_MODAL_ID)
  public async onImportSubmit(
    @Context() [interaction]: ModalContext,
    @Fields() fields: { slug?: string; tags?: string },
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const pending = await this.redis.getdel(
      `golder:import-pending:${interaction.user.id}`,
    );
    if (!pending) {
      await interaction.editReply({
        content:
          'Время на заполнение истекло — отправьте «Загрузить в Golder» заново.',
      });
      return;
    }

    const { channelId, messageId } = JSON.parse(pending) as {
      channelId: string;
      messageId: string;
    };
    const slug = (fields.slug ?? '').trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      await interaction.editReply({
        content:
          'Название обязательно: строчные латинские буквы, цифры и дефисы.',
      });
      return;
    }
    const tags = parseTagsCsv(fields.tags ?? '');

    try {
      const items = await this.golderService.importFromDiscordMessage(
        interaction.user.id,
        { channelId, messageId },
        slug,
        tags,
      );
      const webBaseUrl = stripTrailingSlash(
        this.config.get('WEB_BASE_URL') ?? 'https://rgd.chat',
      );
      const links = items
        .map((item) => `${webBaseUrl}/golder/${item.slug}`)
        .join('\n');
      await interaction.editReply({
        content: `Готово! Страница медиа:\n${links}`,
      });
    } catch (error) {
      this.logger.warn(
        `Import failed for ${interaction.user.username}: ${String(error)}`,
      );
      await interaction.editReply({ content: this.toUserMessage(error) });
    }
  }

  private toUserMessage(error: unknown): string {
    if (error instanceof ConflictException) {
      return 'Такое название уже занято — попробуйте другое.';
    }
    if (error instanceof NotFoundException) {
      return 'Сообщение не найдено или недоступно боту.';
    }
    if (error instanceof BadRequestException) {
      return 'В сообщении нет подходящих вложений (картинки, видео, аудио до 100 МБ) или не удалось их скачать.';
    }
    return 'Не удалось загрузить вложения в Golder.';
  }
}
