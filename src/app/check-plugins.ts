/**
 * Application use cases: read-only checking and manual updating.
 *
 * Knows nothing about fs, fetch, or OpenCode — every effect goes
 * through a port.
 */

import type { AppliedUpdate, InstalledPlugin, PluginStatus, UpdateOutcome } from "../domain/entities";
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

/** Pure core of the comparison step, extracted for direct testing. */
export function toStatus(plugin: InstalledPlugin, latest: string | null): PluginStatus {
  const updateAvailable = plugin.installed !== null && latest !== null && plugin.installed !== latest;
  return { name: plugin.name, installed: plugin.installed, latest, updateAvailable };
}

/** Shared comparison pipeline for both use cases. */
async function collect(deps: CheckDependencies, filter: PluginFilter) {
  const installed = (await deps.cache.list()).filter((plugin) => shouldConsider(plugin.name, filter));
  const statuses = await Promise.all(
    installed.map(async (plugin) => toStatus(plugin, await deps.registry.latest(plugin.name))),
  );
  return { installed, statuses };
}

/** Read-only: reports what is stale, changes nothing. */
export async function checkPlugins(deps: CheckDependencies, filter: PluginFilter): Promise<PluginStatus[]> {
  return (await collect(deps, filter)).statuses;
}

/** Manual: applies pending updates, sequentially — installs never race. */
export async function updatePlugins(deps: UpdateDependencies, filter: PluginFilter): Promise<UpdateOutcome> {
  const { installed, statuses } = await collect(deps, filter);
  const applied: AppliedUpdate[] = [];
  for (const status of statuses) {
    if (!status.updateAvailable) continue;
    const plugin = installed.find((candidate) => candidate.name === status.name);
    if (plugin === undefined) continue;
    if (await deps.updater.apply(plugin, status.latest!)) {
      applied.push({ name: status.name, from: status.installed!, to: status.latest! });
    }
  }
  return { statuses, applied };
}
