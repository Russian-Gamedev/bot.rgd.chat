import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { BotsModule } from '#core/bots/bots.module';
import { TelegramModule } from '#core/telegram/telegram.module';

import {
  CROSSPOST_SOURCE_ADAPTERS,
  CROSSPOST_TARGET_ADAPTERS,
} from './core/crosspost.tokens';
import { CrossPostRelayService } from './core/crosspost-relay.service';
import { CrossPostRouteService } from './core/crosspost-route.service';
import { CrossPostSourceRegistry } from './core/source-registry.service';
import { CrossPostTargetRegistry } from './core/target-registry.service';
import { CrossPostDeliveryEntity } from './entities/crosspost-delivery.entity';
import { CrossPostRouteEntity } from './entities/crosspost-route.entity';
import { DiscordSourceAdapter } from './sources/discord/discord-source.adapter';
import { DiscordSourceWatcher } from './sources/discord/discord-source.watcher';
import { TelegramSourceAdapter } from './sources/telegram/telegram-source.adapter';
import { TelegramSourceUpdate } from './sources/telegram/telegram-source.update';
import { DiscordWebhookPublisher } from './targets/discord-webhook/discord-webhook-publisher.service';
import { DiscordWebhookTargetAdapter } from './targets/discord-webhook/discord-webhook-target.adapter';
import { CrosspostController } from './crosspost.controller';

@Module({
  imports: [
    MikroOrmModule.forFeature([CrossPostRouteEntity, CrossPostDeliveryEntity]),
    TelegramModule,
    BotsModule,
  ],
  controllers: [CrosspostController],
  providers: [
    CrossPostRouteService,
    CrossPostRelayService,
    CrossPostSourceRegistry,
    CrossPostTargetRegistry,
    DiscordSourceAdapter,
    TelegramSourceAdapter,
    DiscordWebhookPublisher,
    DiscordWebhookTargetAdapter,
    DiscordSourceWatcher,
    TelegramSourceUpdate,
    {
      provide: CROSSPOST_SOURCE_ADAPTERS,
      useFactory: (
        discord: DiscordSourceAdapter,
        telegram: TelegramSourceAdapter,
      ) => [discord, telegram],
      inject: [DiscordSourceAdapter, TelegramSourceAdapter],
    },
    {
      provide: CROSSPOST_TARGET_ADAPTERS,
      useFactory: (discordWebhook: DiscordWebhookTargetAdapter) => [
        discordWebhook,
      ],
      inject: [DiscordWebhookTargetAdapter],
    },
  ],
})
export class CrossPostModule {}
