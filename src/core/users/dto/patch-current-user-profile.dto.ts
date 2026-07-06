import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  MAX_PUBLIC_PROFILE_ABOUT_LENGTH,
  MAX_PUBLIC_PROFILE_LINK_ICON_LENGTH,
  MAX_PUBLIC_PROFILE_LINK_LABEL_LENGTH,
  MAX_PUBLIC_PROFILE_LINK_URL_LENGTH,
  MAX_PUBLIC_PROFILE_LINKS,
} from '../constants/public-profile.constants';

export class PatchPublicProfileLinkDto {
  @ApiPropertyOptional({ example: 'GitHub' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PUBLIC_PROFILE_LINK_LABEL_LENGTH)
  label: string;

  @ApiPropertyOptional({ example: 'github' })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PUBLIC_PROFILE_LINK_ICON_LENGTH)
  @Matches(/^[a-z0-9_-]+$/i)
  icon: string;

  @ApiPropertyOptional({ example: 'https://github.com/alice' })
  @Transform(trimString)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(MAX_PUBLIC_PROFILE_LINK_URL_LENGTH)
  url: string;
}

export class PatchPublicProfileInfoDto {
  @ApiPropertyOptional({ nullable: true, example: 'Game developer.' })
  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PUBLIC_PROFILE_ABOUT_LENGTH)
  about?: string | null;

  @ApiPropertyOptional({ type: [PatchPublicProfileLinkDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PUBLIC_PROFILE_LINKS)
  @ValidateNested({ each: true })
  @Type(() => PatchPublicProfileLinkDto)
  links?: PatchPublicProfileLinkDto[];
}

export class PatchCurrentUserProfileDto {
  @ApiPropertyOptional({
    nullable: true,
    example: 'https://example.com/banner-alt.png',
  })
  @Transform(emptyStringToNull)
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(MAX_PUBLIC_PROFILE_LINK_URL_LENGTH)
  bannerAlt?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '2000-01-02T00:00:00.000Z' })
  @Transform(nullableDate)
  @IsOptional()
  @IsDate()
  birthDate?: Date | null;

  @ApiPropertyOptional({ type: PatchPublicProfileInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PatchPublicProfileInfoDto)
  info?: PatchPublicProfileInfoDto;
}

function trimString({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim() : value;
}

function emptyStringToNull({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nullableDate({ value }: { value: unknown }) {
  if (value == null) return value;
  if (value instanceof Date) return value;

  return new Date(String(value));
}
