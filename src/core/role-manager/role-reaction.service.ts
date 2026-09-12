import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable } from '@nestjs/common';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} from 'discord.js';
import { Context, MessageCommand, type MessageCommandContext } from 'necord';

import { EmojiNumber } from '#config/emojis';

import { RoleReactionEntity } from './entities/role-reaction.entity';

const BindRegex =
  /(?<emoji><a?:\w{1,32}:\d{17,21}>|[^\s]+)\s+<@&(?<role_id>\d{17,21})>/g;

@Injectable()
export class RoleReactionService {
  constructor(
    @InjectRepository(RoleReactionEntity)
    private readonly roleReactionRepository: EntityRepository<RoleReactionEntity>,
    private readonly entityManager: EntityManager,
  ) {}

  @MessageCommand({
    name: 'Создать реакции для ролей',
    defaultMemberPermissions: 'Administrator',
  })
  async createRoleReaction(@Context() [interaction]: MessageCommandContext) {
    const message = interaction.options.getMessage('message', true);

    const roles: Record<string, string> = {};

    const parsed = this.parseMessage(message.content);

    Object.assign(roles, parsed);

    if (Object.keys(roles).length === 0) {
      return interaction.reply({
        content:
          'В указанном сообщении не найдено соответствий между реакциями и ролями.',
        flags: MessageFlags.Ephemeral,
      });
    }

    let text = 'Сообщение содержит следующие соответствия реакций и ролей?\n\n';
    for (const [emoji, roleId] of Object.entries(roles)) {
      text += `Эмодзи: ${emoji} -> Роль: <@&${roleId}>\n`;
    }

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_role_reactions')
        .setLabel('Подтвердить')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('cancel_role_reactions')
        .setLabel('Отменить')
        .setStyle(ButtonStyle.Danger),
    );

    const msg = await interaction.reply({
      content: text,
      components: [buttons],
      flags: MessageFlags.Ephemeral,
    });

    const response = await msg.awaitMessageComponent({
      componentType: ComponentType.Button,
    });

    if (response.customId === 'cancel_role_reactions') {
      await response.update({
        content: 'Операция создания реакций для ролей была отменена.',
        components: [],
      });
      return;
    }

    await response.deferUpdate({});

    await this.roleReactionRepository.nativeDelete({
      message_id: BigInt(message.id),
      guild_id: BigInt(interaction.guildId!),
    });

    for (const [emoji, roleId] of Object.entries(roles)) {
      const roleReaction = new RoleReactionEntity();
      roleReaction.message_id = BigInt(message.id);
      roleReaction.guild_id = BigInt(interaction.guildId!);
      roleReaction.emoji = emoji;
      roleReaction.role_id = BigInt(roleId);

      await message.react(emoji);

      this.entityManager.persist(roleReaction);
    }

    await this.entityManager.flush();

    return msg.edit({
      content: 'Реакции для ролей успешно созданы!',
      components: [],
    });
  }

  @MessageCommand({
    name: 'Удалить реакции для ролей',
    defaultMemberPermissions: 'Administrator',
  })
  async removeRoleReactions(@Context() [interaction]: MessageCommandContext) {
    const message = interaction.options.getMessage('message', true);

    const toDelete = await this.roleReactionRepository.find({
      message_id: BigInt(message.id),
      guild_id: BigInt(interaction.guildId!),
    });

    if (toDelete.length === 0) {
      return interaction.reply({
        content:
          'В указанном сообщении не найдены реакции для ролей, связанные с этим сервером.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const msg = await interaction.reply({
      content: `Найдено ${toDelete.length} соответствий реакций и ролей. Вы уверены, что хотите их удалить?`,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('confirm_delete_role_reactions')
            .setLabel('Подтвердить')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('cancel_delete_role_reactions')
            .setLabel('Отменить')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });

    const response = await msg.awaitMessageComponent({
      componentType: ComponentType.Button,
    });

    if (response.customId === 'cancel_delete_role_reactions') {
      await response.update({
        content: 'Операция удаления реакций для ролей была отменена.',
        components: [],
      });
      return;
    }

    await response.deferUpdate({});

    await this.roleReactionRepository.nativeDelete({
      message_id: BigInt(message.id),
      guild_id: BigInt(interaction.guildId!),
    });

    return interaction.editReply({
      content: 'Реакции для ролей успешно удалены из базы данных.',
      components: [],
    });
  }

  /*
  Find in text: emoji - role mention

  1. @GameMaker
  OR
  <web:111111111> @WebDeveloper
  */
  public parseMessage(content: string) {
    const roles: Record<string, string> = {};

    const EmojiRegex =
      /^(?:<(?<animated>a)?:(?<name>\w{1,32}):)?(?<id>\d{17,21})>?$/;

    const matches = content.matchAll(BindRegex);

    for (const match of matches) {
      let emoji = match.groups!.emoji;
      const role_id = match.groups!.role_id;

      if (!EmojiRegex.test(emoji)) {
        emoji = emoji.replace('.', '');
        if (/^\d$/g.test(emoji)) {
          emoji = EmojiNumber[emoji];
        }
      } else {
        const emojiMatch = EmojiRegex.exec(emoji)!;
        emoji = emojiMatch.groups!.id;
      }
      roles[emoji.trim()] = role_id.trim();
    }

    return roles;
  }
}
