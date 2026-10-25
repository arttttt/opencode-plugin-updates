import { describe, expect, test } from "bun:test";

import { createSingleFlight } from "../src/app/single-flight";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

describe("createSingleFlight", () => {
  test("turns a call away while another runs, and runs again once it is done", async () => {
    const flight = createSingleFlight();
    const gate = deferred();

    const first = flight(async () => {
      await gate.promise;
      return "first";
    });
    expect(await flight(async () => "second")).toBeNull();

    gate.resolve();
    expect(await first).toBe("first");
    expect(await flight(async () => "third")).toBe("third");
  });

  test("a run that throws still frees the slot", async () => {
    const flight = createSingleFlight();

    await expect(flight(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");

    expect(await flight(async () => "after")).toBe("after");
  });
});
