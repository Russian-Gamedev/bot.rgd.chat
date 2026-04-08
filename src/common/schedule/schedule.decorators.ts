import { SetMetadata } from '@nestjs/common';

import {
  SCHEDULE_CRON_METADATA,
  SCHEDULE_INTERVAL_METADATA,
  SCHEDULE_TIMEOUT_METADATA,
} from './schedule.constants';

export interface CronOptions {
  name?: string;
  timeZone?: string;
}

export interface CronMetadata {
  cronExpression: string;
  options: CronOptions;
}

export interface IntervalOptions {
  fireOnStart?: boolean;
}

export interface IntervalMetadata {
  name?: string;
  timeout: number;
  options: IntervalOptions;
}

export interface TimeoutMetadata {
  name?: string;
  timeout: number;
}

export function Cron(
  cronExpression: string,
  options?: CronOptions,
): MethodDecorator {
  const metadata: CronMetadata = { cronExpression, options: options ?? {} };
  return SetMetadata(SCHEDULE_CRON_METADATA, metadata);
}

export function Interval(
  timeout: number,
  options?: IntervalOptions,
): MethodDecorator;
export function Interval(
  name: string,
  timeout: number,
  options?: IntervalOptions,
): MethodDecorator;
export function Interval(
  nameOrTimeout: string | number,
  maybeTimeoutOrOptions?: number | IntervalOptions,
  maybeOptions?: IntervalOptions,
): MethodDecorator {
  const name = typeof nameOrTimeout === 'string' ? nameOrTimeout : undefined;
  const timeout =
    typeof nameOrTimeout === 'number'
      ? nameOrTimeout
      : (maybeTimeoutOrOptions as number);
  const options: IntervalOptions =
    (typeof nameOrTimeout === 'number'
      ? (maybeTimeoutOrOptions as IntervalOptions | undefined)
      : maybeOptions) ?? {};
  const metadata: IntervalMetadata = { name, timeout, options };
  return SetMetadata(SCHEDULE_INTERVAL_METADATA, metadata);
}

export function Timeout(timeout: number): MethodDecorator;
export function Timeout(name: string, timeout: number): MethodDecorator;
export function Timeout(
  nameOrTimeout: string | number,
  maybeTimeout?: number,
): MethodDecorator {
  const name = typeof nameOrTimeout === 'string' ? nameOrTimeout : undefined;
  const timeout =
    typeof nameOrTimeout === 'number' ? nameOrTimeout : maybeTimeout!;
  const metadata: TimeoutMetadata = { name, timeout };
  return SetMetadata(SCHEDULE_TIMEOUT_METADATA, metadata);
}
