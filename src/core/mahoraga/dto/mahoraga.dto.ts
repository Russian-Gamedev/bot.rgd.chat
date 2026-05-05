import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { MahoragaCaseEntity } from '../entities/mahoraga-case.entity';
import { MahoragaCaseStatus, MahoragaReason } from '../mahoraga.types';

export class MahoragaListQueryDto {
  @ApiPropertyOptional({ enum: MahoragaCaseStatus })
  @IsOptional()
  @IsEnum(MahoragaCaseStatus)
  status?: MahoragaCaseStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  guild_id?: string;

  @ApiPropertyOptional({ enum: MahoragaReason })
  @IsOptional()
  @IsEnum(MahoragaReason)
  reason?: MahoragaReason;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit = 50;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  offset = 0;
}

export class ManualMahoragaCaseDto {
  @ApiProperty({ description: 'Discord User ID' })
  @IsNumberString()
  user_id: string;

  @ApiPropertyOptional({ description: 'Discord Guild ID for audit context' })
  @IsOptional()
  @IsNumberString()
  guild_id?: string;

  @ApiPropertyOptional({ description: 'Manual softban note' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class MahoragaUnbanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class MahoragaCaseResponseDto {
  id: string;
  user_id: string;
  status: MahoragaCaseStatus;
  reason: MahoragaReason;
  source_guild_id: string | null;
  source_channel_id: string | null;
  source_message_id: string | null;
  matched_value: string | null;
  evidence: MahoragaCaseEntity['evidence'];
  detection_count: number;
  detected_at: Date;
  last_detected_at: Date;
  verification_expires_at: Date | null;
  pardoned_at: Date | null;
  pardoned_by: string | null;
  pardon_reason: string | null;
  created_at: Date;
  updated_at: Date;

  static fromEntity(mahoragaCase: MahoragaCaseEntity) {
    const dto = new MahoragaCaseResponseDto();
    dto.id = mahoragaCase.id;
    dto.user_id = mahoragaCase.user_id.toString();
    dto.status = mahoragaCase.status;
    dto.reason = mahoragaCase.reason;
    dto.source_guild_id = mahoragaCase.source_guild_id?.toString() ?? null;
    dto.source_channel_id = mahoragaCase.source_channel_id?.toString() ?? null;
    dto.source_message_id = mahoragaCase.source_message_id?.toString() ?? null;
    dto.matched_value = mahoragaCase.matched_value;
    dto.evidence = mahoragaCase.evidence;
    dto.detection_count = mahoragaCase.detection_count;
    dto.detected_at = mahoragaCase.detected_at;
    dto.last_detected_at = mahoragaCase.last_detected_at;
    dto.verification_expires_at = mahoragaCase.verification_expires_at;
    dto.pardoned_at = mahoragaCase.pardoned_at;
    dto.pardoned_by = mahoragaCase.pardoned_by?.toString() ?? null;
    dto.pardon_reason = mahoragaCase.pardon_reason;
    dto.created_at = mahoragaCase.createdAt;
    dto.updated_at = mahoragaCase.updatedAt;
    return dto;
  }
}
