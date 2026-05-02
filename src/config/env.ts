import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsNumber()
  PORT: number;

  @IsString()
  BASE_URL: string;

  @IsString()
  POSTGRES_URL: string;

  @IsString()
  REDIS_URL: string;

  @IsString()
  DISCORD_BOT_TOKEN: string;

  @IsString()
  DISCORD_CLIENT_ID: string;

  @IsOptional()
  @IsString()
  DEBUG_CHANNEL_ID?: string;

  @IsString()
  @ValidateIf((o) => o.NODE_ENV === Environment.Development)
  DISCORD_DEVELOPMENT_GUILD_ID: string;

  @IsString()
  DISCORD_REDIRECT_URI: string;

  @IsString()
  DISCORD_CLIENT_SECRET: string;

  @IsString()
  JWT_SECRET: string;

  @IsString()
  TELEGRAM_BOT_TOKEN: string;

  @IsString()
  TELEGRAM_API_ROOT: string;

  @IsOptional()
  @IsString()
  TELEGRAM_SOCKS_PROXY_URL?: string;

  @IsOptional()
  @IsString({ each: true })
  @Transform(({ value }) => value.split(',').map((s) => s.trim()))
  API_ACCESS_WHITELIST: string[];
}
