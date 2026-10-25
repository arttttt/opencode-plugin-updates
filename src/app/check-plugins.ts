/**
 * Application use cases: read-only checking and manual updating.
 *
 * Knows nothing about fs, fetch, or OpenCode — every effect goes
 * through a port.
 */

import type { CheckOutcome, InstalledPlugin, PluginStatus, UpdateOutcome, VersionChange } from "../domain/entities";
import { isNewer } from "../domain/versions";
import type { NpmRegistry, PackagesCache, WorkspaceUpdater } from "./ports";
import type { PluginFilter } from "./policy";
import { shouldConsider } from "./policy";

export interface CheckDependencies {
  readonly cache: PackagesCache;
  readonly registry: NpmRegistry;
}

export interface UpdateDependencies extends CheckDependencies {
  readonly updater: WorkspaceUpdater;
}

/**
 * Pure core of the comparison step, extracted for direct testing. An update
 * needs `latest` to be newer, not merely different: a `latest` dist-tag moved
 * back to an older release must not downgrade the plugin. A workspace whose
 * installed version can't be read holds no loadable plugin, so reinstalling
 * `latest` is offered too.
 */
export function toStatus(plugin: InstalledPlugin, latest: string | null): PluginStatus {
  const updateAvailable = latest !== null && (plugin.installed === null || isNewer(latest, plugin.installed));
  return { name: plugin.name, installed: plugin.installed, latest, updateAvailable };
}

/** Shared comparison pipeline for both use cases. */
async function collect(deps: CheckDependencies, filter: PluginFilter) {
  const discovered = await deps.cache.list();
  const installed = discovered.filter((plugin) => shouldConsider(plugin.name, filter));
  const statuses = await Promise.all(
    installed.map(async (plugin) => toStatus(plugin, await deps.registry.latest(plugin.name))),
  );
  return { installed, statuses, discovered: discovered.length };
}

/** Read-only: reports what is stale, changes nothing. */
export async function checkPlugins(deps: CheckDependencies, filter: PluginFilter): Promise<CheckOutcome> {
  const { statuses, discovered } = await collect(deps, filter);
  return { statuses, discovered };
}

/** Progress event emitted before each workspace install. */
export interface UpdateProgress {
  readonly name: string;
  readonly index: number;
  readonly total: number;
}

/** Manual: applies pending updates, sequentially — installs never race. */
export async function updatePlugins(
  deps: UpdateDependencies,
  filter: PluginFilter,
  onProgress?: (progress: UpdateProgress) => void,
): Promise<UpdateOutcome> {
  const { installed, statuses, discovered } = await collect(deps, filter);
  const stale = statuses.filter((status) => status.updateAvailable);
  const applied: VersionChange[] = [];
  const failed: VersionChange[] = [];
  for (const [index, status] of stale.entries()) {
    const plugin = installed.find((candidate) => candidate.name === status.name);
    if (plugin === undefined) continue;
    onProgress?.({ name: status.name, index: index + 1, total: stale.length });
    const update = { name: status.name, from: status.installed, to: status.latest! };
    (await deps.updater.apply(plugin, update.to) ? applied : failed).push(update);
  }
  return { statuses, applied, failed, discovered };
}
