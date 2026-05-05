/** Formats a coin amount with Russian locale separators. */
export function formatCoins(amount: bigint | number): string {
  return Number(amount).toLocaleString('ru-RU');
}
