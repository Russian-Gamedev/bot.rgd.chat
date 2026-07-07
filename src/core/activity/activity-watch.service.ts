import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  Client,
  GuildMember,
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
  User,
  VoiceBasedChannel,
  type VoiceState,
} from 'discord.js';
import { Redis } from 'ioredis';
import { Context, type ContextOf, On, Once } from 'necord';

import { UserService } from '#core/users/users.service';
import { ActivityService } from './activity.service';

export const VOICE_ACTIVITY_SAVE_INTERVAL_MS = 60_000;
export const VOICE_ACTIVITY_STALE_MULTIPLIER = 5;
export const VOICE_ACTIVITY_STALE_TIMEOUT_MS =
  VOICE_ACTIVITY_SAVE_INTERVAL_MS * VOICE_ACTIVITY_STALE_MULTIPLIER;
const ACTIVITY_DIAGNOSTIC_LOG_INTERVAL_MS = 10 * 60 * 1000;

@Injectable()
export class ActivityWatchService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(ActivityWatchService.name);
  private readonly diagnosticLogTimestamps = new Map<string, number>();

  constructor(
    readonly em: EntityManager,
    private readonly discord: Client,
    @Inject(Redis)
    private readonly redis: Redis,
    private readonly userService: UserService,
    private readonly activityService: ActivityService,
  ) {}

  @Once('clientReady')
  public async onReady() {
    this.logger.log(`Ready`);

    const now = Date.now();

    await this.saveAllVoiceActivities({
      discardStale: true,
      now,
      persistOnlyTrackable: true,
      reopenActive: true,
    });

    const guilds = this.discord.guilds.cache.values();
    for (const guild of guilds) {
      const channels = await guild.channels.fetch();
      const voiceChannels = channels.filter((ch) => ch?.isVoiceBased());

      for (const channel of voiceChannels.values()) {
        const members = (channel as VoiceBasedChannel).members;
        if (members.size === 0) continue;
        const key = this.getVoiceActivityKey(guild.id);
        for (const member of members.values()) {
          if (!this.isTrackableMember(member)) continue;

          const enteredAt = await this.redis.hget(key, member.id);
          if (enteredAt) continue;
          await this.startVoiceActivity(member, now);
          this.logger.log(
            `Member ${member.user.username} is in voice channel ${channel?.name} on startup`,
          );
        }
      }
    }

    this.logger.log(`Finished processing voice channels on startup`);
    const interval = setInterval(() => {
      void this.saveAllVoiceActivities().catch((error) => {
        this.logger.error(`Failed to save voice activities: ${String(error)}`);
      });
    }, VOICE_ACTIVITY_SAVE_INTERVAL_MS);

    interval.unref();
  }

  public async beforeApplicationShutdown() {
    await this.saveAllVoiceActivities({
      now: Date.now(),
      reopenActive: true,
    });
  }

  @On('messageCreate')
  @EnsureRequestContext()
  public async onMessage(@Context() [message]: ContextOf<'messageCreate'>) {
    if (message.webhookId) return;
    if (!message.guild) return;

    const words = message.content
      .trim()
      .replaceAll(/\s+/g, ' ')
      .split(' ')
      .filter((word) => word.length > 0);

    if (words.length === 0) {
      this.warnRateLimited(
        `message-empty-content:${message.guildId}`,
        `Received guild message with empty content in guild ${message.guildId}; check Discord MessageContent intent and message payload access`,
      );
      return;
    }

    const user = await this.userService.findOrCreateMember(
      BigInt(message.guildId!),
      BigInt(message.author.id),
    );

    await this.userService.addExperience(user, words.length);
    await this.activityService.recordActivity(
      message.guildId!,
      message.author.id,
      {
        messageScore: words.length,
      },
    );
  }

  @On('voiceStateUpdate')
  @EnsureRequestContext()
  public async onVoiceStateUpdate(
    @Context() [oldState, newState]: ContextOf<'voiceStateUpdate'>,
  ) {
    if (!newState.guild) return;
    const member = newState.member ?? oldState.member;
    if (!member) return;

    const now = Date.now();
    const wasTracking = this.isTrackableVoiceSessionState(oldState);
    const shouldTrack = this.isTrackableVoiceSessionState(newState);
    const switchedChannel = oldState.channelId !== newState.channelId;

    if (wasTracking && (switchedChannel || !shouldTrack)) {
      await this.saveVoiceActivity(member, { now });
    }

    if (shouldTrack && (switchedChannel || !wasTracking)) {
      await this.startVoiceActivity(member, now);
    }
  }

  @On('messageReactionAdd')
  @EnsureRequestContext()
  public async onReactionAdd(
    @Context() [reaction, user]: ContextOf<'messageReactionAdd'>,
  ) {
    const canProcess = await this.canProcessReaction(reaction, user);
    if (!canProcess) return;

    await this.activityService.recordActivity(
      reaction.message.guildId!,
      reaction.message.author!.id,
      { reactionCount: 1 },
    );
  }

  @On('messageReactionRemove')
  @EnsureRequestContext()
  public async onReactionRemove(
    @Context() [reaction, user]: ContextOf<'messageReactionRemove'>,
  ) {
    const canProcess = await this.canProcessReaction(reaction, user);
    if (!canProcess) return;

    await this.activityService.recordActivity(
      reaction.message.guildId!,
      reaction.message.author!.id,
      { reactionCount: -1 },
    );
  }

  private async canProcessReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ) {
    const message = await reaction.message.fetch().catch((err) => {
      const messageId = reaction.message.id ?? 'unknown';
      const reason = err instanceof Error ? err.message : String(err);
      this.warnRateLimited(
        `reaction-fetch:${messageId}`,
        `Skipping reaction activity for message ${messageId}: failed to fetch message: ${reason}`,
      );
      return null;
    });
    if (!message) return;
    if (!message.guild) {
      this.warnRateLimited(
        `reaction-no-guild:${message.id}`,
        `Skipping reaction activity for message ${message.id}: message has no guild`,
      );
      return;
    }

    const member = await message.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      this.warnRateLimited(
        `reaction-no-member:${message.guild.id}:${user.id}`,
        `Skipping reaction activity in guild ${message.guild.id}: reacting user ${user.id} was not found`,
      );
      return;
    }

    if (!message.author) {
      this.warnRateLimited(
        `reaction-no-author:${message.id}`,
        `Skipping reaction activity for message ${message.id}: message author is missing`,
      );
      return;
    }

    if (message.author.id === user.id) {
      this.warnRateLimited(
        `reaction-self:${message.id}:${user.id}`,
        `Skipping reaction activity for message ${message.id}: user ${user.id} reacted to their own message`,
      );
      return;
    }

    const diffTime = Date.now() - message.createdTimestamp;
    if (diffTime > 1000 * 60 * 60 * 24) {
      this.warnRateLimited(
        `reaction-old:${message.id}`,
        `Skipping reaction activity for message ${message.id}: message is older than 24 hours`,
      );
      return;
    }

    return true;
  }

  private warnRateLimited(key: string, message: string) {
    const now = Date.now();
    const previous = this.diagnosticLogTimestamps.get(key) ?? 0;
    if (now - previous < ACTIVITY_DIAGNOSTIC_LOG_INTERVAL_MS) return;

    this.diagnosticLogTimestamps.set(key, now);
    this.logger.warn(message);
  }

  private getVoiceActivityKey(guildId: string) {
    return `activity:voice:${guildId}`;
  }

  private isTrackableVoiceState(
    state: Pick<VoiceState, 'channelId' | 'selfDeaf' | 'serverDeaf'>,
  ) {
    return Boolean(state.channelId && !state.selfDeaf && !state.serverDeaf);
  }

  private isTrackableVoiceSessionState(
    state: Pick<
      VoiceState,
      'channelId' | 'guild' | 'selfDeaf' | 'serverDeaf' | 'suppress'
    >,
  ) {
    if (!this.isTrackableVoiceState(state)) return false;
    if (
      state.guild.afkChannelId &&
      state.channelId === state.guild.afkChannelId
    ) {
      return false;
    }
    if (state.suppress) return false;

    return true;
  }

  private isTrackableMember(member: GuildMember) {
    const channel = member.voice.channel;
    if (!channel) return false;

    if (member.guild.afkChannelId && channel.id === member.guild.afkChannelId) {
      return false;
    }

    if (member.voice.suppress) return false;

    return this.isTrackableVoiceState(member.voice);
  }

  private async startVoiceActivity(member: GuildMember, now = Date.now()) {
    const key = this.getVoiceActivityKey(member.guild.id);
    await this.redis.hset(key, member.id, String(now));
  }

  private async saveVoiceActivity(
    member: GuildMember,
    options: { now?: number; persist?: boolean } = {},
  ) {
    const key = this.getVoiceActivityKey(member.guild.id);
    const rawEnteredAt = await this.redis.hget(key, member.id);
    const now = options.now ?? Date.now();
    const persist = options.persist ?? true;
    if (!rawEnteredAt) return;

    const enteredAt = Number(rawEnteredAt);
    if (!Number.isFinite(enteredAt) || enteredAt <= 0) {
      await this.redis.hdel(key, member.id);
      return;
    }

    const elapsed = Math.floor((now - enteredAt) / 1_000);

    if (elapsed > 0 && persist) {
      await this.persistVoiceActivity(member.guild.id, member.id, elapsed);
    }

    await this.redis.hdel(key, member.id);
  }

  private async persistVoiceActivity(
    guildId: string,
    memberId: string,
    elapsed: number,
  ) {
    await this.activityService.recordActivity(guildId, memberId, {
      voiceSeconds: elapsed,
    });
  }

  private async saveAllVoiceActivities(
    options: {
      discardStale?: boolean;
      now?: number;
      persistOnlyTrackable?: boolean;
      reopenActive?: boolean;
    } = {},
  ) {
    const now = options.now ?? Date.now();
    const persistOnlyTrackable = options.persistOnlyTrackable ?? false;
    const reopenActive = options.reopenActive ?? true;
    const keys = await this.redis.keys('activity:voice:*');

    for (const key of keys) {
      const guildId = key.split(':')[2];
      const guild = this.discord.guilds.cache.get(guildId);
      if (!guild) continue;
      const members = await this.redis.hgetall(key);

      for (const [memberId, rawEnteredAt] of Object.entries(members)) {
        const enteredAt = Number(rawEnteredAt);
        const hasValidEnteredAt = Number.isFinite(enteredAt) && enteredAt > 0;
        const member = await guild.members.fetch(memberId).catch(() => null);
        const isTrackable = Boolean(member && this.isTrackableMember(member));
        const isStale =
          options.discardStale &&
          (!hasValidEnteredAt ||
            now - enteredAt > VOICE_ACTIVITY_STALE_TIMEOUT_MS);
        const shouldPersist =
          member &&
          hasValidEnteredAt &&
          !isStale &&
          (!persistOnlyTrackable || isTrackable);

        if (shouldPersist) {
          const elapsed = Math.floor((now - enteredAt) / 1_000);
          if (elapsed > 0) {
            await this.persistVoiceActivity(guild.id, memberId, elapsed);
          }
        }

        await this.redis.hdel(key, memberId);

        if (member && isTrackable && reopenActive) {
          await this.startVoiceActivity(member, now);
        }
      }
    }
  }
}
