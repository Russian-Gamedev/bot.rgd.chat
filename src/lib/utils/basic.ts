/** nothing. it's like they don't create games in RGD.. */
export function noop() {
  // do nothing
}

/** Casts an unknown value when runtime validation is handled elsewhere. */
export function cast<T>(value: unknown) {
  return value as T;
}

/** Returns a random item from a readonly array. */
export function pickRandom<T>(array: readonly T[]): T {
  const { length } = array;
  return array[Math.floor(Math.random() * length)];
}

/**
 * Picks an item with probability proportional to its weight.
 * Weights are expected to be non-negative.
 */
export function pickWeighted<T>(
  items: readonly T[],
  weight: (item: T) => number,
): T {
  const weights = items.map(weight);
  let roll = Math.random() * weights.reduce((sum, w) => sum + w, 0);

  for (const [index, item] of items.entries()) {
    roll -= weights[index]!;
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

/** Returns a random item from a readonly array. */
export function choose<T>(array: readonly T[]): T {
  const index = Math.floor(Math.random() * array.length);
  return array[index];
}

/** Produces a deterministic non-negative 32-bit-ish integer from a string. */
export function hashStringToInt(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}
