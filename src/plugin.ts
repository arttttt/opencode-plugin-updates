/**
 * OpenCode Plugin Updates
 *
 * Keeps npm-installed OpenCode plugins current. OpenCode resolves a
 * "@latest" plugin spec once and then treats the cached workspace as
 * permanently fresh, so newer npm releases never arrive on their own.
 * This plugin re-checks the registry and repins those workspaces.
 *
 * @author arttttt
 * @license Apache-2.0
 */

import type { Plugin } from "@opencode-ai/plugin";

import type { PluginFilter } from "./app/policy";
import { checkPlugins, type CheckDependencies } from "./app/check-plugins";
import { renderCheckReport, renderToastSummary } from "./app/report";
import { createFileChangelog, defaultChangelogPath } from "./infra/changelog";
import { createNpmRegistry } from "./infra/npm-registry";
import { createNotifier, type UiClient } from "./infra/opencode-ui";
import { createPackagesCache, resolveCacheCandidates } from "./infra/packages-cache";
import { createWorkspaceUpdater } from "./infra/workspace-updater";

/** Delay before the first automatic check, letting OpenCode settle first. */
const STARTUP_DELAY_MS = 15_000;

interface Settings {
  readonly autoUpdate: boolean;
  readonly commandName: string;
  readonly changelogPath: string;
  readonly packagesDirs: readonly string[];
  readonly filter: PluginFilter;
}

function readStringList(raw: Record<string, unknown>, key: string): string[] | undefined {
  const value = raw[key];
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => typeof entry === "string");
}

function parseSettings(raw: Record<string, unknown>): Settings {
  const packagesDir = raw.packagesDir;
  const dirs = Array.isArray(packagesDir)
    ? packagesDir.filter((entry): entry is string => typeof entry === "string")
    : typeof packagesDir === "string"
      ? [packagesDir]
      : resolveCacheCandidates(process.env);
  return {
    autoUpdate: raw.autoUpdate !== false,
    commandName: typeof raw.commandName === "string" && raw.commandName !== "" ? raw.commandName : "plugins-check",
    changelogPath: typeof raw.changelogPath === "string" ? raw.changelogPath : defaultChangelogPath(process.env),
    packagesDirs: dirs,
    filter: {
      packages: readStringList(raw, "packages"),
      exclude: readStringList(raw, "exclude"),
    },
  };
}

function composeDependencies(settings: Settings): CheckDependencies {
  return {
    cache: createPackagesCache(settings.packagesDirs),
    registry: createNpmRegistry(),
    updater: createWorkspaceUpdater(),
    changelog: createFileChangelog(settings.changelogPath),
  };
}

export const PluginUpdatesPlugin: Plugin = async (input, rawOptions) => {
  const settings = parseSettings(rawOptions ?? {});
  const deps = composeDependencies(settings);
  // Single explicit boundary cast: the structural UI port insulates the
  // plugin from SDK client generics.
  const notifier = createNotifier(input.client as unknown as UiClient);

  async function runCheck(autoUpdate: boolean) {
    return checkPlugins(deps, settings.filter, autoUpdate);
  }

  // Automatic check shortly after startup; a failure here must never
  // surface as a plugin load error.
  const startupTimer = setTimeout(() => {
    runCheck(settings.autoUpdate)
      .then((outcome) => notifier.toast(renderToastSummary(outcome)))
      .catch(() => {});
  }, STARTUP_DELAY_MS);

  return {
    /** Registers /plugins-check so the command exists out of the box. */
    "config": async (config) => {
      config.command ??= {};
      config.command[settings.commandName] ??= {
        description: "Check installed plugins against npm and apply updates",
        template: "Check installed OpenCode plugins for updates.",
      };
    },

    /** Handles /plugins-check without spending a model turn. */
    "command.execute.before": async (cmd, output) => {
      if (cmd.command !== settings.commandName) return;
      const outcome = await runCheck(true);
      await notifier.say(cmd.sessionID, renderCheckReport(outcome));
      (output as { noReply?: boolean }).noReply = true;
    },

    "dispose": async () => {
      clearTimeout(startupTimer);
    },
  };
};

export default PluginUpdatesPlugin;
