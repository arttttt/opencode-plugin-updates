/**
 * Human-readable rendering of a check outcome.
 *
 * Pure formatting: no IO, so the exact wording is testable.
 */

import type { CheckOutcome } from "../domain/entities";

function versionText(version: string | null): string {
  return version ?? "unknown";
}

export function renderCheckReport(outcome: CheckOutcome): string {
  const lines = outcome.statuses.map((status) => {
    const arrow = status.updateAvailable ? " -> " : " =  ";
    const target = status.updateAvailable ? versionText(status.latest) : "up to date";
    return `- ${status.name}: ${versionText(status.installed)}${arrow}${target}`;
  });

  const sections = ["Plugins:", ...lines];

  if (outcome.applied.length > 0) {
    sections.push("", "Updated:");
    for (const update of outcome.applied) sections.push(`- ${update.name}: ${update.from} -> ${update.to}`);
    sections.push("", "Restart OpenCode to load the updated plugins.");
  }

  return sections.join("\n");
}

export function renderToastSummary(outcome: CheckOutcome): string {
  const pending = outcome.statuses.filter((s) => s.updateAvailable).length;
  if (outcome.applied.length > 0) return `plugin-updates: applied ${outcome.applied.length} update(s)`;
  if (pending > 0) return `plugin-updates: ${pending} update(s) available, run /plugins-check`;
  return "plugin-updates: all plugins up to date";
}
