import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { PublicUserProfileInfoDto } from './public-profile-info.dto';

export class PublicUserProfileTagDto {
  @Expose()
  @ApiProperty({ example: 'Admin' })
  name: string;

  @Expose()
  @ApiProperty({ example: '#ffffff' })
  color: string;

  @Expose()
  @ApiProperty({ example: '#5865f229' })
  background: string;

  @Expose()
  @ApiProperty({ example: 'Роль на сервере RGD' })
  description: string;
}

export class PublicUserProfileDto {
  @Expose()
  @ApiProperty({
    description: 'Discord User ID.',
    example: '123456789012345678',
  })
  id: string;

  @Expose()
  @ApiProperty({ example: 'damir' })
  username: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true, example: 'Damir' })
  nickname: string | null;

  @Expose()
  @ApiProperty({ example: 'https://cdn.discordapp.com/avatars/...' })
  avatarUrl: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  banner: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  bannerAlt: string | null;

  @Expose()
  @ApiProperty({ example: '#111827' })
  bannerColor: string;

  @Expose()
  @ApiPropertyOptional({ nullable: true, deprecated: true })
  about: string | null;

  @Expose()
  @ApiProperty({ type: PublicUserProfileInfoDto })
  @Type(() => PublicUserProfileInfoDto)
  info: PublicUserProfileInfoDto;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  birthDate: Date | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  firstJoinedAt: Date | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  lastActiveAt: Date | null;

  @Expose()
  @ApiProperty({ example: 5 })
  activeStreak: number;

  @Expose()
  @ApiProperty({ example: 30 })
  maxActiveStreak: number;

  @Expose()
  @ApiProperty({ example: 2 })
  banCount: number;

  @Expose()
  @ApiProperty({ type: [PublicUserProfileTagDto] })
  @Type(() => PublicUserProfileTagDto)
  tags: PublicUserProfileTagDto[];
}
