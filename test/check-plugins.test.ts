import { describe, expect, test } from "bun:test";

import type { AppliedUpdate, InstalledPlugin } from "../src/domain/entities";
import type { Changelog, NpmRegistry, PackagesCache, WorkspaceUpdater } from "../src/app/ports";
import { checkPlugins, toStatus } from "../src/app/check-plugins";

function fakeCache(plugins: InstalledPlugin[]): PackagesCache {
  return { list: async () => plugins };
}

function fakeRegistry(latest: Record<string, string | null>): NpmRegistry & { requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    latest: async (name) => {
      requested.push(name);
      return latest[name] ?? null;
    },
  };
}

function fakeUpdater(): WorkspaceUpdater & { appliedTo: { name: string; version: string }[] } {
  const appliedTo: { name: string; version: string }[] = [];
  return {
    appliedTo,
    apply: async (plugin, version) => {
      appliedTo.push({ name: plugin.name, version });
      return true;
    },
  };
}

function fakeChangelog(): Changelog & { entries: AppliedUpdate[] } {
  const entries: AppliedUpdate[] = [];
  return { entries, append: async (e) => void entries.push(...e) };
}

const PLUGINS: InstalledPlugin[] = [
  { name: "stale", workspaceDir: "/w/stale", installed: "1.0.0" },
  { name: "fresh", workspaceDir: "/w/fresh", installed: "2.0.0" },
  { name: "offline", workspaceDir: "/w/offline", installed: "1.0.0" },
  { name: "unreadable", workspaceDir: "/w/unreadable", installed: null },
];

describe("toStatus", () => {
  test("update is available only when both versions are known and differ", () => {
    expect(toStatus(PLUGINS[0], "1.1.0").updateAvailable).toBe(true);
    expect(toStatus(PLUGINS[1], "2.0.0").updateAvailable).toBe(false);
    expect(toStatus(PLUGINS[2], null).updateAvailable).toBe(false);
    expect(toStatus(PLUGINS[3], "9.9.9").updateAvailable).toBe(false);
  });
});

describe("checkPlugins", () => {
  test("check-only mode reports statuses without touching anything", async () => {
    const registry = fakeRegistry({ stale: "1.1.0", fresh: "2.0.0", offline: null, unreadable: "3.0.0" });
    const updater = fakeUpdater();
    const changelog = fakeChangelog();

    const outcome = await checkPlugins(
      { cache: fakeCache(PLUGINS), registry, updater, changelog },
      {},
      false,
    );

    expect(outcome.applied).toEqual([]);
    expect(updater.appliedTo).toEqual([]);
    expect(changelog.entries).toEqual([]);
    expect(outcome.statuses.filter((s) => s.updateAvailable)).toHaveLength(1);
    expect(registry.requested.sort()).toEqual(["fresh", "offline", "stale", "unreadable"]);
  });

  test("auto-update applies only stale plugins and records the changelog", async () => {
    const updater = fakeUpdater();
    const changelog = fakeChangelog();

    const outcome = await checkPlugins(
      {
        cache: fakeCache(PLUGINS),
        registry: fakeRegistry({ stale: "1.1.0", fresh: "2.0.0", offline: null, unreadable: "3.0.0" }),
        updater,
        changelog,
      },
      {},
      true,
    );

    expect(updater.appliedTo).toEqual([{ name: "stale", version: "1.1.0" }]);
    expect(outcome.applied).toEqual([{ name: "stale", from: "1.0.0", to: "1.1.0" }]);
    expect(changelog.entries).toEqual([{ name: "stale", from: "1.0.0", to: "1.1.0" }]);
  });

  test("filters are applied before any registry traffic", async () => {
    const registry = fakeRegistry({ stale: "1.1.0" });

    const outcome = await checkPlugins(
      { cache: fakeCache(PLUGINS), registry, updater: fakeUpdater(), changelog: fakeChangelog() },
      { exclude: ["stale"] },
      true,
    );

    expect(registry.requested).not.toContain("stale");
    expect(outcome.statuses.map((s) => s.name)).not.toContain("stale");
  });

  test("a failed install is not reported as applied", async () => {
    const outcome = await checkPlugins(
      {
        cache: fakeCache(PLUGINS),
        registry: fakeRegistry({ stale: "1.1.0" }),
        updater: { apply: async () => false },
        changelog: fakeChangelog(),
      },
      {},
      true,
    );

    expect(outcome.applied).toEqual([]);
    expect(outcome.statuses.find((s) => s.name === "stale")?.updateAvailable).toBe(true);
  });
});
