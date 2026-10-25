/**
 * The npm configuration OpenCode installs a plugin with, and what it says
 * about where that plugin's versions live.
 *
 * OpenCode 1 hands registry and auth to npm's own config engine, loaded with
 * the plugin's cache workspace as cwd (packages/core/src/npm-config.ts at
 * v1.19.4). Loading it the same way reads the same sources — npm_config_*
 * env, ~/.npmrc (or $NPM_CONFIG_USERCONFIG), the global npmrc — so a version
 * is looked up where OpenCode would install it from. Not the user's project
 * .npmrc: OpenCode never reads that for plugins.
 */

import path from "node:path";

// @ts-expect-error npm does not publish types for this internal config API.
import Config from "@npmcli/config";
// @ts-expect-error npm does not publish types for this internal config API.
import { definitions, flatten, nerfDarts, shorthands } from "@npmcli/config/lib/definitions/index.js";

export type NpmConfig = Readonly<Record<string, unknown>>;

/** Loads the flat npm config for `dir`, as OpenCode does. */
export type NpmConfigLoader = (dir: string) => Promise<NpmConfig>;

const PUBLIC_REGISTRY = "https://registry.npmjs.org";

/** Loads the flat config like OpenCode's NpmConfig.load; an unreadable config is the defaults, `{}`. */
export function createNpmConfigLoader(env: NodeJS.ProcessEnv = process.env): NpmConfigLoader {
  return async (dir) => {
    try {
      const config = new Config({
        // Where npm would keep its builtin npmrc; this package ships none.
        npmPath: path.join(import.meta.dir, "..", ".."),
        cwd: dir,
        env: { ...env },
        argv: [process.execPath, process.execPath],
        execPath: process.execPath,
        platform: process.platform,
        definitions,
        flatten,
        nerfDarts,
        shorthands,
        warn: false,
      });
      await config.load();
      return config.flat as NpmConfig;
    } catch {
      return {};
    }
  };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** The registry `name` installs from: its scope's registry, else the default; no trailing slash. */
export function registryFor(name: string, config: NpmConfig): string {
  const scope = name.startsWith("@") ? name.slice(0, name.indexOf("/")) : null;
  const registry = (scope !== null ? text(config[`${scope}:registry`]) : null) ?? text(config.registry) ?? PUBLIC_REGISTRY;
  return registry.endsWith("/") ? registry.slice(0, -1) : registry;
}

/**
 * npm's credential keys for `registry`, most specific first:
 * `//host/a/b/`, `//host/a/`, `//host/` — registries such as GitLab's or
 * Artifactory's live under a path, and their tokens are keyed by it.
 */
function credentialKeys(registry: string): string[] {
  let url: URL;
  try {
    url = new URL(registry);
  } catch {
    return [];
  }
  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  return segments.map((_, index) => `//${url.host}/${segments.slice(0, segments.length - index).join("/")}/`).concat(`//${url.host}/`);
}

/**
 * The Authorization header npm would send to `registry`: the first key, most
 * specific first, with an `_authToken` (Bearer) or `_auth` (Basic). npmrc
 * `${VAR}` references are already expanded by the loader. None when there
 * are no credentials.
 */
export function authHeadersFor(registry: string, config: NpmConfig): Record<string, string> {
  for (const key of credentialKeys(registry)) {
    const token = text(config[`${key}:_authToken`]);
    if (token !== null) return { Authorization: `Bearer ${token}` };
    const basic = text(config[`${key}:_auth`]);
    if (basic !== null) return { Authorization: `Basic ${basic}` };
  }
  return {};
}
