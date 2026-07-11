// 커리어 Drill Down — rev2 3C4P (P4d 잔여). A career achievement decomposed as
// 3C = "왜 했는가"(Customer/Company/Competitor) + 4P = "무엇을 · 어떻게"
// (Product/Place/Price/Promotion). Pure input scaffolding (prototype
// sb-drilldown 1:1): nothing persists here — submit seeds a 세컨비 chat draft
// (the qualitative complement to /career's structured 성과 담기), reusing the
// existing /secondb fromNode prefill contract.
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Field, MdButton, MdCard, MdChip } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { createRecord } from "@/lib/records/create";
import { composeStructured } from "@/lib/capture/structured";
import { deepSpace, spacing, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";

// 경험 유형 (prototype DD_EXP_TYPES, verbatim).
const EXP_TYPES = [
  "학업", "학교 프로젝트", "교내 동아리", "대외활동 (교외 동아리)", "연구/개발",
  "공모전/대회", "인턴", "아르바이트", "계약직/파견직", "정규 입사 경험",
  "개인 사업/창업/사이드 프로젝트",
] as const;

interface DdField {
  key: string;
  label: string;
  hint: string;
  multiline?: boolean;
}

interface DdGroup {
  id: string;
  name: string;
  kr: string;
  fields: DdField[];
}

interface DdBand {
  code: "3C" | "4P";
  label: string;
  why: string;
  groups: DdGroup[];
}

// 3C/4P bands — labels + helper copy verbatim from the prototype.
const BANDS: DdBand[] = [
  {
    code: "3C",
    label: "왜 했는가",
    why: "Why",
    groups: [
      { id: "customer", name: "Customer", kr: "고객", fields: [
        { key: "c_target", label: "혜택을 받는 대상", hint: "예) 가입 직후 이탈하던 20–30대" },
        { key: "c_need", label: "대상이 필요로 한 것", hint: "예) 가입 직후 '뭘 해야 할지' 빠르게 아는 것" },
      ] },
      { id: "company", name: "Company", kr: "자사", fields: [
        { key: "o_org", label: "내가 속했던 곳", hint: "예) 테크컴퍼니 노바 · 디자인 플랫폼팀" },
        { key: "o_goal", label: "본인(팀)의 목표", hint: "예) 온보딩 완료율을 끌어올리기" },
        { key: "o_problem", label: "문제 · 원인 (혹은 기회 상황)", hint: "예) 1단계에서 40% 이탈 — 첫 화면 정보 과다", multiline: true },
        { key: "o_role", label: "팀 내에서 나의 역할", hint: "예) 플로우 설계 · 실험 리드" },
      ] },
      { id: "competitor", name: "Competitor", kr: "경쟁사", fields: [
        { key: "x_subject", label: "조사한 대상", hint: "예) 동종 앱 3종의 온보딩 플로우" },
        { key: "x_applied", label: "조사 후 적용한 내용", hint: "예) 3단계 → 1단계로 압축, 진행률 표시 도입", multiline: true },
      ] },
    ],
  },
  {
    code: "4P",
    label: "무엇을 · 어떻게",
    why: "What + How",
    groups: [
      { id: "product", name: "Product", kr: "상품", fields: [
        { key: "p_result", label: "결과", hint: "예) 온보딩 완료율 52% → 71%" },
        { key: "p_meaning", label: "결과의 의미", hint: "예) 신규 30일 잔존이 동반 상승 — 첫 경험이 핵심", multiline: true },
      ] },
      { id: "place", name: "Place", kr: "위치", fields: [
        { key: "l_where", label: "문제 해결을 할 수 있었던 장소 · 지점 · 채널", hint: "예) 앱 첫 실행 온보딩 · 푸시 리마인드" },
      ] },
      { id: "price", name: "Price", kr: "가격", fields: [
        { key: "r_productivity", label: "생산성 관점 (비용 감소 · 효율 · 시간 단축 등)", hint: "예) 온보딩 관련 CS 문의 30% 감소" },
      ] },
      { id: "promotion", name: "Promotion", kr: "마케팅", fields: [
        { key: "m_share", label: "알리기 관점", hint: "예) 개선 사례를 사내 위클리·블로그로 공유" },
      ] },
    ],
  },
];

export default function CareerDrilldown() {
  const { t, i18n } = useTranslation("deepspace");
  const isKo = i18n.language === "ko";
  const { userId, loading } = useAuth();

  const [summary, setSummary] = useState("");
  const [expType, setExpType] = useState<string | null>(null);
  const [typeOpen, setTypeOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const filled = useMemo(
    () => summary.trim().length > 0 || Object.values(values).some((v) => v.trim().length > 0),
    [summary, values],
  );

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  const setField = (key: string) => (v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  // 0066: persist the drill-down as a record FIRST (human-readable body +
  // machine-readable structured payload), then seed the 세컨비 chat via the
  // existing /secondb fromNode prefill contract. Best-effort save: a network
  // miss still opens the chat so the user's flow is never blocked.
  const submit = async () => {
    const head = summary.trim().length > 0 ? summary.trim() : t("deepspace:careerDrilldown.summaryFallback");
    const seed = expType ? `Drill Down · ${head} · ${expType}` : `Drill Down · ${head}`;
    if (!saving && userId) {
      setSaving(true);
      try {
        const labelOf: Record<string, string> = {};
        for (const band of BANDS) for (const g of band.groups) for (const f of g.fields) labelOf[f.key] = f.label;
        const bodyLines = [head, expType ? `유형: ${expType}` : null]
          .concat(
            Object.entries(values)
              .filter(([, v]) => v.trim().length > 0)
              .map(([k, v]) => `${labelOf[k] ?? k}: ${v.trim()}`),
          )
          .filter(Boolean) as string[];
        await createRecord({
          userId,
          locale: isKo ? "ko" : "en",
          kind: "note",
          body: bodyLines.join("\n"),
          topic: head,
          tags: ["career_drilldown"],
          structured: composeStructured("career_3c4p", { summary: summary, exp_type: expType ?? "", ...values }) ?? undefined,
        });
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[drilldown] save failed", (e as Error).message);
      } finally {
        setSaving(false);
      }
    }
    router.push({ pathname: "/secondb", params: { fromNode: seed } });
  };

  return (
    <DeepSpaceScreen active="lens">
      <View style={styles.body}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text variant="heading">Drill Down</Text>

          {/* intro (tertiary framing, prototype copy verbatim) */}
          <MdCard variant="filled" style={styles.introCard}>
            <Text style={styles.introText}>
              {t("deepspace:careerDrilldown.intro")}
            </Text>
          </MdCard>

          {/* 경험 개요 */}
          <MdCard variant="outlined" style={styles.groupCard}>
            <Field
              label={t("deepspace:careerDrilldown.summaryLabel")}
              value={summary}
              onChangeText={setSummary}
              placeholder={t("deepspace:careerDrilldown.summaryPlaceholder")}
            />
            <Pressable
              onPress={() => setTypeOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: typeOpen }}
              accessibilityLabel={t("deepspace:careerDrilldown.expTypeA11y")}
              style={styles.typeButton}
            >
              <Text style={[styles.typeButtonText, expType == null && styles.typeButtonPlaceholder]}>
                {expType ?? t("deepspace:careerDrilldown.expTypePlaceholder")}
              </Text>
              <Text style={styles.typeCaret}>{typeOpen ? "▴" : "▾"}</Text>
            </Pressable>
            {typeOpen ? (
              <View style={styles.typeGrid}>
                {EXP_TYPES.map((t) => (
                  <MdChip
                    key={t}
                    label={t}
                    selected={expType === t}
                    onPress={() => {
                      setExpType((prev) => (prev === t ? null : t));
                      setTypeOpen(false);
                    }}
                  />
                ))}
              </View>
            ) : null}
          </MdCard>

          {/* 3C / 4P bands */}
          {BANDS.map((band) => (
            <View key={band.code} style={styles.band}>
              <View style={styles.bandHead}>
                <View style={styles.bandCode}>
                  <Text style={styles.bandCodeText}>{band.code}</Text>
                </View>
                <Text style={styles.bandLabel}>{band.label}</Text>
                <Text style={styles.bandWhy}>{band.why}</Text>
              </View>
              {band.groups.map((g) => (
                <MdCard key={g.id} variant="outlined" style={styles.groupCard}>
                  <View style={styles.groupHead}>
                    <Text style={styles.groupName}>{g.name}</Text>
                    <Text style={styles.groupKr}>{g.kr}</Text>
                  </View>
                  {g.fields.map((f) => (
                    <Field
                      key={f.key}
                      label={f.label}
                      value={values[f.key] ?? ""}
                      onChangeText={setField(f.key)}
                      placeholder={f.hint}
                      multiline={f.multiline}
                    />
                  ))}
                </MdCard>
              ))}
            </View>
          ))}
        </ScrollView>

        {/* submit bar */}
        <View style={styles.submitBar}>
          <MdButton
            variant="filled"
            label={t("deepspace:careerDrilldown.submit")}
            onPress={() => void submit()}
            disabled={!filled || saving}
            accessibilityLabel={t("deepspace:careerDrilldown.submit")}
          />
        </View>
      </View>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: 120, gap: spacing.md },
  introCard: { backgroundColor: withAlpha(m3.color.tertiary, 0.12) },
  introText: { fontSize: 13.5, lineHeight: 21, color: m3.color.onSurface },
  groupCard: { gap: spacing.sm },
  typeButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: m3.color.outlineVariant,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    backgroundColor: m3.color.surfaceContainerHighest,
  },
  typeButtonText: { fontSize: 14, color: m3.color.onSurface },
  typeButtonPlaceholder: { color: m3.color.onSurfaceVariant },
  typeCaret: { fontSize: 12, color: m3.color.onSurfaceVariant },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  band: { gap: spacing.sm },
  bandHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  bandCode: {
    minWidth: 44,
    height: 32,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: m3.color.tertiaryContainer,
    paddingHorizontal: 12,
  },
  bandCodeText: { fontSize: 16, fontWeight: "800", letterSpacing: 0.5, color: m3.color.onTertiaryContainer },
  bandLabel: { fontSize: 16, fontWeight: "600", color: m3.color.onSurface },
  bandWhy: { fontSize: 11, color: m3.color.onSurfaceVariant },
  groupHead: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  groupName: { fontSize: 14, fontWeight: "700", color: m3.color.tertiary },
  groupKr: { fontSize: 12, color: m3.color.onSurfaceVariant },
  submitBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    backgroundColor: deepSpace.bgEdge,
    borderTopWidth: 1,
    borderTopColor: withAlpha(m3.color.outlineVariant, 0.4),
  },
});
