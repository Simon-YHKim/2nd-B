import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/lib/auth/AuthContext";
import { crisisHotlines } from "@/lib/safety/classifier";
import type { HotlineId } from "@/lib/safety/lexicon";

import { createRecord } from "../records/create";
import { importPendingCaptures } from "./import-pending";

// Once per authenticated session, drain any pre-account captures (D-17 / D-25
// Phase 2) into the account as note records (kind "note" + withFollowup false =
// no AI call). Best-effort: a failure leaves the items in the device-local queue
// for next time, and a session with no pending captures does no work (the import
// returns early before any createRecord). The local C9 classifier still runs on
// these first-person notes; the home route must surface its red-zone result.
// Mounted from the home route so it runs after auth + profile (C10).
//
// ⚠ 2026-09-08: 여기 "for both home variants" 라고 적혀 있었다. 변형은 이제 하나다 —
// 레거시 홈이 legacy/screens/index.tsx 로 나갔다. 마운트 자리는 **그대로 라우트다**:
// 셸 안으로 옮기면 셸의 리다이렉트 뒤로 밀려 들어간다.
// 그 한 줄을 지키는 검사: src/lib/capture/__tests__/preauth-pending.test.ts
interface PendingImportCrisis {
  visible: boolean;
  hotline: HotlineId;
}

export function useImportPendingCaptures(): {
  crisis: PendingImportCrisis;
  dismissCrisis: () => void;
} {
  const { userId, hasProfile, isMinor } = useAuth();
  const { i18n } = useTranslation();
  const ran = useRef(false);
  const crisisShown = useRef(false);
  const [crisis, setCrisis] = useState<PendingImportCrisis>({ visible: false, hotline: "GLOBAL_988" });

  useEffect(() => {
    if (ran.current) return;
    if (!userId || hasProfile !== true) return;
    ran.current = true;
    const locale = i18n.language === "ko" ? "ko" : "en";
    // Unknown age takes the protective youth route until the profile resolves.
    const minor = isMinor !== false;
    void importPendingCaptures(
      { userId, locale, minor },
      (item, ctx, clientRequestId) =>
        createRecord({
          userId: ctx.userId,
          locale: ctx.locale,
          kind: "note",
          body: item.text,
          minor: ctx.minor,
          withFollowup: false,
          // 0178: a re-import of the same capture replays the existing row.
          clientRequestId,
        }).then((res) => {
          // One visible hand-off per batch, even if several queued notes are red.
          if (res.followup?.zone === "red" && !crisisShown.current) {
            crisisShown.current = true;
            setCrisis({ visible: true, hotline: crisisHotlines(locale, minor)[0].id });
          }
        }),
      // The key is "preauth:" + SHA-256(localId); the raw id stays on the device.
      (s) => digestStringAsync(CryptoDigestAlgorithm.SHA256, s),
    ).catch(() => {
      // A storage read/write failure rejects the whole import. Keep the queue
      // for a later home mount; 0178 makes committed rows safe to replay.
      ran.current = false;
      if (typeof console !== "undefined") console.warn("[capture] pending import failed; retry on next home mount");
    });
  }, [userId, hasProfile, isMinor, i18n.language]);

  return {
    crisis,
    dismissCrisis: () => setCrisis((current) => ({ ...current, visible: false })),
  };
}
