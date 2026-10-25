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
import { isSameVersion } from "../domain/versions";
import type { WorkspaceUpdater } from "../app/ports";

const LOCK_FILES = ["package-lock.json", "bun.lockb", "bun.lock"] as const;
const INSTALL_TIMEOUT_MS = 30_000;

export type InstallRunner = (cwd: string) => Promise<boolean>;

/** Runs one command in `cwd`; resolves to whether it exited cleanly. */
export type CommandRunner = (command: string, args: readonly string[], cwd: string) => Promise<boolean>;

function exec(command: string, args: readonly string[], cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd, timeout: INSTALL_TIMEOUT_MS }, (error) => {
      resolve(error === null);
    });
  });
}

/** Prefers bun (what OpenCode itself uses); falls back to npm when bun fails or is absent. */
export function createInstallRunner(run: CommandRunner = exec): InstallRunner {
  return async (cwd) =>
    (await run("bun", ["install", "--ignore-scripts"], cwd)) ||
    run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], cwd);
}

async function readText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

/** The workspace package.json text with `name` pinned to `version`, or null when it is not JSON. */
function pinned(original: string, name: string, version: string): string | null {
  try {
    const pkg = JSON.parse(original) as Record<string, unknown>;
    const dependencies = (pkg.dependencies as Record<string, string> | undefined) ?? {};
    dependencies[name] = version;
    pkg.dependencies = dependencies;
    return JSON.stringify(pkg, null, 2) + "\n";
  } catch {
    return null;
  }
}

async function removeLockFiles(workspaceDir: string): Promise<void> {
  await Promise.all(
    LOCK_FILES.map(async (lock) => {
      await fs.rm(path.join(workspaceDir, lock), { force: true }).catch(() => {});
    }),
  );
}

/** The version actually sitting in node_modules — what OpenCode will load. */
async function installedVersion(workspaceDir: string, name: string): Promise<string | null> {
  const text = await readText(path.join(workspaceDir, "node_modules", name, "package.json"));
  try {
    const version = text === null ? undefined : (JSON.parse(text) as Record<string, unknown>).version;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

export function createWorkspaceUpdater(runInstall: InstallRunner = createInstallRunner()): WorkspaceUpdater {
  return {
    async apply(plugin: InstalledPlugin, version: string): Promise<boolean> {
      const manifest = path.join(plugin.workspaceDir, "package.json");
      const original = await readText(manifest);
      const updated = original === null ? null : pinned(original, plugin.name, version);
      if (original === null || updated === null) return false;
      await fs.writeFile(manifest, updated);
      await removeLockFiles(plugin.workspaceDir);
      // Counted only once node_modules holds the new version: an installer
      // that exits cleanly, or is killed by the timeout, can leave the old
      // copy or a torn one behind.
      if (await runInstall(plugin.workspaceDir)) {
        const now = await installedVersion(plugin.workspaceDir, plugin.name);
        // By semver: a "v1.2.3" dist-tag installs a package that says "1.2.3".
        if (now !== null && isSameVersion(now, version)) return true;
      }
      // OpenCode keeps loading whatever node_modules holds; give the
      // manifest back its old pin so it says so too. Lock files are not
      // restored: nothing on OpenCode's load path reads them.
      await fs.writeFile(manifest, original).catch(() => {});
      return false;
    },
  };
}
