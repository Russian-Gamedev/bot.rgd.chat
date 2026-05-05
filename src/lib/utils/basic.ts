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
