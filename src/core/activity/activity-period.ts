export const ACTIVITY_TIME_ZONE = 'Europe/Moscow';

export enum ActivityPeriod {
  Day = 'day',
  Week = 'week',
  Month = 'month',
}

const MOSCOW_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: ACTIVITY_TIME_ZONE,
  year: 'numeric',
});

export function toMoscowDateKey(date: Date): string {
  const parts = MOSCOW_DATE_FORMATTER.formatToParts(date);
  const year = getDatePart(parts, 'year');
  const month = getDatePart(parts, 'month');
  const day = getDatePart(parts, 'day');

  return `${year}-${month}-${day}`;
}

export function getActivityPeriodRange(
  period: ActivityPeriod,
  now = new Date(),
): [string, string] {
  const end = addDaysToDateKey(toMoscowDateKey(now), 1);
  const days = {
    [ActivityPeriod.Day]: 1,
    [ActivityPeriod.Week]: 7,
    [ActivityPeriod.Month]: 30,
  }[period];
  const start = addDaysToDateKey(end, -days);

  return [start, end];
}

export function moscowDateKeyToStartDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00+03:00`);
}

export const ACTIVITY_RANGE_MONTHS = [3, 6, 12] as const;
export const DEFAULT_ACTIVITY_RANGE_MONTHS = 12;

export function getActivityRange(
  months: number,
  now = new Date(),
): [string, string] {
  const dateKey = toMoscowDateKey(now);
  const end = addDaysToDateKey(dateKey, 1);
  const start = subtractMonthsFromDateKey(dateKey, months);

  return [start, end];
}

export function getRecentDaysRange(
  days: number,
  now = new Date(),
): [string, string] {
  const dateKey = toMoscowDateKey(now);
  return [addDaysToDateKey(dateKey, -(days - 1)), addDaysToDateKey(dateKey, 1)];
}

function subtractMonthsFromDateKey(dateKey: string, months: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 - months, day));

  return date.toISOString().slice(0, 10);
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return date.toISOString().slice(0, 10);
}

function getDatePart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) throw new Error(`Missing ${type} in Moscow date formatter`);

  return value;
}
