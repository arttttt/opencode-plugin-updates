import { describe, expect, test } from "bun:test";

import { isNewer, isSameVersion } from "../src/domain/versions";

describe("isNewer", () => {
  test.each([
    ["1.1.0", "1.0.0", true],
    ["1.0.0", "1.1.0", false],
    ["1.10.0", "1.9.0", true],
    ["1.1.0", "1.1.0-beta.1", true],
    ["1.1.0-beta.1", "1.1.0", false],
    ["v1.2.3", "1.2.3", false],
  ])("%s newer than %s: %p", (candidate, current, newer) => {
    expect(isNewer(candidate, current)).toBe(newer);
  });

  test("compares anything that is not semver as text", () => {
    expect(isNewer("1.0.0", "not-a-version")).toBe(true);
    expect(isNewer("not-a-version", "not-a-version")).toBe(false);
  });
});

describe("isSameVersion", () => {
  test.each([
    ["1.2.3", "1.2.3", true],
    ["v1.2.3", "1.2.3", true],
    ["1.2.3", "1.2.4", false],
    ["not-a-version", "not-a-version", true],
    ["not-a-version", "1.2.3", false],
  ])("%s and %s: %p", (a, b, same) => {
    expect(isSameVersion(a, b)).toBe(same);
  });
});
