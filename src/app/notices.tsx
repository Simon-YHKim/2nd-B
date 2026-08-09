import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";
import { SvgXml } from "react-native-svg";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { keepAllKo } from "@/lib/i18n/keep-all";
import { composeNoticeCenter } from "@/lib/notices/center";
import { renderableBlocks } from "@/lib/notices/markdown";
import {
  addReadId,
  getReadIds,
  getRevision,
  loadPersistedReadIds,
  mergeReadIds,
  subscribe,
} from "@/lib/notices/read-store";
import { fetchNotices, fetchReadNoticeIds, markNoticeRead } from "@/lib/notices/remote";
import type { LocalizedNoticeText, NoticeKind, ProductNotice, RemoteNotice } from "@/lib/notices/types";
import { getAppVersion } from "@/lib/notices/version";
import { m3 } from "@/lib/theme/m3";
import { withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

// The shapes moved to src/lib/notices/types.ts so the pure notice logic is
// importable without pulling a screen (and its RN imports) into the node test
// environment. Re-exported here because this module is the historical home of
// the notice API and both consumers import from it.
export type { LocalizedNoticeText, NoticeKind, ProductNotice };

/** Release notes baked into the binary. They describe THIS build, so they are
 *  authored here rather than published to the notices table; anything an
 *  operator needs to say after a release goes in the table instead
 *  (db/migrations/0113_notices.sql, docs/OPERATIONS-NOTICES.md). */
export const PRODUCT_NOTICES: readonly ProductNotice[] = [
  {
    id: "patch-1.4.0",
    sortAt: "2026-07-17T00:00:00+09:00",
    kind: "patch",
    eyebrow: { ko: "NEW", en: "NEW" },
    version: "v1.4.0",
    when: { ko: "2026.07.17 · 패치노트", en: "2026.07.17 · Patch notes" },
    listMeta: { ko: "패치 v1.4.0 · 오늘", en: "Patch v1.4.0 · Today" },
    title: { ko: "리즈닝 실행 방식이 새로워졌어요", en: "Reasoning has a new workflow" },
    body: [
      {
        kind: "bullet",
        text: {
          ko: "자동 리즈닝 토글이 생겼어요. 담은 자료의 연결을 제안해요.",
          en: "Automatic reasoning is now available. It proposes connections for captured items.",
        },
      },
      {
        kind: "bullet",
        text: {
          ko: "실행 전에 자료를 직접 고를 수 있어요.",
          en: "You can choose the items before each manual run.",
        },
      },
      {
        kind: "bullet",
        text: {
          ko: "위키 그래프가 더 부드럽게 움직여요.",
          en: "The Wiki graph now moves more smoothly.",
        },
      },
    ],
  },
  {
    id: "developer-letter-2026-07",
    sortAt: "2026-07-14T00:00:00+09:00",
    kind: "developer",
    eyebrow: { ko: "개발자 공지", en: "DEVELOPER NOTE" },
    when: { ko: "2026.07.14 · 세컨비 팀", en: "2026.07.14 · SecondB team" },
    listMeta: { ko: "공지 · 3일 전", en: "Note · 3 days ago" },
    title: {
      ko: "세컨비의 편지: 우리가 별을 그리는 이유",
      en: "A letter from SecondB: Why we draw stars",
    },
    body: [
      {
        kind: "paragraph",
        text: {
          ko: "안녕하세요, 세컨비를 만드는 팀이에요.",
          en: "Hello, we're the team building SecondB.",
        },
      },
      {
        kind: "paragraph",
        text: {
          ko: "여러분이 담아준 별가루가 이번 달에만 12만 개를 넘었어요. 하나하나가 누군가의 하루라 생각하면 조심스럽고 고맙습니다.",
          en: "You captured more than 120,000 pieces this month. Each one holds part of someone's day, and we handle that trust with care.",
        },
      },
      {
        kind: "paragraph",
        text: {
          ko: "다음 업데이트에선 '북극성'을 더 또렷하게 다듬고 있어요. 조금만 기다려 주세요.",
          en: "We're refining Polaris for the next update. Thank you for waiting with us.",
        },
      },
    ],
  },
  {
    id: "maintenance-2026-07-20",
    sortAt: "2026-07-20T00:00:00+09:00",
    kind: "maintenance",
    eyebrow: { ko: "점검 안내", en: "MAINTENANCE" },
    when: { ko: "2026.07.20 · 03:00–05:00", en: "2026.07.20 · 03:00–05:00 KST" },
    listMeta: { ko: "점검 · 1주 전", en: "Maintenance · 1 week ago" },
    title: { ko: "정기 서버 점검 안내", en: "Scheduled server maintenance" },
    body: [
      {
        kind: "paragraph",
        text: {
          ko: "일요일 새벽 서버 점검이 있어요. 이 시간엔 담기·리즈닝이 잠시 멈춰요. 담아둔 자료는 안전하게 보관되고 연결되면 자동 동기화돼요.",
          en: "Server maintenance is scheduled for early Sunday. Capture and reasoning will pause briefly. Saved items remain stored and sync automatically after service returns.",
        },
      },
    ],
  },
  {
    id: "patch-1.3.0",
    sortAt: "2026-06-26T00:00:00+09:00",
    kind: "patch",
    eyebrow: { ko: "패치노트", en: "PATCH NOTES" },
    version: "v1.3.0",
    when: { ko: "2026.06.26 · 패치노트", en: "2026.06.26 · Patch notes" },
    listMeta: { ko: "패치 v1.3.0 · 3주 전", en: "Patch v1.3.0 · 3 weeks ago" },
    title: { ko: "v1.3.0: AI 뮤지엄이 열렸어요", en: "v1.3.0: AI Museum is open" },
    body: [
      {
        kind: "paragraph",
        text: {
          ko: "AI 뮤지엄에서 지금까지 담은 자료와 새로 발견한 연결을 시간의 흐름으로 둘러볼 수 있어요.",
          en: "Explore captured items and newly found connections over time in AI Museum.",
        },
      },
    ],
  },
  {
    id: "beta-thanks-2026-06",
    sortAt: "2026-06-05T00:00:00+09:00",
    kind: "developer",
    eyebrow: { ko: "공지", en: "NOTE" },
    when: { ko: "2026.06.05 · 세컨비 팀", en: "2026.06.05 · SecondB team" },
    listMeta: { ko: "공지 · 6주 전", en: "Note · 6 weeks ago" },
    title: { ko: "베타에 함께해줘서 고마워요", en: "Thank you for joining the beta" },
    body: [
      {
        kind: "paragraph",
        text: {
          ko: "여러분이 남겨준 기록과 의견 덕분에 별자리가 조금씩 또렷해지고 있어요. 함께 만들어줘서 고마워요.",
          en: "Your records and feedback are helping the constellation take shape. Thank you for building it with us.",
        },
      },
    ],
  },
] as const;

export const LATEST_NOTICE = PRODUCT_NOTICES[0];

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const memorySeen = new Map<string, string>();

function noticeSeenKey(userId: string): string {
  return `notices.lastSeen.v1.${userId}`;
}

function webStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function nativeStorage(): AsyncStorageLike | null {
  const nav = globalThis.navigator as { product?: string } | undefined;
  if (nav?.product !== "ReactNative") return null;
  try {
    return require("@react-native-async-storage/async-storage").default as AsyncStorageLike;
  } catch {
    return null;
  }
}

async function readSeenId(userId: string): Promise<string | null> {
  const key = noticeSeenKey(userId);
  const web = webStorage();
  if (web) return web.getItem(key);
  const native = nativeStorage();
  if (native) return native.getItem(key);
  return memorySeen.get(key) ?? null;
}

async function writeSeenId(userId: string, noticeId: string): Promise<void> {
  const key = noticeSeenKey(userId);
  memorySeen.set(key, noticeId);
  const web = webStorage();
  if (web) {
    web.setItem(key, noticeId);
    return;
  }
  await nativeStorage()?.setItem(key, noticeId);
}

/**
 * The notice centre: bundled release notes plus operator-published rows from
 * the `notices` table, merged into one list, one unread count and one popup.
 *
 * Everything about WHICH notice wins lives in composeNoticeCenter()
 * (src/lib/notices/center.ts) so it can be unit-tested; this hook is just the
 * data plumbing around it.
 */
export function useNoticeCenter(userId: string | null) {
  // undefined = hydration in progress, for each source independently. It
  // prevents an already-read notice from flashing for one frame during an
  // Android cold start, and it keeps the popup shut until BOTH the local cursor
  // and the server read-state are known.
  const [seenId, setSeenId] = useState<string | null | undefined>(undefined);
  const [remote, setRemote] = useState<readonly RemoteNotice[] | undefined>(undefined);
  const [readsHydrated, setReadsHydrated] = useState(false);
  // Read ids live in a module-level store, not in this hook: home, /settings
  // and /notices all mount useNoticeCenter at once, and /notices is pushed OVER
  // a still-mounted home, so a private copy left the home badge lit after the
  // inbox cleared it. See src/lib/notices/read-store.ts.
  const [readRevision, setReadRevision] = useState(() => getRevision());
  useEffect(() => subscribe(() => setReadRevision(getRevision())), []);
  const readIds = useMemo(
    // readRevision is the dependency that matters; the store mutates in place.
    () => new Set(getReadIds(userId)),
    [userId, readRevision],
  );

  useEffect(() => {
    if (!userId) {
      setSeenId(null);
      // Signed out: no rows are readable (the RLS policies are TO authenticated
      // and anon holds no grant), so do not spend a request to find that out.
      setRemote([]);
      setReadsHydrated(true);
      return;
    }
    let cancelled = false;
    setSeenId(undefined);
    setRemote(undefined);
    setReadsHydrated(false);

    void readSeenId(userId)
      .then((value) => {
        if (!cancelled) setSeenId(value);
      })
      .catch(() => {
        if (!cancelled) setSeenId(null);
      });

    // Both fetches already fail soft and resolve to an empty result, so a
    // network outage hydrates to "no remote notices" rather than hanging the
    // popup gate forever.
    void fetchNotices().then((rows) => {
      if (!cancelled) setRemote(rows);
    });
    // Local mirror first so a read recorded while offline survives the restart,
    // then the server set. Both MERGE rather than replace, so neither can undo
    // an optimistic markSeen that landed while they were in flight.
    void Promise.all([loadPersistedReadIds(userId), fetchReadNoticeIds(userId)])
      .then(([local, server]) => {
        if (cancelled) return;
        mergeReadIds(userId, local);
        mergeReadIds(userId, server);
      })
      .finally(() => {
        if (!cancelled) setReadsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const hydrated = seenId !== undefined && remote !== undefined && readsHydrated;

  const state = useMemo(
    () =>
      composeNoticeCenter({
        remote: remote ?? [],
        remoteReadIds: readIds ?? new Set<string>(),
        bundled: PRODUCT_NOTICES,
        bundledSeenId: seenId ?? null,
        appVersion: getAppVersion(),
      }),
    [remote, readIds, seenId],
  );

  const markSeen = useCallback(
    async (noticeId: string) => {
      if (!userId) return;
      if (state.remoteIds.has(noticeId)) {
        // Optimistic AND locally persisted. The write is idempotent (23505 is
        // swallowed), and the local mirror is what makes a failed request cost
        // only the cross-device sync of this one read: without it an offline
        // 확인 was forgotten at the next cold start and the same major notice
        // interrupted again, forever.
        addReadId(userId, noticeId);
        await markNoticeRead(userId, noticeId).catch((error: unknown) => {
          // The two read paths in remote.ts warn on failure; this one used to
          // swallow silently, which made the replay above undiagnosable.
          console.warn("[notices] failed to record read", error);
        });
        return;
      }
      // Bundled notices share a single "last seen id" cursor, so only the newest
      // one moves it. Reading an older history item must not accidentally clear
      // a newer announcement.
      if (noticeId !== LATEST_NOTICE.id) return;
      setSeenId(noticeId);
      await writeSeenId(userId, noticeId).catch(() => undefined);
    },
    [userId, state.remoteIds],
  );

  return {
    hydrated,
    notices: state.notices,
    unreadCount: hydrated ? state.unreadCount : 0,
    popupNotice: hydrated ? state.popupNotice : null,
    isUnread: (noticeId: string) => hydrated && state.unreadIds.has(noticeId),
    markSeen,
  };
}

const ICON_PATH: Record<NoticeKind, string> = {
  patch:
    '<path d="M4 6.5h3l8-3v17l-8-3H4z"/><path d="M7 17.5 8.5 21h3L10 18"/><path d="M18 8v8"/>',
  developer:
    '<path d="M4 19.5h5L19.5 9 15 4.5 4.5 15z"/><path d="m13.5 6 4.5 4.5M4 19.5l4.5-1-3.5-3.5z"/>',
  maintenance:
    '<path d="M14.7 6.3a4.2 4.2 0 0 0-5.5 5.5L3.5 17.5l3 3 5.7-5.7a4.2 4.2 0 0 0 5.5-5.5l-2.4 2.4-3-3z"/>',
  // Operator-published kinds. major = the megaphone that is allowed to
  // interrupt; minor = a quiet info mark that only ever sits in the list.
  major:
    '<path d="M4 6.5h3l8-3v17l-8-3H4z"/><path d="M7 17.5 8.5 21h3L10 18"/><path d="M18 8v8"/>',
  minor: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.4"/>',
};

function kindColor(kind: NoticeKind): string {
  if (kind === "developer") return m3.color.tertiary;
  if (kind === "maintenance") return m3.color.error;
  // A minor notice recedes: neutral tone, no accent colour competing with the
  // rest of the surface. Same tier principle the constellation uses, and it
  // keeps the screen inside its colour budget instead of adding a fourth hue.
  if (kind === "minor") return m3.color.onSurfaceVariant;
  return m3.color.primary;
}

function noticeText(text: LocalizedNoticeText, ko: boolean): string {
  return ko ? text.ko : text.en;
}

function NoticeGlyph({ kind, size = 22 }: { kind: NoticeKind; size?: number }) {
  const color = kindColor(kind);
  const xml =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
    `${ICON_PATH[kind]}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} color={color} />;
}

export function NoticeDialog({
  visible,
  notice,
  index,
  onClose,
  onConfirm,
  onList,
  onPrevious,
  onNext,
  showPager = true,
  total,
}: {
  visible: boolean;
  notice: ProductNotice;
  index: number;
  onClose: () => void;
  onConfirm: () => void;
  onList: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  showPager?: boolean;
  /** Pager denominator. The list is no longer a fixed array once remote notices
   *  are merged in, so the count comes from the caller. */
  total?: number;
}) {
  const { i18n } = useTranslation();
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? true;
  const title = noticeText(notice.title, ko);
  const shortTitle =
    notice.id === "developer-letter-2026-07"
      ? ko
        ? "세컨비의 편지"
        : "A letter from SecondB"
      : title;
  const tone = kindColor(notice.kind);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.scrim} accessibilityViewIsModal>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={ko ? "공지 닫기" : "Close notice"}
        />
        <View style={[styles.dialog, notice.kind === "maintenance" && styles.dialogMaintenance]}>
          <View style={styles.dialogHeader}>
            <View
              style={[
                styles.dialogIcon,
                { backgroundColor: withAlpha(tone, 0.13), borderColor: withAlpha(tone, 0.32) },
              ]}
            >
              <NoticeGlyph kind={notice.kind} size={22} />
            </View>
            <View style={styles.headerCopy}>
              <View style={styles.tags}>
                <View style={[styles.tag, { borderColor: withAlpha(tone, 0.52) }]}>
                  <RNText style={[styles.tagText, { color: tone }]}>
                    {noticeText(notice.eyebrow, ko)}
                  </RNText>
                </View>
                {notice.version ? (
                  <View style={styles.versionTag}>
                    <RNText style={styles.versionText}>{notice.version}</RNText>
                  </View>
                ) : null}
              </View>
              <RNText style={styles.when}>{noticeText(notice.when, ko)}</RNText>
            </View>
          </View>

          <RNText style={styles.dialogTitle} accessibilityLabel={shortTitle}>
            {ko ? keepAllKo(shortTitle) : shortTitle}
          </RNText>

          <ScrollView style={styles.dialogBodyScroll} contentContainerStyle={styles.dialogBody}>
            {/* renderableBlocks drops blocks with no text in THIS language:
                the ko/en bodies are paired by index and padded, so an unequal
                bullet count would otherwise show a bare "✦" with nothing after
                it. See src/lib/notices/markdown.ts. */}
            {renderableBlocks(notice.body, ko)
              .map((block, blockIndex) =>
              block.kind === "bullet" ? (
                <View key={`${notice.id}-${blockIndex}`} style={styles.bulletRow}>
                  <RNText style={[styles.bulletMark, { color: tone }]}>{"✦"}</RNText>
                  <RNText
                    style={styles.bodyText}
                    accessibilityLabel={noticeText(block.text, ko)}
                  >
                    {ko
                      ? keepAllKo(noticeText(block.text, ko))
                      : noticeText(block.text, ko)}
                  </RNText>
                </View>
              ) : (
                <RNText
                  key={`${notice.id}-${blockIndex}`}
                  style={styles.bodyText}
                  accessibilityLabel={noticeText(block.text, ko)}
                >
                  {ko
                    ? keepAllKo(noticeText(block.text, ko))
                    : noticeText(block.text, ko)}
                </RNText>
              ),
              )}
          </ScrollView>

          <View style={styles.dialogActions}>
            {showPager ? <View style={styles.pager}>
              <Pressable
                onPress={onPrevious}
                disabled={!onPrevious}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={ko ? "이전 공지" : "Previous notice"}
                accessibilityState={{ disabled: !onPrevious }}
              >
                <RNText style={[styles.pagerArrow, !onPrevious && styles.pagerDisabled]}>{"‹"}</RNText>
              </Pressable>
              <RNText style={styles.pagerText}>
                {`${index + 1} / ${total ?? PRODUCT_NOTICES.length}`}
              </RNText>
              <Pressable
                onPress={onNext}
                disabled={!onNext}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={ko ? "다음 공지" : "Next notice"}
                accessibilityState={{ disabled: !onNext }}
              >
                <RNText style={[styles.pagerArrow, !onNext && styles.pagerDisabled]}>{"›"}</RNText>
              </Pressable>
            </View> : null}
            <MdButton
              label={ko ? "리스트" : "List"}
              variant="text"
              onPress={onList}
              style={styles.dialogButton}
            />
            <MdButton
              label={ko ? "확인" : "Done"}
              variant={notice.kind === "maintenance" ? "tonal" : "filled"}
              onPress={onConfirm}
              style={styles.dialogButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function NoticesScreen() {
  const { userId, loading } = useAuth();
  const { i18n } = useTranslation();
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? true;
  const noticeCenter = useNoticeCenter(userId);
  // Keyed by ID, not by index. `data` is bundled-only until fetchNotices()
  // resolves and then gains the remote rows AT THE FRONT, so an index captured
  // on tap pointed at a different notice a round trip later: the open dialog
  // swapped its own content, and 확인 wrote a read row for a notice the user
  // had never opened - permanently suppressing its popup, since reads are
  // append-only with no client DELETE.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Newest first: remote rows and bundled release notes interleaved by date.
  // Composed in src/lib/notices/center.ts.
  const data = noticeCenter.notices;
  const selectedIndex = selectedId == null ? -1 : data.findIndex((item) => item.id === selectedId);
  const selected = selectedIndex < 0 ? null : data[selectedIndex];

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <DeepSpaceScreen
      active="settings"
      header="none"
      variant="windowed"
      title={ko ? "공지사항" : "Notices"}
      onBack={() => router.back()}
    >
      <View style={styles.listFrame}>
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          style={styles.noticeCard}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          renderItem={({ item }) => {
            const unread = noticeCenter.isUnread(item.id);
            const title = noticeText(item.title, ko);
            const listMeta = noticeText(item.listMeta, ko);
            return (
              <Pressable
                onPress={() => setSelectedId(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`${title}, ${listMeta}`}
                style={styles.noticeRow}
              >
                <View
                  style={[
                    styles.rowIcon,
                    { backgroundColor: withAlpha(kindColor(item.kind), 0.12) },
                  ]}
                >
                  <NoticeGlyph kind={item.kind} />
                </View>
                <View style={styles.rowCopy}>
                  <View style={styles.rowTitleLine}>
                    {unread ? <View style={styles.unreadDot} /> : null}
                    <RNText
                      style={[styles.rowTitle, !unread && styles.rowTitleRead]}
                      numberOfLines={2}
                    >
                      {title}
                    </RNText>
                  </View>
                  <RNText style={styles.rowMeta}>{listMeta}</RNText>
                </View>
                <RNText style={styles.chevron}>{"›"}</RNText>
              </Pressable>
            );
          }}
        />
      </View>

      {selected ? (
        <NoticeDialog
          visible
          notice={selected}
          index={selectedIndex}
          total={data.length}
          onClose={() => setSelectedId(null)}
          onList={() => setSelectedId(null)}
          onConfirm={() => {
            void noticeCenter.markSeen(selected.id);
            setSelectedId(null);
          }}
          onPrevious={
            selectedIndex > 0 ? () => setSelectedId(data[selectedIndex - 1].id) : undefined
          }
          onNext={
            selectedIndex < data.length - 1
              ? () => setSelectedId(data[selectedIndex + 1].id)
              : undefined
          }
        />
      ) : null}
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  listFrame: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: m3.spacing.s2,
    paddingBottom: 18,
  },
  noticeCard: {
    flexGrow: 0,
    flexShrink: 1,
    borderRadius: m3.shape.large,
    overflow: "hidden",
    backgroundColor: m3.color.surfaceContainer,
  },
  list: { backgroundColor: m3.color.surfaceContainer },
  noticeRow: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s3,
    paddingHorizontal: 15,
    paddingVertical: 14,
    backgroundColor: m3.color.surfaceContainer,
  },
  divider: {
    height: 1,
    marginHorizontal: m3.spacing.s3,
    backgroundColor: m3.color.outlineVariant,
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: m3.shape.medium,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: m3.accent.alertDot,
    flexShrink: 0,
  },
  rowTitle: {
    flexShrink: 1,
    color: m3.color.onSurface,
    fontFamily: fontFamilies.readable,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  rowTitleRead: { color: m3.color.onSurfaceVariant, fontWeight: "400" },
  rowMeta: {
    color: m3.color.onSurfaceVariant,
    fontFamily: fontFamilies.readable,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  chevron: { color: m3.color.onSurfaceVariant, fontSize: 28, lineHeight: 32 },
  scrim: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: m3.spacing.s6,
    backgroundColor: withAlpha(m3.color.scrim, 0.55),
  },
  dialog: {
    width: "100%",
    maxWidth: 320,
    maxHeight: "82%",
    borderRadius: m3.shape.extraLarge,
    paddingTop: 22,
    paddingHorizontal: 22,
    paddingBottom: m3.spacing.s4,
    backgroundColor: m3.color.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: withAlpha(m3.color.primary, 0.18),
    ...m3.elevation.level3,
  },
  dialogMaintenance: { borderColor: withAlpha(m3.color.error, 0.3) },
  dialogHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  dialogIcon: {
    width: 40,
    height: 40,
    borderRadius: m3.shape.medium,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1, minWidth: 0 },
  tags: { flexDirection: "row", alignItems: "center", gap: 6 },
  tag: {
    minHeight: 24,
    justifyContent: "center",
    borderRadius: m3.shape.small,
    borderWidth: 1,
    paddingHorizontal: 8,
  },
  tagText: {
    fontFamily: m3.font.mono,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.7,
    fontWeight: "700",
  },
  versionTag: {
    minHeight: 24,
    justifyContent: "center",
    borderRadius: m3.shape.small,
    paddingHorizontal: 8,
    backgroundColor: m3.color.primaryContainer,
  },
  versionText: {
    color: m3.color.onPrimaryContainer,
    fontFamily: m3.font.mono,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
  },
  when: {
    color: m3.color.onSurfaceVariant,
    fontFamily: fontFamilies.readable,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  dialogTitle: {
    color: m3.color.onSurface,
    fontFamily: fontFamilies.readable,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "700",
    marginTop: 14,
  },
  dialogBodyScroll: { marginTop: 10, maxHeight: 260 },
  dialogBody: { gap: m3.spacing.s3, paddingBottom: 2 },
  bodyText: {
    flex: 1,
    color: m3.color.onSurfaceVariant,
    fontFamily: fontFamilies.readable,
    fontSize: 14,
    lineHeight: 22,
  },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: m3.spacing.s2 },
  bulletMark: { fontSize: 13, lineHeight: 22 },
  dialogActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: m3.spacing.s5,
  },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginRight: "auto",
  },
  pagerArrow: {
    minWidth: 18,
    color: m3.color.primary,
    fontSize: 24,
    lineHeight: 28,
    textAlign: "center",
  },
  pagerDisabled: { color: m3.color.outlineVariant },
  pagerText: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.mono,
    fontSize: 11,
    lineHeight: 16,
  },
  dialogButton: { minHeight: 44, paddingHorizontal: 13 },
});
