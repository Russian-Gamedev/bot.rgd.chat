import { Expose, Type } from 'class-transformer';
import { PublicUserProfileInfoDto } from './public-profile-info.dto';

export class PublicUserProfileTagDto {
  @Expose()
  name: string;

  @Expose()
  color: string;

  @Expose()
  background: string;

  @Expose()
  description: string;
}

export class PublicUserProfileDto {
  @Expose()
  id: string;

  @Expose()
  username: string;

  @Expose()
  nickname: string | null;

  @Expose()
  avatarUrl: string;

  @Expose()
  banner: string | null;

  @Expose()
  bannerAlt: string | null;

  @Expose()
  bannerColor: string;

  @Expose()
  about: string | null;

  @Expose()
  @Type(() => PublicUserProfileInfoDto)
  info: PublicUserProfileInfoDto;

  @Expose()
  birthDate: Date | null;

  @Expose()
  firstJoinedAt: Date | null;

  @Expose()
  lastActiveAt: Date | null;

  @Expose()
  activeStreak: number;

  @Expose()
  maxActiveStreak: number;

  @Expose()
  banCount: number;

  @Expose()
  activityPublic: boolean;

  @Expose()
  @Type(() => PublicUserProfileTagDto)
  tags: PublicUserProfileTagDto[];
}
