// The informant's only channel to the server (T5 F2, spec §6): no session, no
// account, no informant PII -- just the one-time token and the peer-respond edge
// function.
//
// This used to live inline in src/app/peer/[token].tsx as:
//
//   async function callPeerRespond(body) {
//     const res = await fetch(...);
//     return await res.json();          // <-- res.ok never checked
//   }
//
// which made every failure look like a success to the caller. The edge function
// returns 404 not_found, 500 lookup_failed, 500 withdraw_failed, 409
// already_responded -- and the client happily parsed those error bodies and moved
// on. withdraw() then did `await callPeerRespond(...); setPhase("withdrawn")` with
// no check at all, so an informant whose revocation FAILED on the server was still
// told "철회됐어요".
//
// That is a consent withdrawal that fails open. peer-respond/index.ts:100 even says
// "Check every write: a silent failure here would..." -- the server author knew. The
// client just never listened.
//
// So: a non-2xx response throws. Callers must handle it.

import { getEnv } from "@/lib/env";

export class PeerRespondError extends Error {
  readonly status: number;
  /** The `error` code from the edge function body, when it sent one. */
  readonly code: string | null;

  constructor(status: number, code: string | null) {
    super(`peer-respond failed: ${status}${code ? ` (${code})` : ""}`);
    this.name = "PeerRespondError";
    this.status = status;
    this.code = code;
  }
}

export interface PeerRespondResult {
  ok?: boolean;
  status?: string;
  error?: string;
  [key: string]: unknown;
}

/**
 * POST to the peer-respond edge function.
 *
 * @throws {PeerRespondError} on any non-2xx response, or on a body that is not JSON.
 *         A network failure throws whatever fetch throws (TypeError) -- also a
 *         failure, also not swallowed.
 */
export async function callPeerRespond(body: Record<string, unknown>): Promise<PeerRespondResult> {
  const env = getEnv();
  const res = await fetch(`${env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/peer-respond`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      authorization: `Bearer ${env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });

  let parsed: PeerRespondResult | null = null;
  try {
    parsed = (await res.json()) as PeerRespondResult;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    throw new PeerRespondError(res.status, typeof parsed?.error === "string" ? parsed.error : null);
  }
  if (parsed === null) {
    // 2xx with an unreadable body: we cannot claim the write happened.
    throw new PeerRespondError(res.status, "unreadable_body");
  }
  return parsed;
}
