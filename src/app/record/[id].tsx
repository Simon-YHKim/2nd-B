// Record detail (queue B / A-to-Z Phase 6) - one saved piece in full.
// Reached from the records browser or the core-brain evidence drawer.
// Shows the piece's type, date, topic and body, plus the standard handoffs
// (see in graph / ask SecondB / open the source screen).
//
// Renders loading / not-found / error / normal states so a direct URL never
// lands on a blank or crashing screen.

import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { PremiumAppShell, PremiumLoadingState } from "@/components/premium";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  evidenceDateLabel,
  evidenceRoute,
  evidenceTypeLabel,
  recordKindToType,
  sourceKindToType,
  type EvidenceType,
} from "@/lib/persona/evidence";
import { summarizeAssessmentBody } from "@/lib/persona/assessment-summary";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useFocusRefetch } from "@/lib/nav/use-focus-refetch";
import { radii, semantic, spacing } from "@/lib/theme/tokens";

interface RecordDetailRow {
  id: string;
  kind: string;
  topic: string | null;
  body: string | null;
  created_at: string;
  tags: string[] | null;
}

type LoadState = "loading" | "ready" | "missing" | "error";

export default function RecordDetail() {
  const { t, i18n } = useTranslation("recordDetail");
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const { id, origin } = useLocalSearchParams<{ id: string; origin?: string }>();
  const isSource = origin === "source";

  const [row, setRow] = useState<RecordDetailRow | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!userId || !id) return;
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const supabase = getSupabaseClient();
        if (isSource) {
          // Source-origin pieces (capture / imagine) live in the `sources`
          // table with a different column shape (title/captured_at, no body).
          // Map them onto RecordDetailRow so the detail view renders the
          // specific piece instead of bouncing to the generic capture screen.
          const { data, error } = await supabase
            .from("sources")
            .select("id, kind, title, captured_at, tags")
            .eq("user_id", userId)
            .eq("id", id)
            .maybeSingle();
          if (error) throw error;
          if (cancelled) return;
          if (!data) {
            setState("missing");
            return;
          }
          const s = data as { id: string; kind: string; title: string | null; captured_at: string; tags: string[] | null };
          setRow({ id: s.id, kind: s.kind, topic: s.title, body: null, created_at: s.captured_at, tags: s.tags });
          setState("ready");
          return;
        }
        const { data, error } = await supabase
          .from("records")
          .select("id, kind, topic, body, created_at, tags")
          .eq("user_id", userId)
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        if (!data) {
          setState("missing");
          return;
        }
        setRow(data as RecordDetailRow);
        setState("ready");
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[record] load failed", (e as Error).message);
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, id, isSource, reloadKey]);
  useFocusRefetch(() => setReloadKey((k) => k + 1), Boolean(userId && id));

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading.auth")} />
        </View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  if (state === "loading") {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <PremiumLoadingState message={t("loading.record")} />
        </View>
      </PremiumAppShell>
    );
  }

  if (state === "error" || state === "missing" || !row) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <Text variant="heading" style={{ textAlign: "center" }}>
            {state === "missing" ? t("state.missingTitle") : t("state.errorTitle")}
          </Text>
          <Button label={t("actions.backToRecords")} variant="secondary" onPress={() => router.replace("/records")} />
        </View>
      </PremiumAppShell>
    );
  }

  const type: EvidenceType = isSource ? sourceKindToType(row.kind, row.tags ?? []) : recordKindToType(row.kind, row.tags ?? []);
  const title = row.topic && row.topic.trim().length > 0 ? row.topic.trim() : evidenceTypeLabel(type, locale);
  const dateLabel = evidenceDateLabel(row.created_at, locale);
  // Assessment records (MBTI/Big Five/ECR) store a JSON body - render it as
  // friendly label/value lines instead of dumping raw JSON at the user.
  const assessment = summarizeAssessmentBody(row.body, locale);

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View>
          <Text variant="caption" color="brand" style={{ letterSpacing: 0 }}>
            {[evidenceTypeLabel(type, locale), dateLabel].filter(Boolean).join(" · ")}
          </Text>
          <Text variant="heading">{title}</Text>
        </View>

        {row.tags && row.tags.length > 0 ? (
          <View style={styles.tagRow}>
            {row.tags.map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <Text variant="caption" color="textMuted">
                  #{tag}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.bodyCard}>
          {assessment ? (
            <View style={styles.assessment}>
              <Text variant="caption" color="brand" style={{ letterSpacing: 0 }}>
                {assessment.label}
              </Text>
              {assessment.lines.map((line) => (
                <View key={line.k} style={styles.assessmentRow}>
                  <Text variant="subtle" color="textMuted">
                    {line.k}
                  </Text>
                  <Text variant="body">{line.v}</Text>
                </View>
              ))}
            </View>
          ) : row.body && row.body.trim().length > 0 ? (
            <Text variant="body" selectable>
              {row.body}
            </Text>
          ) : (
            <Text variant="body" color="textMuted">
              {isSource ? t("body.sourceEmpty") : t("body.noText")}
            </Text>
          )}
        </View>

        <View style={styles.handoffs}>
          {/* J1: only source-origin pieces exist as graph nodes; for a journal
              or note record the highlight matched nothing and the button
              landed on an unchanged graph (the broken-promise class the
              capture CTA fix routes users straight into). */}
          {isSource ? (
            <Button
              label={t("actions.seeGraph")}
              variant="secondary"
              onPress={() => router.push({ pathname: "/", params: { highlightRecordId: row.id } })}
            />
          ) : null}
          <Button
            label={t("actions.askSecondB")}
            variant="secondary"
            onPress={() => router.push({ pathname: "/secondb", params: { fromNode: title } })}
          />
          <Button label={t("actions.openSource")} variant="primary" onPress={() => router.push(evidenceRoute(type) as never)} />
        </View>
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.lg, padding: spacing.lg },
  assessment: { gap: spacing.sm },
  assessmentRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tagChip: {
    borderWidth: 1,
    borderColor: semantic.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  bodyCard: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  handoffs: { gap: spacing.md },
});
