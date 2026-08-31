import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  countPendingProposals,
  countRespondedPeerInvites,
  inboxAuthGate,
  InboxSignalSession,
  openInboxRoute,
  summarizeInboxSignals,
  syncInboxSessionWithAuth,
  type InboxReadState,
  type InboxRoute,
  type InboxSignalSnapshot,
  type InboxSourceKey,
} from "@/lib/inbox/signals";
import { listPeerInvites, type PeerInvitation } from "@/lib/peer/invite";
import { m3 } from "@/lib/theme/m3";
import {
  listInferredLinkDetails,
  type InferredLinkDetail,
} from "@/lib/wiki/queries";
import { m3TextStyle } from "@/components/m3";

const READERS = {
  proposals: {
    read: (ownerId: string) => listInferredLinkDetails(ownerId),
    count: countPendingProposals,
  },
  peers: {
    read: (ownerId: string) => listPeerInvites(ownerId),
    count: countRespondedPeerInvites,
  },
};

const INITIAL_SNAPSHOT: InboxSignalSnapshot = {
  proposals: { status: "loading" },
  peers: { status: "loading" },
};

function Frame({ children, title }: { children: ReactNode; title: string }) {
  return (
    <DeepSpaceScreen
      active="lens"
      header="none"
      variant="windowed"
      title={title}
      onBack={() => router.back()}
    >
      {children}
    </DeepSpaceScreen>
  );
}

function LoadingSurface({ label }: { label: string }) {
  return (
    <View accessible accessibilityLabel={label} accessibilityState={{ busy: true }}>
      <PixelSurface variant="inset" contentStyle={styles.stateContent}>
        <PixelGlyph name="schedule" color={m3.color.onSurfaceVariant} size={24} />
        <RNText style={[m3TextStyle("bodyMedium"), styles.stateText]}>{label}</RNText>
      </PixelSurface>
    </View>
  );
}

function ErrorSurface({
  state,
  sourceLabel,
  message,
  retryLabel,
  onRetry,
}: {
  state: Extract<InboxReadState, { status: "error" | "timeout" }>;
  sourceLabel: string;
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  const accessibilityLabel = `${sourceLabel}. ${message}`;
  return (
    <View accessibilityRole="alert" accessibilityLabel={accessibilityLabel}>
      <PixelSurface variant="inset" contentStyle={styles.errorContent}>
        <View style={styles.errorLead}>
          <PixelGlyph
            name={state.status === "timeout" ? "schedule" : "warning"}
            color={m3.color.error}
            size={24}
          />
          <View style={styles.flex1}>
            <RNText style={[m3TextStyle("titleSmall"), styles.cardTitle]}>{sourceLabel}</RNText>
            <RNText style={[m3TextStyle("bodySmall"), styles.stateText]}>{message}</RNText>
          </View>
        </View>
        <PixelPressable
          onPress={onRetry}
          variant="bevel"
          accessibilityLabel={`${sourceLabel}. ${retryLabel}`}
          contentStyle={styles.retryContent}
        >
          <View style={styles.actionRow}>
            <PixelGlyph name="refresh" color={m3.color.primary} size={24} />
            <RNText style={[m3TextStyle("labelLarge"), styles.actionText]}>{retryLabel}</RNText>
          </View>
        </PixelPressable>
      </PixelSurface>
    </View>
  );
}

function SignalCard({
  icon,
  title,
  body,
  cta,
  route,
  onOpen,
}: {
  icon: "link" | "forum";
  title: string;
  body: string;
  cta: string;
  route: InboxRoute;
  onOpen: (route: InboxRoute) => void;
}) {
  return (
    <PixelPressable
      onPress={() => onOpen(route)}
      fullWidth
      variant="bevel"
      accessibilityRole="link"
      accessibilityLabel={`${title}. ${body}. ${cta}`}
      contentStyle={styles.cardContent}
    >
      <View style={styles.cardRow}>
        <PixelSurface variant="inset" style={styles.iconSurface} contentStyle={styles.iconContent}>
          <PixelGlyph
            name={icon}
            color={icon === "link" ? m3.color.primary : m3.color.tertiary}
            size={24}
          />
        </PixelSurface>
        <View style={styles.flex1}>
          <RNText style={[m3TextStyle("titleSmall"), styles.cardTitle]}>{title}</RNText>
          <RNText style={[m3TextStyle("bodySmall"), styles.cardBody]}>{body}</RNText>
          <View style={styles.routeHint}>
            <RNText style={[m3TextStyle("labelLarge"), styles.actionText]}>{cta}</RNText>
            <PixelGlyph name="arrow_forward" color={m3.color.primary} size={24} />
          </View>
        </View>
      </View>
    </PixelPressable>
  );
}

function InboxReady({ userId }: { userId: string }) {
  const { t } = useTranslation("deepspace");
  const [snapshot, setSnapshot] = useState<InboxSignalSnapshot>(INITIAL_SNAPSHOT);
  const sessionRef = useRef<InboxSignalSession<InferredLinkDetail, PeerInvitation> | null>(null);
  if (sessionRef.current === null) {
    sessionRef.current = new InboxSignalSession(READERS, setSnapshot);
  }
  const session = sessionRef.current;

  useEffect(() => {
    syncInboxSessionWithAuth(session, {
      userId,
      loading: false,
      hasProfile: true,
      profileProbeFailed: false,
    });
    return () => session.deactivate();
  }, [session, userId]);

  const retry = useCallback((source: InboxSourceKey) => {
    session.retry(source);
  }, [session]);

  const open = useCallback((route: InboxRoute) => {
    openInboxRoute(route, (target) => router.push(target));
  }, []);

  const summary = summarizeInboxSignals(snapshot);
  const sourceLabel = {
    proposals: t("ds.inbox.proposalsTitle"),
    peers: t("ds.inbox.peerTitle"),
  };

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <RNText style={[m3TextStyle("headlineSmall"), styles.pageTitle]}>{t("ds.inbox.title")}</RNText>
      <View style={styles.stack}>
        {snapshot.proposals.status === "ready" ? (
          <SignalCard
            icon="link"
            title={sourceLabel.proposals}
            body={t("ds.inbox.proposalsBody", { n: summary.proposalCount })}
            cta={t("ds.inbox.proposalsCta")}
            route="/digest"
            onOpen={open}
          />
        ) : null}
        {snapshot.peers.status === "ready" ? (
          <SignalCard
            icon="forum"
            title={sourceLabel.peers}
            body={t("ds.inbox.peerBody", { n: summary.peerCount })}
            cta={t("ds.inbox.peerCta")}
            route="/peer-invites"
            onOpen={open}
          />
        ) : null}

        {snapshot.proposals.status === "loading" ? (
          <LoadingSurface label={`${sourceLabel.proposals}. ${t("star.loading")}`} />
        ) : snapshot.proposals.status === "error" || snapshot.proposals.status === "timeout" ? (
          <ErrorSurface
            state={snapshot.proposals}
            sourceLabel={sourceLabel.proposals}
            message={t("star.loadError")}
            retryLabel={t("star.retry")}
            onRetry={() => retry("proposals")}
          />
        ) : null}

        {snapshot.peers.status === "loading" ? (
          <LoadingSurface label={`${sourceLabel.peers}. ${t("star.loading")}`} />
        ) : snapshot.peers.status === "error" || snapshot.peers.status === "timeout" ? (
          <ErrorSurface
            state={snapshot.peers}
            sourceLabel={sourceLabel.peers}
            message={t("star.loadError")}
            retryLabel={t("star.retry")}
            onRetry={() => retry("peers")}
          />
        ) : null}

        {summary.genuineEmpty ? (
          <PixelSurface variant="inset" contentStyle={styles.emptyContent}>
            <PixelGlyph name="inbox" color={m3.color.onSurfaceVariant} size={24} />
            <RNText style={[m3TextStyle("bodyMedium"), styles.emptyText]}>{t("ds.inbox.empty")}</RNText>
          </PixelSurface>
        ) : null}
      </View>
    </ScrollView>
  );
}

export function DeepSpaceInboxScreen() {
  const { t } = useTranslation("deepspace");
  const auth = useAuth();
  const [profileRetrying, setProfileRetrying] = useState(false);
  const title = t("ds.inbox.title");
  const gate = inboxAuthGate(auth);

  const retryProfile = useCallback(async () => {
    if (profileRetrying) return;
    setProfileRetrying(true);
    try {
      await auth.refresh();
    } finally {
      setProfileRetrying(false);
    }
  }, [auth, profileRetrying]);

  if (gate === "signed-out") return <Redirect href="/sign-in" />;
  if (gate === "incomplete") return <Redirect href="/complete-profile" />;
  if (gate === "loading" || !auth.userId) {
    return (
      <Frame title={title}>
        <View style={styles.gateBody}>
          <LoadingSurface label={t("star.loading")} />
        </View>
      </Frame>
    );
  }
  if (gate === "profile-error") {
    return (
      <Frame title={title}>
        <View style={styles.gateBody}>
          {profileRetrying ? (
            <LoadingSurface label={t("star.loading")} />
          ) : (
            <ErrorSurface
              state={{ status: "error" }}
              sourceLabel={title}
              message={t("star.loadError")}
              retryLabel={t("star.retry")}
              onRetry={() => void retryProfile()}
            />
          )}
        </View>
      </Frame>
    );
  }

  return (
    <Frame title={title}>
      {/* Auth can publish owner B one render before the child effect invalidates
          A's session. The owner key makes that first B paint start loading. */}
      <InboxReady key={auth.userId} userId={auth.userId} />
    </Frame>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: m3.spacing.s8,
    paddingTop: m3.spacing.s4,
    paddingBottom: m3.spacing.s8 * 4,
  },
  gateBody: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: m3.spacing.s8,
  },
  pageTitle: {
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    marginTop: m3.spacing.s4,
    marginBottom: m3.spacing.s6,
    paddingBottom: m3.spacing.s1,
  },
  stack: { gap: m3.spacing.s6 },
  flex1: { flex: 1, minWidth: 0 },
  cardContent: { paddingVertical: m3.spacing.s6, paddingHorizontal: m3.spacing.s6 },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: m3.spacing.s6 },
  iconSurface: { width: 48, height: 48 },
  iconContent: { flex: 1, alignItems: "center", justifyContent: "center", padding: 0 },
  cardTitle: {
    color: m3.color.onSurface,
    fontFamily: m3.font.brand,
    paddingBottom: m3.spacing.s1,
  },
  cardBody: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    lineHeight: 20,
    paddingBottom: m3.spacing.s2,
  },
  routeHint: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: m3.spacing.s2,
  },
  actionRow: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s2,
  },
  actionText: { color: m3.color.primary, fontFamily: m3.font.brand },
  stateContent: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s4,
  },
  stateText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, lineHeight: 20 },
  errorContent: { gap: m3.spacing.s4, paddingVertical: m3.spacing.s6 },
  errorLead: { flexDirection: "row", alignItems: "flex-start", gap: m3.spacing.s4 },
  retryContent: { paddingHorizontal: m3.spacing.s4 },
  emptyContent: {
    minHeight: 112,
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s4,
  },
  emptyText: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    textAlign: "center",
    lineHeight: 20,
    paddingBottom: m3.spacing.s1,
  },
});
