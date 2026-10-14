// 첫 기록 코치마크. 기능을 설명하며 넘기는 투어가 아니라, 평소에 기록을 더하는
// 길인 아래 탭 「스크랩」을 실제로 눌러 기록 흐름으로 들어가게 한다(Z70 · Simon
// 2026-10-13). 탭이 화면 몸통 밖에 있어 이 층은 화면 틀의 overlay 자리에 그린다.
// 배경은 불투명 면으로 덮지 않고 FirstRecordCoachmark의 디더 스크림 네 조각으로만 어둡힌다.
import { useCallback, useRef, type RefObject } from "react";
import { BackHandler, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "expo-router";

import { FirstRecordCoachmark } from "@/components/deep-space/FirstRecordCoachmark";
import { markCoachmarksSeen } from "@/lib/onboarding/coachmarks-gate";
import { homeCoachmarkBack } from "@/lib/nav/home-coachmark-back";

export function HomeCoachmarks({
  ownerId,
  targetRef,
}: {
  ownerId: string;
  targetRef: RefObject<View | null>;
}) {
  const { t } = useTranslation("deepspace");
  const backOwner = useRef<ReturnType<typeof homeCoachmarkBack.claim> | null>(null);

  const finish = useCallback(() => {
    backOwner.current?.release();
    markCoachmarksSeen(ownerId);
  }, [ownerId]);

  // Android back dismisses and remembers the guide instead of exiting the root
  // screen. The actual target remains the live Scrap tab beneath the hole.
  useFocusEffect(useCallback(() => {
    const owner = homeCoachmarkBack.claim(finish);
    backOwner.current = owner;
    const sub = BackHandler.addEventListener("hardwareBackPress", owner.back);
    return () => {
      owner.release();
      sub.remove();
    };
  }, [finish]));

  return (
    <FirstRecordCoachmark
      targetRef={targetRef}
      countLabel="1/4"
      message={t("deepspace:coachmarks.homeStep")}
      hint={t("deepspace:coachmarks.targetHint")}
      skipLabel={t("deepspace:coachmarks.dontShowAgain")}
      onSkip={finish}
      refreshKey="home-scrap-tab"
    />
  );
}
