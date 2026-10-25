/**
 * The package is installed and loaded by name, and each OpenCode generation
 * finds a different entry in it. These tests install the checkout into a
 * throwaway node_modules, resolve it the way each loader does, and apply
 * each loader's own acceptance rule to what comes back:
 *
 *   OpenCode 1.0 – 1.3.3  import the package root, call EVERY export
 *                         (packages/opencode/src/plugin/index.ts@v1.0.0 … @v1.3.3)
 *   OpenCode 1.3.4 – 1.x  exports["./server"], else main; default {id, server}
 *                         (plugin/shared.ts resolvePackageEntrypoint, readV1Plugin @v1.18.32)
 *   OpenCode 2            `<name>/server`, else `<name>`; default must be an
 *                         OBJECT {id, setup} (@opencode/plugin host.js, @opencode/core Module)
 *
 * This plugin supports OpenCode 1 only, so OpenCode 2 must reject it.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

const install = mkdtempSync(join(tmpdir(), "opencode-plugin-updates-install-"));
mkdirSync(join(install, "node_modules"));
symlinkSync(ROOT, join(install, "node_modules", pkg.name), "dir");
afterAll(() => rmSync(install, { force: true, recursive: true }));

/** A cache root that does not exist, so the startup check finds nothing. */
const options = { packagesDir: join(install, "no-cache") };
const input = { client: {} };
const HOOKS = ["command.execute.before", "config", "dispose"];

type Hooks = Record<string, (...args: unknown[]) => Promise<unknown>>;
type PluginFunction = (input: unknown, options: unknown) => Promise<Hooks>;

/** Run a plugin function as a loader would, then stop the startup timer it schedules. */
async function load(plugin: PluginFunction): Promise<string[]> {
  const hooks = await plugin(input, options);
  await hooks.dispose?.();
  return Object.keys(hooks).sort();
}

/** Resolve a specifier from inside the install, as a host resolving the installed package does. */
function resolveFromInstall(specifier: string): string {
  return Bun.resolveSync(specifier, install);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

describe("package manifest", () => {
  test("main and the root export name the same file", () => {
    // A resolver that ignores `exports` falls back to `main`; both must land on the legacy entry.
    expect(`./${pkg.main}`).toBe(pkg.exports["."]);
  });

  // OpenCode 1.3.4+ refuses an install outside this range (checkPluginCompatibility,
  // plugin/shared.ts@v1.18.32): the commands need command.execute.before, from 1.2.0,
  // and the plugin has no OpenCode 2 entry.
  test.each([
    ["1.1.4", false],
    ["1.2.0", true],
    ["1.18.32", true],
    ["1.19.4", true],
    ["2.0.0", false],
  ])("engines.opencode on OpenCode %s: admitted %p", (version, admitted) => {
    expect(Bun.semver.satisfies(version, pkg.engines.opencode)).toBe(admitted);
  });

  test("the published files include every entry", () => {
    expect(pkg.files).toContain("src");
    for (const target of Object.values<string>(pkg.exports)) expect(target.startsWith("./src/")).toBe(true);
  });
});

describe("OpenCode 1.0 – 1.3.3: the package root, every export called", () => {
  test("the root resolves to the legacy entry", () => {
    expect(resolveFromInstall(pkg.name)).toBe(join(ROOT, "src", "entry", "legacy.ts"));
  });

  test("every export is a plugin function and there is exactly one", async () => {
    const mod: Record<string, unknown> = await import(resolveFromInstall(pkg.name));
    // 1.0.x calls each export without deduplicating, so a second export
    // pointing at the same function would register the hooks twice.
    const loaded = [];
    for (const entry of Object.values(mod)) {
      expect(typeof entry).toBe("function");
      loaded.push(await load(entry as PluginFunction));
    }

    expect(loaded).toEqual([HOOKS]);
  });
});

describe("OpenCode 1.3.4+: exports['./server'], an {id, server} object", () => {
  test("the server export resolves to the server entry", () => {
    expect(resolveFromInstall(`${pkg.name}/server`)).toBe(join(ROOT, "src", "entry", "server.ts"));
  });

  test("readV1Plugin accepts it and the server function yields the hooks", async () => {
    const value = (await import(resolveFromInstall(`${pkg.name}/server`))).default;

    // readV1Plugin: a record with a function `server`, and not also `tui`.
    expect(isRecord(value)).toBe(true);
    expect(value.id).toBe(pkg.name);
    expect(typeof value.server).toBe("function");
    expect("tui" in value).toBe(false);
    expect(await load(value.server)).toEqual(HOOKS);
  });
});

describe("OpenCode 2: <name>/server first, an {id, setup} object", () => {
  test("is rejected: the server export has no setup, and the root is a function", async () => {
    const server = (await import(resolveFromInstall(`${pkg.name}/server`))).default;
    const root = (await import(resolveFromInstall(pkg.name))).default;

    // OpenCode 2's Module schema needs a function `setup` on an object. Adding
    // one is a decision to support OpenCode 2, not something to slip in.
    expect(typeof server.setup).toBe("undefined");
    expect(typeof root).toBe("function");
  });
});
