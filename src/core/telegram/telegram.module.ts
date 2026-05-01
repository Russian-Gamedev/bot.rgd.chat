import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';

import { AppConfigModule } from '#common/config/config.module';
import { EnvironmentVariables } from '#config/env';

import { TelegramBotService } from './events.service';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables>) => ({
        token: config.getOrThrow<string>('TELEGRAM_BOT_TOKEN'),
        options: {
          telegram: {
            apiRoot: config.get<string>('TELEGRAM_API_ROOT'),
          },
        },
      }),
    }),
  ],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramBotService],
  exports: [TelegramService],
})
export class TelegramModule {}
