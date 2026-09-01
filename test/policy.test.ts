import { describe, expect, test } from "bun:test";

import { shouldConsider } from "../src/app/policy";

describe("shouldConsider", () => {
  test("no filter considers everything", () => {
    expect(shouldConsider("any-plugin", {})).toBe(true);
    expect(shouldConsider("any-plugin", { packages: [], exclude: [] })).toBe(true);
  });

  test("non-empty whitelist is exclusive", () => {
    const filter = { packages: ["a", "b"] };
    expect(shouldConsider("a", filter)).toBe(true);
    expect(shouldConsider("b", filter)).toBe(true);
    expect(shouldConsider("c", filter)).toBe(false);
  });

  test("blacklist removes entries without a whitelist", () => {
    const filter = { exclude: ["noisy"] };
    expect(shouldConsider("noisy", filter)).toBe(false);
    expect(shouldConsider("quiet", filter)).toBe(true);
  });

  test("whitelist wins over blacklist", () => {
    expect(shouldConsider("x", { packages: ["x"], exclude: ["x"] })).toBe(true);
  });
});
