/**
 * At most one run at a time.
 *
 * Two overlapping /plugins-update runs would reinstall the same workspaces
 * concurrently, and neither bun nor npm locks a directory against that.
 * A call made while a run is in flight is turned away rather than queued:
 * the run in flight already does what it asked for.
 */

export type SingleFlight = <T>(task: () => Promise<T>) => Promise<T | null>;

/** Runs `task` unless another run is in flight, in which case resolves to null. */
export function createSingleFlight(): SingleFlight {
  let running = false;
  return async (task) => {
    if (running) return null;
    running = true;
    try {
      return await task();
    } finally {
      running = false;
    }
  };
}
