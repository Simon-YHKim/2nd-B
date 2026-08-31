import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import type { AnyGlyphName } from "@/components/pixel/pixel-glyphs";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  loadAuditProvenance,
  normalizeAuditOrigin,
  type AuditProvenanceResult,
  type AuditStarProvenance,
} from "@/lib/persona/audit-provenance";
import {
  isUnlived,
  SEVEN_STARS,
  type SevenStar,
  type SevenStarId,
} from "@/lib/persona/seven-stars";
import { m3 } from "@/lib/theme/m3";

type ScreenReadState =
  | { kind: "loading"; ownerId: string | null }
  | (AuditProvenanceResult & { ownerId: string });

type Translate = (key: string, options?: Record<string, unknown>) => string;

function originLabel(
  origin: AuditStarProvenance["origin"],
  t: Translate,
): string {
  switch (normalizeAuditOrigin(origin)) {
    case "ratify":
      return t("ratifications:originRatify");
    case "rebuild":
      return t("ratifications:originRebuild");
    case "recorded":
      return t("ratifications:originRecorded");
  }
}

function StatePanel({
  icon,
  message,
  retryLabel,
  onRetry,
}: {
  icon: AnyGlyphName;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <PixelSurface variant="frame" style={styles.stateSurface} contentStyle={styles.stateContent}>
      <PixelGlyph name={icon} color={m3.color.primary} size={24} />
      <Text variant="body" style={styles.stateMessage}>
        {message}
      </Text>
      {retryLabel && onRetry ? (
        <PixelPressable
          fullWidth
          variant="bevel"
          onPress={onRetry}
          accessibilityLabel={retryLabel}
          contentStyle={styles.actionContent}
        >
          <PixelGlyph name="refresh" color={m3.color.onSurface} size={18} />
          <Text variant="body" style={styles.actionText}>
            {retryLabel}
          </Text>
        </PixelPressable>
      ) : null}
    </PixelSurface>
  );
}

function StarDisclosure({
  star,
  entry,
  expanded,
  locked,
  onToggle,
  t,
}: {
  star: SevenStar;
  entry: AuditStarProvenance | undefined;
  expanded: boolean;
  locked: boolean;
  onToggle: () => void;
  t: Translate;
}) {
  const name = t(`home:ds.star.${star.key}`);
  const emptyCopy =
    star.id === "profile"
      ? t("home:ds.star.profileBody")
      : t("home:ds.star.emptyBody");
  const evidenceSummary = entry
    ? t("brightness:honestyLine", {
        obs: entry.observations,
        cited: entry.citedObservations,
        stars: 1,
      })
    : emptyCopy;

  return (
    <View style={styles.starBlock}>
      <PixelPressable
        fullWidth
        variant="bevel"
        onPress={onToggle}
        accessibilityLabel={`${name}. ${evidenceSummary}`}
        accessibilityState={{ expanded }}
        contentStyle={styles.starButtonContent}
      >
        <PixelGlyph name="star" color={m3.color.primary} size={24} />
        <View style={styles.starHeading}>
          <Text variant="body" style={styles.starName}>
            {name}
          </Text>
          {entry ? (
            <Text variant="caption" style={styles.starLevel}>
              {`L${entry.level}`}
            </Text>
          ) : null}
        </View>
        <PixelGlyph
          name={expanded ? "expand_less" : "expand_more"}
          color={m3.color.onSurfaceVariant}
          size={24}
        />
      </PixelPressable>

      {expanded ? (
        <PixelSurface variant="inset" contentStyle={styles.disclosureContent}>
          {entry ? (
            <>
              <Text variant="heading" style={styles.detailLevel}>
                {`L${entry.level}`}
              </Text>
              <Text variant="body" style={styles.detailText}>
                {evidenceSummary}
              </Text>
              <View style={styles.detailLine}>
                <PixelGlyph name="article" color={m3.color.onSurfaceVariant} size={18} />
                <Text variant="caption" style={styles.detailText}>
                  {t("ratifications:cited", { n: entry.citations })}
                </Text>
              </View>
              <View style={styles.detailLine}>
                <PixelGlyph name="schedule" color={m3.color.onSurfaceVariant} size={18} />
                <Text variant="caption" style={styles.detailText}>
                  {entry.recordedAt.slice(0, 10)}
                </Text>
              </View>
              <View style={styles.detailLine}>
                <PixelGlyph name="article" color={m3.color.onSurfaceVariant} size={18} />
                <Text variant="caption" style={styles.detailText}>
                  {originLabel(entry.origin, t)}
                </Text>
              </View>
            </>
          ) : (
            <Text variant="body" style={styles.detailText}>
              {emptyCopy}
            </Text>
          )}

          {locked ? (
            <Text variant="body" style={styles.lockedText}>
              {t("home:ds.star.lockedBody")}
            </Text>
          ) : null}

          {star.period !== null && !locked ? (
            <PixelPressable
              fullWidth
              variant="bevel"
              onPress={() =>
                router.push({
                  pathname: "/interview",
                  params: { period: star.period },
                })
              }
              accessibilityRole="link"
              accessibilityLabel={t(
                entry ? "home:ds.star.continue" : "home:ds.star.start",
              )}
              contentStyle={styles.actionContent}
            >
              <Text variant="body" style={styles.actionText}>
                {t(entry ? "home:ds.star.continue" : "home:ds.star.start")}
              </Text>
              <PixelGlyph name="arrow_forward" color={m3.color.onSurface} size={18} />
            </PixelPressable>
          ) : null}
        </PixelSurface>
      ) : null}
    </View>
  );
}

export function DdsAuditScreen() {
  const { t } = useTranslation(["home", "brightness", "ratifications", "common"]);
  const {
    userId,
    loading,
    hasProfile,
    profileProbeFailed,
    age,
    refresh,
  } = useAuth();
  const [expandedStarId, setExpandedStarId] = useState<SevenStarId | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [readState, setReadState] = useState<ScreenReadState>({
    kind: "loading",
    ownerId: null,
  });
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (loading || !userId || hasProfile !== true || profileProbeFailed) return;
    let active = true;
    const requestId = ++requestIdRef.current;
    setReadState({ kind: "loading", ownerId: userId });
    void loadAuditProvenance(userId).then((result) => {
      if (!active || requestId !== requestIdRef.current) return;
      setReadState({ ...result, ownerId: userId });
    });
    return () => {
      active = false;
    };
  }, [hasProfile, loading, profileProbeFailed, reloadNonce, userId]);

  const currentState: ScreenReadState =
    readState.ownerId === userId
      ? readState
      : { kind: "loading", ownerId: userId };
  const entries = currentState.kind === "ready" ? currentState.entries : [];
  const entryByStar = useMemo(
    () => new Map(entries.map((entry) => [entry.starId, entry])),
    [entries],
  );
  const totals = useMemo(
    () =>
      entries.reduce(
        (sum, entry) => ({
          observations: sum.observations + entry.observations,
          citedObservations:
            sum.citedObservations + entry.citedObservations,
        }),
        { observations: 0, citedObservations: 0 },
      ),
    [entries],
  );

  const title = t("brightness:evidence");
  const shell = (body: ReactNode) => (
    <DeepSpaceScreen
      active="lens"
      header="none"
      variant="windowed"
      title={title}
      onBack={() => router.back()}
    >
      {body}
    </DeepSpaceScreen>
  );

  if (loading) {
    return shell(
      <View style={styles.center}>
        <StatePanel icon="schedule" message={t("common:states.loading")} />
      </View>,
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === null) {
    return shell(
      <View style={styles.center}>
        <StatePanel icon="schedule" message={t("common:states.loading")} />
      </View>,
    );
  }
  if (profileProbeFailed) {
    return shell(
      <View style={styles.center}>
        <StatePanel
          icon="warning"
          message={t("common:errors.network")}
          retryLabel={t("common:actions.retry")}
          onRetry={() => void refresh()}
        />
      </View>,
    );
  }
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  if (currentState.kind === "loading") {
    return shell(
      <View style={styles.center}>
        <StatePanel icon="schedule" message={t("brightness:readingSky")} />
      </View>,
    );
  }
  if (currentState.kind === "timeout") {
    return shell(
      <View style={styles.center}>
        <StatePanel
          icon="schedule"
          message={t("common:errors.network")}
          retryLabel={t("common:actions.retry")}
          onRetry={() => setReloadNonce((value) => value + 1)}
        />
      </View>,
    );
  }
  if (currentState.kind === "error") {
    return shell(
      <View style={styles.center}>
        <StatePanel
          icon="warning"
          message={t("common:errors.unknown")}
          retryLabel={t("common:actions.retry")}
          onRetry={() => setReloadNonce((value) => value + 1)}
        />
      </View>,
    );
  }

  return shell(
    <ScrollView contentContainerStyle={styles.scroll}>
      <PixelSurface variant="bevel" contentStyle={styles.heroContent}>
        <PixelGlyph name="star" color={m3.color.primary} size={24} />
        <View style={styles.heroCopy}>
          <Text variant="heading" style={styles.heroTitle} accessibilityRole="header">
            {title}
          </Text>
          <Text variant="body" style={styles.heroBody}>
            {t("brightness:honestyCaption")}
          </Text>
          {currentState.kind === "ready" ? (
            <Text variant="caption" style={styles.heroSummary}>
              {t("brightness:honestyLine", {
                obs: totals.observations,
                cited: totals.citedObservations,
                stars: entries.length,
              })}
            </Text>
          ) : null}
        </View>
      </PixelSurface>

      {currentState.kind === "empty" ? (
        <StatePanel icon="inbox" message={t("home:ds.star.emptyBody")} />
      ) : null}

      <View style={styles.starList}>
        {SEVEN_STARS.map((star) => {
          const expanded = expandedStarId === star.id;
          return (
            <StarDisclosure
              key={star.id}
              star={star}
              entry={entryByStar.get(star.id)}
              expanded={expanded}
              locked={isUnlived(star.id, age)}
              onToggle={() =>
                setExpandedStarId((current) =>
                  current === star.id ? null : star.id,
                )
              }
              t={t}
            />
          );
        })}
      </View>

      <View style={styles.routeActions}>
        <PixelPressable
          fullWidth
          variant="bevel"
          onPress={() => router.push("/ratifications")}
          accessibilityRole="link"
          accessibilityLabel={t("brightness:ratLog")}
          contentStyle={styles.actionContent}
        >
          <PixelGlyph name="article" color={m3.color.onSurface} size={18} />
          <Text variant="body" style={styles.actionText}>
            {t("brightness:ratLog")}
          </Text>
          <PixelGlyph name="chevron_right" color={m3.color.onSurface} size={18} />
        </PixelPressable>
        <PixelPressable
          fullWidth
          variant="bevel"
          onPress={() => router.push("/brightness")}
          accessibilityRole="link"
          accessibilityLabel={t("brightness:barTitle")}
          contentStyle={styles.actionContent}
        >
          <PixelGlyph name="trending_up" color={m3.color.onSurface} size={18} />
          <Text variant="body" style={styles.actionText}>
            {t("brightness:barTitle")}
          </Text>
          <PixelGlyph name="chevron_right" color={m3.color.onSurface} size={18} />
        </PixelPressable>
      </View>
    </ScrollView>,
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    padding: m3.spacing.s4,
  },
  scroll: {
    padding: m3.spacing.s4,
    paddingBottom: m3.spacing.s8,
    gap: m3.spacing.s3,
  },
  stateSurface: { width: "100%" },
  stateContent: { gap: m3.spacing.s3, alignItems: "flex-start" },
  stateMessage: {
    color: m3.color.onSurfaceVariant,
    lineHeight: m3.type.bodyMedium.line,
    paddingBottom: m3.spacing.s1,
  },
  heroContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: m3.spacing.s3,
    paddingVertical: m3.spacing.s4,
  },
  heroCopy: { flex: 1, gap: m3.spacing.s2 },
  heroTitle: { color: m3.color.onSurface },
  heroBody: { color: m3.color.onSurfaceVariant, lineHeight: m3.type.bodyMedium.line },
  heroSummary: { color: m3.color.primary, lineHeight: m3.type.bodySmall.line },
  starList: { gap: m3.spacing.s2 },
  starBlock: { gap: m3.spacing.s1 },
  starButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s3,
    minHeight: m3.minTouch,
  },
  starHeading: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s2,
  },
  starName: { color: m3.color.onSurface },
  starLevel: { color: m3.color.primary, fontFamily: m3.font.mono },
  disclosureContent: { gap: m3.spacing.s3, paddingVertical: m3.spacing.s4 },
  detailLevel: { color: m3.color.primary, fontFamily: m3.font.mono },
  detailText: { color: m3.color.onSurfaceVariant, lineHeight: m3.type.bodyMedium.line },
  detailLine: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s2 },
  lockedText: { color: m3.color.error, lineHeight: m3.type.bodyMedium.line },
  actionContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s2,
  },
  actionText: { flex: 1, color: m3.color.onSurface, textAlign: "center" },
  routeActions: { gap: m3.spacing.s2, marginTop: m3.spacing.s2 },
});
