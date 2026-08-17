// 성과 입력 — the full form from design/proto_rev2/reference-app/sb-careerinput.jsx.
//
// The career lens shipped with a reduced version of this: 성과 / 역할 / 임팩트 and a
// year. Simon asked where the form he specified went; it had never been ported.
// The dropped sections are the ones that make an entry answerable later — 일터 and
// 역할 place the work, 성과 분해 turns a claim into the actions behind it, 기술 정리
// names what was used.
//
// Everything saves as ONE record (tags: career_achievement + domain:career +
// year:YYYY), the same shape the timeline already groups and the retrieval layer
// already indexes. No new table: this is a richer body, not a new kind of thing.
//
// The composer lives in lib/career/achievement-form.ts, pure and tested. The
// KPI suggestion chips come from the canon (data/screens/careerinput.json), not
// from a copy in this file.
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Field, DateField, MdButton, MdCard, MdChip } from "@/components/m3";
import { Text } from "@/components/ui/Text";
import { PremiumLoadingState } from "@/components/premium";
import { useAuth } from "@/lib/auth/AuthContext";
import { canonCareerInput } from "@/lib/canon";
import { createRecord } from "@/lib/records/create";
import { domainTagFor } from "@/lib/persona/domain-stars";
import {
  EMPTY_ACHIEVEMENT_FORM,
  achievementYear,
  canSaveAchievement,
  composeFullAchievementBody,
  type AchievementForm,
  type CareerKpi,
} from "@/lib/career/achievement-form";
import { m3 } from "@/lib/theme/m3";
import { spacing } from "@/lib/theme/tokens";

const CAREER_TAG = domainTagFor("career");

type Section = { key: string; title: string; hint: string };

export default function CareerInputScreen() {
  const { t, i18n } = useTranslation(["deepspace", "common"]);
  const { userId, isMinor, loading } = useAuth();
  const locale = i18n.language.startsWith("ko") ? "ko" : "en";

  const [form, setForm] = useState<AchievementForm>(EMPTY_ACHIEVEMENT_FORM);
  const [kpiDraft, setKpiDraft] = useState("");
  const [tagDrafts, setTagDrafts] = useState({ tools: "", skills: "", theories: "" });
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [kpiSeq, setKpiSeq] = useState(0);

  const set = useCallback(
    <K extends keyof AchievementForm>(key: K, value: AchievementForm[K]) =>
      setForm((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const addKpi = useCallback(
    (name: string, unit: string) => {
      const clean = name.trim();
      if (!clean) return;
      setForm((prev) => {
        if (prev.kpis.some((k) => k.name === clean)) return prev;
        const next: CareerKpi = { id: `k${kpiSeq + 1}`, name: clean, unit, value: "" };
        return { ...prev, kpis: [...prev.kpis, next] };
      });
      setKpiSeq((n) => n + 1);
    },
    [kpiSeq],
  );

  const addTag = useCallback((key: "tools" | "skills" | "theories") => {
    setTagDrafts((drafts) => {
      const value = drafts[key].trim();
      if (!value) return drafts;
      setForm((prev) =>
        prev[key].includes(value) ? prev : { ...prev, [key]: [...prev[key], value] },
      );
      return { ...drafts, [key]: "" };
    });
  }, []);

  const suggestions = useMemo(() => canonCareerInput.suggest, []);
  const canSave = canSaveAchievement(form) && !saving;

  if (loading) {
    return (
      <DeepSpaceScreen active="lens" header="none" variant="museumLike" title={t("deepspace:careerInput.screenTitle")} onBack={() => router.back()}>
        <View style={styles.center}>
          <PremiumLoadingState message={t("deepspace:career.loading")} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  async function handleSave() {
    if (!userId || !canSave) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const year = achievementYear(form);
      await createRecord({
        userId,
        locale,
        minor: isMinor === true,
        kind: "note",
        body: composeFullAchievementBody(form, locale),
        topic: form.summary.trim().slice(0, 80),
        tags: ["career_achievement", CAREER_TAG, ...(year ? [`year:${year}`] : [])],
      });
      // Back to the timeline rather than a success screen: the entry the user
      // just wrote is the confirmation, and it is one screen away.
      router.replace("/career");
    } catch (e) {
      if (typeof console !== "undefined") console.warn("[career-input] save failed", (e as Error).message);
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  const section = (s: Section, children: React.ReactNode) => (
    <View key={s.key} style={styles.section}>
      <View style={styles.sectionHead}>
        <Text variant="subtle" style={styles.sectionTitle}>{s.title}</Text>
        <Text variant="caption" color="textSubtle">{s.hint}</Text>
      </View>
      {children}
    </View>
  );

  const tagGroup = (key: "tools" | "skills" | "theories", label: string, placeholder: string) => (
    <View style={styles.tagGroup}>
      <View style={styles.row}>
        <Field
          label={label}
          value={tagDrafts[key]}
          onChangeText={(v) => setTagDrafts((d) => ({ ...d, [key]: v }))}
          placeholder={placeholder}
          onSubmitEditing={() => addTag(key)}
          returnKeyType="done"
          containerStyle={styles.grow}
        />
        <MdButton variant="tonal" label={t("deepspace:careerInput.add")} onPress={() => addTag(key)} />
      </View>
      {form[key].length > 0 ? (
        <View style={styles.chipWrap}>
          {form[key].map((tag) => (
            <MdChip
              key={tag}
              kind="input"
              label={tag}
              onClose={() => set(key, form[key].filter((x) => x !== tag))}
              removeAccessibilityLabel={t("deepspace:careerInput.removeTag", { tag })}
            />
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <DeepSpaceScreen active="lens" header="none" variant="museumLike" title={t("deepspace:careerInput.screenTitle")} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <MdCard variant="filled" style={styles.intro}>
          <Text variant="subtle" color="textMuted">{t("deepspace:careerInput.intro")}</Text>
        </MdCard>

        {section(
          { key: "workplace", title: t("deepspace:careerInput.workplace"), hint: t("deepspace:careerInput.workplaceHint") },
          <>
            <Field label={t("deepspace:careerInput.industry")} value={form.industry} onChangeText={(v) => set("industry", v)} placeholder={t("deepspace:careerInput.industryPlaceholder")} containerStyle={styles.field} />
            <Field label={t("deepspace:careerInput.company")} value={form.company} onChangeText={(v) => set("company", v)} placeholder={t("deepspace:careerInput.companyPlaceholder")} containerStyle={styles.field} />
            <Field label={t("deepspace:careerInput.dept")} value={form.dept} onChangeText={(v) => set("dept", v)} placeholder={t("deepspace:careerInput.deptPlaceholder")} containerStyle={styles.field} />
            <Field label={t("deepspace:careerInput.team")} value={form.team} onChangeText={(v) => set("team", v)} placeholder={t("deepspace:careerInput.teamPlaceholder")} containerStyle={styles.field} />
          </>,
        )}

        {section(
          { key: "role", title: t("deepspace:careerInput.role"), hint: t("deepspace:careerInput.roleHint") },
          <>
            <Field label={t("deepspace:careerInput.rank")} value={form.rank} onChangeText={(v) => set("rank", v)} placeholder={t("deepspace:careerInput.rankPlaceholder")} containerStyle={styles.field} />
            <Field label={t("deepspace:careerInput.job")} value={form.job} onChangeText={(v) => set("job", v)} placeholder={t("deepspace:careerInput.jobPlaceholder")} containerStyle={styles.field} />
            <Field label={t("deepspace:careerInput.title")} value={form.title} onChangeText={(v) => set("title", v)} placeholder={t("deepspace:careerInput.titlePlaceholder")} containerStyle={styles.field} />
          </>,
        )}

        {section(
          { key: "project", title: t("deepspace:careerInput.project"), hint: t("deepspace:careerInput.projectHint") },
          <>
            <Field label={t("deepspace:careerInput.projectName")} value={form.project} onChangeText={(v) => set("project", v)} placeholder={t("deepspace:careerInput.projectPlaceholder")} containerStyle={styles.field} />
            <DateField
              label={t("deepspace:careerInput.start")}
              value={form.start}
              onChange={(iso) => set("start", iso)}
              supportingText={t("deepspace:careerInput.startHint")}
              containerStyle={styles.field}
            />
            {!form.ongoing ? (
              <DateField
                label={t("deepspace:careerInput.end")}
                value={form.end}
                onChange={(iso) => set("end", iso)}
                minDate={form.start || undefined}
                containerStyle={styles.field}
              />
            ) : null}
            <MdChip
              kind="filter"
              label={t("deepspace:careerInput.ongoing")}
              selected={form.ongoing}
              onPress={() => set("ongoing", !form.ongoing)}
            />
          </>,
        )}

        {section(
          { key: "kpi", title: t("deepspace:careerInput.kpi"), hint: t("deepspace:careerInput.kpiHint") },
          <>
            {form.kpis.map((k) => (
              <View key={k.id} style={styles.kpiRow}>
                <Field
                  label={k.unit ? `${k.name} (${k.unit})` : k.name}
                  value={k.value}
                  onChangeText={(v) =>
                    set("kpis", form.kpis.map((x) => (x.id === k.id ? { ...x, value: v } : x)))
                  }
                  placeholder={t("deepspace:careerInput.kpiValue")}
                  keyboardType="numeric"
                  containerStyle={styles.grow}
                />
                <MdButton
                  variant="text"
                  label={t("deepspace:careerInput.remove")}
                  onPress={() => set("kpis", form.kpis.filter((x) => x.id !== k.id))}
                />
              </View>
            ))}
            <View style={styles.row}>
              <Field
                label={t("deepspace:careerInput.kpiCustom")}
                value={kpiDraft}
                onChangeText={setKpiDraft}
                placeholder={t("deepspace:careerInput.kpiCustomPlaceholder")}
                onSubmitEditing={() => {
                  addKpi(kpiDraft, "");
                  setKpiDraft("");
                }}
                returnKeyType="done"
                containerStyle={styles.grow}
              />
              <MdButton
                variant="tonal"
                label={t("deepspace:careerInput.add")}
                onPress={() => {
                  addKpi(kpiDraft, "");
                  setKpiDraft("");
                }}
              />
            </View>
            <Text variant="caption" color="textSubtle" style={styles.suggestLabel}>
              {t("deepspace:careerInput.suggestTitle")}
            </Text>
            <View style={styles.chipWrap}>
              {suggestions.map((s) => (
                <MdChip
                  key={s.name}
                  kind="assist"
                  label={s.unit ? `${s.name} (${s.unit})` : s.name}
                  onPress={() => addKpi(s.name, s.unit)}
                />
              ))}
            </View>
          </>,
        )}

        {section(
          { key: "result", title: t("deepspace:careerInput.result"), hint: t("deepspace:careerInput.resultHint") },
          <>
            <Field
              label={t("deepspace:careerInput.summary")}
              value={form.summary}
              onChangeText={(v) => set("summary", v)}
              placeholder={t("deepspace:careerInput.summaryPlaceholder")}
              containerStyle={styles.field}
            />
            <Field
              label={t("deepspace:careerInput.freeNote")}
              value={form.freeNote}
              onChangeText={(v) => set("freeNote", v)}
              placeholder={t("deepspace:careerInput.freeNotePlaceholder")}
              multiline
              numberOfLines={4}
              containerStyle={styles.field}
            />
          </>,
        )}

        {section(
          { key: "breakdown", title: t("deepspace:careerInput.breakdown"), hint: t("deepspace:careerInput.breakdownHint") },
          <>
            <Field label={t("deepspace:careerInput.problem")} value={form.problem} onChangeText={(v) => set("problem", v)} placeholder={t("deepspace:careerInput.problemPlaceholder")} multiline numberOfLines={3} containerStyle={styles.field} />
            <Field label={t("deepspace:careerInput.productivity")} value={form.productivity} onChangeText={(v) => set("productivity", v)} placeholder={t("deepspace:careerInput.productivityPlaceholder")} multiline numberOfLines={3} containerStyle={styles.field} />
            <Field label={t("deepspace:careerInput.communication")} value={form.communication} onChangeText={(v) => set("communication", v)} placeholder={t("deepspace:careerInput.communicationPlaceholder")} multiline numberOfLines={3} containerStyle={styles.field} />
          </>,
        )}

        {section(
          { key: "stack", title: t("deepspace:careerInput.stack"), hint: t("deepspace:careerInput.stackHint") },
          <>
            {tagGroup("tools", t("deepspace:careerInput.tools"), t("deepspace:careerInput.toolsPlaceholder"))}
            {tagGroup("skills", t("deepspace:careerInput.skills"), t("deepspace:careerInput.skillsPlaceholder"))}
            {tagGroup("theories", t("deepspace:careerInput.theories"), t("deepspace:careerInput.theoriesPlaceholder"))}
          </>,
        )}

        {saveFailed ? (
          <Text variant="caption" color="danger" style={styles.error}>
            {t("deepspace:career.saveFailed")}
          </Text>
        ) : null}

        <MdButton
          variant="filled"
          label={saving ? t("deepspace:career.saving") : t("deepspace:careerInput.save")}
          onPress={handleSave}
          disabled={!canSave}
          style={styles.submit}
        />
        <Text variant="caption" color="textSubtle" style={styles.requiredNote}>
          {t("deepspace:careerInput.requiredNote")}
        </Text>
      </ScrollView>
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  intro: { padding: spacing.md, marginBottom: spacing.lg },
  section: { marginBottom: spacing.lg },
  sectionHead: { marginBottom: spacing.sm, gap: 2 },
  sectionTitle: { color: m3.color.onSurface, fontWeight: "700" },
  field: { marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  grow: { flex: 1 },
  kpiRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, marginBottom: spacing.sm },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  suggestLabel: { marginTop: spacing.md },
  tagGroup: { marginBottom: spacing.md },
  submit: { marginTop: spacing.sm },
  requiredNote: { marginTop: spacing.sm, textAlign: "center" },
  error: { marginBottom: spacing.sm },
});
