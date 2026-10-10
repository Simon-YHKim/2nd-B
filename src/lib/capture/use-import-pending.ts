import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/lib/auth/AuthContext";
import { captureAccountOwnerLease } from "@/lib/auth/account-epoch";
import { beginAccountSessionLease } from "@/lib/auth/account-session-lease";
import { sessionIdFromAccessToken } from "@/lib/auth/auth-storage-schema";
import { withTimeout } from "@/lib/async/with-timeout";
import { useFirstRunHomeGate } from "@/lib/onboarding/account-first-run";
import { crisisHotlines } from "@/lib/safety/classifier";
import type { HotlineId } from "@/lib/safety/lexicon";
import { getSupabaseClient } from "@/lib/supabase/client";

import { createRecord } from "../records/create";
import { importPendingCaptures } from "./import-pending";
import { loadPendingCaptures, type PendingCapture } from "./preauth-pending";

// The v1 queue belongs to this device, not to a Supabase user. Old /jot builds
// could leave real notes there. A later sign-in is not evidence of ownership:
// read only the count on a stable home, then wait for an explicit decision tied
// to the currently published account and these exact queue entries.
interface PendingImportOffer {
  userId: string;
  sessionId: string;
  email: string | null;
  items: PendingCapture[];
}

interface PendingImportCrisis {
  visible: boolean;
  hotline: HotlineId;
}

export interface PendingImportPromptState {
  count: number;
  email: string | null;
  importing: boolean;
  error: boolean;
}

export function useImportPendingCaptures(): {
  prompt: PendingImportPromptState | null;
  confirmImport: () => void;
  deferImport: () => void;
  crisis: PendingImportCrisis;
  dismissCrisis: () => void;
} {
  const { userId, sessionId, hasProfile, isMinor, loading, profileProbeFailed } = useAuth();
  // The home's own first-run decision (0219), read and never driven from here:
  // "home" means no welcome or first-day review is about to open over it. This
  // prompt never asks the server for a grant (design 5.2).
  const firstRunReady = !loading && !!userId && hasProfile === true && !profileProbeFailed;
  const firstRun = useFirstRunHomeGate(userId, firstRunReady, sessionId);
  const { i18n } = useTranslation();
  const [offer, setOffer] = useState<PendingImportOffer | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(false);
  const [crisis, setCrisis] = useState<PendingImportCrisis>({ visible: false, hotline: "GLOBAL_988" });
  const crisisShown = useRef(false);
  const currentLogin = useRef({ userId, sessionId });
  currentLogin.current = { userId, sessionId };
  const importRun = useRef<Promise<void> | null>(null);

  useEffect(() => {
    // A different login must never inherit the previous prompt, busy state,
    // or a crisis modal from an in-flight import.
    setOffer(null);
    setImporting(false);
    setError(false);
    setCrisis({ visible: false, hotline: "GLOBAL_988" });
    crisisShown.current = false;
  }, [userId, sessionId]);

  useEffect(() => {
    if (
      loading || !userId || !sessionId || hasProfile !== true || profileProbeFailed ||
      firstRun !== "home"
    ) return;
    const lease = captureAccountOwnerLease(userId);
    if (!lease) return;
    let active = true;
    void (async () => {
      try {
        // The importer shares an in-flight run by UID. Let this hook's previous
        // login finish before reading a new queue snapshot or offering it again.
        await importRun.current;
        if (!active || !lease.isCurrent()) return;
        const items = await loadPendingCaptures();
        if (!active || !lease.isCurrent() || items.length === 0) return;
        // Use the exact persisted session email, never a display name or a
        // local-part shared by two accounts. A missing/mismatched session keeps
        // confirmation disabled and leaves the device queue alone.
        let email: string | null = null;
        try {
          const { data, error: sessionError } = await withTimeout(
            getSupabaseClient().auth.getSession(), 6000, "Pending import account",
          );
          if (sessionError || data.session?.user.id !== userId ||
            sessionIdFromAccessToken(data.session.access_token) !== sessionId) return;
          email = data.session.user.email?.trim() || null;
        } catch {
          // Do not publish an offer whose login could not be confirmed.
          return;
        }
        if (active && lease.isCurrent()) setOffer({ userId, sessionId, email, items });
      } catch {
        // Never turn unreadable protected storage into an empty queue claim.
      }
    })();
    return () => { active = false; };
  }, [userId, sessionId, hasProfile, loading, profileProbeFailed, firstRun]);

  const confirmImport = useCallback(() => {
    if (!offer || !offer.email || importing || offer.userId !== userId ||
      offer.sessionId !== sessionId || firstRun !== "home") return;
    const lease = captureAccountOwnerLease(offer.userId);
    if (!lease) return;
    const isCurrent = () => lease.isCurrent() && currentLogin.current.userId === userId &&
      currentLogin.current.sessionId === sessionId;
    if (!isCurrent() || importRun.current) return;
    const locale = i18n.language === "ko" ? "ko" : "en";
    // Unknown age takes the protective youth route until the profile resolves.
    const minor = isMinor !== false;
    setImporting(true);
    setError(false);
    const sessionLease = beginAccountSessionLease(offer.userId);
    importRun.current = withTimeout(sessionLease.authenticate(), 6000, "Pending import session").then((session) => {
      // Auth publication can lag behind getSession during a new sign-in.
      if (!isCurrent() || sessionIdFromAccessToken(session.accessToken) !== offer.sessionId) return null;
      return importPendingCaptures(
        { userId: offer.userId, locale, minor },
        async (item, ctx, clientRequestId) => {
          // Hashing and queue reads await. Re-check before classification;
          // createRecord checks again before the DB insert and C9 ledger writes.
          session.assertCurrent();
          if (!isCurrent()) throw new Error("Pending import sign-in changed");
          const res = await createRecord({
            userId: ctx.userId,
            locale: ctx.locale,
            kind: "note",
            body: item.text,
            minor: ctx.minor,
            withFollowup: false,
            clientRequestId,
            session,
          });
          if (res.followup?.zone === "red" && !crisisShown.current && isCurrent()) {
            crisisShown.current = true;
            setOffer(null);
            setCrisis({ visible: true, hotline: crisisHotlines(locale, minor)[0].id });
          }
        },
        (s) => digestStringAsync(CryptoDigestAlgorithm.SHA256, s),
        { userId: offer.userId, items: offer.items, isCurrent: () => {
          try { session.assertCurrent(); return isCurrent(); } catch { return false; }
        } },
      );
    }).then(async (summary) => {
      if (!summary || !isCurrent() || crisisShown.current) return;
      if (summary.failed === 0) {
        setOffer(null);
      } else {
        // Only the failed entries remain. A retry needs a fresh decision over
        // the still-present entries; never silently broaden the old approval.
        const remaining = await loadPendingCaptures();
        if (isCurrent()) {
          setOffer({ ...offer, items: remaining });
          setError(true);
        }
      }
    }).catch(() => {
      if (isCurrent() && !crisisShown.current) setError(true);
    }).finally(() => {
      sessionLease.release();
      if (isCurrent()) setImporting(false);
      importRun.current = null;
    });
  }, [offer, importing, userId, sessionId, firstRun, i18n.language, isMinor]);

  const deferImport = useCallback(() => {
    if (!importing) setOffer(null); // no server write and no local deletion
  }, [importing]);

  return {
    prompt: offer && offer.userId === userId && offer.sessionId === sessionId &&
      firstRun === "home" && captureAccountOwnerLease(userId)
      ? { count: offer.items.length, email: offer.email, importing, error }
      : null,
    confirmImport,
    deferImport,
    crisis,
    dismissCrisis: () => setCrisis((current) => ({ ...current, visible: false })),
  };
}
