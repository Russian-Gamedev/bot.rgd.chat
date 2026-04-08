/**
 * Normalize a cron expression from 5-field (@nestjs/schedule format)
 * to 6-field (cronbake format) by prepending `0` for the seconds field.
 */
export function normalizeCronExpression(expression: string): string {
  // Presets start with @, pass them through unchanged
  if (expression.startsWith('@')) {
    return expression;
  }

  const parts = expression.trim().split(/\s+/);
  if (parts.length === 5) {
    return `0 ${expression.trim()}`;
  }
  return expression;
}
