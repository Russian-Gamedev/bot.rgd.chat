import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class PublicUserProfileLinkDto {
  @Expose()
  @ApiProperty({ example: 'GitHub' })
  label: string;

  @Expose()
  @ApiProperty({ example: 'github' })
  icon: string;

  @Expose()
  @ApiProperty({ example: 'https://github.com/alice' })
  url: string;
}

export class PublicUserProfileInfoDto {
  @Expose()
  @ApiPropertyOptional({ nullable: true, example: 'Game developer.' })
  about: string | null;

  @Expose()
  @ApiProperty({ type: [PublicUserProfileLinkDto] })
  @Type(() => PublicUserProfileLinkDto)
  links: PublicUserProfileLinkDto[];
}
