/**
 * Discovers plugin workspaces in OpenCode's package caches.
 *
 * OpenCode installs npm plugins as `<cache>/packages/<name>@latest/`
 * workspaces whose package.json pins the resolved version. Both the
 * XDG-style path and the macOS-specific path occur in the wild, so every
 * candidate that exists is scanned and results are deduplicated by name.
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import type { InstalledPlugin } from "../domain/entities";
import type { PackagesCache } from "../app/ports";

/** Candidate package cache roots, most likely first. Overridable for tests. */
export function resolveCacheCandidates(env: NodeJS.ProcessEnv, home: string = homedir()): string[] {
  const xdg = env.XDG_CACHE_HOME && env.XDG_CACHE_HOME !== "" ? env.XDG_CACHE_HOME : null;
  const candidates = xdg !== null ? [path.join(xdg, "opencode", "packages")] : [];
  return [
    ...candidates,
    path.join(home, ".cache", "opencode", "packages"),
    path.join(home, "Library", "Caches", "opencode", "packages"),
  ];
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** First dependency key of a workspace package.json is the plugin's npm name. */
function workspacePackageName(pkg: Record<string, unknown> | null): string | null {
  if (pkg === null || pkg.dependencies === null || typeof pkg.dependencies !== "object") return null;
  const first = Object.keys(pkg.dependencies as Record<string, unknown>)[0];
  return typeof first === "string" && first !== "" ? first : null;
}

async function readWorkspace(workspaceDir: string): Promise<InstalledPlugin | null> {
  const pkg = await readJson(path.join(workspaceDir, "package.json"));
  const name = workspacePackageName(pkg);
  if (name === null) return null;
  const installedPkg = await readJson(path.join(workspaceDir, "node_modules", name, "package.json"));
  const version = installedPkg?.version;
  return { name, workspaceDir, installed: typeof version === "string" ? version : null };
}

/** Resolves to `dir` when it exists, otherwise to null. */
async function existingDir(dir: string): Promise<string | null> {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory() ? dir : null;
  } catch {
    return null;
  }
}

async function subDirs(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(dir, entry.name));
}

/** `@scope` roots contribute their `name@latest` children; plain roots contribute themselves. */
async function latestWorkspaceDirs(root: string): Promise<string[]> {
  const children = await subDirs(root);
  const perEntry = await Promise.all(
    children.map(async (child) =>
      path.basename(child).startsWith("@")
        ? (await subDirs(child)).filter((dir) => dir.endsWith("@latest"))
        : child.endsWith("@latest") ? [child] : [],
    ),
  );
  return perEntry.flat();
}

/** Keeps the first plugin per name, preserving discovery order. */
function uniqueByName(plugins: readonly InstalledPlugin[]): InstalledPlugin[] {
  const byFirstSeen = plugins.reduce(
    (first, plugin) => (first.has(plugin.name) ? first : first.set(plugin.name, plugin)),
    new Map<string, InstalledPlugin>(),
  );
  return [...byFirstSeen.values()];
}

export function createPackagesCache(candidates: readonly string[]): PackagesCache {
  return {
    async list(): Promise<InstalledPlugin[]> {
      const roots = (await Promise.all(candidates.map(existingDir))).filter((dir): dir is string => dir !== null);
      const workspaceDirs = (await Promise.all(roots.map(latestWorkspaceDirs))).flat();
      const plugins = await Promise.all(workspaceDirs.map(readWorkspace));
      return uniqueByName(plugins.filter((plugin): plugin is InstalledPlugin => plugin !== null));
    },
  };
}
