import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createFileChangelog, formatChangelogEntry } from "../src/infra/changelog";
import { createNpmRegistry, distTagsUrl } from "../src/infra/npm-registry";

describe("distTagsUrl", () => {
  test("percent-encodes the scope separator", () => {
    expect(distTagsUrl("@bybrawe/opencode-loop")).toBe(
      "https://registry.npmjs.org/-/package/@bybrawe%2Fopencode-loop/dist-tags",
    );
    expect(distTagsUrl("opencode-pr-signature")).toBe(
      "https://registry.npmjs.org/-/package/opencode-pr-signature/dist-tags",
    );
  });
});

describe("createNpmRegistry", () => {
  test("returns the latest dist-tag on success", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ latest: "1.2.3" }), { status: 200 });
    expect(await createNpmRegistry(fetchImpl).latest("any")).toBe("1.2.3");
  });

  test("returns null on non-OK responses and malformed bodies", async () => {
    const notOk = async () => new Response("nope", { status: 404 });
    expect(await createNpmRegistry(notOk).latest("any")).toBeNull();

    const malformed = async () => new Response("not json", { status: 200 });
    expect(await createNpmRegistry(malformed).latest("any")).toBeNull();
  });
});

describe("changelog", () => {
  test("formatChangelogEntry renders one bullet per update", () => {
    const text = formatChangelogEntry(
      [
        { name: "a", from: "1.0.0", to: "1.0.1" },
        { name: "b", from: "2.0.0", to: "2.1.0" },
      ],
      "2026-09-01T12:00:00.000Z",
    );
    expect(text).toContain("## 2026-09-01 12:00:00 UTC");
    expect(text).toContain("- **a**: 1.0.0 -> 1.0.1");
    expect(text).toContain("- **b**: 2.0.0 -> 2.1.0");
  });

  test("prepend keeps newer entries on top across writes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "opu-log-"));
    const file = path.join(dir, "plugin-updates.log.md");
    const changelog = createFileChangelog(file);

    await changelog.append([{ name: "old", from: "1", to: "2" }]);
    await changelog.append([{ name: "new", from: "3", to: "4" }]);

    const contents = await readFile(file, "utf8");
    expect(contents.indexOf("**new**")).toBeLessThan(contents.indexOf("**old**"));
    expect(contents.startsWith("# Plugin Update Changelog")).toBe(true);

    await changelog.append([]);
    expect(await readFile(file, "utf8")).toBe(contents);
    await rm(dir, { recursive: true, force: true });
  });

  test("creates the target directory when missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "opu-log-"));
    const file = path.join(dir, "nested", "deep", "log.md");
    await createFileChangelog(file).append([{ name: "x", from: "1", to: "2" }]);
    expect((await readFile(file, "utf8")).length).toBeGreaterThan(0);
    await rm(dir, { recursive: true, force: true });
  });
});
