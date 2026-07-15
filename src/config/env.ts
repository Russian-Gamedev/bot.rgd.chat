import { Transform } from 'class-transformer';
import {
  IsBoolean,
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

  @IsOptional()
  @IsString()
  AUTH_COOKIE_DOMAIN?: string;

  @IsOptional()
  @IsString()
  AUTH_COOKIE_NAME?: string;

  @IsOptional()
  @IsString({ each: true })
  @Transform(({ value }) => value.split(',').map((s) => s.trim()))
  CORS_ORIGINS: string;

  @IsOptional()
  @IsString({ each: true })
  @Transform(({ value }) => value.split(',').map((s) => s.trim()))
  API_ACCESS_WHITELIST: string[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => parseOptionalBoolean(value, true))
  METRICS_ENABLED?: boolean = true;

  @IsOptional()
  @IsString()
  METRICS_PATH?: string = '/metrics';

  @IsString()
  @ValidateIf((o) => o.NODE_ENV === Environment.Production && o.METRICS_ENABLED)
  METRICS_TOKEN?: string;

  @IsOptional()
  @IsString()
  OPENAI_BASE_URL?: string;

  @IsOptional()
  @IsString()
  OPENAI_ACCESS_TOKEN?: string;
}

function parseOptionalBoolean(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  if (typeof value === 'boolean') return value;

  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}
