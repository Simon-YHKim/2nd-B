import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/lib/auth/AuthContext";
import { captureAccountOwnerLease } from "@/lib/auth/account-epoch";
import { beginAccountSessionLease } from "@/lib/auth/account-session-lease";
import { withTimeout } from "@/lib/async/with-timeout";
import { useOnboardingComplete } from "@/lib/onboarding/state";
import { useAutoTriggerTTFV } from "@/lib/onboarding/ttfv-gate";
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
  const { userId, hasProfile, isMinor, loading, profileProbeFailed } = useAuth();
  const onboardingComplete = useOnboardingComplete();
  const autoTriggerTTFV = useAutoTriggerTTFV();
  const { i18n } = useTranslation();
  const [offer, setOffer] = useState<PendingImportOffer | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(false);
  const [crisis, setCrisis] = useState<PendingImportCrisis>({ visible: false, hotline: "GLOBAL_988" });
  const crisisShown = useRef(false);

  useEffect(() => {
    // A different account must never inherit the previous prompt, busy state,
    // or a crisis modal from an in-flight import.
    setOffer(null);
    setImporting(false);
    setError(false);
    setCrisis({ visible: false, hotline: "GLOBAL_988" });
    crisisShown.current = false;
  }, [userId]);

  useEffect(() => {
    if (
      loading || !userId || hasProfile !== true || profileProbeFailed ||
      onboardingComplete !== true || autoTriggerTTFV !== false
    ) return;
    const lease = captureAccountOwnerLease(userId);
    if (!lease) return;
    let active = true;
    void (async () => {
      try {
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
          if (!sessionError && data.session?.user.id === userId) {
            email = data.session.user.email?.trim() || null;
          }
        } catch {
          // Account identity could not be confirmed; show only a defer option.
        }
        if (active && lease.isCurrent()) setOffer({ userId, email, items });
      } catch {
        // Never turn unreadable protected storage into an empty queue claim.
      }
    })();
    return () => { active = false; };
  }, [userId, hasProfile, loading, profileProbeFailed, onboardingComplete, autoTriggerTTFV]);

  const confirmImport = useCallback(() => {
    if (!offer || !offer.email || importing || offer.userId !== userId) return;
    const lease = captureAccountOwnerLease(offer.userId);
    if (!lease) return;
    const locale = i18n.language === "ko" ? "ko" : "en";
    // Unknown age takes the protective youth route until the profile resolves.
    const minor = isMinor !== false;
    setImporting(true);
    setError(false);
    const sessionLease = beginAccountSessionLease(offer.userId);
    void withTimeout(sessionLease.authenticate(), 6000, "Pending import session").then((session) =>
      importPendingCaptures(
        { userId: offer.userId, locale, minor },
        async (item, ctx, clientRequestId) => {
          // Hashing and queue reads await. Re-check before classification;
          // createRecord checks again before the DB insert and C9 ledger writes.
          session.assertCurrent();
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
          if (res.followup?.zone === "red" && !crisisShown.current && lease.isCurrent()) {
            crisisShown.current = true;
            setOffer(null);
            setCrisis({ visible: true, hotline: crisisHotlines(locale, minor)[0].id });
          }
        },
        (s) => digestStringAsync(CryptoDigestAlgorithm.SHA256, s),
        { userId: offer.userId, items: offer.items, isCurrent: () => {
          try { session.assertCurrent(); return true; } catch { return false; }
        } },
      )
    ).then(async (summary) => {
      if (!lease.isCurrent() || crisisShown.current) return;
      if (summary.failed === 0) {
        setOffer(null);
      } else {
        // Only the failed entries remain. A retry needs a fresh decision over
        // the still-present entries; never silently broaden the old approval.
        const remaining = await loadPendingCaptures();
        if (lease.isCurrent()) {
          setOffer({ ...offer, items: remaining });
          setError(true);
        }
      }
    }).catch(() => {
      if (lease.isCurrent() && !crisisShown.current) setError(true);
    }).finally(() => {
      sessionLease.release();
      if (lease.isCurrent()) setImporting(false);
    });
  }, [offer, importing, userId, i18n.language, isMinor]);

  const deferImport = useCallback(() => {
    if (!importing) setOffer(null); // no server write and no local deletion
  }, [importing]);

  return {
    prompt: offer && offer.userId === userId && captureAccountOwnerLease(userId)
      ? { count: offer.items.length, email: offer.email, importing, error }
      : null,
    confirmImport,
    deferImport,
    crisis,
    dismissCrisis: () => setCrisis((current) => ({ ...current, visible: false })),
  };
}
