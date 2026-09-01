/**
 * Human-readable rendering of stale-plugin notifications.
 *
 * Pure formatting: no IO, so the exact wording is testable.
 */

import type { PluginStatus, UpdateOutcome } from "../domain/entities";

function versionText(version: string | null): string {
  return version ?? "unknown";
}

/** Full table for the /plugins-check command: every plugin and its state. */
export function renderCheckReport(statuses: readonly PluginStatus[]): string {
  const lines = statuses.map((status) => {
    const arrow = status.updateAvailable ? " -> " : " =  ";
    const target = status.updateAvailable ? versionText(status.latest) : "up to date";
    return `- ${status.name}: ${versionText(status.installed)}${arrow}${target}`;
  });
  return ["Plugins:", ...lines].join("\n");
}

/** Table plus the applied updates and a restart hint, for /plugins-update. */
export function renderUpdateReport(outcome: UpdateOutcome): string {
  const base = renderCheckReport(outcome.statuses);
  if (outcome.applied.length === 0) return `${base}\n\nNothing to update.`;
  const applied = outcome.applied.map(({ name, from, to }) => `- ${name}: ${from} -> ${to}`);
  return [base, "", "Updated:", ...applied, "", "Restart OpenCode to load the updated plugins."].join("\n");
}

/** Short toast that names every outdated plugin, or null when all is fresh. */
export function renderStaleToast(statuses: readonly PluginStatus[]): string | null {
  const stale = statuses.filter((status) => status.updateAvailable);
  if (stale.length === 0) return null;
  const list = stale.map((status) => `${status.name} (${versionText(status.installed)} -> ${versionText(status.latest)})`).join(", ");
  return `plugin-updates: ${stale.length} outdated: ${list}`;
}
