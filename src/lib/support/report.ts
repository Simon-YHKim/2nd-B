import { withTimeout } from "../async/with-timeout";

export type ReportKind = "inquiry" | "bug";
export type ReportMetadata = { app_version: string; screen_path: "/support"; locale: string };
export type ReportRequest = {
  p_request_id: string;
  p_kind: ReportKind;
  p_body: string;
  p_metadata: ReportMetadata;
  p_consent_version: "support-v1";
};
export type ReportState =
  | { phase: "editing" | "sending" }
  | { phase: "failed"; reason: "offline" | "unconfirmed" | "limited" | "invalid" }
  | { phase: "sent"; receipt: string };

export const REPORT_MAX_LENGTH = 2000;
export const REPORT_TIMEOUT_MS = 15000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Deliberately absent from every release configuration until the server and
// published privacy notice have been verified. Expo replaces this literal access.
export function inAppReportsEnabled(value = process.env.EXPO_PUBLIC_IN_APP_REPORTS): boolean {
  return value === "true";
}

export function supportDestination(kind: ReportKind, enabled: boolean): "form" | string {
  if (enabled) return "form";
  return kind === "bug"
    ? "mailto:kim0405@hayangzip.com?subject=Bug%20report"
    : "mailto:kim0405@hayangzip.com";
}

/** In-memory, one form/owner only. No queue, content logging or device storage.
 * Once dispatched, retries keep the exact envelope, including its request ID.
 * A timeout can mean the server committed but the response was lost. */
export function createReportSender(deps: {
  enabled: () => boolean;
  assertOwner: () => void;
  online: () => Promise<boolean>;
  uuid: () => string;
  send: (request: ReportRequest, signal: AbortSignal) => Promise<unknown>;
  changed: (state: ReportState) => void;
}) {
  let state: ReportState = { phase: "editing" };
  let request: ReportRequest | undefined;
  let disposed = false;
  let active: AbortController | undefined;
  const publish = (next: ReportState) => {
    if (!disposed) { state = next; deps.changed(next); }
  };
  return {
    get state() { return state; },
    get locked() { return request !== undefined; },
    dispose() { disposed = true; active?.abort(); request = undefined; },
    async submit(body: string, consent: boolean, kind: ReportKind, metadata: ReportMetadata) {
      if (disposed || state.phase === "sending" || state.phase === "sent" || !deps.enabled()) return;
      if (!consent || !body.trim() || Array.from(body.trim()).length > REPORT_MAX_LENGTH) {
        publish({ phase: "failed", reason: "invalid" });
        return;
      }
      publish({ phase: "sending" }); // synchronous fence against two presses
      active = new AbortController();
      try {
        deps.assertOwner();
        if (!await withTimeout(deps.online(), REPORT_TIMEOUT_MS)) {
          publish({ phase: "failed", reason: "offline" });
          return;
        }
        deps.assertOwner();
        if (disposed) return;
        request ??= {
          p_request_id: deps.uuid(), p_kind: kind, p_body: body.trim(),
          p_metadata: { app_version: metadata.app_version, screen_path: "/support", locale: metadata.locale },
          p_consent_version: "support-v1",
        };
        const receipt = await withTimeout(deps.send(request, active.signal), REPORT_TIMEOUT_MS);
        deps.assertOwner();
        if (typeof receipt !== "string" || !UUID.test(receipt)) throw new Error("receipt_missing");
        publish({ phase: "sent", receipt });
      } catch (error) {
        const code = (error as { code?: string } | null)?.code;
        publish({ phase: "failed", reason: code === "P0053" ? "limited" : "unconfirmed" });
      } finally {
        active?.abort();
        active = undefined;
      }
    },
  };
}
