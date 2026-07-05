import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import { Permission } from '#core/permissions/permissions.types';

export class ActorPermissionsDto {
  @ApiProperty({ enum: Permission, isArray: true })
  global: Permission[];

  @ApiProperty({
    additionalProperties: {
      type: 'array',
      items: { enum: Object.values(Permission), type: 'string' },
    },
    description: 'Permissions grouped by Discord Guild ID.',
    type: 'object',
  })
  guilds: Record<string, Permission[]>;
}

export class PublicUserProfileDto {
  @ApiProperty({
    description: 'Discord User ID.',
    example: '123456789012345678',
  })
  @Expose({ name: 'user_id' })
  @Transform(({ obj, value }) => (value ?? obj.id).toString(), {
    toClassOnly: true,
  })
  id: string;

  @ApiProperty({ example: 'damir' })
  @Expose()
  username: string;

  @ApiPropertyOptional({ nullable: true, example: 'Damir' })
  @Expose()
  nickname: string | null;

  @ApiProperty({ example: 'https://cdn.discordapp.com/avatars/...' })
  @Expose()
  avatar_url: string;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  banner: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  banner_alt: string | null;

  @ApiProperty({ example: '#111827' })
  @Expose()
  banner_color: string;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  about: string | null;

  @ApiPropertyOptional({ nullable: true })
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

  @ApiProperty()
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

  @ApiProperty()
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

  @ApiProperty({ example: 5 })
  @Expose({ name: 'activeStreak' })
  @Transform(({ obj, value }) => value ?? obj.active_streak, {
    toClassOnly: true,
  })
  active_streak: number;

  @ApiProperty({ example: 30 })
  @Expose({ name: 'maxActiveStreak' })
  @Transform(({ obj, value }) => value ?? obj.max_active_streak, {
    toClassOnly: true,
  })
  max_active_streak: number;
}

export class CurrentUserProfileDto extends PublicUserProfileDto {
  @ApiProperty({ type: ActorPermissionsDto })
  permissions: ActorPermissionsDto;
}
