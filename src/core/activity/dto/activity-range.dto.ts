import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

import { ACTIVITY_RANGE_MONTHS } from '../activity-period';

export class ActivityRangeQueryDto {
  @Transform(({ value }) => Number(value))
  @IsOptional()
  @IsIn(ACTIVITY_RANGE_MONTHS)
  months?: number;
}
