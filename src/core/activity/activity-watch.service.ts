import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Client,
  GuildMember,
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
  User,
  VoiceBasedChannel,
} from 'discord.js';
import { Redis } from 'ioredis';
import { Context, type ContextOf, On, Once } from 'necord';

import { UserService } from '#core/users/users.service';

import { ActivityEntity, ActivityPeriod } from './entities/activity.entity';

@Injectable()
export class ActivityWatchService {
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

    await this.saveAllVoiceActivities();

    const guilds = this.discord.guilds.cache.values();
    for (const guild of guilds) {
      const channels = await guild.channels.fetch();
      const voiceChannels = channels.filter((ch) => ch?.isVoiceBased());

      for (const channel of voiceChannels.values()) {
        const members = (channel as VoiceBasedChannel).members;
        if (members.size === 0) continue;
        const key = `activity:voice:${guild.id}`;
        const now = Date.now();
        for (const member of members.values()) {
          if (member.user.bot) continue;
          const enteredAt = await this.redis.hget(key, member.id);
          if (enteredAt) continue;
          await this.redis.hset(key, member.id, now);
          this.logger.log(
            `Member ${member.user.username} is in voice channel ${channel?.name} on startup`,
          );
        }
      }
    }

    this.logger.log(`Finished processing voice channels on startup`);
    setInterval(() => this.saveAllVoiceActivities(), 1_000 * 60);
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

    const key = `activity:voice:${newState.guild.id}`;
    const recordTime = () => this.redis.hset(key, member.id, Date.now());
    const wasTracking = Boolean(oldState.channelId && !oldState.selfDeaf);
    const shouldTrack = Boolean(newState.channelId && !newState.selfDeaf);
    const switchedChannel = oldState.channelId !== newState.channelId;

    if (wasTracking && (switchedChannel || !shouldTrack)) {
      await this.saveVoiceActivity(member);
    }

    if (shouldTrack && (switchedChannel || !wasTracking)) {
      await recordTime();
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
      await this.em.persist(activity).flush();
    }

    return activity;
  }

  private async saveVoiceActivity(member: GuildMember) {
    const key = `activity:voice:${member.guild.id}`;
    const enteredAt = await this.redis.hget(key, member.id).then(Number);
    const now = Date.now();
    if (!enteredAt) return;
    const elapsed = Math.floor((now - enteredAt) / 1_000);

    const activity = await this.getOrCreateActivity(
      BigInt(member.guild.id),
      BigInt(member.id),
      ActivityPeriod.Day,
    );

    activity.voice += elapsed;

    const user = await this.userService.findOrCreate(
      BigInt(member.guild.id),
      BigInt(member.id),
    );

    await this.userService.addVoiceTime(user, elapsed);
    await this.userService.updateLastActiveAt(user);

    await this.em.persist(activity).flush();

    await this.redis.hdel(key, member.id);
  }

  private async saveAllVoiceActivities() {
    const keys = await this.redis.keys('activity:voice:*');

    for (const key of keys) {
      const guildId = key.split(':')[2];
      const guild = this.discord.guilds.cache.get(guildId);
      if (!guild) continue;
      const members = await this.redis.hgetall(key);

      for (const memberId of Object.keys(members)) {
        const member = await guild.members.fetch(memberId).catch(() => null);
        if (!member) continue;
        await this.saveVoiceActivity(member);
        if (member.voice.channel) {
          await this.redis.hset(key, member.id, Date.now());
        }
      }
    }
  }
}
