import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';

import { trimString } from '#lib/utils';

import { GolderSlug, GolderTags } from './golder-validators';

export class ImportGolderDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(1024)
  url: string;

  @GolderSlug()
  slug: string;

  @GolderTags()
  tags: string[];
}
