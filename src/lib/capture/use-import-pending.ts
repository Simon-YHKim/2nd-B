import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/lib/auth/AuthContext";

import { createRecord } from "../records/create";
import { importPendingCaptures } from "./import-pending";

// Once per authenticated session, drain any pre-account captures (D-17 / D-25
// Phase 2) into the account as note records (kind "note" + withFollowup false =
// no AI call). Best-effort: a failure leaves the items in the device-local queue
// for next time, and a session with no pending captures does no work (the import
// returns early before any createRecord). Mounted from the home route so it runs
// after auth + profile (age known, C10 satisfied).
//
// ⚠ 2026-09-08: 여기 "for both home variants" 라고 적혀 있었다. 변형은 이제 하나다 —
// 레거시 홈이 legacy/screens/index.tsx 로 나갔다. 마운트 자리는 **그대로 라우트다**:
// 셸 안으로 옮기면 셸의 리다이렉트 뒤로 밀려 들어간다.
// 그 한 줄을 지키는 검사: src/lib/capture/__tests__/preauth-pending.test.ts
export function useImportPendingCaptures(): void {
  const { userId, hasProfile, isMinor } = useAuth();
  const { i18n } = useTranslation();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    if (!userId || hasProfile !== true) return;
    ran.current = true;
    const locale = i18n.language === "ko" ? "ko" : "en";
    void importPendingCaptures({ userId, locale, minor: isMinor === true }, (item, ctx) =>
      createRecord({
        userId: ctx.userId,
        locale: ctx.locale,
        kind: "note",
        body: item.text,
        minor: ctx.minor,
        withFollowup: false,
      }).then(() => undefined),
    );
  }, [userId, hasProfile, isMinor, i18n.language]);
}
