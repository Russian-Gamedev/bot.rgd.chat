import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { trimString } from '#lib/utils';

import {
  GOLDER_DEFAULT_PAGE_LIMIT,
  GOLDER_MAX_PAGE_LIMIT,
} from '../golder.constants';

export class ListGolderQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  tags?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  search?: string;

  @Transform(({ value }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(GOLDER_MAX_PAGE_LIMIT)
  limit: number = GOLDER_DEFAULT_PAGE_LIMIT;

  @Transform(({ value }) => Number(value))
  @IsOptional()
  @IsInt()
  @Min(0)
  offset: number = 0;

  get tagList(): string[] {
    if (!this.tags) return [];
    return this.tags
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
  }
}
