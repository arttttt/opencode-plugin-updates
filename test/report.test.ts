import { describe, expect, test } from "bun:test";

import type { InstalledPlugin, PluginStatus, UpdateOutcome } from "../src/domain/entities";
import { renderCheckReport, renderStaleToast, renderUpdateReport } from "../src/app/report";

const STATUSES: PluginStatus[] = [
  { name: "fresh", installed: "1.0.0", latest: "1.0.0", updateAvailable: false },
  { name: "stale", installed: "1.0.0", latest: "1.1.0", updateAvailable: true },
  { name: "unknown-registry", installed: "1.0.0", latest: null, updateAvailable: false },
  { name: "broken-install", installed: null, latest: "2.0.0", updateAvailable: false },
];

describe("renderCheckReport", () => {
  test("lists every plugin with its resolution state", () => {
    const report = renderCheckReport(STATUSES);
    expect(report).toContain("- fresh: 1.0.0 =  up to date");
    expect(report).toContain("- stale: 1.0.0 -> 1.1.0");
    expect(report).toContain("- unknown-registry: 1.0.0 =  unknown (no registry data)");
    expect(report).toContain("- broken-install: unknown =  unknown (local version unreadable)");
  });
});

describe("renderUpdateReport", () => {
  test("appends applied updates and the restart hint", () => {
    const outcome: UpdateOutcome = {
      statuses: STATUSES,
      applied: [{ name: "stale", from: "1.0.0", to: "1.1.0" }],
    };
    const report = renderUpdateReport(outcome);
    expect(report).toContain("- stale: 1.0.0 -> 1.1.0");
    expect(report).toContain("Updated:");
    expect(report).toContain("Restart OpenCode");
  });

  test("reports nothing-to-update without applied section", () => {
    const outcome: UpdateOutcome = { statuses: STATUSES, applied: [] };
    const report = renderUpdateReport(outcome);
    expect(report).toContain("Nothing to update.");
    expect(report).not.toContain("Restart OpenCode");
  });
});

describe("renderStaleToast", () => {
  test("names every outdated plugin with its versions", () => {
    const statuses: PluginStatus[] = [
      { name: "a", installed: "1.0.0", latest: "1.0.1", updateAvailable: true },
      { name: "b", installed: "2.0.0", latest: "2.1.0", updateAvailable: true },
      { name: "c", installed: "3.0.0", latest: "3.0.0", updateAvailable: false },
    ];
    expect(renderStaleToast(statuses)).toBe(
      "plugin-updates: 2 outdated: a (1.0.0 -> 1.0.1), b (2.0.0 -> 2.1.0)",
    );
  });

  test("stays silent when everything is current", () => {
    const fresh: PluginStatus[] = [{ name: "a", installed: "1.0.0", latest: "1.0.0", updateAvailable: false }];
    expect(renderStaleToast(fresh)).toBeNull();
    expect(renderStaleToast([])).toBeNull();
  });
});
