/**
 * Check installed plugins against the npm registry.
 *
 * The single application use case: read-only comparison. Knows nothing
 * about fs, fetch, or OpenCode — every effect goes through a port.
 */

import type { InstalledPlugin, PluginStatus } from "../domain/entities";
import type { NpmRegistry, PackagesCache } from "./ports";
import type { PluginFilter } from "./policy";
import { shouldConsider } from "./policy";

export interface CheckDependencies {
  readonly cache: PackagesCache;
  readonly registry: NpmRegistry;
}

/** Pure core of the comparison step, extracted for direct testing. */
export function toStatus(plugin: InstalledPlugin, latest: string | null): PluginStatus {
  const updateAvailable = plugin.installed !== null && latest !== null && plugin.installed !== latest;
  return { name: plugin.name, installed: plugin.installed, latest, updateAvailable };
}

export async function checkPlugins(deps: CheckDependencies, filter: PluginFilter): Promise<PluginStatus[]> {
  const installed = (await deps.cache.list()).filter((plugin) => shouldConsider(plugin.name, filter));
  return Promise.all(installed.map(async (plugin) => toStatus(plugin, await deps.registry.latest(plugin.name))));
}
