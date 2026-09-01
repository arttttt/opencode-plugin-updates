/**
 * npm registry adapter: resolves the "latest" dist-tag of a package.
 */

import type { NpmRegistry } from "../app/ports";

const REGISTRY = "https://registry.npmjs.org";
const FETCH_TIMEOUT_MS = 5_000;

/** Scoped names need "%2F" instead of "/" in the registry URL path. */
export function distTagsUrl(name: string): string {
  const encoded = name.startsWith("@") ? name.replace("/", "%2F") : encodeURIComponent(name);
  return `${REGISTRY}/-/package/${encoded}/dist-tags`;
}

type FetchLike = (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<Response>;

export function createNpmRegistry(fetchImpl: FetchLike = fetch, timeoutMs: number = FETCH_TIMEOUT_MS): NpmRegistry {
  return {
    async latest(name: string): Promise<string | null> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(distTagsUrl(name), {
          signal: controller.signal,
          headers: { Accept: "application/json" },
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
