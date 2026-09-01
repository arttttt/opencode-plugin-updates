/**
 * Which plugins a check run should consider.
 *
 * Pure decision logic, trivially testable.
 */

export interface PluginFilter {
  /** Whitelist: when non-empty, only these package names are considered. */
  readonly packages?: readonly string[];
  /** Blacklist: these package names are never considered. */
  readonly exclude?: readonly string[];
}

export function shouldConsider(name: string, filter: PluginFilter): boolean {
  if (filter.packages?.length) return filter.packages.includes(name);
  if (filter.exclude?.length) return !filter.exclude.includes(name);
  return true;
}
