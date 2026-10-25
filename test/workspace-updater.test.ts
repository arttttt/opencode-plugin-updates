import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { InstalledPlugin } from "../src/domain/entities";
import { createInstallRunner, createWorkspaceUpdater, type InstallRunner } from "../src/infra/workspace-updater";

const NAME = "demo-plugin";

async function writeInstalled(dir: string, version: string): Promise<void> {
  await mkdir(path.join(dir, "node_modules", NAME), { recursive: true });
  await writeFile(path.join(dir, "node_modules", NAME, "package.json"), JSON.stringify({ name: NAME, version }));
}

async function makeWorkspace(version: string): Promise<InstalledPlugin & { manifest: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "opu-ws-"));
  await writeInstalled(dir, version);
  await writeFile(path.join(dir, "package.json"), JSON.stringify({ dependencies: { [NAME]: version } }, null, 2));
  await writeFile(path.join(dir, "package-lock.json"), "{}");
  await writeFile(path.join(dir, "bun.lock"), "");
  return { name: NAME, workspaceDir: dir, installed: version, manifest: await readFile(path.join(dir, "package.json"), "utf8") };
}

/** An installer that leaves `version` in node_modules (null: removes it) and exits with `ok`. */
function installer(version: string | null, ok = true): InstallRunner & { cwds: string[] } {
  const runner: InstallRunner & { cwds: string[] } = async (cwd) => {
    runner.cwds.push(cwd);
    if (version === null) await rm(path.join(cwd, "node_modules", NAME), { recursive: true, force: true });
    else await writeInstalled(cwd, version);
    return ok;
  };
  runner.cwds = [];
  return runner;
}

const readManifest = (plugin: InstalledPlugin) => readFile(path.join(plugin.workspaceDir, "package.json"), "utf8");

describe("createWorkspaceUpdater", () => {
  test("pins the new version, removes lock files, reinstalls in place", async () => {
    const plugin = await makeWorkspace("1.0.0");
    const runner = installer("1.1.0");

    const ok = await createWorkspaceUpdater(runner).apply(plugin, "1.1.0");

    expect(ok).toBe(true);
    expect(runner.cwds).toEqual([plugin.workspaceDir]);
    expect(JSON.parse(await readManifest(plugin)).dependencies[NAME]).toBe("1.1.0");
    await expect(readFile(path.join(plugin.workspaceDir, "package-lock.json"))).rejects.toThrow();
    await expect(readFile(path.join(plugin.workspaceDir, "bun.lock"))).rejects.toThrow();
    await rm(plugin.workspaceDir, { recursive: true, force: true });
  });

  // npm has dist-tags like "v1.1.0"; the package they install says "1.1.0".
  test("counts a v-prefixed target as installed when node_modules holds that version", async () => {
    const plugin = await makeWorkspace("1.0.0");

    expect(await createWorkspaceUpdater(installer("1.1.0")).apply(plugin, "v1.1.0")).toBe(true);
    await rm(plugin.workspaceDir, { recursive: true, force: true });
  });

  // OpenCode loads whatever node_modules holds, so that is what decides
  // whether the update happened — not the installer's exit code. On failure
  // the manifest gets its old pin back, so it agrees with node_modules.
  test.each([
    ["the installer fails", installer("1.0.0", false)],
    ["the installer exits cleanly but leaves the old version", installer("1.0.0")],
    ["the installer leaves no package behind", installer(null)],
    ["the installer leaves a different version", installer("1.0.5")],
  ])("reports failure and restores the manifest when %s", async (_, runner) => {
    const plugin = await makeWorkspace("1.0.0");

    const ok = await createWorkspaceUpdater(runner).apply(plugin, "1.1.0");

    expect(ok).toBe(false);
    expect(await readManifest(plugin)).toBe(plugin.manifest);
    await rm(plugin.workspaceDir, { recursive: true, force: true });
  });

  test("a workspace without a package.json cannot be updated", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "opu-empty-"));
    const runner = installer("1.0.0");
    const ok = await createWorkspaceUpdater(runner).apply({ name: "ghost", workspaceDir: dir, installed: null }, "1.0.0");
    expect(ok).toBe(false);
    expect(runner.cwds).toEqual([]);
    await rm(dir, { recursive: true, force: true });
  });
});

describe("createInstallRunner", () => {
  function recording(results: Record<string, boolean>) {
    const calls: string[] = [];
    const run = async (command: string, args: readonly string[], cwd: string) => {
      calls.push(`${cwd}: ${command} ${args.join(" ")}`);
      return results[command] ?? false;
    };
    return { calls, run };
  }

  test("installs with bun, without running install scripts", async () => {
    const { calls, run } = recording({ bun: true });
    expect(await createInstallRunner(run)("/w")).toBe(true);
    expect(calls).toEqual(["/w: bun install --ignore-scripts"]);
  });

  test("falls back to npm when bun fails or is missing", async () => {
    const { calls, run } = recording({ bun: false, npm: true });
    expect(await createInstallRunner(run)("/w")).toBe(true);
    expect(calls).toEqual(["/w: bun install --ignore-scripts", "/w: npm install --ignore-scripts --no-audit --no-fund"]);
  });

  test("fails when both do", async () => {
    expect(await createInstallRunner(recording({}).run)("/w")).toBe(false);
  });
});
