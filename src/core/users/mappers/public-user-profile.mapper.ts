import { plainToInstance } from 'class-transformer';
import { CurrentUserProfileDto } from '../dto/current-user-profile.dto';
import {
  PublicUserProfileDto,
  type PublicUserProfileTagDto,
} from '../dto/public-user-profile.dto';
import type { UserProfileEntity } from '../entities/user-profile.entity';
import { normalizePublicProfileInfo } from '../normalizers/public-profile-info.normalizer';

const PUBLIC_USER_PROFILE_DTO_OPTIONS = { excludeExtraneousValues: true };

export function toPublicUserProfileDto(
  profile: UserProfileEntity,
  tags: PublicUserProfileTagDto[] = [],
): PublicUserProfileDto {
  const info = normalizePublicProfileInfo(profile.profileInfo, {
    legacyAbout: profile.about,
  });

  return plainToInstance(
    PublicUserProfileDto,
    {
      id: profile.user_id.toString(),
      username: profile.username,
      nickname: profile.nickname,
      avatarUrl: profile.avatar_url,
      banner: profile.banner,
      bannerAlt: profile.banner_alt,
      bannerColor: profile.banner_color,
      about: info.about,
      info,
      birthDate: toNullableDate(profile.birthDate),
      firstJoinedAt: toNullableDate(profile.firstJoinedAt),
      lastActiveAt: toNullableDate(profile.lastActiveAt),
      activeStreak: profile.activeStreak ?? 0,
      maxActiveStreak: profile.maxActiveStreak ?? 0,
      banCount: profile.banCount ?? 0,
      tags,
    },
    PUBLIC_USER_PROFILE_DTO_OPTIONS,
  );
}

export function toCurrentUserProfileDto(
  profile: UserProfileEntity,
  tags: PublicUserProfileTagDto[],
  permissions: CurrentUserProfileDto['permissions'],
): CurrentUserProfileDto {
  return plainToInstance(
    CurrentUserProfileDto,
    {
      ...toPublicUserProfileDto(profile, tags),
      permissions,
    },
    PUBLIC_USER_PROFILE_DTO_OPTIONS,
  );
}

export function toCachedPublicUserProfileDto(
  value: unknown,
): PublicUserProfileDto | null {
  if (!isObject(value)) return null;

  return plainToInstance(
    PublicUserProfileDto,
    {
      ...value,
      birthDate: toNullableDate(value.birthDate),
      firstJoinedAt: toNullableDate(value.firstJoinedAt),
      lastActiveAt: toNullableDate(value.lastActiveAt),
      activeStreak: value.activeStreak ?? 0,
      maxActiveStreak: value.maxActiveStreak ?? 0,
      banCount: value.banCount ?? 0,
      tags: Array.isArray(value.tags) ? value.tags : [],
    },
    PUBLIC_USER_PROFILE_DTO_OPTIONS,
  );
}

function toNullableDate(value: unknown): Date | null {
  if (value == null) return null;

  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
