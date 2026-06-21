// /trends - 트렌드 · 관심 상승 (SCREEN_TREE_SPEC §3). Surfaces tags whose
// frequency rose this week vs last week (deterministic, from the user's own
// records) and offers to capture more on that topic. Assembled from the shared
// Ops kit; deepSpace tokens only, no LLM, nothing applied automatically.

import { useEffect, useState } from "react";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { OpsFrame, OpsRecommendationCard, OpsState } from "@/components/deepspace/ops";
import { useAuth } from "@/lib/auth/AuthContext";
import { gatherRisingInterests } from "@/lib/trends/gather";
import type { RisingInterest } from "@/lib/trends/rising";

export function TrendsScreen() {
  const { i18n } = useTranslation();
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  const { userId } = useAuth();

  const [rows, setRows] = useState<RisingInterest[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    (userId ? gatherRisingInterests(userId) : Promise.resolve([]))
      .then((r) => {
        if (!alive) return;
        setRows(r);
        setStatus("ready");
      })
      .catch(() => {
        if (alive) setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const C = ko
    ? {
        title: "트렌드",
        bubble: "요즘 자주 떠오르는 관심이에요.",
        tip: "관심이 자라는 주제를 더 담아볼까요?",
        captureThis: "이 주제로 담기",
        emptyTitle: "아직 또렷한 관심 변화가 없어요",
        emptyBody: "이번 주 기록을 채우면 떠오르는 관심을 보여줄게요.",
        emptyCta: "기록 담기",
        errTitle: "잠시 불러오지 못했어요",
        errBody: "조금 뒤에 다시 볼게요",
        loading: "관심을 살펴보는 중…",
        reason: (r: RisingInterest) => `이번 주 ${r.recent}회 떠올랐어요 (지난주 ${r.prior}회).`,
      }
    : {
        title: "Trends",
        bubble: "What you've been drawn to lately.",
        tip: "Want to capture more on a rising topic?",
        captureThis: "Capture this",
        emptyTitle: "No clear interest shift yet",
        emptyBody: "Fill in this week's records and rising interests will show here.",
        emptyCta: "Capture a record",
        errTitle: "Couldn't load just now",
        errBody: "We'll show it again shortly",
        loading: "Looking at your interests…",
        reason: (r: RisingInterest) => `Came up ${r.recent}x this week (was ${r.prior}).`,
      };

  const captureTopic = (tag: string) =>
    router.push({ pathname: "/capture", params: { text: `#${tag} ` } });

  return (
    <OpsFrame title={C.title} bubble={C.bubble} tip={C.tip} onBack={() => router.back()}>
      {status === "error" ? (
        <OpsState variant="error" title={C.errTitle} body={C.errBody} />
      ) : status === "loading" ? (
        <OpsState variant="empty" title="…" body={C.loading} />
      ) : rows.length === 0 ? (
        <OpsState
          variant="empty"
          title={C.emptyTitle}
          body={C.emptyBody}
          ctaLabel={C.emptyCta}
          onCta={() => router.push("/capture")}
        />
      ) : (
        rows.map((r) => (
          <OpsRecommendationCard
            key={r.tag}
            title={r.tag}
            reason={C.reason(r)}
            chips={[`+${r.delta}`]}
            primaryLabel={C.captureThis}
            onPrimary={() => captureTopic(r.tag)}
          />
        ))
      )}
    </OpsFrame>
  );
}
