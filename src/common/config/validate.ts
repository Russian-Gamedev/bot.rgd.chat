import { plainToInstance } from 'class-transformer';
import { type ValidationError, validateSync } from 'class-validator';

import { EnvironmentVariables } from '#config/env';

function formatErrors(errors: ValidationError[]): string {
  const seen = new Set<string>();

  function walk(error: ValidationError, prefix: string): string {
    const property = `${prefix}${error.property}`;

    if (seen.has(property)) return '';
    seen.add(property);

    const lines: string[] = [];

    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        lines.push(`  - ${property}: ${message}`);
      }
    }

    if (error.children?.length) {
      for (const child of error.children) {
        lines.push(walk(child, `${property}.`));
      }
    }

    return lines.join('\n');
  }

  return errors.map((error) => walk(error, '')).join('\n');
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, { forbidUnknownValues: false });

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${formatErrors(errors)}`);
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(
      `Config NODE_ENV=${validatedConfig.NODE_ENV}, raw NODE_ENV=${process.env.NODE_ENV ?? 'missing'}`,
    );
  }

  return validatedConfig;
}
