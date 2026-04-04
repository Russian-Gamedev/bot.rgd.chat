import { generateDependencyReport, joinVoiceChannel } from '@discordjs/voice';
import { Injectable, Logger } from '@nestjs/common';
import {
  Client,
  Guild,
  GuildMember,
  InteractionContextType,
  MessageFlags,
  PartialUser,
  User,
} from 'discord.js';
import {
  Context,
  type ContextOf,
  On,
  Once,
  SlashCommand,
  type SlashCommandContext,
} from 'necord';

import { GuildSettings } from '#config/guilds';
import { GuildSettingsService } from '#core/guilds/settings/guild-settings.service';
import { cast, getDisplayAvatar } from '#root/lib/utils';

import { type BarGateway } from './bar.gateway';
import { ChannelType, ConnectedPayload } from './bar.protocol';

@Injectable()
export class BarWatcher {
  private readonly logger = new Logger(BarWatcher.name);

  private guilds: Guild[] = [];
  barGateway: BarGateway;

  constructor(
    private readonly guildSettings: GuildSettingsService,
    private readonly discord: Client,
  ) {}

  @SlashCommand({
    name: 'bar-join',
    description: 'Make the bot join the voice channel and start tracking',
    contexts: [InteractionContextType.Guild],
  })
  async joinToChannel(@Context() [interaction]: SlashCommandContext) {
    const member = interaction.member as GuildMember;
    const channel = member.voice.channel;

    if (!channel) {
      return interaction.reply({
        content:
          'Вы должны находиться в голосовом канале, чтобы использовать эту команду.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    connection.receiver.speaking.on('start', (userId) => {
      const user = channel.guild.members.cache.get(userId)!;
      this.barGateway.broadcast('member_speaking', {
        guild_id: channel.guild.id,
        channel_id: channel.id,
        member: this.normalizeMember(user),
        speaking: true,
      });
    });

    connection.receiver.speaking.on('end', (userId) => {
      const user = channel.guild.members.cache.get(userId)!;
      this.barGateway.broadcast('member_speaking', {
        guild_id: channel.guild.id,
        channel_id: channel.id,
        member: this.normalizeMember(user),
        speaking: false,
      });
    });

    return interaction.reply({
      content: `Присоединился к голосовому каналу **${channel.name}** и начал отслеживание событий!`,
    });
  }

  @Once('clientReady')
  async onInit() {
    this.logger.log(generateDependencyReport());

    const enabledGuilds = await this.guildSettings.getGuildsWithEnabledFeature(
      GuildSettings.BarEnabled,
    );

    this.logger.log('Enabled guilds for BarGateway:', enabledGuilds);

    for (const guildId of enabledGuilds) {
      const guild = await this.discord.guilds.fetch(guildId).catch(() => null);

      if (guild) {
        this.guilds.push(guild);
      }
    }

    this.logger.log('BarGateway initialized');
  }

  public getInitialData(): ConnectedPayload {
    return {
      guilds: this.guilds.map((guild) => {
        return {
          id: guild.id,
          name: guild.name,
          icon_url: guild.iconURL() ?? '',
          channels: guild.channels.cache.map((channel) => ({
            id: channel.id,
            name: channel.name,
            type: ChannelType[channel.type] as keyof typeof ChannelType,
          })),
        };
      }),
    };
  }

  @On('typingStart')
  onMessageTyping(@Context() [typing]: ContextOf<'typingStart'>) {
    if (!this.checkGuildFeatureEnabled(typing.guild)) return;

    this.barGateway.broadcast('member_start_typing', {
      channel_id: typing.channel.id,
      guild_id: typing.guild.id,
      member: this.normalizeMember(typing.user),
    });
  }

  @On('messageCreate')
  onMessageCreate(@Context() [message]: ContextOf<'messageCreate'>) {
    if (!this.checkGuildFeatureEnabled(message.guild)) return;

    this.barGateway.broadcast('message_create', {
      guild_id: message.guild.id,
      channel_id: message.channel.id,
      message: {
        id: message.id,
        content: message.content,
      },
      member: this.normalizeMember(message.member ?? message.author),
    });
  }

  @On('voiceChannelJoin')
  onVoiceChannelJoin(
    @Context() [member, channel]: ContextOf<'voiceChannelJoin'>,
  ) {
    if (!this.checkGuildFeatureEnabled(member.guild)) return;

    this.barGateway.broadcast('member_join_voice', {
      guild_id: member.guild.id,
      channel_id: channel.id,
      member: this.normalizeMember(member),
    });
  }
  @On('voiceChannelLeave')
  onVoiceChannelLeave(
    @Context() [member, channel]: ContextOf<'voiceChannelLeave'>,
  ) {
    if (!this.checkGuildFeatureEnabled(member.guild)) return;

    this.barGateway.broadcast('member_leave_voice', {
      guild_id: member.guild.id,
      channel_id: channel.id,
      member: this.normalizeMember(member),
    });
  }

  @On('voiceChannelSwitch')
  onVoiceChannelMove(
    @Context()
    [member, oldChannel, newChannel]: ContextOf<'voiceChannelSwitch'>,
  ) {
    if (!this.checkGuildFeatureEnabled(member.guild)) return;

    this.barGateway.broadcast('member_move_voice', {
      guild_id: member.guild.id,
      old_channel_id: oldChannel.id,
      new_channel_id: newChannel.id,
      member: this.normalizeMember(member),
    });
  }

  @On('voiceStateUpdate')
  onVoiceStateUpdate(
    @Context() [oldState, newState]: ContextOf<'voiceStateUpdate'>,
  ) {
    if (!this.checkGuildFeatureEnabled(newState.guild)) return;

    this.barGateway.broadcast('voice_state_update', {
      guild_id: newState.guild.id,
      channel_id: newState.channelId ?? '',
      member: this.normalizeMember(newState.member ?? oldState.member!),
      self_mute: newState.selfMute ?? false,
      self_deaf: newState.selfDeaf ?? false,
    });
  }

  @On('messageReactionAdd')
  onMessageReactionAdd(
    @Context() [reaction, user]: ContextOf<'messageReactionAdd'>,
  ) {
    const message = reaction.message;
    if (!this.checkGuildFeatureEnabled(message.guild)) return;

    this.barGateway.broadcast('member_reaction_add', {
      guild_id: message.guild.id,
      channel_id: message.channel.id,
      message_id: message.id,
      emoji: {
        url: reaction.emoji.imageURL() ?? '',
        name: reaction.emoji.name ?? '',
      },
      member: this.normalizeMember(user),
    });
  }

  private normalizeMember(member: GuildMember | User | PartialUser) {
    const username =
      member instanceof GuildMember
        ? member.displayName
        : (member.username ?? 'Unknown user');

    return {
      id: member.id,
      username,
      avatar_url: getDisplayAvatar(
        cast<GuildMember | User>(member),
        'png',
        256,
      ),
      is_bot: 'bot' in member ? member.bot : member.user.bot,
    };
  }

  private checkGuildFeatureEnabled(guild?: Guild | null): guild is Guild {
    return this.guilds.some((g) => g.id === guild?.id);
  }
}
