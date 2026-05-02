import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { CommonServicesModule } from '#common/common-services.module';
import { AppConfigModule } from '#common/config/config.module';
import { DatabaseModule } from '#common/database.module';
import { RedisModule } from '#common/redis.module';
import { ScheduleLoggerService } from '#common/schedule-logger.service';
import { ActivityModule } from '#core/activity/activity.module';
import { AuthModule } from '#core/auth/auth.module';
import { BarModule } from '#core/bar/bar.module';
import { BotsModule } from '#core/bots/bots.module';
import { CrossPostModule } from '#core/crosspost/crosspost.module';
import { DiscordModule } from '#core/discord/discord.module';
import { FunModule } from '#core/fun/fun.module';
import { GuildModule } from '#core/guilds/guild.module';
import { ItemsModule } from '#core/items/items.module';
import { MiniGamesModule } from '#core/mini-games/mini-games.module';
import { NicknameModule } from '#core/nickname/nickname.module';
import { RoleManagerModule } from '#core/role-manager/role-manager.module';
import { TelegramModule } from '#core/telegram/telegram.module';
import { UserModule } from '#core/users/users.module';
import { WalletModule } from '#core/wallet/wallet.module';

import { AppController } from './app.controller';

@Module({
  imports: [
    AppConfigModule,
    CommonServicesModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    DiscordModule,
    UserModule,
    GuildModule,
    ActivityModule,
    BotsModule,
    TelegramModule,
    CrossPostModule,
    MiniGamesModule,
    AuthModule,
    ItemsModule,
    WalletModule,
    BarModule,
    RoleManagerModule,
    FunModule,
    NicknameModule,
  ],
  controllers: [AppController],
  providers: [ScheduleLoggerService],
})
export class AppModule {}
