import { describe, expect, test } from "bun:test";

import type { InstalledPlugin } from "../src/domain/entities";
import type { NpmRegistry, PackagesCache, WorkspaceUpdater } from "../src/app/ports";
import { checkPlugins, toStatus, updatePlugins } from "../src/app/check-plugins";

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

const PLUGINS: InstalledPlugin[] = [
  { name: "stale", workspaceDir: "/w/stale", installed: "1.0.0" },
  { name: "fresh", workspaceDir: "/w/fresh", installed: "2.0.0" },
  { name: "offline", workspaceDir: "/w/offline", installed: "1.0.0" },
  { name: "unreadable", workspaceDir: "/w/unreadable", installed: null },
];

const LATEST = { stale: "1.1.0", fresh: "2.0.0", offline: null, unreadable: "3.0.0" };

describe("toStatus", () => {
  test("update is available only when both versions are known and differ", () => {
    expect(toStatus(PLUGINS[0], "1.1.0").updateAvailable).toBe(true);
    expect(toStatus(PLUGINS[1], "2.0.0").updateAvailable).toBe(false);
    expect(toStatus(PLUGINS[2], null).updateAvailable).toBe(false);
    expect(toStatus(PLUGINS[3], "9.9.9").updateAvailable).toBe(false);
  });
});

describe("checkPlugins", () => {
  test("reports a status for every considered plugin without touching workspaces", async () => {
    const statuses = await checkPlugins({ cache: fakeCache(PLUGINS), registry: fakeRegistry(LATEST) }, {});

    expect(statuses).toHaveLength(4);
    expect(statuses.filter((s) => s.updateAvailable)).toHaveLength(1);
  });

  test("filters are applied before any registry traffic", async () => {
    const registry = fakeRegistry(LATEST);

    const statuses = await checkPlugins({ cache: fakeCache(PLUGINS), registry }, { exclude: ["stale"] });

    expect(registry.requested).not.toContain("stale");
    expect(statuses.map((s) => s.name)).not.toContain("stale");
  });
});

describe("updatePlugins", () => {
  test("applies updates only to stale plugins", async () => {
    const updater = fakeUpdater();

    const outcome = await updatePlugins(
      { cache: fakeCache(PLUGINS), registry: fakeRegistry(LATEST), updater },
      {},
    );

    expect(updater.appliedTo).toEqual([{ name: "stale", version: "1.1.0" }]);
    expect(outcome.applied).toEqual([{ name: "stale", from: "1.0.0", to: "1.1.0" }]);
    expect(outcome.statuses).toHaveLength(4);
  });

  test("emits progress before each install, 1-based", async () => {
    const plugins: InstalledPlugin[] = [
      { name: "a", workspaceDir: "/w/a", installed: "1.0.0" },
      { name: "b", workspaceDir: "/w/b", installed: "1.0.0" },
    ];
    const events: { name: string; index: number; total: number }[] = [];

    await updatePlugins(
      { cache: fakeCache(plugins), registry: fakeRegistry({ a: "1.1.0", b: "1.1.0" }), updater: fakeUpdater() },
      {},
      (progress) => events.push({ ...progress }),
    );

    expect(events).toEqual([
      { name: "a", index: 1, total: 2 },
      { name: "b", index: 2, total: 2 },
    ]);
  });

  test("emits no progress when nothing is stale", async () => {
    const events: unknown[] = [];
    await updatePlugins(
      { cache: fakeCache(PLUGINS), registry: fakeRegistry({ stale: "1.0.0", fresh: "2.0.0", offline: null, unreadable: "3.0.0" }), updater: fakeUpdater() },
      {},
      (progress) => events.push(progress),
    );
    expect(events).toEqual([]);
  });

  test("a failed install is not reported as applied", async () => {
    const outcome = await updatePlugins(
      { cache: fakeCache(PLUGINS), registry: fakeRegistry(LATEST), updater: { apply: async () => false } },
      {},
    );

    expect(outcome.applied).toEqual([]);
    expect(outcome.statuses.find((s) => s.name === "stale")?.updateAvailable).toBe(true);
  });
});
