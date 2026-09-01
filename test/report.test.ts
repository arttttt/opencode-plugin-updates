import { describe, expect, test } from "bun:test";

import type { CheckOutcome } from "../src/domain/entities";
import { renderCheckReport, renderToastSummary } from "../src/app/report";

describe("renderCheckReport", () => {
  test("lists every plugin with its resolution state", () => {
    const outcome: CheckOutcome = {
      statuses: [
        { name: "fresh", installed: "1.0.0", latest: "1.0.0", updateAvailable: false },
        { name: "stale", installed: "1.0.0", latest: "1.1.0", updateAvailable: true },
        { name: "unknown-registry", installed: "1.0.0", latest: null, updateAvailable: false },
        { name: "broken-install", installed: null, latest: "2.0.0", updateAvailable: false },
      ],
      applied: [],
    };
    const report = renderCheckReport(outcome);
    expect(report).toContain("- fresh: 1.0.0 =  up to date");
    expect(report).toContain("- stale: 1.0.0 -> 1.1.0");
    expect(report).toContain("- unknown-registry: 1.0.0 =  up to date");
    expect(report).toContain("- broken-install: unknown =  up to date");
    expect(report).not.toContain("Restart");
  });

  test("reports applied updates and asks for a restart", () => {
    const outcome: CheckOutcome = {
      statuses: [{ name: "stale", installed: "1.0.0", latest: "1.1.0", updateAvailable: true }],
      applied: [{ name: "stale", from: "1.0.0", to: "1.1.0" }],
    };
    const report = renderCheckReport(outcome);
    expect(report).toContain("Updated:");
    expect(report).toContain("- stale: 1.0.0 -> 1.1.0");
    expect(report).toContain("Restart OpenCode");
  });
});

describe("renderToastSummary", () => {
  test("counts applied updates first", () => {
    const outcome: CheckOutcome = {
      statuses: [],
      applied: [{ name: "a", from: "1", to: "2" }],
    };
    expect(renderToastSummary(outcome)).toBe("plugin-updates: applied 1 update(s)");
  });

  test("suggests the command when updates are pending", () => {
    const outcome: CheckOutcome = {
      statuses: [
        { name: "a", installed: "1", latest: "2", updateAvailable: true },
        { name: "b", installed: "1", latest: "2", updateAvailable: true },
      ],
      applied: [],
    };
    expect(renderToastSummary(outcome)).toBe("plugin-updates: 2 update(s) available, run /plugins-check");
  });

  test("quiet when everything is current", () => {
    const outcome: CheckOutcome = {
      statuses: [{ name: "a", installed: "1", latest: "1", updateAvailable: false }],
      applied: [],
    };
    expect(renderToastSummary(outcome)).toBe("plugin-updates: all plugins up to date");
  });
});
