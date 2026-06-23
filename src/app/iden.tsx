// IDEN export screen (queue C wiring). Turns the user's stored self-knowledge
// into the portable `.iden` file + the one-page CV sheet, then lets them copy /
// share it (the AI-readable half) or open the sheet (the human-readable half).
//
// Web-safe by construction: no native-only modules at module scope. The rich
// WebView preview + native PDF/share path is the device-QA follow-up; here the
// `.iden` text (copy/share) and a web "open sheet" (print -> PDF) cover both
// runtimes with deps already in the app.

import { useCallback, useEffect, useState } from "react";
import { Share } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { IdenView, type IdenViewData } from "@/components/deep-space/DeepSpaceViews";
import { useAuth } from "@/lib/auth/AuthContext";
import { exportIden } from "@/lib/iden/iden-export";
import { buildIdenDoc } from "@/lib/iden/build-iden";

export default function IdenExportScreen() {
  return <IdenExportScreenDeepSpace />;
}

// Deep-space IDEN: the canonical default surface. Fetches the user's real
// IdenDoc (buildIdenDoc — persona + vault counts) and feeds IdenView; renders a
// proper loading/empty/error state instead of the prior hardcoded "simon.iden".
function IdenExportScreenDeepSpace() {
  const { i18n } = useTranslation("iden");
  const isKo = i18n.language === "ko";
  const locale = (isKo ? "ko" : "en") as "en" | "ko";
  const { userId, loading, isMinor } = useAuth();
  const [data, setData] = useState<IdenViewData | null | undefined>(undefined);
  const [hasError, setHasError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      setData(null);
      setHasError(false);
      return;
    }
    let cancelled = false;
    setHasError(false);
    setData(undefined); // undefined drives the loading state in IdenView
    buildIdenDoc(userId, { locale, minor: isMinor === true })
      .then((doc) => {
        if (cancelled) return;
        // composeIdenDoc inserts the traits ScoreMap in fixed O,C,E,A,N order
        // with 0..1 values; map to the "O72 C58 E41 A67 N39" line. Absent when
        // there's no measured/derived trait field yet (never a fabricated line).
        const traits = doc.fields.find((f) => f.key === "traits");
        const letters = ["O", "C", "E", "A", "N"];
        const bigFive =
          traits && (traits.viz === "radar" || traits.viz === "bar")
            ? Object.values(traits.data)
                .map((v, i) => `${letters[i] ?? ""}${Math.round(v * 100)}`)
                .join(" ")
            : null;
        setData({ name: `${doc.name}.iden`, version: doc.iden, northStar: doc.oneLiner, bigFive });
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setHasError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, loading, locale, isMinor, reloadKey]);

  const hasData = !hasError && data != null;

  // "Send to AI" exports the real `.iden` text and opens the share sheet (queue
  // C export/share path). When there's no IDEN yet, the empty-state CTA instead
  // routes the user to start gathering, so the action always advances them.
  const handleSend = useCallback(async () => {
    if (!userId) return;
    if (!hasData) {
      router.push("/interview");
      return;
    }
    try {
      const result = await exportIden(userId, { locale, minor: isMinor === true });
      await Share.share({ message: result.iden });
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[iden] export/share failed", (e as Error).message);
    }
  }, [userId, hasData, locale, isMinor]);

  return (
    <DeepSpaceScreen active="iden">
      <IdenView
        data={hasError ? null : data}
        loading={!hasError && data === undefined}
        hasError={hasError}
        isKo={isKo}
        onSend={handleSend}
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    </DeepSpaceScreen>
  );
}

