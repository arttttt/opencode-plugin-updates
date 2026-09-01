/**
 * Applies a new version to a plugin workspace the way opencode itself
 * expects: pin the version in the workspace package.json, remove lock
 * files, and reinstall. Without this, opencode treats the cached
 * workspace as permanently fresh and never re-resolves "@latest".
 */

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { InstalledPlugin } from "../domain/entities";
import type { WorkspaceUpdater } from "../app/ports";

const LOCK_FILES = ["package-lock.json", "bun.lockb", "bun.lock"] as const;
const INSTALL_TIMEOUT_MS = 30_000;

export type InstallRunner = (cwd: string) => Promise<boolean>;

function exec(command: string, args: readonly string[], cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd, timeout: INSTALL_TIMEOUT_MS }, (error) => {
      resolve(error === null);
    });
  });
}

/** Prefers bun (what OpenCode itself uses); falls back to npm when absent. */
export function resilientInstallRunner(cwd: string): Promise<boolean> {
  return exec("bun", ["install", "--ignore-scripts"], cwd).then((ok) => ok || exec("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], cwd));
}

/** Rewrites the workspace package.json pinning `name` to `version`. */
async function pinDependency(workspaceDir: string, name: string, version: string): Promise<boolean> {
  const file = path.join(workspaceDir, "package.json");
  try {
    const pkg = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
    const dependencies = (pkg.dependencies as Record<string, string> | undefined) ?? {};
    dependencies[name] = version;
    pkg.dependencies = dependencies;
    await fs.writeFile(file, JSON.stringify(pkg, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

async function removeLockFiles(workspaceDir: string): Promise<void> {
  await Promise.all(
    LOCK_FILES.map(async (lock) => {
      await fs.rm(path.join(workspaceDir, lock), { force: true }).catch(() => {});
    }),
  );
}

export function createWorkspaceUpdater(runInstall: InstallRunner = resilientInstallRunner): WorkspaceUpdater {
  return {
    async apply(plugin: InstalledPlugin, version: string): Promise<boolean> {
      if (!(await pinDependency(plugin.workspaceDir, plugin.name, version))) return false;
      await removeLockFiles(plugin.workspaceDir);
      return runInstall(plugin.workspaceDir);
    },
  };
}
