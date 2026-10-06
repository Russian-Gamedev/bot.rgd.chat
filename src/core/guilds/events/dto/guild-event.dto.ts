import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { GuildEvents } from '#config/guilds';

export class CreateEventDto {
  @IsEnum(GuildEvents)
  event: GuildEvents;

  @IsString()
  @MaxLength(2000)
  message: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsOptional()
  attachments?: string[];
}

export class UpdateEventDto {
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  message?: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @IsOptional()
  attachments?: string[];
}

export class GuildEventAuthorDto {
  id: string;

  username: string;

  avatar_url: string;
}

export class GuildEventDto {
  id: string;

  event: GuildEvents;

  message: string;

  attachments: string[] | null;

  author: GuildEventAuthorDto;
}

export class AddEventResponseDto {
  id: string;

  event: GuildEvents;

  message: string;

  attachments: string[] | null;

  author: GuildEventAuthorDto;

  balance_after: string;
}

export class GuildEventMessageDto {
  message: string;
}

export class UpdateEventParamsDto {
  @IsUUID()
  id: string;
}
