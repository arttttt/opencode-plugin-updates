import { describe, expect, test } from "bun:test";

import type { InstalledPlugin, PluginStatus, UpdateOutcome } from "../src/domain/entities";
import { renderCheckReport, renderStaleToast, renderUpdateReport } from "../src/app/report";

const STATUSES: PluginStatus[] = [
  { name: "fresh", installed: "1.0.0", latest: "1.0.0", updateAvailable: false },
  { name: "stale", installed: "1.0.0", latest: "1.1.0", updateAvailable: true },
  { name: "unknown-registry", installed: "1.0.0", latest: null, updateAvailable: false },
  { name: "broken-install", installed: null, latest: "2.0.0", updateAvailable: false },
];

const SEARCHED = ["/cache/opencode/packages", "/home/me/.cache/opencode/packages"];

const CHECKED = { statuses: STATUSES, discovered: STATUSES.length };

describe("renderCheckReport", () => {
  test("lists every plugin with its resolution state", () => {
    const report = renderCheckReport(CHECKED, SEARCHED);
    expect(report).toContain("- fresh: 1.0.0 =  up to date");
    expect(report).toContain("- stale: 1.0.0 -> 1.1.0");
    expect(report).toContain("- unknown-registry: 1.0.0 =  unknown (no registry data)");
    expect(report).toContain("- broken-install: unknown =  unknown (local version unreadable)");
    expect(report).not.toContain("No npm-installed plugins");
  });

  // An empty list read as "all up to date" when the cache was simply not
  // where it was looked for: say where, and how to point elsewhere.
  test("says where it looked when the cache held no plugins", () => {
    const report = renderCheckReport({ statuses: [], discovered: 0 }, SEARCHED);
    expect(report).toContain("No npm-installed plugins found.");
    for (const dir of SEARCHED) expect(report).toContain(dir);
    expect(report).toContain("packagesDir");
  });

  // The cache was found; pointing at packagesDir would send the user to the
  // wrong option.
  test.each([
    [1, "Found 1 plugin in the cache"],
    [3, "Found 3 plugins in the cache"],
  ])("blames the filter when it removed all %p found plugins", (discovered, found) => {
    const report = renderCheckReport({ statuses: [], discovered }, SEARCHED);
    expect(report).toBe(`${found}, but none matches the \`packages\` / \`exclude\` options.`);
  });
});

describe("renderUpdateReport", () => {
  test("appends applied updates and the restart hint", () => {
    const outcome: UpdateOutcome = {
      ...CHECKED,
      applied: [{ name: "stale", from: "1.0.0", to: "1.1.0" }],
    };
    const report = renderUpdateReport(outcome, SEARCHED);
    expect(report).toContain("- stale: 1.0.0 -> 1.1.0");
    expect(report).toContain("Updated:");
    expect(report).toContain("Restart OpenCode");
  });

  test("reports nothing-to-update without applied section", () => {
    const outcome: UpdateOutcome = { ...CHECKED, applied: [] };
    const report = renderUpdateReport(outcome, SEARCHED);
    expect(report).toContain("Nothing to update.");
    expect(report).not.toContain("Restart OpenCode");
  });

  test("says where it looked when it found no plugins", () => {
    const report = renderUpdateReport({ statuses: [], applied: [], discovered: 0 }, SEARCHED);
    expect(report).toContain("No npm-installed plugins found.");
    expect(report).toContain(SEARCHED[0]);
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
