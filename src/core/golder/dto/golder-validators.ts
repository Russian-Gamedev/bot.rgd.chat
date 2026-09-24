import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { trimString } from '#lib/utils';
import {
  GOLDER_MAX_TAGS,
  GOLDER_NAME_MAX_LENGTH,
  GOLDER_TAG_MAX_LENGTH,
  normalizeTags,
} from '../golder.constants';

/** Validates the golder media display name: any language, 1..200 chars. */
export function GolderName(isOptional = false): PropertyDecorator {
  const optional = isOptional ? [IsOptional()] : [];
  return applyDecorators(
    Transform(trimString),
    ...optional,
    IsString(),
    MinLength(1, { message: 'Name is required.' }),
    MaxLength(GOLDER_NAME_MAX_LENGTH),
  );
}

/** Validates golder tags: string array, normalized (trim + lowercase + dedupe). */
export function GolderTags(isOptional = false): PropertyDecorator {
  const optional = isOptional ? [IsOptional()] : [];
  return applyDecorators(
    Transform(({ value }) =>
      Array.isArray(value) ? normalizeTags(value) : value,
    ),
    ...optional,
    IsArray(),
    ArrayMaxSize(GOLDER_MAX_TAGS),
    IsString({ each: true }),
    MaxLength(GOLDER_TAG_MAX_LENGTH, { each: true }),
  );
}
