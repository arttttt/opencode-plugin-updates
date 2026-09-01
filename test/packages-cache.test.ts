import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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

    const plugins = await createPackagesCache([root]).list();

    expect(plugins).toEqual([
      { name: "plain-plugin", workspaceDir: path.join(root, "plain-plugin@latest"), installed: "1.0.0" },
      { name: "bybrawe", workspaceDir: path.join(root, "@bybrawe", "bybrawe@latest"), installed: "2.0.0" },
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

    const plugins = await createPackagesCache([path.join(first, "missing"), first, second]).list();

    expect(plugins.map((p) => [p.name, p.installed])).toEqual([
      ["dup", "1.0.0"],
      ["only-here", "0.1.0"],
    ]);
  });
});
