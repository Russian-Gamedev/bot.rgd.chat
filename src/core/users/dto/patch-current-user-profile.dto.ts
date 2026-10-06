import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { trimString } from '#lib/utils';
import {
  MAX_PUBLIC_PROFILE_ABOUT_LENGTH,
  MAX_PUBLIC_PROFILE_LINK_ICON_LENGTH,
  MAX_PUBLIC_PROFILE_LINK_LABEL_LENGTH,
  MAX_PUBLIC_PROFILE_LINK_URL_LENGTH,
  MAX_PUBLIC_PROFILE_LINKS,
} from '../constants/public-profile.constants';

export class PatchPublicProfileLinkDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PUBLIC_PROFILE_LINK_LABEL_LENGTH)
  label: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_PUBLIC_PROFILE_LINK_ICON_LENGTH)
  @Matches(/^[a-z0-9_-]+$/i)
  icon: string;

  @Transform(trimString)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(MAX_PUBLIC_PROFILE_LINK_URL_LENGTH)
  url: string;
}

export class PatchPublicProfileInfoDto {
  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PUBLIC_PROFILE_ABOUT_LENGTH)
  about?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PUBLIC_PROFILE_LINKS)
  @ValidateNested({ each: true })
  @Type(() => PatchPublicProfileLinkDto)
  links?: PatchPublicProfileLinkDto[];
}

export class PatchCurrentUserProfileDto {
  @Transform(emptyStringToNull)
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(MAX_PUBLIC_PROFILE_LINK_URL_LENGTH)
  bannerAlt?: string | null;

  @Transform(nullableDate)
  @IsOptional()
  @IsDate()
  birthDate?: Date | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => PatchPublicProfileInfoDto)
  info?: PatchPublicProfileInfoDto;

  @IsOptional()
  @IsBoolean()
  activityPublic?: boolean;
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
