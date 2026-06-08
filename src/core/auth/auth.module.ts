import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { EnvironmentVariables } from '#config/env';
import { UserModule } from '#core/users/users.module';
import { AuthController } from './auth.controller';
import { DiscordAuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { DiscordStrategy } from './discord.strategy';
import { AuthEntity } from './entities/auth.entity';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    MikroOrmModule.forFeature([AuthEntity]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (
        configService: ConfigService<EnvironmentVariables>,
      ) => {
        return {
          secret: configService.get<string>('JWT_SECRET'),
        };
      },
    }),
    UserModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, DiscordAuthGuard, DiscordStrategy, JwtStrategy],
})
export class AuthModule {}
