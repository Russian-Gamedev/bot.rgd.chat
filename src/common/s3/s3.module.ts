import { S3Client } from '@aws-sdk/client-s3';
import { Global, Logger, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '#config/env';
import { S3StorageService } from './s3-storage.service';

const s3ClientProvider: Provider = {
  provide: S3Client,
  useFactory: (config: ConfigService<EnvironmentVariables>) => {
    const logger = new Logger('S3Module');

    const client = new S3Client({
      endpoint: config.getOrThrow('S3_ENDPOINT'),
      region: config.getOrThrow('S3_REGION'),
      credentials: {
        accessKeyId: config.getOrThrow('S3_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow('S3_SECRET_ACCESS_KEY'),
      },
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', true),
    });

    logger.log('S3 client initialized');

    return client;
  },
  inject: [ConfigService],
};

@Global()
@Module({
  providers: [s3ClientProvider, S3StorageService],
  exports: [S3Client, S3StorageService],
})
export class S3Module {}
