import { describe, expect, test } from "bun:test";

import type { InstalledPlugin } from "../src/domain/entities";
import type { NpmConfig } from "../src/infra/npm-config";
import { createNpmRegistry, distTagsUrl } from "../src/infra/npm-registry";

const PLUGIN: InstalledPlugin = { name: "any", workspaceDir: "/cache/packages/any@latest", installed: "1.0.0" };

/** A config loader that returns `config` and records the directories it was asked about. */
function configOf(config: NpmConfig) {
  const dirs: string[] = [];
  const loadConfig = async (dir: string) => {
    dirs.push(dir);
    return config;
  };
  return { dirs, loadConfig };
}

const PUBLIC = configOf({}).loadConfig;

describe("distTagsUrl", () => {
  test("percent-encodes the scope separator", () => {
    expect(distTagsUrl("https://registry.npmjs.org", "@bybrawe/opencode-loop")).toBe(
      "https://registry.npmjs.org/-/package/@bybrawe%2Fopencode-loop/dist-tags",
    );
    expect(distTagsUrl("https://registry.npmjs.org", "opencode-pr-signature")).toBe(
      "https://registry.npmjs.org/-/package/opencode-pr-signature/dist-tags",
    );
  });
});

describe("createNpmRegistry", () => {
  test("returns the latest dist-tag on success", async () => {
    const fetch = async () => new Response(JSON.stringify({ latest: "1.2.3" }), { status: 200 });
    expect(await createNpmRegistry({ fetch, loadConfig: PUBLIC }).latest(PLUGIN)).toBe("1.2.3");
  });

  test("returns null on non-OK responses and malformed bodies", async () => {
    const notOk = async () => new Response("nope", { status: 404 });
    expect(await createNpmRegistry({ fetch: notOk, loadConfig: PUBLIC }).latest(PLUGIN)).toBeNull();

    const malformed = async () => new Response("not json", { status: 200 });
    expect(await createNpmRegistry({ fetch: malformed, loadConfig: PUBLIC }).latest(PLUGIN)).toBeNull();
  });

  test("gives up on a registry that does not answer within the timeout", async () => {
    // Answers only by rejecting once aborted, as fetch does.
    const silent = (_: string, init?: { signal?: AbortSignal }) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));

    expect(await createNpmRegistry({ fetch: silent, timeoutMs: 10, loadConfig: PUBLIC }).latest(PLUGIN)).toBeNull();
  });

  // Where OpenCode installs the plugin from: the config of its cache
  // workspace decides the registry and the credentials.
  test("asks the registry and sends the credentials the plugin's workspace config names", async () => {
    const requests: { url: string; headers?: Record<string, string> }[] = [];
    const fetch = async (url: string, init?: { headers?: Record<string, string> }) => {
      requests.push({ url, headers: init?.headers });
      return new Response(JSON.stringify({ latest: "2.0.0" }), { status: 200 });
    };
    const { dirs, loadConfig } = configOf({
      registry: "https://mirror.example/npm/",
      "//mirror.example/npm/:_authToken": "secret",
    });

    expect(await createNpmRegistry({ fetch, loadConfig }).latest(PLUGIN)).toBe("2.0.0");

    expect(dirs).toEqual([PLUGIN.workspaceDir]);
    expect(requests).toEqual([
      {
        url: "https://mirror.example/npm/-/package/any/dist-tags",
        headers: { Accept: "application/json", Authorization: "Bearer secret" },
      },
    ]);
  });
});
