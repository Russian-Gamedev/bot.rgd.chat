import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';

import { trimString } from '#lib/utils';

import { GolderName, GolderTags } from './golder-validators';

export class ImportGolderDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(1024)
  url: string;

  @GolderName()
  name: string;

  @GolderTags()
  tags: string[];
}
