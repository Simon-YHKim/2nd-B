import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { ValuesLensView, type ValuesDomain } from "@/components/deep-space/DeepSpaceViews";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";

// Domain = the framework family a life-audit answer was tagged with (the part
// before ":"). Friendly bilingual labels so raw enum prefixes never leak (cf.
// frameworkLabels.ts). Order here is the display order when counts tie.
const DOMAIN_LABELS: Record<string, { en: string; ko: string }> = {
  big_five: { en: "Personality", ko: "성격" },
  sdt: { en: "Motivation", ko: "동기" },
  via: { en: "Strengths", ko: "강점" },
  attachment: { en: "Relationships", ko: "관계" },
};


// Deep-space 일·성장 (Values/Domain): counts the user's real life-audit answers
// by framework family and feeds ValuesLensView. Empty/loading/error are honest
// states — no hardcoded "142 pieces" mock survives here.
function AuditDeepSpace() {
  const { i18n } = useTranslation();
  const isKo = i18n.language === "ko";
  const { userId, loading } = useAuth();
  const [domains, setDomains] = useState<ValuesDomain[] | null | undefined>(undefined);
  const [hasError, setHasError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      setDomains(null);
      setHasError(false);
      return;
    }
    let cancelled = false;
    setHasError(false);
    setDomains(undefined); // undefined drives the loading state in ValuesLensView
    getSupabaseClient()
      .from("records")
      .select("tags")
      .eq("user_id", userId)
      .eq("kind", "audit_response")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setDomains(null);
          setHasError(true);
          return;
        }
        // Each audit answer is tagged ["life_audit", "<family>:<facet>"]. Tally
        // by family prefix; only families with a friendly label are surfaced.
        const counts = new Map<string, number>();
        for (const row of (data ?? []) as { tags: string[] | null }[]) {
          for (const tag of row.tags ?? []) {
            const family = tag.includes(":") ? tag.split(":")[0] : "";
            if (DOMAIN_LABELS[family]) counts.set(family, (counts.get(family) ?? 0) + 1);
          }
        }
        const order = Object.keys(DOMAIN_LABELS);
        const next: ValuesDomain[] = [...counts.entries()]
          .map(([key, count]) => ({ key, label: DOMAIN_LABELS[key][isKo ? "ko" : "en"], count }))
          .sort((a, b) => b.count - a.count || order.indexOf(a.key) - order.indexOf(b.key));
        setDomains(next);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, loading, isKo, reloadKey]);

  return (
    <DeepSpaceScreen active="lens">
      {/* "데이터 추가" opens the open-ended interview that feeds domain piece
          counts (the audit period-selector screener is the legacy-only flow;
          routing back to /audit here would loop the deep-space lens). */}
      <ValuesLensView
        domains={hasError ? [] : domains}
        loading={!hasError && domains === undefined}
        hasError={hasError}
        isKo={isKo}
        onAddData={() => router.push("/interview")}
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    </DeepSpaceScreen>
  );
}

export default function Audit() {
  return <AuditDeepSpace />;
}
