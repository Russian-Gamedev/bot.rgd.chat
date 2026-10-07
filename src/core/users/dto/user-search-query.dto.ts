import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { trimString } from '#lib/utils';

export class UserSearchQueryDto {
  @Transform(trimString)
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  q: string;
}
