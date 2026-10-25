import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { authHeadersFor, createNpmConfigLoader, registryFor } from "../src/infra/npm-config";

describe("registryFor", () => {
  test("uses the public registry when the config names none", () => {
    expect(registryFor("plain", {})).toBe("https://registry.npmjs.org");
  });

  test("uses the configured registry, without its trailing slash", () => {
    expect(registryFor("plain", { registry: "https://mirror.example/npm/" })).toBe("https://mirror.example/npm");
  });

  test("uses a scope's own registry for that scope's packages only", () => {
    const config = { registry: "https://mirror.example/", "@acme:registry": "https://npm.acme.dev/" };
    expect(registryFor("@acme/plugin", config)).toBe("https://npm.acme.dev");
    expect(registryFor("@other/plugin", config)).toBe("https://mirror.example");
    expect(registryFor("plain", config)).toBe("https://mirror.example");
  });
});

describe("authHeadersFor", () => {
  test("sends a token as Bearer and _auth as Basic", () => {
    expect(authHeadersFor("https://npm.acme.dev", { "//npm.acme.dev/:_authToken": "t" })).toEqual({ Authorization: "Bearer t" });
    expect(authHeadersFor("https://npm.acme.dev", { "//npm.acme.dev/:_auth": "dXNlcjpwYXNz" })).toEqual({
      Authorization: "Basic dXNlcjpwYXNz",
    });
  });

  // GitLab and Artifactory registries live under a path and key their
  // tokens by it; npm takes the most specific key that has credentials.
  test("takes the most specific key for a registry under a path", () => {
    const registry = "https://gitlab.example/api/v4/packages/npm";
    expect(authHeadersFor(registry, { "//gitlab.example/api/v4/packages/npm/:_authToken": "deep", "//gitlab.example/:_authToken": "host" })).toEqual({
      Authorization: "Bearer deep",
    });
    expect(authHeadersFor(registry, { "//gitlab.example/:_authToken": "host" })).toEqual({ Authorization: "Bearer host" });
  });

  test("sends nothing without credentials for that host", () => {
    expect(authHeadersFor("https://registry.npmjs.org", { "//npm.acme.dev/:_authToken": "t" })).toEqual({});
    expect(authHeadersFor("not a url", {})).toEqual({});
  });
});

describe("createNpmConfigLoader", () => {
  // The real @npmcli/config, as OpenCode loads it: a user npmrc named by
  // the environment, with an env reference in its token.
  test("reads the user npmrc and expands ${VAR} in it", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "opu-npmrc-"));
    const userconfig = path.join(dir, ".npmrc");
    await writeFile(
      userconfig,
      ["registry=https://mirror.example/npm/", "@acme:registry=https://npm.acme.dev/", "//npm.acme.dev/:_authToken=${ACME_TOKEN}", ""].join("\n"),
    );
    const workspace = await mkdtemp(path.join(tmpdir(), "opu-workspace-"));
    await writeFile(path.join(workspace, "package.json"), "{}");

    const load = createNpmConfigLoader({ PATH: process.env.PATH, HOME: dir, npm_config_userconfig: userconfig, ACME_TOKEN: "from-env" });
    const config = await load(workspace);

    expect(registryFor("plain", config)).toBe("https://mirror.example/npm");
    expect(registryFor("@acme/plugin", config)).toBe("https://npm.acme.dev");
    expect(authHeadersFor("https://npm.acme.dev", config)).toEqual({ Authorization: "Bearer from-env" });
  });

  test("an npm_config_registry in the environment wins over the npmrc", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "opu-npmrc-"));
    const userconfig = path.join(dir, ".npmrc");
    await writeFile(userconfig, "registry=https://from-file.example/\n");

    const load = createNpmConfigLoader({
      PATH: process.env.PATH,
      HOME: dir,
      npm_config_userconfig: userconfig,
      npm_config_registry: "https://from-env.example/",
    });

    expect(registryFor("plain", await load(dir))).toBe("https://from-env.example");
  });
});
