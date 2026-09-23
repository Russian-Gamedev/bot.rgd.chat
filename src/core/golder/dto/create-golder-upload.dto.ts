import { IsNumber, IsString, Matches, Max, Min } from 'class-validator';

import {
  GOLDER_CONTENT_TYPE_PATTERN,
  GOLDER_MAX_UPLOAD_BYTES,
} from '../golder.constants';
import { GolderSlug, GolderTags } from './golder-validators';

export class CreateGolderUploadDto {
  @GolderSlug()
  slug: string;

  @GolderTags()
  tags: string[];

  @IsString()
  @Matches(GOLDER_CONTENT_TYPE_PATTERN, {
    message: 'Only image, video and audio content types are allowed.',
  })
  contentType: string;

  @IsNumber()
  @Min(1)
  @Max(GOLDER_MAX_UPLOAD_BYTES)
  sizeBytes: number;
}
