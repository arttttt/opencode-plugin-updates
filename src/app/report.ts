/**
 * Human-readable rendering of stale-plugin notifications.
 *
 * Pure formatting: no IO, so the exact wording is testable.
 */

import type { CheckOutcome, PluginStatus, UpdateOutcome } from "../domain/entities";

function versionText(version: string | null): string {
  return version ?? "unknown";
}

/**
 * Said instead of an empty table, which reads as "all up to date". It names
 * the knob that explains it: an empty cache usually sits elsewhere
 * (packagesDir); a full one emptied by the filter, the filter.
 */
function renderNothingToCheck(discovered: number, searched: readonly string[]): string {
  if (discovered > 0) {
    const plugins = discovered === 1 ? "1 plugin" : `${discovered} plugins`;
    return `Found ${plugins} in the cache, but none matches the \`packages\` / \`exclude\` options.`;
  }
  return [
    "No npm-installed plugins found. Searched:",
    ...searched.map((dir) => `- ${dir}`),
    "",
    "Set the `packagesDir` option if OpenCode keeps its plugin cache elsewhere.",
  ].join("\n");
}

/** Full table for the /plugins-check command: every plugin and its state. */
export function renderCheckReport(outcome: CheckOutcome, searched: readonly string[]): string {
  const { statuses, discovered } = outcome;
  if (statuses.length === 0) return renderNothingToCheck(discovered, searched);
  const lines = statuses.map((status) => {
    if (status.latest === null) {
      return `- ${status.name}: ${versionText(status.installed)} =  unknown (no registry data)`;
    }
    if (status.installed === null) {
      return `- ${status.name}: unknown =  unknown (local version unreadable)`;
    }
    const arrow = status.updateAvailable ? " -> " : " =  ";
    const target = status.updateAvailable ? versionText(status.latest) : "up to date";
    return `- ${status.name}: ${versionText(status.installed)}${arrow}${target}`;
  });
  return ["Plugins:", ...lines].join("\n");
}

/** Table plus the applied updates and a restart hint, for /plugins-update. */
export function renderUpdateReport(outcome: UpdateOutcome, searched: readonly string[]): string {
  const base = renderCheckReport(outcome, searched);
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
