import { UserProfileEntity } from '../entities/user-profile.entity';

export interface PublicUserProfileDto {
  id: string;
  username: string;
  nickname: string | null;
  avatar_url: string;
  banner: string | null;
  banner_alt: string | null;
  banner_color: string;
  about: string | null;
  birth_date: Date | null;
  first_joined_at: Date;
  last_active_at: Date;
  active_streak: number;
  max_active_streak: number;
}

export function toPublicUserProfileDto(
  profile: UserProfileEntity,
): PublicUserProfileDto {
  return {
    id: profile.user_id.toString(),
    username: profile.username,
    nickname: profile.nickname,
    avatar_url: profile.avatar_url,
    banner: profile.banner,
    banner_alt: profile.banner_alt,
    banner_color: profile.banner_color,
    about: profile.about,
    birth_date: profile.birthDate,
    first_joined_at: profile.firstJoinedAt,
    last_active_at: profile.lastActiveAt,
    active_streak: profile.activeStreak,
    max_active_streak: profile.maxActiveStreak,
  };
}
