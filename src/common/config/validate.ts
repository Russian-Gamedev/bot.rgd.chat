import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { EnvironmentVariables } from '#config/env';

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, { forbidUnknownValues: false });

  if (errors.length > 0) {
    throw new Error(
      `Error while parsing env variables\n` +
        errors.map((error) => error.toString(true, true, '', true)).join(''),
    );
  }

  console.log(
    `Config NODE_ENV=${validatedConfig.NODE_ENV}, raw NODE_ENV=${process.env.NODE_ENV ?? 'missing'}`,
  );

  return validatedConfig;
}
