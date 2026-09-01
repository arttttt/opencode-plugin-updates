/**
 * Human-readable rendering of stale-plugin notifications.
 *
 * Pure formatting: no IO, so the exact wording is testable.
 */

import type { PluginStatus } from "../domain/entities";

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

/** Short toast that names every outdated plugin, or null when all is fresh. */
export function renderStaleToast(statuses: readonly PluginStatus[]): string | null {
  const stale = statuses.filter((status) => status.updateAvailable);
  if (stale.length === 0) return null;
  const list = stale.map((status) => `${status.name} (${versionText(status.installed)} -> ${versionText(status.latest)})`).join(", ");
  return `plugin-updates: ${stale.length} outdated: ${list}`;
}
