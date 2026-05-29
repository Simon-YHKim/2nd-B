// Record detail (queue B / A-to-Z Phase 6) — one saved piece in full.
// Reached from the records browser or the core-brain evidence drawer.
// Shows the piece's type, date, topic and body, plus the standard handoffs
// (그래프에서 보기 / 세컨비에게 묻기 / open the source screen).
//
// Renders loading / not-found / error / normal states so a direct URL never
// lands on a blank or crashing screen.

import { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, useLocalSearchParams } from "expo-router";

import { PremiumAppShell } from "@/components/premium";
import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  recordKindToType,
  evidenceRoute,
  evidenceTypeLabel,
  evidenceDateLabel,
  type EvidenceType,
} from "@/lib/persona/evidence";

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
  const { i18n } = useTranslation();
  const { userId, loading } = useAuth();
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const { id } = useLocalSearchParams<{ id: string }>();

  const [row, setRow] = useState<RecordDetailRow | null>(null);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    if (!userId || !id) return;
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const supabase = getSupabaseClient();
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
  }, [userId, id]);

  if (loading) {
    return (
      <PremiumAppShell>
        <View style={styles.center}><ActivityIndicator color={semantic.brand} /></View>
      </PremiumAppShell>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  if (state === "loading") {
    return (
      <PremiumAppShell>
        <View style={styles.center}><ActivityIndicator color={semantic.brand} /></View>
      </PremiumAppShell>
    );
  }

  if (state === "error" || state === "missing" || !row) {
    return (
      <PremiumAppShell>
        <View style={styles.center}>
          <Text variant="heading" style={{ textAlign: "center" }}>
            {state === "missing"
              ? locale === "ko" ? "조각을 찾을 수 없어요" : "Piece not found"
              : locale === "ko" ? "조각을 불러오지 못했어요" : "Couldn't load this piece"}
          </Text>
          <Button label={locale === "ko" ? "기록으로" : "Back to records"} variant="secondary" onPress={() => router.replace("/records")} />
        </View>
      </PremiumAppShell>
    );
  }

  const type: EvidenceType = recordKindToType(row.kind, row.tags ?? []);
  const title = row.topic && row.topic.trim().length > 0 ? row.topic.trim() : evidenceTypeLabel(type, locale);
  const dateLabel = evidenceDateLabel(row.created_at, locale);

  return (
    <PremiumAppShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View>
          <Text variant="caption" color="brand" style={{ letterSpacing: 1 }}>
            {[evidenceTypeLabel(type, locale), dateLabel].filter(Boolean).join(" · ")}
          </Text>
          <Text variant="heading">{title}</Text>
        </View>

        {row.tags && row.tags.length > 0 ? (
          <View style={styles.tagRow}>
            {row.tags.map((t) => (
              <View key={t} style={styles.tagChip}>
                <Text variant="caption" color="textMuted">#{t}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.bodyCard}>
          {row.body && row.body.trim().length > 0 ? (
            <Text variant="body" selectable>{row.body}</Text>
          ) : (
            <Text variant="body" color="textMuted">
              {locale === "ko" ? "이 조각엔 본문이 없어요." : "This piece has no body text."}
            </Text>
          )}
        </View>

        {/* Handoffs (A-to-Z Phase 13) */}
        <View style={styles.handoffs}>
          <Button
            label={locale === "ko" ? "그래프에서 보기" : "See in graph"}
            variant="secondary"
            onPress={() => router.push({ pathname: "/", params: { highlightRecordId: row.id } })}
          />
          <Button
            label={locale === "ko" ? "세컨비에게 묻기" : "Ask SecondB"}
            variant="secondary"
            onPress={() => router.push({ pathname: "/jarvis", params: { fromNode: title } })}
          />
          <Button
            label={locale === "ko" ? "원래 화면 열기" : "Open its screen"}
            variant="primary"
            onPress={() => router.push(evidenceRoute(type) as never)}
          />
        </View>
      </ScrollView>
    </PremiumAppShell>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: spacing.lg, padding: spacing.lg },
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
