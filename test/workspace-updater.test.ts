import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { InstalledPlugin } from "../src/domain/entities";
import { createWorkspaceUpdater, type InstallRunner } from "../src/infra/workspace-updater";

async function makeWorkspace(name: string, version: string): Promise<InstalledPlugin> {
  const dir = await mkdtemp(path.join(tmpdir(), "opu-ws-"));
  await mkdir(path.join(dir, "node_modules", name), { recursive: true });
  await writeFile(path.join(dir, "package.json"), JSON.stringify({ dependencies: { [name]: version } }, null, 2));
  await writeFile(path.join(dir, "package-lock.json"), "{}");
  await writeFile(path.join(dir, "bun.lock"), "");
  return { name, workspaceDir: dir, installed: version };
}

function recordingRunner(): InstallRunner & { cwds: string[] } {
  const runner: InstallRunner & { cwds: string[] } = async (cwd) => {
    runner.cwds.push(cwd);
    return true;
  };
  runner.cwds = [];
  return runner;
}
describe("createWorkspaceUpdater", () => {
  test("pins the new version, removes lock files, reinstalls in place", async () => {
    const plugin = await makeWorkspace("demo-plugin", "1.0.0");
    const runner = recordingRunner();

    const ok = await createWorkspaceUpdater(runner).apply(plugin, "1.1.0");

    expect(ok).toBe(true);
    expect(runner.cwds).toEqual([plugin.workspaceDir]);
    const pkg = JSON.parse(await readFile(path.join(plugin.workspaceDir, "package.json"), "utf8"));
    expect(pkg.dependencies["demo-plugin"]).toBe("1.1.0");
    await expect(readFile(path.join(plugin.workspaceDir, "package-lock.json"))).rejects.toThrow();
    await expect(readFile(path.join(plugin.workspaceDir, "bun.lock"))).rejects.toThrow();
    await rm(plugin.workspaceDir, { recursive: true, force: true });
  });

  test("reports failure when the install step fails", async () => {
    const plugin = await makeWorkspace("demo-plugin", "1.0.0");
    const failing: InstallRunner = async () => false;

    const ok = await createWorkspaceUpdater(failing).apply(plugin, "1.1.0");

    expect(ok).toBe(false);
    await rm(plugin.workspaceDir, { recursive: true, force: true });
  });

  test("a workspace without a package.json cannot be updated", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "opu-empty-"));
    const ok = await createWorkspaceUpdater(async () => true).apply(
      { name: "ghost", workspaceDir: dir, installed: null },
      "1.0.0",
    );
    expect(ok).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });
});
