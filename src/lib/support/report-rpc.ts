import { getSupabaseClient } from "../supabase/client";
import { withLiveOwnerSignal } from "../auth/live-owner-guard";
import type { ReportRequest } from "./report";

export async function submitSupportReport(request: ReportRequest, signal: AbortSignal, assertOwner: () => void) {
  return withLiveOwnerSignal(assertOwner, signal, async (ownedSignal) => {
    const { data, error } = await getSupabaseClient().rpc("submit_support_report", request).abortSignal(ownedSignal!);
    if (error) throw error;
    return data as unknown;
  });
}
