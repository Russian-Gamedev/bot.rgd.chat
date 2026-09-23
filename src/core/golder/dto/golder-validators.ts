import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { trimString } from '#lib/utils';
import {
  GOLDER_MAX_TAGS,
  GOLDER_SLUG_MAX_LENGTH,
  GOLDER_SLUG_PATTERN,
  GOLDER_TAG_MAX_LENGTH,
  normalizeTags,
} from '../golder.constants';

const SLUG_MESSAGE =
  'Slug must consist of lowercase latin letters, digits and dashes.';

/** Validates the golder media slug: lowercase latin letters, digits and dashes. */
export function GolderSlug(isOptional = false): PropertyDecorator {
  const optional = isOptional ? [IsOptional()] : [];
  return applyDecorators(
    Transform(trimString),
    ...optional,
    IsString(),
    Matches(GOLDER_SLUG_PATTERN, { message: SLUG_MESSAGE }),
    MaxLength(GOLDER_SLUG_MAX_LENGTH),
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
