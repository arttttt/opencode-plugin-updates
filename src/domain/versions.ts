/**
 * Version comparison by semver, not by text: "v1.2.3" and "1.2.3" are one
 * version, and "1.10.0" is newer than "1.9.0".
 *
 * npm versions are always valid semver; anything else is compared as text.
 */

function order(a: string, b: string): number | null {
  try {
    return Bun.semver.order(a, b);
  } catch {
    return null;
  }
}

/** Whether `candidate` is a newer version than `current`. */
export function isNewer(candidate: string, current: string): boolean {
  const result = order(candidate, current);
  return result === null ? candidate !== current : result > 0;
}

/** Whether `a` and `b` name the same version. */
export function isSameVersion(a: string, b: string): boolean {
  const result = order(a, b);
  return result === null ? a === b : result === 0;
}
