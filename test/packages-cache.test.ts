import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { InstalledPlugin } from "../src/domain/entities";
import { createPackagesCache, resolveCacheCandidates } from "../src/infra/packages-cache";

async function makeWorkspace(root: string, name: string, version: string): Promise<string> {
  const dir = path.join(root, `${name}@latest`);
  await mkdir(path.join(dir, "node_modules", name), { recursive: true });
  await writeFile(path.join(dir, "package.json"), JSON.stringify({ dependencies: { [name]: version } }));
  await writeFile(
    path.join(dir, "node_modules", name, "package.json"),
    JSON.stringify({ name, version }),
  );
  return dir;
}

async function makeTempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "opu-cache-"));
}

/** Directory order is the filesystem's (hash order on ext4), so compare by name. */
function byName(plugins: InstalledPlugin[]): InstalledPlugin[] {
  return [...plugins].sort((a, b) => a.name.localeCompare(b.name));
}

describe("resolveCacheCandidates", () => {
  test("prefers XDG_CACHE_HOME, then ~/.cache, then the macOS path", () => {
    const home = "/home/tester";
    const xdg = resolveCacheCandidates({ XDG_CACHE_HOME: "/xdg" }, home);
    expect(xdg).toEqual(["/xdg/opencode/packages", path.join(home, ".cache/opencode/packages"), path.join(home, "Library/Caches/opencode/packages")]);

    const noXdg = resolveCacheCandidates({}, home);
    expect(noXdg[0]).toBe(path.join(home, ".cache/opencode/packages"));
  });
});

describe("createPackagesCache", () => {
  test("discovers plain and scoped @latest workspaces with versions", async () => {
    const root = await makeTempRoot();
    await makeWorkspace(root, "plain-plugin", "1.0.0");
    await makeWorkspace(path.join(root, "@bybrawe"), "bybrawe", "2.0.0");

    const plugins = byName(await createPackagesCache([root]).list());

    expect(plugins).toEqual([
      { name: "bybrawe", workspaceDir: path.join(root, "@bybrawe", "bybrawe@latest"), installed: "2.0.0" },
      { name: "plain-plugin", workspaceDir: path.join(root, "plain-plugin@latest"), installed: "1.0.0" },
    ]);
  });

  test("ignores non-latest entries and workspaces without a readable package.json", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "pinned@1.2.3"), { recursive: true });
    await mkdir(path.join(root, "empty@latest"), { recursive: true });

    expect(await createPackagesCache([root]).list()).toEqual([]);
  });

  test("skips missing roots and keeps the first hit per name across roots", async () => {
    const first = await makeTempRoot();
    const second = await makeTempRoot();
    await makeWorkspace(first, "dup", "1.0.0");
    await makeWorkspace(second, "dup", "9.0.0");
    await makeWorkspace(second, "only-here", "0.1.0");

    // Which copy of "dup" wins depends on root order, which is ours; the
    // order of names inside a root is the filesystem's.
    const plugins = byName(await createPackagesCache([path.join(first, "missing"), first, second]).list());

    expect(plugins.map((p) => [p.name, p.installed])).toEqual([
      ["dup", "1.0.0"],
      ["only-here", "0.1.0"],
    ]);
  });
});

/**
 * The cache exactly as OpenCode writes it, so a move on OpenCode's side shows
 * up here rather than as a silent "nothing found". Taken from OpenCode
 * v1.18.32, packages/core/src/npm.ts: Npm.add installs a plugin spec — a bare
 * name already normalised to `<name>@latest` by plugin/shared.ts — into
 * `path.join(global.cache, "packages", sanitize(spec))` with Arborist
 * (save: true, savePrefix: ""), so a scoped spec nests under its scope.
 * Npm.which installs tools such as language servers into the same root under
 * their bare name.
 */
describe("OpenCode 1.18.32's package cache", () => {
  async function arboristWorkspace(packages: string, spec: string, name: string, version: string): Promise<void> {
    const dir = path.join(packages, spec);
    await mkdir(path.join(dir, "node_modules", ".bin"), { recursive: true });
    await mkdir(path.join(dir, "node_modules", name), { recursive: true });
    await writeFile(path.join(dir, "package.json"), JSON.stringify({ dependencies: { [name]: version } }));
    await writeFile(path.join(dir, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: {} }));
    await writeFile(path.join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, version }));
  }

  test("finds the plugins OpenCode installed and ignores the tools it installed beside them", async () => {
    // global.cache is <xdg cache>/opencode; plugins live in its packages/.
    const packages = path.join(await makeTempRoot(), "opencode", "packages");
    await arboristWorkspace(packages, "opencode-pr-signature@latest", "opencode-pr-signature", "1.2.1");
    await arboristWorkspace(packages, "@acme/opencode-plugin@latest", "@acme/opencode-plugin", "0.3.0");
    await arboristWorkspace(packages, "pyright", "pyright", "1.1.400");

    const plugins = byName(await createPackagesCache([packages]).list());

    expect(plugins).toEqual([
      {
        name: "@acme/opencode-plugin",
        workspaceDir: path.join(packages, "@acme", "opencode-plugin@latest"),
        installed: "0.3.0",
      },
      {
        name: "opencode-pr-signature",
        workspaceDir: path.join(packages, "opencode-pr-signature@latest"),
        installed: "1.2.1",
      },
    ]);
  });
});
