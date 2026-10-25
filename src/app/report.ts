/**
 * Human-readable rendering of stale-plugin notifications.
 *
 * Pure formatting: no IO, so the exact wording is testable.
 */

import type { CheckOutcome, PluginStatus, UpdateOutcome, VersionChange } from "../domain/entities";
import { isSameVersion } from "../domain/versions";

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
    if (status.updateAvailable) return `- ${status.name}: ${status.installed} -> ${status.latest}`;
    // Known, a different version, yet no update: the registry's latest is older.
    if (!isSameVersion(status.installed, status.latest)) {
      return `- ${status.name}: ${status.installed} =  newer than npm latest (${status.latest})`;
    }
    return `- ${status.name}: ${status.installed} =  up to date`;
  });
  return ["Plugins:", ...lines].join("\n");
}

function updateLines(updates: readonly VersionChange[]): string[] {
  return updates.map(({ name, from, to }) => `- ${name}: ${from} -> ${to}`);
}

/** Table plus what was updated, what failed, and a restart hint, for /plugins-update. */
export function renderUpdateReport(outcome: UpdateOutcome, searched: readonly string[]): string {
  const base = renderCheckReport(outcome, searched);
  const { applied, failed } = outcome;
  if (applied.length === 0 && failed.length === 0) return `${base}\n\nNothing to update.`;
  const sections = [base];
  if (applied.length > 0) sections.push(["Updated:", ...updateLines(applied)].join("\n"));
  if (failed.length > 0) {
    sections.push(["Failed to update:", ...updateLines(failed)].join("\n"));
  }
  if (applied.length > 0) sections.push("Restart OpenCode to load the updated plugins.");
  return sections.join("\n\n");
}

/** Said to a /plugins-update made while another one is still running. */
export const UPDATE_ALREADY_RUNNING =
  "An update is already running; its report will follow. Run /plugins-update again after it if needed.";

/** Short toast that names every outdated plugin, or null when all is fresh. */
export function renderStaleToast(statuses: readonly PluginStatus[]): string | null {
  const stale = statuses.filter((status) => status.updateAvailable);
  if (stale.length === 0) return null;
  const list = stale.map((status) => `${status.name} (${versionText(status.installed)} -> ${versionText(status.latest)})`).join(", ");
  return `plugin-updates: ${stale.length} outdated: ${list}`;
}
