import { GolderName, GolderTags } from './golder-validators';

export class UpdateGolderMediaDto {
  @GolderName(true)
  name?: string;

  @GolderTags(true)
  tags?: string[];
}
