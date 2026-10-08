import { beginAccountSessionLease } from "../auth/account-session-lease";
import { captureAccountOwnerLease, subscribeAccountTransition } from "../auth/account-epoch";
import { currentPrivacyChange, subscribePrivacyChanges } from "../privacy/changes";
import { invokeFunctionWithCapturedSession } from "../supabase/captured-session-client";
import { decodeBoardResponse, type ValidatedBoardOutput } from "./generation-output";

// Server deployment and canary precede this build flag. No local model fallback.
export const DASHBOARD_GENERATION_ENABLED = process.env.EXPO_PUBLIC_DASHBOARD_GENERATION === "true";

export async function requestBoardGeneration(
  ownerId: string, action: "open" | "summary" | "triage", locale: string, signal?: AbortSignal,
): Promise<ValidatedBoardOutput> {
  const invalid = { ok: false, reason: "invalid_output" } as const;
  if (!DASHBOARD_GENERATION_ENABLED || currentPrivacyChange(ownerId)?.prefs.recommendations === false) return invalid;
  const owner = captureAccountOwnerLease(ownerId);
  if (!owner) return invalid;
  const pending = beginAccountSessionLease(ownerId, signal);
  const revision = currentPrivacyChange(ownerId)?.revision;
  const stopOwner = subscribeAccountTransition(() => { if (!owner.isCurrent()) pending.abort(); });
  const stopPrivacy = subscribePrivacyChanges((change) => { if (change.ownerId === ownerId) pending.abort(); });
  const timeout = setTimeout(() => pending.abort(), 35_000);
  try {
    const session = await pending.authenticate(); session.assertCurrent();
    const language = locale.toLowerCase().split("-")[0];
    const result = await invokeFunctionWithCapturedSession("dashboard-generate", session.accessToken, {
      body: { action, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: ["en", "ko", "es", "pt", "id"].includes(language) ? language : "en" }, signal: session.signal,
    });
    session.assertCurrent();
    if (!owner.isCurrent() || result.error || currentPrivacyChange(ownerId)?.revision !== revision) return invalid;
    return decodeBoardResponse(result.data);
  } catch { return invalid; }
  finally { clearTimeout(timeout); stopOwner(); stopPrivacy(); pending.release(); }
}
