import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
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

import { ActivityEntity, ActivityPeriod } from './entities/activity.entity';

export const VOICE_ACTIVITY_SAVE_INTERVAL_MS = 60_000;
export const VOICE_ACTIVITY_STALE_MULTIPLIER = 5;
export const VOICE_ACTIVITY_STALE_TIMEOUT_MS =
  VOICE_ACTIVITY_SAVE_INTERVAL_MS * VOICE_ACTIVITY_STALE_MULTIPLIER;

@Injectable()
export class ActivityWatchService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(ActivityWatchService.name);

  constructor(
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: EntityRepository<ActivityEntity>,
    private readonly em: EntityManager,
    private readonly discord: Client,
    @Inject(Redis)
    private readonly redis: Redis,
    private readonly userService: UserService,
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
          if (member.user.bot) continue;
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
  public async onMessage(@Context() [message]: ContextOf<'messageCreate'>) {
    if (message.author.bot) return;
    if (message.webhookId) return;
    if (!message.guild) return;

    const words = message.content
      .trim()
      .replaceAll(/\s+/g, ' ')
      .split(' ')
      .filter((word) => word.length > 0);

    if (words.length === 0) return;

    const activity = await this.getOrCreateActivity(
      BigInt(message.guildId!),
      BigInt(message.author.id),
      ActivityPeriod.Day,
    );

    activity.message += words.length;

    const user = await this.userService.findOrCreate(
      BigInt(message.guildId!),
      BigInt(message.author.id),
    );

    await this.userService.addExperience(user, words.length);
    await this.userService.updateLastActiveAt(user);

    await this.em.persist(activity).flush();
  }

  @On('voiceStateUpdate')
  public async onVoiceStateUpdate(
    @Context() [oldState, newState]: ContextOf<'voiceStateUpdate'>,
  ) {
    if (!newState.guild) return;
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;

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
  public async onReactionAdd(
    @Context() [reaction, user]: ContextOf<'messageReactionAdd'>,
  ) {
    const canProcess = await this.canProcessReaction(reaction, user);
    if (!canProcess) return;

    const activity = await this.getOrCreateActivity(
      BigInt(reaction.message.guildId!),
      BigInt(reaction.message.author!.id),
      ActivityPeriod.Day,
    );

    activity.reactions += 1;

    await this.em.persist(activity).flush();
  }

  @On('messageReactionRemove')
  public async onReactionRemove(
    @Context() [reaction, user]: ContextOf<'messageReactionRemove'>,
  ) {
    const canProcess = await this.canProcessReaction(reaction, user);
    if (!canProcess) return;

    const activity = await this.getOrCreateActivity(
      BigInt(reaction.message.guildId!),
      BigInt(reaction.message.author!.id),
      ActivityPeriod.Day,
    );

    if (activity.reactions > 0) {
      activity.reactions -= 1;
    }

    await this.em.persist(activity).flush();
  }

  private async canProcessReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ) {
    if (user.bot) return;

    const message = await reaction.message.fetch();
    if (!message.guild) return;

    const member = await message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    if (message.author.id === user.id) return;

    const diffTime = Date.now() - message.createdTimestamp;
    if (diffTime > 1000 * 60 * 60 * 24) return; // older than 24 hours

    return true;
  }

  private async getOrCreateActivity(
    guildId: bigint,
    userId: bigint,
    period: ActivityPeriod,
  ) {
    let activity = await this.activityRepository.findOne({
      guild_id: guildId,
      user_id: userId,
      period,
    });

    if (!activity) {
      activity = new ActivityEntity();
      activity.guild_id = guildId;
      activity.user_id = userId;
      activity.period = period;
      activity.message = 0;
      activity.voice = 0;
      activity.reactions = 0;
      await this.em.persist(activity).flush();
    }

    return activity;
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
    const activity = await this.getOrCreateActivity(
      BigInt(guildId),
      BigInt(memberId),
      ActivityPeriod.Day,
    );

    activity.voice += elapsed;

    const user = await this.userService.findOrCreate(
      BigInt(guildId),
      BigInt(memberId),
    );

    await this.userService.addVoiceTime(user, elapsed);
    await this.userService.updateLastActiveAt(user);

    await this.em.persist(activity).flush();
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
