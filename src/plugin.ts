/**
 * OpenCode Plugin Updates
 *
 * Notifies about outdated npm-installed OpenCode plugins. OpenCode
 * resolves a "@latest" plugin spec once and then treats the cached
 * workspace as permanently fresh, so newer npm releases never arrive
 * on their own. The startup check only notifies; updates happen
 * exclusively through the manual /plugins-update command.
 *
 * @author arttttt
 * @license Apache-2.0
 */

import type { Plugin } from "@opencode-ai/plugin";

import type { PluginFilter } from "./app/policy";
import { checkPlugins, updatePlugins, type CheckDependencies, type UpdateDependencies } from "./app/check-plugins";
import { renderCheckReport, renderStaleToast, renderUpdateReport } from "./app/report";
import { createNpmRegistry } from "./infra/npm-registry";
import { createNotifier, type UiClient } from "./infra/opencode-ui";
import { createPackagesCache, resolveCacheCandidates } from "./infra/packages-cache";
import { createWorkspaceUpdater } from "./infra/workspace-updater";

/** Delay before the first automatic check, letting OpenCode settle first. */
const STARTUP_DELAY_MS = 15_000;

interface Settings {
  readonly checkCommandName: string;
  readonly updateCommandName: string;
  readonly packagesDirs: readonly string[];
  readonly filter: PluginFilter;
}

function readStringList(raw: Record<string, unknown>, key: string): string[] | undefined {
  const value = raw[key];
  if (!Array.isArray(value)) return undefined;
  return value.filter((entry): entry is string => typeof entry === "string");
}

function readCommandName(raw: Record<string, unknown>, key: string, fallback: string): string {
  const value = raw[key];
  return typeof value === "string" && value !== "" ? value : fallback;
}

function parseSettings(raw: Record<string, unknown>): Settings {
  const packagesDir = raw.packagesDir;
  const dirs = Array.isArray(packagesDir)
    ? packagesDir.filter((entry): entry is string => typeof entry === "string")
    : typeof packagesDir === "string"
      ? [packagesDir]
      : resolveCacheCandidates(process.env);
  return {
    checkCommandName: readCommandName(raw, "checkCommandName", "plugins-check"),
    updateCommandName: readCommandName(raw, "updateCommandName", "plugins-update"),
    packagesDirs: dirs,
    filter: {
      packages: readStringList(raw, "packages"),
      exclude: readStringList(raw, "exclude"),
    },
  };
}

function composeDependencies(settings: Settings): UpdateDependencies {
  const deps: CheckDependencies = {
    cache: createPackagesCache(settings.packagesDirs),
    registry: createNpmRegistry(),
  };
  return { ...deps, updater: createWorkspaceUpdater() };
}

export const PluginUpdatesPlugin: Plugin = async (input, rawOptions) => {
  const settings = parseSettings(rawOptions ?? {});
  const deps = composeDependencies(settings);
  // Single explicit boundary cast: the structural UI port insulates the
  // plugin from SDK client generics.
  const notifier = createNotifier(input.client as unknown as UiClient);

  // Automatic check shortly after startup: notification only, never an
  // update; a failure here must never surface as a plugin load error.
  const startupTimer = setTimeout(() => {
    checkPlugins(deps, settings.filter)
      .then((statuses) => {
        const toast = renderStaleToast(statuses);
        if (toast !== null) return notifier.toast(toast);
      })
      .catch(() => {});
  }, STARTUP_DELAY_MS);

  return {
    /** Registers both commands so they exist out of the box. */
    "config": async (config) => {
      config.command ??= {};
      config.command[settings.checkCommandName] ??= {
        description: "List installed plugins with available updates",
        template: "List installed OpenCode plugins and their available updates.",
      };
      config.command[settings.updateCommandName] ??= {
        description: "Apply pending updates to installed plugins",
        template: "Update outdated OpenCode plugins to their latest versions.",
      };
    },

    /** Handles both commands without spending a model turn. */
    "command.execute.before": async (cmd, output) => {
      if (cmd.command === settings.checkCommandName) {
        const statuses = await checkPlugins(deps, settings.filter);
        await notifier.say(cmd.sessionID, renderCheckReport(statuses));
        (output as { noReply?: boolean }).noReply = true;
        return;
      }
      if (cmd.command === settings.updateCommandName) {
        const outcome = await updatePlugins(deps, settings.filter);
        await notifier.say(cmd.sessionID, renderUpdateReport(outcome));
        (output as { noReply?: boolean }).noReply = true;
      }
    },

    "dispose": async () => {
      clearTimeout(startupTimer);
    },
  };
};

export default PluginUpdatesPlugin;
