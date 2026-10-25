import { describe, expect, test } from "bun:test";

import type { InstalledPlugin, PluginStatus, UpdateOutcome } from "../src/domain/entities";
import { renderCheckReport, renderStaleToast, renderUpdateReport, TOAST_NAMES } from "../src/app/report";

const STATUSES: PluginStatus[] = [
  { name: "fresh", installed: "1.0.0", latest: "1.0.0", updateAvailable: false },
  { name: "stale", installed: "1.0.0", latest: "1.1.0", updateAvailable: true },
  { name: "unknown-registry", installed: "1.0.0", latest: null, updateAvailable: false },
  { name: "broken-install", installed: null, latest: "2.0.0", updateAvailable: true },
];

const SEARCHED = ["/cache/opencode/packages", "/home/me/.cache/opencode/packages"];

const CHECKED = { statuses: STATUSES, discovered: STATUSES.length };

describe("renderCheckReport", () => {
  test("lists every plugin with its resolution state", () => {
    const report = renderCheckReport(CHECKED, SEARCHED);
    expect(report).toContain("- fresh: 1.0.0 =  up to date");
    expect(report).toContain("- stale: 1.0.0 -> 1.1.0");
    expect(report).toContain("- unknown-registry: 1.0.0 =  unknown (no registry data)");
    expect(report).toContain("- broken-install: unknown -> 2.0.0  (local version unreadable: updating reinstalls it)");
    expect(report).not.toContain("No npm-installed plugins");
  });

  // Not "up to date": the versions differ, the registry's is just older.
  test("says so when the installed version is newer than npm's latest", () => {
    const ahead: PluginStatus = { name: "ahead", installed: "1.2.0", latest: "1.1.0", updateAvailable: false };
    const report = renderCheckReport({ statuses: [ahead], discovered: 1 }, SEARCHED);
    expect(report).toContain("- ahead: 1.2.0 =  newer than npm latest (1.1.0)");
  });

  test("reads a v-prefixed latest naming the installed version as up to date", () => {
    const tagged: PluginStatus = { name: "tagged", installed: "1.2.0", latest: "v1.2.0", updateAvailable: false };
    const report = renderCheckReport({ statuses: [tagged], discovered: 1 }, SEARCHED);
    expect(report).toContain("- tagged: 1.2.0 =  up to date");
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
  const STALE = { name: "stale", from: "1.0.0", to: "1.1.0" };

  test("appends applied updates and the restart hint", () => {
    const outcome: UpdateOutcome = { ...CHECKED, applied: [STALE], failed: [] };
    const report = renderUpdateReport(outcome, SEARCHED);
    expect(report).toContain("- stale: 1.0.0 -> 1.1.0");
    expect(report).toContain("Updated:");
    expect(report).toContain("Restart OpenCode");
    expect(report).not.toContain("Failed to update:");
  });

  test("reports nothing-to-update without applied section", () => {
    const outcome: UpdateOutcome = { ...CHECKED, applied: [], failed: [] };
    const report = renderUpdateReport(outcome, SEARCHED);
    expect(report).toContain("Nothing to update.");
    expect(report).not.toContain("Restart OpenCode");
  });

  // Stale plugins whose every install failed read as "Nothing to update."
  // under the table that listed them as outdated.
  test("names failed installs instead of claiming nothing to update, and asks no restart", () => {
    const outcome: UpdateOutcome = { ...CHECKED, applied: [], failed: [STALE] };
    const report = renderUpdateReport(outcome, SEARCHED);
    expect(report).toEndWith("Failed to update:\n- stale: 1.0.0 -> 1.1.0");
    expect(report).not.toContain("Nothing to update.");
    expect(report).not.toContain("Restart OpenCode");
  });

  test("reports applied and failed updates side by side", () => {
    const other = { name: "other", from: "2.0.0", to: "2.1.0" };
    const outcome: UpdateOutcome = { ...CHECKED, applied: [STALE], failed: [other] };
    const report = renderUpdateReport(outcome, SEARCHED);
    expect(report).toContain("Updated:\n- stale: 1.0.0 -> 1.1.0");
    expect(report).toContain("Failed to update:\n- other: 2.0.0 -> 2.1.0");
    expect(report).toEndWith("Restart OpenCode to load the updated plugins.");
  });

  test("reports a reinstall from an unreadable version as from unknown", () => {
    const reinstall = { name: "broken-install", from: null, to: "2.0.0" };
    const report = renderUpdateReport({ ...CHECKED, applied: [reinstall], failed: [] }, SEARCHED);
    expect(report).toContain("Updated:\n- broken-install: unknown -> 2.0.0");
  });

  test("says where it looked when it found no plugins", () => {
    const report = renderUpdateReport({ statuses: [], applied: [], failed: [], discovered: 0 }, SEARCHED);
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

  test(`names the first ${TOAST_NAMES} outdated plugins and counts the rest`, () => {
    const stale: PluginStatus[] = ["a", "b", "c", "d", "e"].map((name) => ({
      name,
      installed: "1.0.0",
      latest: "1.1.0",
      updateAvailable: true,
    }));
    expect(renderStaleToast(stale)).toBe(
      "plugin-updates: 5 outdated: a (1.0.0 -> 1.1.0), b (1.0.0 -> 1.1.0), c (1.0.0 -> 1.1.0) and 2 more",
    );
    expect(renderStaleToast(stale.slice(0, TOAST_NAMES))).not.toContain("more");
  });

  test("calls a plugin to reinstall a broken install, not an ordinary update", () => {
    const broken: PluginStatus[] = [{ name: "x", installed: null, latest: "2.0.0", updateAvailable: true }];
    expect(renderStaleToast(broken)).toBe("plugin-updates: 1 outdated: x (broken install, reinstall 2.0.0)");
  });

  test("stays silent when everything is current", () => {
    const fresh: PluginStatus[] = [{ name: "a", installed: "1.0.0", latest: "1.0.0", updateAvailable: false }];
    expect(renderStaleToast(fresh)).toBeNull();
    expect(renderStaleToast([])).toBeNull();
  });
});
