// 내 생활 정보 — 프로필 상세 입력 (Simon 2026-08-18, D2).
//
// 일곱 번째 별이 프로필로 확정되면서 "채운 만큼 밝아지는" 별이 됐는데, 채울
// 칸이 이름과 생일뿐이었다. 이 화면이 그 눈금을 만든다.
//
// 화면 규칙 두 가지를 지킨다:
//   - 전부 선택 입력이다. 비워도 저장되고 앱은 그대로 동작한다.
//   - 왜 묻는지를 항목마다 한 줄로 말한다. 이유 없이 묻는 칸이 하나라도 있으면
//     이 화면은 설문지가 되고, 사용자는 답할 이유가 없다.
//
// ⚠ 민감정보는 여기서 묻지 않는다(PIPA 제23조). 근거는
// `lib/persona/profile-details.ts` 헤더와 0132 마이그레이션 주석에 있다.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Field, MdButton, MdCard, MdChip } from "@/components/m3";
import { Text } from "@/components/ui/Text";
import { PremiumLoadingState, PremiumToast } from "@/components/premium";
import { useAuth } from "@/lib/auth/AuthContext";
import { deepSpace, deepSpaceSpacing } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import {
  PROFILE_DETAIL_FIELDS,
  PROFILE_DETAIL_TOTAL,
  countFilledDetails,
  type ProfileDetailKey,
  type ProfileDetails,
} from "@/lib/persona/profile-details";
import { fetchProfileDetails, saveProfileDetails } from "@/lib/supabase/profile-details";

/** 선택지 값 -> 로케일 키. 값 자체를 화면에 보여주면 안 되므로 표로 잇는다. */
const CHOICE_LABEL: Readonly<Record<string, string>> = {
  morning: "rhythmMorning",
  evening: "rhythmEvening",
  flexible: "rhythmFlexible",
  irregular: "rhythmIrregular",
  dawn: "hoursDawn",
  afternoon: "hoursAfternoon",
  night: "hoursNight",
  varies: "hoursVaries",
  weekdays: "daysWeekdays",
  weekends: "daysWeekends",
  shift: "daysShift",
};

/**
 * `morning` 이 하루 리듬과 근무 시간대 양쪽에 있어서 키가 겹친다. 필드별로
 * 접두사를 붙여 각자의 라벨을 찾는다 - 표 하나로 뭉개면 "오전" 과 "아침형" 이
 * 같은 말이 된다.
 */
function choiceLabelKey(field: ProfileDetailKey, value: string): string {
  if (field === "workHours") {
    const map: Record<string, string> = {
      dawn: "hoursDawn",
      morning: "hoursMorning",
      afternoon: "hoursAfternoon",
      evening: "hoursEvening",
      night: "hoursNight",
      varies: "hoursVaries",
    };
    return map[value] ?? value;
  }
  if (field === "workDays") {
    const map: Record<string, string> = {
      weekdays: "daysWeekdays",
      weekends: "daysWeekends",
      shift: "daysShift",
      varies: "daysVaries",
    };
    return map[value] ?? value;
  }
  return CHOICE_LABEL[value] ?? value;
}

export default function ProfileDetailsScreen() {
  const { t } = useTranslation(["deepspace"]);
  const { userId, hasProfile, loading: authLoading } = useAuth();
  const [details, setDetails] = useState<ProfileDetails>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "danger" } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void fetchProfileDetails(userId).then((d) => {
      if (!alive) return;
      setDetails(d);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const filled = useMemo(() => countFilledDetails(details), [details]);

  const set = useCallback((key: ProfileDetailKey, value: string) => {
    setDetails((prev) => ({ ...prev, [key]: value }));
  }, []);

  const onSave = useCallback(async () => {
    if (!userId || saving) return;
    setSaving(true);
    try {
      await saveProfileDetails(userId, details);
      setToast({ message: t("deepspace:profileDetails.saved"), tone: "success" });
    } catch {
      setToast({ message: t("deepspace:profileDetails.saveError"), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }, [userId, details, saving, t]);

  const title = t("deepspace:profileDetails.screenTitle");

  // ⚠ authLoading 을 **먼저** 본다. 순서가 이 화면의 버그였다.
  //
  // 처음엔 `!userId -> /sign-in` 을 맨 앞에 뒀는데, 인증이 해석되는 짧은 창에는
  // userId 가 null 이라 로그인한 사용자도 /sign-in 으로 튕겼다. 그러면 sign-in 이
  // "이미 세션이 있네" 하고 다시 밀어내고, 결국 홈 → 온보딩까지 갔다. 이 화면만
  // 온보딩으로 새던 이유가 이것이고, 실제 브라우저로 열어 보고서야 드러났다
  // (테스트는 소스만 읽어서 전부 초록이었다).
  //
  // career-input 같은 이웃 화면들이 loading 을 먼저 보는 이유가 같다.
  if (authLoading || hasProfile !== true) {
    return (
      <DeepSpaceScreen active="lens" header="none" variant="museumLike" title={title} onBack={() => router.back()}>
        <View style={styles.center}>
          <PremiumLoadingState message={title} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (loading) {
    return (
      <DeepSpaceScreen active="lens" header="none" variant="museumLike" title={title} onBack={() => router.back()}>
        <View style={styles.center}>
          <PremiumLoadingState message={title} />
        </View>
      </DeepSpaceScreen>
    );
  }

  return (
    <DeepSpaceScreen active="lens" header="none" variant="museumLike" title={title} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>{t("deepspace:profileDetails.intro")}</Text>
        <Text style={styles.progress}>
          {t("deepspace:profileDetails.progress", { filled, total: PROFILE_DETAIL_TOTAL })}
        </Text>
        {/* 무엇을 안 묻는지도 말해 준다. 안 묻는다는 사실은 물어보는 것만큼 중요하다. */}
        <Text style={styles.notSensitive}>{t("deepspace:profileDetails.notSensitive")}</Text>

        {PROFILE_DETAIL_FIELDS.map((field) => {
          const value = details[field.key] ?? "";
          return (
            <MdCard key={field.key} style={styles.card}>
              <Text style={styles.label}>{t(`deepspace:profileDetails.${field.key}Label`)}</Text>
              <Text style={styles.hint}>{t(`deepspace:profileDetails.${field.key}Hint`)}</Text>
              {field.kind === "text" ? (
                <Field
                  value={value}
                  onChangeText={(v) => set(field.key, v)}
                  maxLength={field.maxLen}
                  accessibilityLabel={t(`deepspace:profileDetails.${field.key}Label`)}
                />
              ) : (
                <View style={styles.choices}>
                  {(field.choices ?? []).map((choice) => (
                    <MdChip
                      key={choice}
                      label={t(`deepspace:profileDetails.${choiceLabelKey(field.key, choice)}`)}
                      selected={value === choice}
                      // 같은 칩을 다시 누르면 해제된다. 한 번 고르면 못 무르는
                      // 선택지는 "선택 입력" 이 아니다.
                      onPress={() => set(field.key, value === choice ? "" : choice)}
                    />
                  ))}
                </View>
              )}
            </MdCard>
          );
        })}

        <MdButton
          variant="filled"
          label={t("deepspace:profileDetails.save")}
          disabled={saving}
          onPress={() => void onSave()}
        />
      </ScrollView>
      {toast ? <PremiumToast message={toast.message} tone={toast.tone} /> : null}
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: deepSpaceSpacing.lg, gap: deepSpaceSpacing.md, paddingBottom: 48 },
  intro: { fontSize: 14, color: deepSpace.textHi },
  progress: { fontSize: 12, color: deepSpace.accentSoft },
  notSensitive: { fontSize: 12, color: deepSpace.textLo },
  card: { gap: 6, padding: deepSpaceSpacing.md, borderRadius: m3.shape.medium },
  label: { fontSize: 14, color: deepSpace.textHi },
  hint: { fontSize: 12, color: deepSpace.textLo },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
});
