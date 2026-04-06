import { NecordPaginationModule } from '@necord/pagination';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntentsBitField, Partials } from 'discord.js';
import { NecordModule } from 'necord';

import { AppConfigModule } from '#common/config/config.module';
import { RedisModule } from '#common/redis.module';
import { Environment, EnvironmentVariables } from '#config/env';

import { commands } from './commands';
import { DiscordController } from './discord.controller';
import { DiscordService } from './discord.service';

@Module({
  imports: [
    NecordModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables>) => ({
        token: config.getOrThrow<string>('DISCORD_BOT_TOKEN'),
        intents: [
          IntentsBitField.Flags.Guilds,
          IntentsBitField.Flags.GuildMembers,
          IntentsBitField.Flags.GuildModeration,
          IntentsBitField.Flags.GuildExpressions,
          IntentsBitField.Flags.GuildIntegrations,
          IntentsBitField.Flags.GuildWebhooks,
          IntentsBitField.Flags.GuildInvites,
          IntentsBitField.Flags.GuildVoiceStates,
          IntentsBitField.Flags.GuildPresences,
          IntentsBitField.Flags.GuildMessages,
          IntentsBitField.Flags.GuildMessageReactions,
          IntentsBitField.Flags.GuildMessageTyping,
          IntentsBitField.Flags.DirectMessages,
          IntentsBitField.Flags.DirectMessageReactions,
          IntentsBitField.Flags.DirectMessageTyping,
          IntentsBitField.Flags.MessageContent,
          IntentsBitField.Flags.GuildScheduledEvents,
          IntentsBitField.Flags.AutoModerationConfiguration,
          IntentsBitField.Flags.AutoModerationExecution,
          IntentsBitField.Flags.GuildMessagePolls,
          IntentsBitField.Flags.DirectMessagePolls,
        ],
        partials: [
          Partials.Channel,
          Partials.Message,
          Partials.Reaction,
          Partials.GuildMember,
          Partials.User,
          Partials.GuildScheduledEvent,
          Partials.Poll,
          Partials.PollAnswer,
          Partials.SoundboardSound,
          Partials.ThreadMember,
        ],
        development:
          config.get('NODE_ENV') === Environment.Development
            ? [config.getOrThrow<string>('DISCORD_DEVELOPMENT_GUILD_ID')]
            : false,
        enforceNonce: true,
      }),
    }),
    NecordPaginationModule.forRoot({}),
    RedisModule,
  ],
  providers: [DiscordService, ...commands],
  controllers: [DiscordController],
})
export class DiscordModule {}
