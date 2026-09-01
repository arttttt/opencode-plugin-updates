/**
 * OpenCode UI adapter: toasts and no-reply chat messages.
 *
 * Structural typing over the SDK client keeps this layer decoupled from
 * SDK version churn; every call is fail-soft so update reporting can
 * never break a session.
 */

export interface ToastVariant {
  variant?: "info" | "success" | "warning" | "error";
}

export interface UiClient {
  tui?: { showToast?: (options?: unknown) => unknown };
  session?: { prompt?: (options?: unknown) => unknown };
}

export interface Notifier {
  toast(message: string): Promise<void>;
  /** Prints a report into the session without triggering a model turn. */
  say(sessionID: string, text: string): Promise<void>;
}

export function createNotifier(client: UiClient): Notifier {
  return {
    async toast(message: string): Promise<void> {
      try {
        await client.tui?.showToast?.({ body: { message, variant: "info" } });
      } catch {
        // Toasts are best-effort.
      }
    },
    async say(sessionID: string, text: string): Promise<void> {
      try {
        await client.session?.prompt?.({
          path: { id: sessionID },
          body: { noReply: true, parts: [{ type: "text", text }] },
        });
      } catch {
        // Failing to print a report must not surface as a plugin error.
      }
    },
  };
}
