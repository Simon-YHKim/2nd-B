// 적용된 별 변화의 읽기 전용 원장.
//
// 실제 star_tier_history observation만 newest-first로 보여 준다. 이 화면에는
// 비준/되돌리기/write가 없으며, 실패를 빈 이력으로 바꾸지 않는다.
import { useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router } from "expo-router";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PixelPressable, PixelSurface } from "@/components/pixel";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { Text } from "@/components/ui/Text";
import { useAuth } from "@/lib/auth/AuthContext";
import { keepAllKo } from "@/lib/i18n/keep-all";
import { addressTerm } from "@/lib/persona/address";
import { ratificationEmptyState, type RatificationEntry } from "@/lib/persona/brightness-timeline";
import {
  beginRatificationRead,
  canPublishRatificationRead,
  filterRatificationEntries,
  finishRatificationRead,
  initialRatificationReadState,
  loadRatificationsForGate,
  ratificationAuthGate,
  ratificationOriginKey,
  ratificationSummary,
  ratificationTimeLabel,
  type RatificationFilter,
  type RatificationReadStatus,
} from "@/lib/persona/ratification-screen";
import { starNameKey } from "@/lib/persona/star-name";
import { useAddressTerm } from "@/lib/persona/use-address";
import { m3 } from "@/lib/theme/m3";

type Tx = (key: string, options?: Record<string, unknown>) => string;

const FILTERS: readonly RatificationFilter[] = ["all", "ratified", "held", "declined"];

function starName(starId: string, t: Tx): string {
  const key = starNameKey(starId);
  return key ? t(`home:${key}`) : t("community:unknownSender");
}

function StatusSurface({
  message,
  status,
  retryLabel,
  onRetry,
}: {
  message: string;
  status: "loading" | "error" | "timeout";
  retryLabel?: string;
  onRetry?: () => void;
}) {
  const color = status === "error" ? m3.color.error : m3.color.primary;
  const glyph = status === "error" ? "warning" : "refresh";
  return (
    <PixelSurface variant="frame" style={styles.statusSurface} contentStyle={styles.statusContent}>
      <View
        accessible
        accessibilityRole={status === "loading" ? "progressbar" : "alert"}
        accessibilityLabel={message}
        style={styles.statusLine}
      >
        <PixelGlyph name={glyph} color={color} size={24} />
        <Text style={styles.statusText}>{message}</Text>
      </View>
      {retryLabel && onRetry ? (
        <PixelPressable
          fullWidth
          variant="bevel"
          accessibilityLabel={retryLabel}
          onPress={onRetry}
          contentStyle={styles.actionContent}
        >
          <PixelGlyph name="refresh" color={m3.color.onPrimaryContainer} size={18} />
          <Text style={styles.actionText}>{retryLabel}</Text>
        </PixelPressable>
      ) : null}
    </PixelSurface>
  );
}

function GateFrame({
  title,
  message,
  status,
  retryLabel,
  onRetry,
}: {
  title: string;
  message: string;
  status: "loading" | "error" | "timeout";
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <DeepSpaceScreen
      active="lens"
      header="none"
      variant="windowed"
      title={title}
      onBack={() => router.back()}
    >
      <View style={styles.gateCenter}>
        <StatusSurface
          message={message}
          status={status}
          retryLabel={retryLabel}
          onRetry={onRetry}
        />
      </View>
    </DeepSpaceScreen>
  );
}

function RatificationEntryCard({
  entry,
  locale,
  t,
}: {
  entry: RatificationEntry;
  locale: string;
  t: Tx;
}) {
  const origin = t(ratificationOriginKey(entry.origin));
  const target = starName(entry.starId, t);
  const when = ratificationTimeLabel(entry.recordedAt, Date.now(), locale, t);

  return (
    <PixelSurface variant="frame" style={styles.entry} contentStyle={styles.entryContent}>
      <View style={styles.entryHead}>
        <View style={styles.iconBox}>
          <PixelGlyph name="star" color={m3.color.onSurfaceVariant} size={18} />
        </View>
        <Text style={styles.source}>{origin}</Text>
        <View style={styles.decisionBox}>
          <PixelGlyph name="check" color={m3.color.onPrimaryContainer} size={14} />
          <Text style={styles.decisionText}>{t("ratified")}</Text>
        </View>
      </View>

      <View style={styles.entryMeta}>
        <Text style={styles.target}>{target}</Text>
        <View style={styles.delta}>
          {entry.prevLevel === null ? null : (
            <>
              <Text style={styles.deltaText}>{`L${entry.prevLevel}`}</Text>
              <PixelGlyph name="arrowForward" color={m3.color.onSurfaceVariant} size={14} />
            </>
          )}
          <Text style={[styles.deltaText, styles.deltaTo]}>{`L${entry.level}`}</Text>
        </View>
      </View>

      {when || entry.citedCount > 0 ? (
        <View style={styles.entryFoot}>
          {when ? <Text style={styles.when}>{when}</Text> : null}
          {entry.citedCount > 0 ? (
            <Text style={styles.note}>{t("cited", { n: entry.citedCount })}</Text>
          ) : null}
        </View>
      ) : null}
    </PixelSurface>
  );
}

/** Mounted only after auth + a genuine profile answer, so both reads stay behind the gate. */
function RatificationsReady({ ownerId }: { ownerId: string }) {
  const { t, i18n } = useTranslation("ratifications");
  useAddressTerm(ownerId, i18n.language);

  const [filter, setFilter] = useState<RatificationFilter>("all");
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [retryEpoch, setRetryEpoch] = useState(0);
  const [readState, setReadState] = useState(initialRatificationReadState);
  const mountedRef = useRef(false);
  const ownerRef = useRef<string | null>(ownerId);
  const requestRef = useRef(0);
  ownerRef.current = ownerId;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const ticket = { ownerId, requestId: ++requestRef.current };
    setReadState((previous) => beginRatificationRead(previous, ticket));
    void loadRatificationsForGate("ready", ownerId).then((result) => {
      if (!result) return;
      if (
        !canPublishRatificationRead(
          ticket,
          ownerRef.current,
          requestRef.current,
          mountedRef.current,
        )
      ) {
        return;
      }
      setReadState((previous) => finishRatificationRead(previous, ticket, result));
    });
  }, [ownerId, retryEpoch]);

  const isCurrentOwner = readState.ownerId === ownerId;
  const status: RatificationReadStatus = isCurrentOwner ? readState.status : "loading";
  const entries = isCurrentOwner ? readState.entries : null;
  const all = entries ?? [];
  const visible = filterRatificationEntries(all, filter, showUnchanged);
  const summary = ratificationSummary(all);
  const unchangedCount = all.filter(
    (entry) => entry.prevLevel !== null && entry.prevLevel === entry.level,
  ).length;
  const subtitleText = t("subtitle", { who: addressTerm(null, i18n.language) });
  const retry = () => setRetryEpoch((value) => value + 1);

  const filterLabel: Record<RatificationFilter, string> = {
    all: t("all"),
    ratified: t("ratified"),
    held: t("held"),
    declined: t("declined"),
  };
  const counts = [
    { key: "proposed", label: t("proposed"), count: summary.proposed, color: m3.color.onSurface },
    { key: "ratified", label: t("ratified"), count: summary.ratified, color: m3.color.primary },
    { key: "held", label: t("held"), count: summary.held, color: m3.accent.trendFlat },
    { key: "declined", label: t("declined"), count: summary.declined, color: m3.color.error },
  ];

  const readNotice =
    status === "loading" ? (
      <StatusSurface message={t("openingLedger")} status="loading" />
    ) : status === "error" ? (
      <StatusSurface
        message={t("common:errors.unknown")}
        status="error"
        retryLabel={t("common:actions.retry")}
        onRetry={retry}
      />
    ) : status === "timeout" ? (
      <StatusSurface
        message={t("common:errors.network")}
        status="timeout"
        retryLabel={t("common:actions.retry")}
        onRetry={retry}
      />
    ) : null;

  const header = (
    <View style={styles.header}>
      <Text style={styles.headline}>{t("barTitle")}</Text>
      <Text style={styles.subtitle} accessibilityLabel={subtitleText}>
        {keepAllKo(subtitleText)}
      </Text>

      {readNotice}

      {entries !== null ? (
        <>
          <PixelSurface variant="inset" contentStyle={styles.summaryGrid}>
            {counts.map((item) => (
              <View key={item.key} style={styles.summaryCell}>
                <Text style={[styles.summaryNum, { color: item.color }]}>{item.count}</Text>
                <Text style={styles.summaryLabel}>{item.label}</Text>
              </View>
            ))}
          </PixelSurface>

          <View style={styles.filterRow}>
            {FILTERS.map((item) => {
              const selected = filter === item;
              return (
                <PixelPressable
                  key={item}
                  variant={selected ? "inset" : "frame"}
                  background={selected ? m3.color.primaryContainer : m3.color.surfaceContainer}
                  accessibilityLabel={filterLabel[item]}
                  accessibilityState={{ selected: selected }}
                  rootStyle={styles.filterButton}
                  contentStyle={styles.filterContent}
                  onPress={() => setFilter(item)}
                >
                  {selected ? (
                    <PixelGlyph name="check" color={m3.color.onPrimaryContainer} size={14} />
                  ) : null}
                  <Text style={selected ? styles.filterTextSelected : styles.filterText}>
                    {filterLabel[item]}
                  </Text>
                </PixelPressable>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );

  const empty =
    status === "ready" && ratificationEmptyState(all.length, visible.length) === "none" ? (
      <PixelSurface variant="frame" style={styles.emptyCard} contentStyle={styles.emptyContent}>
        <Text style={styles.emptyText}>{t("emptyAll")}</Text>
        <PixelPressable
          fullWidth
          variant="bevel"
          accessibilityLabel={t("goPolaris")}
          onPress={() => router.replace("/core-brain")}
          contentStyle={styles.actionContent}
        >
          <PixelGlyph name="star" color={m3.color.onPrimaryContainer} size={18} />
          <Text style={styles.actionText}>{t("goPolaris")}</Text>
        </PixelPressable>
      </PixelSurface>
    ) : all.length > 0 && ratificationEmptyState(all.length, visible.length) === "filtered" ? (
      <PixelSurface variant="frame" style={styles.emptyCard} contentStyle={styles.emptyContent}>
        <Text style={styles.emptyText}>{t("emptyFilter")}</Text>
      </PixelSurface>
    ) : null;

  const footer =
    unchangedCount > 0 ? (
      <PixelPressable
        fullWidth
        variant="frame"
        accessibilityLabel={
          showUnchanged ? t("hideUnchanged") : t("showUnchanged", { n: unchangedCount })
        }
        accessibilityState={{ expanded: showUnchanged }}
        onPress={() => setShowUnchanged((value) => !value)}
        contentStyle={styles.actionContent}
      >
        <PixelGlyph name="refresh" color={m3.color.primary} size={18} />
        <Text style={styles.toggleText}>
          {showUnchanged ? t("hideUnchanged") : t("showUnchanged", { n: unchangedCount })}
        </Text>
      </PixelPressable>
    ) : null;

  return (
    <DeepSpaceScreen
      active="lens"
      header="none"
      variant="windowed"
      title={t("barTitle")}
      onBack={() => router.back()}
    >
      <FlatList
        data={visible}
        keyExtractor={(_entry, index) => `entry-${index}`}
        renderItem={({ item }) => (
          <RatificationEntryCard entry={item} locale={i18n.language} t={t as Tx} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        windowSize={7}
      />
    </DeepSpaceScreen>
  );
}

export default function RatificationLogScreen() {
  const { t } = useTranslation("ratifications");
  const { userId, hasProfile, profileProbeFailed, loading, refresh } = useAuth();
  const gate = ratificationAuthGate({ userId, hasProfile, profileProbeFailed, loading });
  const title = t("barTitle");

  if (gate === "auth-loading" || gate === "profile-loading") {
    return <GateFrame title={title} message={t("loading")} status="loading" />;
  }
  if (gate === "signed-out") return <Redirect href="/sign-in" />;
  if (gate === "profile-incomplete") return <Redirect href="/complete-profile" />;
  if (gate === "profile-error") {
    return (
      <GateFrame
        title={title}
        message={t("common:errors.network")}
        status="error"
        retryLabel={t("common:actions.retry")}
        onRetry={() => void refresh()}
      />
    );
  }

  return <RatificationsReady key={userId!} ownerId={userId!} />;
}

const styles = StyleSheet.create({
  gateCenter: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: m3.spacing.s4,
  },
  listContent: {
    padding: m3.spacing.s4,
    paddingBottom: m3.spacing.s8,
  },
  header: {
    gap: m3.spacing.s3,
    paddingBottom: m3.spacing.s3,
  },
  headline: {
    marginTop: m3.spacing.s2,
    color: m3.color.onSurface,
    fontSize: m3.type.headlineSmall.size,
    lineHeight: m3.type.headlineSmall.line,
    fontWeight: "500",
  },
  subtitle: {
    color: m3.color.onSurfaceVariant,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
    paddingBottom: m3.spacing.s1,
  },
  statusSurface: {
    alignSelf: "stretch",
  },
  statusContent: {
    gap: m3.spacing.s3,
  },
  statusLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s3,
    minHeight: m3.minTouch,
  },
  statusText: {
    flex: 1,
    color: m3.color.onSurfaceVariant,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
    paddingBottom: m3.spacing.s1,
  },
  actionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s2,
  },
  actionText: {
    color: m3.color.onPrimaryContainer,
    fontSize: m3.type.labelLarge.size,
    lineHeight: m3.type.labelLarge.line,
    fontWeight: "700",
    paddingBottom: m3.spacing.s1,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: m3.spacing.s1,
    padding: m3.spacing.s3,
  },
  summaryCell: {
    flexBasis: "45%",
    flexGrow: 1,
    minWidth: 120,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: m3.color.surfaceContainerHigh,
    paddingVertical: m3.spacing.s2,
  },
  summaryNum: {
    fontFamily: m3.font.mono,
    fontSize: m3.type.headlineSmall.size,
    lineHeight: m3.type.headlineSmall.line,
    fontWeight: "700",
  },
  summaryLabel: {
    marginTop: m3.spacing.s1,
    color: m3.color.onSurfaceVariant,
    fontSize: m3.type.labelMedium.size,
    lineHeight: m3.type.labelMedium.line,
    paddingBottom: m3.spacing.s1,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: m3.spacing.s2,
  },
  filterButton: {
    flexGrow: 1,
    minWidth: 72,
  },
  filterContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s1,
    paddingHorizontal: m3.spacing.s2,
  },
  filterText: {
    color: m3.color.onSurfaceVariant,
    fontSize: m3.type.labelMedium.size,
    lineHeight: m3.type.labelMedium.line,
    paddingBottom: m3.spacing.s1,
  },
  filterTextSelected: {
    color: m3.color.onPrimaryContainer,
    fontSize: m3.type.labelMedium.size,
    lineHeight: m3.type.labelMedium.line,
    fontWeight: "700",
    paddingBottom: m3.spacing.s1,
  },
  entry: {
    marginBottom: m3.spacing.s2,
  },
  entryContent: {
    gap: m3.spacing.s2,
    padding: m3.spacing.s3,
  },
  entryHead: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: m3.spacing.s2,
  },
  iconBox: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: m3.color.surfaceContainerHighest,
  },
  source: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "48%",
    color: m3.color.onSurfaceVariant,
    fontSize: m3.type.labelMedium.size,
    lineHeight: m3.type.labelMedium.line,
    paddingBottom: m3.spacing.s1,
  },
  decisionBox: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s1,
    borderWidth: 1,
    borderColor: m3.color.primary,
    backgroundColor: m3.color.primaryContainer,
    paddingHorizontal: m3.spacing.s2,
    paddingVertical: m3.spacing.s1,
  },
  decisionText: {
    color: m3.color.onPrimaryContainer,
    fontSize: m3.type.labelMedium.size,
    lineHeight: m3.type.labelMedium.line,
    fontWeight: "700",
    paddingBottom: m3.spacing.s1,
  },
  entryMeta: {
    alignItems: "flex-start",
    gap: m3.spacing.s2,
  },
  target: {
    color: m3.color.onSurface,
    fontSize: m3.type.titleSmall.size,
    lineHeight: m3.type.titleSmall.line,
    fontWeight: "500",
    paddingBottom: m3.spacing.s1,
  },
  delta: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: m3.spacing.s2,
  },
  deltaText: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.mono,
    fontSize: m3.type.labelLarge.size,
    lineHeight: m3.type.labelLarge.line,
    paddingBottom: m3.spacing.s1,
  },
  deltaTo: {
    color: m3.color.primary,
  },
  entryFoot: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: m3.spacing.s2,
    borderTopWidth: 1,
    borderTopColor: m3.color.outlineVariant,
    paddingTop: m3.spacing.s2,
  },
  when: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.mono,
    fontSize: m3.type.labelSmall.size,
    lineHeight: m3.type.labelSmall.line,
    paddingBottom: m3.spacing.s1,
  },
  note: {
    color: m3.color.onSurfaceVariant,
    fontSize: m3.type.bodySmall.size,
    lineHeight: m3.type.bodySmall.line,
    paddingBottom: m3.spacing.s1,
  },
  emptyCard: {
    marginTop: m3.spacing.s2,
  },
  emptyContent: {
    gap: m3.spacing.s3,
    padding: m3.spacing.s3,
  },
  emptyText: {
    color: m3.color.onSurfaceVariant,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
    paddingBottom: m3.spacing.s1,
  },
  toggleText: {
    color: m3.color.primary,
    fontSize: m3.type.labelLarge.size,
    lineHeight: m3.type.labelLarge.line,
    fontWeight: "700",
    paddingBottom: m3.spacing.s1,
  },
});
