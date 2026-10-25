/**
 * npm registry adapter: resolves the "latest" dist-tag of a plugin, from the
 * registry and with the credentials OpenCode would install it with.
 */

import type { InstalledPlugin } from "../domain/entities";
import type { NpmRegistry } from "../app/ports";
import { authHeadersFor, createNpmConfigLoader, registryFor, type NpmConfigLoader } from "./npm-config";

const FETCH_TIMEOUT_MS = 5_000;

/** Scoped names need "%2F" instead of "/" in the registry URL path. */
export function distTagsUrl(registry: string, name: string): string {
  const encoded = name.startsWith("@") ? name.replace("/", "%2F") : encodeURIComponent(name);
  return `${registry}/-/package/${encoded}/dist-tags`;
}

type FetchLike = (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<Response>;

export interface NpmRegistryOptions {
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
  /** Loads the npm config for a plugin's cache workspace. */
  readonly loadConfig?: NpmConfigLoader;
}

export function createNpmRegistry(options: NpmRegistryOptions = {}): NpmRegistry {
  const { fetch: fetchImpl = fetch, timeoutMs = FETCH_TIMEOUT_MS, loadConfig = createNpmConfigLoader() } = options;
  return {
    async latest(plugin: InstalledPlugin): Promise<string | null> {
      const config = await loadConfig(plugin.workspaceDir);
      const registry = registryFor(plugin.name, config);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(distTagsUrl(registry, plugin.name), {
          signal: controller.signal,
          headers: { Accept: "application/json", ...authHeadersFor(registry, config) },
        });
        if (!response.ok) return null;
        const tags = (await response.json()) as Record<string, unknown>;
        const latest = tags.latest;
        return typeof latest === "string" ? latest : null;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
