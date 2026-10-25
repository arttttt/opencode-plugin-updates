/**
 * The composition root's hooks, driven the way OpenCode 1 drives them. The
 * cache root does not exist, so no plugin is found and the registry is never
 * asked: these tests stay offline.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import path from "node:path";

import { UPDATE_ALREADY_RUNNING } from "../src/app/report";
import { resolveCacheCandidates } from "../src/infra/packages-cache";
import { PluginUpdatesPlugin, resolvePackagesDirs } from "../src/plugin";

type Hooks = Record<string, (...args: any[]) => Promise<unknown>>;

const loaded: Hooks[] = [];
afterEach(async () => {
  // Each load schedules a startup check; dispose cancels it.
  await Promise.all(loaded.splice(0).map((hooks) => hooks.dispose?.()));
});

const packagesDir = path.join(tmpdir(), "opencode-plugin-updates-no-cache");

/** Load the plugin with a recording client; return its hooks and what it printed. */
async function load(options: Record<string, unknown> = {}) {
  const prompts: unknown[] = [];
  const client = {
    tui: { showToast: async () => {} },
    session: { prompt: async (request: unknown) => void prompts.push(request) },
  };
  const hooks = (await PluginUpdatesPlugin({ client } as never, { packagesDir, ...options })) as unknown as Hooks;
  loaded.push(hooks);
  return { hooks, prompts };
}

describe("config hook", () => {
  test("registers both commands", async () => {
    const { hooks } = await load();
    const config: { command?: Record<string, { description: string }> } = {};

    await hooks.config(config);

    expect(Object.keys(config.command ?? {}).sort()).toEqual(["plugins-check", "plugins-update"]);
  });

  test("leaves a command the user already defined alone, and honours custom names", async () => {
    const { hooks } = await load({ checkCommandName: "pc" });
    const mine = { description: "mine", template: "mine" };
    const config = { command: { "plugins-update": mine } as Record<string, unknown> };

    await hooks.config(config);

    expect(config.command["plugins-update"]).toBe(mine);
    expect(Object.keys(config.command).sort()).toEqual(["pc", "plugins-update"]);
  });
});

describe("command.execute.before", () => {
  test.each(["plugins-check", "plugins-update"])(
    "%s prints its report without a model turn, then aborts the command",
    async (command) => {
      const { hooks, prompts } = await load();
      const output = { parts: [] };

      await expect(hooks["command.execute.before"]({ command, sessionID: "s1", arguments: "" }, output)).rejects.toThrow(
        "command handled by the plugin",
      );

      // The cache root does not exist, so the report says where it looked.
      const text = expect.stringContaining(`No npm-installed plugins found. Searched:\n- ${packagesDir}`);
      expect(prompts).toEqual([{ path: { id: "s1" }, body: { noReply: true, parts: [{ type: "text", text }] } }]);
      // The throw is what stops the LLM dispatch; OpenCode 1's output for this
      // hook is {parts} only, so nothing else is written to it.
      expect(output).toEqual({ parts: [] });
    },
  );

  // Two loads stand for two projects in one OpenCode process: the lock is
  // shared, so their updates cannot reinstall the same workspaces at once.
  test("turns away a /plugins-update made while another is running", async () => {
    const first = await load();
    const second = await load();
    const command = { command: "plugins-update", arguments: "" };

    const errors = await Promise.all(
      [first, second].map(({ hooks }, index) =>
        hooks["command.execute.before"]({ ...command, sessionID: `s${index + 1}` }, { parts: [] }).then(
          () => null,
          (error: Error) => error.message,
        ),
      ),
    );

    expect(errors).toEqual([expect.stringContaining("command handled by the plugin"), expect.stringContaining("command handled by the plugin")]);

    expect(second.prompts).toEqual([
      { path: { id: "s2" }, body: { noReply: true, parts: [{ type: "text", text: UPDATE_ALREADY_RUNNING }] } },
    ]);
    expect(first.prompts).toEqual([
      { path: { id: "s1" }, body: { noReply: true, parts: [{ type: "text", text: expect.stringContaining("No npm-installed plugins found.") }] } },
    ]);
  });

  test("passes any other command through untouched", async () => {
    const { hooks, prompts } = await load();
    const output = { parts: [] };

    await hooks["command.execute.before"]({ command: "review", sessionID: "s1", arguments: "" }, output);

    expect(prompts).toEqual([]);
    expect(output).toEqual({ parts: [] });
  });
});

describe("resolvePackagesDirs", () => {
  const env = { XDG_CACHE_HOME: "/xdg" };
  const detected = resolveCacheCandidates(env);

  test("uses the directories it names, as a string or a list", () => {
    expect(resolvePackagesDirs("/a", env)).toEqual(["/a"]);
    expect(resolvePackagesDirs(["/a", 7, "/b"], env)).toEqual(["/a", "/b"]);
  });

  // `"packagesDir": []` is what the README's options example shows: it
  // searched no directory at all, so nothing was ever found.
  test.each([[undefined], [[]], [""], [[""]], [[7]]])("detects the cache roots when given %p", (packagesDir) => {
    expect(resolvePackagesDirs(packagesDir, env)).toEqual(detected);
  });
});
