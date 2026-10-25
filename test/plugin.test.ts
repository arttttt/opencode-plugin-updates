/**
 * The composition root's hooks, driven the way OpenCode 1 drives them. The
 * cache root does not exist, so no plugin is found and the registry is never
 * asked: these tests stay offline.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import path from "node:path";

import { PluginUpdatesPlugin } from "../src/plugin";

type Hooks = Record<string, (...args: any[]) => Promise<unknown>>;

const loaded: Hooks[] = [];
afterEach(async () => {
  // Each load schedules a startup check; dispose cancels it.
  await Promise.all(loaded.splice(0).map((hooks) => hooks.dispose?.()));
});

/** Load the plugin with a recording client; return its hooks and what it printed. */
async function load(options: Record<string, unknown> = {}) {
  const prompts: unknown[] = [];
  const client = {
    tui: { showToast: async () => {} },
    session: { prompt: async (request: unknown) => void prompts.push(request) },
  };
  const packagesDir = path.join(tmpdir(), "opencode-plugin-updates-no-cache");
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

      expect(prompts).toEqual([
        { path: { id: "s1" }, body: { noReply: true, parts: [{ type: "text", text: expect.stringContaining("Plugins:") }] } },
      ]);
      // The throw is what stops the LLM dispatch; OpenCode 1's output for this
      // hook is {parts} only, so nothing else is written to it.
      expect(output).toEqual({ parts: [] });
    },
  );

  test("passes any other command through untouched", async () => {
    const { hooks, prompts } = await load();
    const output = { parts: [] };

    await hooks["command.execute.before"]({ command: "review", sessionID: "s1", arguments: "" }, output);

    expect(prompts).toEqual([]);
    expect(output).toEqual({ parts: [] });
  });
});
