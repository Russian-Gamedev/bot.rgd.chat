import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { validate } from './validate';

@Module({
  imports: [
    ConfigModule.forRoot({
      validate,
      isGlobal: true,
      expandVariables: true,
      ignoreEnvFile: true,
    }),
  ],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class AppConfigModule {}
