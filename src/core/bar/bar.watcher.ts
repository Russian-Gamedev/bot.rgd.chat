import { generateDependencyReport, joinVoiceChannel } from '@discordjs/voice';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  Client,
  ChannelType as DiscordChannelType,
  Guild,
  GuildMember,
  InteractionContextType,
  MessageFlags,
  PartialUser,
  PermissionFlagsBits,
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
import { recordDiscordCommand } from '#common/metrics/discord-command-metrics';
import { MetricsService } from '#common/metrics/metrics.service';
import { GuildSettings } from '#config/guilds';
import { GuildSettingsService } from '#core/guilds/settings/guild-settings.service';
import { cast, getDisplayAvatar } from '#lib/utils';

import { type BarGateway } from './bar.gateway';
import { ChannelType, ConnectedPayload } from './bar.protocol';

type BarConnectedGuild = ConnectedPayload['guilds'][number];
type BarConnectedChannel = BarConnectedGuild['channels'][number];
type BarInitialData = Pick<ConnectedPayload, 'guilds'>;

@Injectable()
export class BarWatcher {
  private readonly logger = new Logger(BarWatcher.name);
  private readonly guildRefreshIntervalMs = 1000 * 60 * 60;

  private guilds: Guild[] = [];
  private guildsLastRefreshedAt: number | null = null;
  private guildRefreshPromise: Promise<void> | null = null;
  barGateway: BarGateway;

  constructor(
    readonly em: EntityManager,
    private readonly guildSettings: GuildSettingsService,
    private readonly discord: Client,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  @SlashCommand({
    name: 'bar-join',
    description: 'Make the bot join the voice channel and start tracking',
    contexts: [InteractionContextType.Guild],
  })
  async joinToChannel(@Context() [interaction]: SlashCommandContext) {
    if (!this.metrics) return this.joinToChannelCommand(interaction);

    return recordDiscordCommand(this.metrics, 'bar_join', interaction, () => {
      return this.joinToChannelCommand(interaction);
    });
  }

  private async joinToChannelCommand(interaction: SlashCommandContext[0]) {
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
  @EnsureRequestContext()
  async onInit() {
    this.logger.log(generateDependencyReport());

    await this.refreshGuilds();
    this.logger.log('BarGateway initialized');
  }

  @EnsureRequestContext()
  public async getInitialData(): Promise<BarInitialData> {
    await this.refreshGuildsIfStale();

    return {
      guilds: await Promise.all(
        this.guilds.map(async (guild) => {
          const channels = this.getPublicChannels(guild);
          return {
            id: guild.id,
            name: guild.name,
            icon_url: guild.iconURL() ?? '',
            channels,
            members: await this.getActiveMembers(guild),
            voices: this.getVoiceMembersByChannel(guild, channels),
          };
        }),
      ),
    };
  }

  private getPublicChannels(guild: Guild): BarConnectedChannel[] {
    const channels = guild.channels.cache.filter(
      (channel) =>
        this.getBarChannelType(channel.type) !== null &&
        this.canEveryoneUseChannel(channel, guild.roles.everyone),
    );
    const result: BarConnectedChannel[] = [];
    const addedChannelIds = new Set<string>();

    const addChannelsByParent = (parentId: string | null) => {
      const childChannels = this.sortChannels(
        channels
          .filter((channel) => (channel.parentId ?? null) === parentId)
          .values(),
      );

      for (const channel of childChannels.values()) {
        if (addedChannelIds.has(channel.id)) continue;

        const type = this.getBarChannelType(channel.type);
        if (type === null) continue;

        addedChannelIds.add(channel.id);
        result.push({
          id: channel.id,
          name: channel.name,
          type,
        });
        addChannelsByParent(channel.id);
      }
    };

    addChannelsByParent(null);

    for (const channel of this.sortChannels(channels.values())) {
      if (addedChannelIds.has(channel.id)) continue;

      const type = this.getBarChannelType(channel.type);
      if (type === null) continue;

      addedChannelIds.add(channel.id);
      result.push({
        id: channel.id,
        name: channel.name,
        type,
      });
    }

    return result;
  }

  private sortChannels<
    Channel extends { id: string; position?: number; rawPosition?: number },
  >(channels: Iterable<Channel>): Channel[] {
    return Array.from(channels).sort((a, b) => {
      const aPosition = a.rawPosition ?? a.position ?? 0;
      const bPosition = b.rawPosition ?? b.position ?? 0;

      return aPosition - bPosition || Number(BigInt(a.id) - BigInt(b.id));
    });
  }

  private canEveryoneUseChannel(
    channel: Guild['channels']['cache'] extends Map<string, infer Channel>
      ? Channel
      : never,
    everyoneRole: Guild['roles']['everyone'],
  ) {
    const permissions = channel.permissionsFor(everyoneRole);
    if (!permissions?.has(PermissionFlagsBits.ViewChannel)) return false;

    switch (channel.type) {
      case DiscordChannelType.GuildCategory:
        return true;
      case DiscordChannelType.GuildText:
        return permissions.has(PermissionFlagsBits.SendMessages);
      case DiscordChannelType.GuildVoice:
        return permissions.has(PermissionFlagsBits.Connect);
      case DiscordChannelType.PublicThread:
        return permissions.has(PermissionFlagsBits.SendMessagesInThreads);
      default:
        return false;
    }
  }

  private getBarChannelType(
    type: DiscordChannelType,
  ): keyof typeof ChannelType | null {
    switch (type) {
      case DiscordChannelType.GuildText:
        return 'text';
      case DiscordChannelType.GuildVoice:
        return 'voice';
      case DiscordChannelType.GuildCategory:
        return 'category';
      case DiscordChannelType.PublicThread:
        return 'thread';
      default:
        return null;
    }
  }

  private async getActiveMembers(guild: Guild) {
    const activeRoleId = await this.guildSettings.getSetting<string>(
      BigInt(guild.id),
      GuildSettings.ActiveRoleId,
      null,
    );
    if (!activeRoleId) return [];

    return guild.members.cache
      .filter((member) => member.roles.cache.has(activeRoleId))
      .map((member) => this.normalizeMember(member));
  }

  private getVoiceMembersByChannel(
    guild: Guild,
    channels: BarConnectedChannel[],
  ) {
    const voices: Record<string, ReturnType<typeof this.normalizeMember>[]> =
      {};

    for (const channel of channels) {
      if (channel.type !== 'voice') continue;

      const discordChannel = guild.channels.cache.get(channel.id);
      if (
        !discordChannel ||
        discordChannel.type !== DiscordChannelType.GuildVoice
      ) {
        voices[channel.id] = [];
        continue;
      }

      voices[channel.id] = Array.from(discordChannel.members.values()).map(
        (member) => this.normalizeMember(member),
      );
    }

    return voices;
  }

  private async refreshGuildsIfStale() {
    const now = Date.now();
    if (
      this.guildsLastRefreshedAt !== null &&
      now - this.guildsLastRefreshedAt < this.guildRefreshIntervalMs
    ) {
      return;
    }

    if (this.guildRefreshPromise) {
      return this.guildRefreshPromise;
    }

    this.guildRefreshPromise = this.refreshGuilds().finally(() => {
      this.guildRefreshPromise = null;
    });
    return this.guildRefreshPromise;
  }

  private async refreshGuilds() {
    const enabledGuilds = await this.guildSettings.getGuildsWithEnabledFeature(
      GuildSettings.BarEnabled,
    );

    this.logger.log('Enabled guilds for BarGateway:', enabledGuilds);

    const guilds: Guild[] = [];
    for (const guildId of enabledGuilds) {
      const guild = await this.discord.guilds.fetch(guildId).catch(() => null);

      if (guild) {
        guilds.push(guild);
      }
    }

    this.guilds = guilds;
    this.guildsLastRefreshedAt = Date.now();
    this.metrics?.setWatchedGuildCount('bar', guilds.length);
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
      color: this.getMemberColor(member),
      is_bot: 'bot' in member ? member.bot : member.user.bot,
    };
  }

  private getMemberColor(member: GuildMember | User | PartialUser) {
    if ('displayColor' in member && typeof member.displayColor === 'number') {
      return member.displayColor.toString(16).padStart(6, '0');
    }

    return '000000';
  }

  private checkGuildFeatureEnabled(guild?: Guild | null): guild is Guild {
    return this.guilds.some((g) => g.id === guild?.id);
  }
}
