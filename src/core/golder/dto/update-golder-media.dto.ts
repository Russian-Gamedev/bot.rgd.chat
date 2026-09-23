import { GolderSlug, GolderTags } from './golder-validators';

export class UpdateGolderMediaDto {
  @GolderSlug(true)
  slug?: string;

  @GolderTags(true)
  tags?: string[];
}
