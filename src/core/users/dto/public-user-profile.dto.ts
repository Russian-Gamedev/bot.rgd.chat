import { Expose, Transform, Type } from 'class-transformer';

export class PublicUserProfileDto {
  @Expose({ name: 'user_id' })
  @Transform(({ obj, value }) => (value ?? obj.id).toString(), {
    toClassOnly: true,
  })
  id: string;

  @Expose()
  username: string;

  @Expose()
  nickname: string | null;

  @Expose()
  avatar_url: string;

  @Expose()
  banner: string | null;

  @Expose()
  banner_alt: string | null;

  @Expose()
  banner_color: string;

  @Expose()
  about: string | null;

  @Expose({ name: 'birthDate' })
  @Type(() => Date)
  @Transform(
    ({ obj, value }) => {
      const date = value ?? obj.birth_date;
      return date == null ? null : date instanceof Date ? date : new Date(date);
    },
    { toClassOnly: true },
  )
  birth_date: Date | null;

  @Expose({ name: 'firstJoinedAt' })
  @Type(() => Date)
  @Transform(
    ({ obj, value }) => {
      const date = value ?? obj.first_joined_at;
      return date instanceof Date ? date : new Date(date);
    },
    { toClassOnly: true },
  )
  first_joined_at: Date;

  @Expose({ name: 'lastActiveAt' })
  @Type(() => Date)
  @Transform(
    ({ obj, value }) => {
      const date = value ?? obj.last_active_at;
      return date instanceof Date ? date : new Date(date);
    },
    { toClassOnly: true },
  )
  last_active_at: Date;

  @Expose({ name: 'activeStreak' })
  @Transform(({ obj, value }) => value ?? obj.active_streak, {
    toClassOnly: true,
  })
  active_streak: number;

  @Expose({ name: 'maxActiveStreak' })
  @Transform(({ obj, value }) => value ?? obj.max_active_streak, {
    toClassOnly: true,
  })
  max_active_streak: number;
}
