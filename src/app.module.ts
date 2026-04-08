import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { AppConfigModule } from '#common/config/config.module';
import { DatabaseModule } from '#common/database.module';
import { GitInfoService } from '#common/git-info.service';
import { RedisModule } from '#common/redis.module';
import { ActivityModule } from '#core/activity/activity.module';
import { AuthModule } from '#core/auth/auth.module';
import { BarModule } from '#core/bar/bar.module';
import { BotsModule } from '#core/bots/bots.module';
import { DiscordModule } from '#core/discord/discord.module';
import { FunModule } from '#core/fun/fun.module';
import { GuildModule } from '#core/guilds/guild.module';
import { ItemsModule } from '#core/items/items.module';
import { MiniGamesModule } from '#core/mini-games/mini-games.module';
import { RoleManagerModule } from '#core/role-manager/role-manager.module';
import { UserModule } from '#core/users/users.module';
import { WalletModule } from '#core/wallet/wallet.module';

import { AppController } from './app.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    DiscordModule,
    UserModule,
    GuildModule,
    ActivityModule,
    BotsModule,
    MiniGamesModule,
    AuthModule,
    ItemsModule,
    WalletModule,
    BarModule,
    RoleManagerModule,
    FunModule,
  ],
  controllers: [AppController],
  providers: [GitInfoService],
  exports: [GitInfoService],
})
export class AppModule {}
