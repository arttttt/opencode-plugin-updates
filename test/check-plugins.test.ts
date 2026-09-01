import { describe, expect, test } from "bun:test";

import type { InstalledPlugin, PluginStatus } from "../src/domain/entities";
import type { NpmRegistry, PackagesCache } from "../src/app/ports";
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
  test("reports a status for every considered plugin", async () => {
    const statuses = await checkPlugins(
      {
        cache: fakeCache(PLUGINS),
        registry: fakeRegistry({ stale: "1.1.0", fresh: "2.0.0", offline: null, unreadable: "3.0.0" }),
      },
      {},
    );

    expect(statuses).toHaveLength(4);
    expect(statuses.find((s) => s.name === "stale")?.updateAvailable).toBe(true);
    expect(statuses.filter((s) => s.updateAvailable)).toHaveLength(1);
  });

  test("filters are applied before any registry traffic", async () => {
    const registry = fakeRegistry({ stale: "1.1.0" });

    const statuses = await checkPlugins(
      { cache: fakeCache(PLUGINS), registry },
      { exclude: ["stale"] },
    );

    expect(registry.requested).not.toContain("stale");
    expect(statuses.map((s) => s.name)).not.toContain("stale");
  });
});
