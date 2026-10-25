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
  /**
   * True when `latest` is known and either newer than `installed` or
   * `installed` is unreadable (a reinstall).
   */
  readonly updateAvailable: boolean;
}

/** One plugin's move from one version to another, whether it was applied or failed. */
export interface VersionChange {
  readonly name: string;
  /** null: the installed version was unreadable, so this is a reinstall. */
  readonly from: string | null;
  readonly to: string;
}

/** Everything one check learned. */
export interface CheckOutcome {
  /** One status per plugin that passed the packages/exclude filter. */
  readonly statuses: readonly PluginStatus[];
  /**
   * How many plugins the cache held before the filter: no statuses with
   * plugins discovered means the filter removed them, not that none exist.
   */
  readonly discovered: number;
}

/** Everything one manual update run learned and did. */
export interface UpdateOutcome extends CheckOutcome {
  readonly applied: readonly VersionChange[];
  /** Updates that were attempted but whose pin or install failed. */
  readonly failed: readonly VersionChange[];
}
