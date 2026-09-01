/**
 * Ports the application layer depends on.
 *
 * Interfaces only: infrastructure implements them, the composition root
 * wires them. Dependencies point inward (Clean Architecture).
 */

import type { InstalledPlugin } from "../domain/entities";

/** Reads plugin workspaces from one or more package cache directories. */
export interface PackagesCache {
  list(): Promise<InstalledPlugin[]>;
}

/** Resolves the current "latest" dist-tag of a package from npm. */
export interface NpmRegistry {
  latest(name: string): Promise<string | null>;
}

/** Applies a new version to an installed plugin workspace. */
export interface WorkspaceUpdater {
  apply(plugin: InstalledPlugin, version: string): Promise<boolean>;
}
