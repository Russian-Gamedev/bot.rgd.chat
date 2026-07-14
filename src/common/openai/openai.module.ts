import { Global, Logger, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import { EnvironmentVariables } from '#config/env';
import { OpenAiService } from './openai.service';

const openAiProvider: Provider = {
  provide: OpenAI,
  useFactory: (config: ConfigService<EnvironmentVariables>) => {
    const logger = new Logger('OpenAiModule');
    const baseURL = config.get('OPENAI_BASE_URL');
    const apiKey = config.get('OPENAI_ACCESS_TOKEN');

    if (!baseURL) {
      logger.warn('OPENAI_BASE_URL is not set, OpenAI client will not work');
    }

    if (!apiKey) {
      logger.warn(
        'OPENAI_ACCESS_TOKEN is not set, OpenAI client will not work',
      );
    }

    const client = new OpenAI({
      baseURL: baseURL ?? undefined,
      apiKey: apiKey ?? undefined,
    });

    logger.log('OpenAI client initialized');

    return client;
  },
  inject: [ConfigService],
};

@Global()
@Module({
  providers: [openAiProvider, OpenAiService],
  exports: [OpenAI, OpenAiService],
})
export class OpenAiModule {}
