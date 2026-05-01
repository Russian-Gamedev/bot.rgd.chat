import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import type {
  CrossPostSettings,
  CrossPostSourceConfig,
} from '../types/crosspost.types';
import { CrossPostSourceKind } from '../types/crosspost.types';
import { CrossPostTargetKind } from '../types/crosspost.types';

export class CrossPostTargetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ enum: CrossPostTargetKind })
  @IsEnum(CrossPostTargetKind)
  kind: CrossPostTargetKind;

  @ApiProperty()
  @IsString()
  webhookUrl: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class CrossPostSettingsDto implements CrossPostSettings {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  relayEdits = true;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  relayDeletes = true;

  @ApiPropertyOptional({ enum: ['none'], default: 'none' })
  @IsOptional()
  @IsIn(['none'])
  allowedMentions = 'none' as const;
}

export class CreateCrossPostRouteDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ enum: CrossPostSourceKind })
  @IsEnum(CrossPostSourceKind)
  sourceKind: CrossPostSourceKind;

  @ApiProperty({
    description:
      'Discord: { guildId, channelId }. Telegram: { chatId, chatTitle? }',
  })
  @IsObject()
  sourceConfig: CrossPostSourceConfig;

  @ApiProperty({ type: [CrossPostTargetDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CrossPostTargetDto)
  targets: CrossPostTargetDto[];

  @ApiPropertyOptional({ type: CrossPostSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CrossPostSettingsDto)
  settings?: CrossPostSettingsDto;
}

export class UpdateCrossPostRouteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: CrossPostSourceKind })
  @IsOptional()
  @IsEnum(CrossPostSourceKind)
  sourceKind?: CrossPostSourceKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  sourceConfig?: CrossPostSourceConfig;

  @ApiPropertyOptional({ type: [CrossPostTargetDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CrossPostTargetDto)
  targets?: CrossPostTargetDto[];

  @ApiPropertyOptional({ type: CrossPostSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CrossPostSettingsDto)
  settings?: CrossPostSettingsDto;
}
