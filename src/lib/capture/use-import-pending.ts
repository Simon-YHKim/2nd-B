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
// for both home variants after auth + profile (age known, C10 satisfied).
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
