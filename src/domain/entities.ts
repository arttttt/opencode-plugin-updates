/**
 * Domain entities for plugin update checking.
 *
 * Pure data: no IO, no framework, no environment access.
 */

/** A plugin workspace discovered in an OpenCode packages cache. */
export interface InstalledPlugin {
  /** npm package name, e.g. "opencode-pr-signature" or "@bybrawe/opencode-loop". */
  readonly name: string;
  /** Absolute path to the workspace directory opencode installed it in. */
  readonly workspaceDir: string;
  /** Version found in the workspace node_modules, or null when unreadable. */
  readonly installed: string | null;
}

/** Result of comparing one installed plugin against the npm registry. */
export interface PluginStatus {
  readonly name: string;
  readonly installed: string | null;
  readonly latest: string | null;
  /** True only when both versions are known and differ. */
  readonly updateAvailable: boolean;
}
