import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';

import { AppConfigModule } from '#common/config/config.module';
import { EnvironmentVariables } from '#config/env';

import { TelegramBotService } from './events.service';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramHttpService } from './telegram-http.service';
import { createTelegramModuleOptions } from './telegram-proxy';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables>) =>
        createTelegramModuleOptions(config),
    }),
  ],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramBotService, TelegramHttpService],
  exports: [TelegramService],
})
export class TelegramModule {}
