/**
 * Check installed plugins against the npm registry and optionally apply updates.
 *
 * The single application use case. Knows nothing about fs, fetch, or OpenCode:
 * every effect goes through a port.
 */

import type { AppliedUpdate, CheckOutcome, InstalledPlugin, PluginStatus } from "../domain/entities";
import type { Changelog, NpmRegistry, PackagesCache, WorkspaceUpdater } from "./ports";
import type { PluginFilter } from "./policy";
import { shouldConsider } from "./policy";

export interface CheckDependencies {
  readonly cache: PackagesCache;
  readonly registry: NpmRegistry;
  readonly updater: WorkspaceUpdater;
  readonly changelog: Changelog;
}

/** Pure core of the comparison step, extracted for direct testing. */
export function toStatus(plugin: InstalledPlugin, latest: string | null): PluginStatus {
  const updateAvailable = plugin.installed !== null && latest !== null && plugin.installed !== latest;
  return { name: plugin.name, installed: plugin.installed, latest, updateAvailable };
}

export async function checkPlugins(
  deps: CheckDependencies,
  filter: PluginFilter,
  autoUpdate: boolean,
): Promise<CheckOutcome> {
  const installed = (await deps.cache.list()).filter((p) => shouldConsider(p.name, filter));

  const statuses = await Promise.all(
    installed.map(async (plugin) => toStatus(plugin, await deps.registry.latest(plugin.name))),
  );

  if (!autoUpdate) return { statuses, applied: [] };

  const applied: AppliedUpdate[] = [];
  for (const status of statuses) {
    if (!status.updateAvailable) continue;
    const plugin = installed.find((p) => p.name === status.name);
    if (!plugin) continue;
    if (await deps.updater.apply(plugin, status.latest!)) {
      applied.push({ name: status.name, from: status.installed!, to: status.latest! });
    }
  }
  if (applied.length > 0) await deps.changelog.append(applied);

  return { statuses, applied };
}
