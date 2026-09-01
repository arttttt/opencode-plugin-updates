import { describe, expect, test } from "bun:test";

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
