/** Splits seconds into calendar-ish time units used by bot messages. */
export function getTimeInfo(t: number) {
  const years = Math.floor(t / 31_536_000);
  t -= years * 31_536_000;
  const month = Math.floor(t / 2_592_000);
  t -= month * 2_592_000;
  const weeks = Math.floor(t / 604800);
  t -= weeks * 604800;
  const days = Math.floor(t / 86400);
  t -= days * 86400;
  const hours = Math.floor(t / 3600);
  t -= hours * 3600;
  const minutes = Math.floor(t / 60);
  t -= minutes * 60;
  const seconds = t;

  return {
    years,
    month,
    weeks,
    days,
    hours,
    minutes,
    seconds,
  };
}

type TimeKeys = keyof ReturnType<typeof getTimeInfo>;

const formatMap: Record<TimeKeys, (value: number) => string> = {
  years: (value) => `${value} год.`,
  month: (value) => `${value} мес.`,
  weeks: (value) => `${value} нед.`,
  days: (value) => `${value} дн.`,
  hours: (value) => `${value} ч.`,
  minutes: (value) => `${value} мин.`,
  seconds: (value) => `${value} сек.`,
};

/** Formats seconds into a compact Russian duration string. */
export function formatTime(t: number | bigint, parts = -1) {
  const time = getTimeInfo(Math.abs(Number(t)));
  let result = '';
  const keys = Object.keys(time) as TimeKeys[];
  for (const key of keys) {
    if (time[key] > 0 && (parts === -1 || parts > 0)) {
      result += formatMap[key](time[key]) + ' ';
      if (parts > 0) parts--;
    }
  }
  return result.trim();
}
