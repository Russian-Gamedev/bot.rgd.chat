import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { EnvironmentVariables } from '#config/env';
import { BotEntity } from '#core/bots/entities/bot.entity';
import { PermissionGrantEntity } from './entities/permission-grant.entity';
import { ActorAuthGuard, PermissionGuard } from './permissions.guard';
import { PermissionService } from './permissions.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([PermissionGrantEntity, BotEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (
        configService: ConfigService<EnvironmentVariables>,
      ) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [PermissionService, ActorAuthGuard, PermissionGuard],
  exports: [PermissionService, ActorAuthGuard, PermissionGuard],
})
export class PermissionsModule {}
