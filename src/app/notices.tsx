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
import { SafeAreaView } from "react-native-safe-area-context";

import { MdButton, MdTopAppBar } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { keepAllKo } from "@/lib/i18n/keep-all";
import { m3 } from "@/lib/theme/m3";
import { withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";

export type NoticeKind = "patch" | "developer" | "maintenance";

export interface ProductNotice {
  id: string;
  kind: NoticeKind;
  eyebrow: string;
  version?: string;
  when: string;
  listMeta: string;
  title: string;
  body: readonly { kind: "paragraph" | "bullet"; text: string }[];
}

export const PRODUCT_NOTICES: readonly ProductNotice[] = [
  {
    id: "patch-1.4.0",
    kind: "patch",
    eyebrow: "NEW",
    version: "v1.4.0",
    when: "2026.07.17 · 패치노트",
    listMeta: "패치 v1.4.0 · 오늘",
    title: "리즈닝이 더 똑똑해졌어요",
    body: [
      { kind: "bullet", text: "자동 리즈닝 토글이 생겼어요. 담는 대로 별을 이어줘요." },
      { kind: "bullet", text: "자료를 별로 잇는 속도가 2배 빨라졌어요." },
      { kind: "bullet", text: "위키 그래프가 더 부드럽게 움직여요." },
    ],
  },
  {
    id: "developer-letter-2026-07",
    kind: "developer",
    eyebrow: "개발자 공지",
    when: "2026.07.14 · 세컨비 팀",
    listMeta: "공지 · 3일 전",
    title: "세컨비의 편지 — 우리가 별을 그리는 이유",
    body: [
      { kind: "paragraph", text: "안녕하세요, 세컨비를 만드는 팀이에요." },
      {
        kind: "paragraph",
        text: "여러분이 담아준 별가루가 이번 달에만 12만 개를 넘었어요. 하나하나가 누군가의 하루라 생각하면 조심스럽고 고맙습니다.",
      },
      {
        kind: "paragraph",
        text: "다음 업데이트에선 '북극성'을 더 또렷하게 다듬고 있어요. 조금만 기다려 주세요.",
      },
    ],
  },
  {
    id: "maintenance-2026-07-20",
    kind: "maintenance",
    eyebrow: "점검 안내",
    when: "2026.07.20 · 03:00–05:00",
    listMeta: "점검 · 1주 전",
    title: "정기 서버 점검 안내",
    body: [
      {
        kind: "paragraph",
        text: "일요일 새벽 서버 점검이 있어요. 이 시간엔 담기·리즈닝이 잠시 멈춰요. 담아둔 자료는 안전하게 보관되고 연결되면 자동 동기화돼요.",
      },
    ],
  },
  {
    id: "patch-1.3.0",
    kind: "patch",
    eyebrow: "패치노트",
    version: "v1.3.0",
    when: "2026.06.26 · 패치노트",
    listMeta: "패치 v1.3.0 · 3주 전",
    title: "v1.3.0 — AI 뮤지엄이 열렸어요",
    body: [
      {
        kind: "paragraph",
        text: "AI 뮤지엄에서 지금까지 담은 자료와 새로 발견한 연결을 시간의 흐름으로 둘러볼 수 있어요.",
      },
    ],
  },
  {
    id: "beta-thanks-2026-06",
    kind: "developer",
    eyebrow: "공지",
    when: "2026.06.05 · 세컨비 팀",
    listMeta: "공지 · 6주 전",
    title: "베타에 함께해줘서 고마워요",
    body: [
      {
        kind: "paragraph",
        text: "여러분이 남겨준 기록과 의견 덕분에 별자리가 조금씩 또렷해지고 있어요. 함께 만들어줘서 고마워요.",
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

export function useNoticeCenter(userId: string | null) {
  // undefined = storage hydration in progress. It prevents an already-read
  // notice from flashing for one frame during an Android cold start.
  const [seenId, setSeenId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!userId) {
      setSeenId(null);
      return;
    }
    let cancelled = false;
    setSeenId(undefined);
    void readSeenId(userId)
      .then((value) => {
        if (!cancelled) setSeenId(value);
      })
      .catch(() => {
        if (!cancelled) setSeenId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const markSeen = useCallback(
    async (noticeId: string) => {
      if (!userId) return;
      // Only the newest ID is the unread cursor. Reading an older history item
      // must not accidentally clear a newer announcement.
      if (noticeId !== LATEST_NOTICE.id) return;
      setSeenId(noticeId);
      await writeSeenId(userId, noticeId).catch(() => undefined);
    },
    [userId],
  );

  return {
    hydrated: seenId !== undefined,
    unreadCount: seenId !== undefined && seenId !== LATEST_NOTICE.id ? 1 : 0,
    isUnread: (noticeId: string) => noticeId === LATEST_NOTICE.id && seenId !== LATEST_NOTICE.id,
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
};

function kindColor(kind: NoticeKind): string {
  if (kind === "developer") return m3.color.tertiary;
  if (kind === "maintenance") return m3.color.error;
  return m3.color.primary;
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
}) {
  const { i18n } = useTranslation();
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? true;
  const shortTitle = notice.id === "developer-letter-2026-07" ? "세컨비의 편지" : notice.title;
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
              <NoticeGlyph kind={notice.kind} size={24} />
            </View>
            <View style={styles.headerCopy}>
              <View style={styles.tags}>
                <View style={[styles.tag, { borderColor: withAlpha(tone, 0.52) }]}>
                  <RNText style={[styles.tagText, { color: tone }]}>{notice.eyebrow}</RNText>
                </View>
                {notice.version ? (
                  <View style={styles.versionTag}>
                    <RNText style={styles.versionText}>{notice.version}</RNText>
                  </View>
                ) : null}
              </View>
              <RNText style={styles.when}>{notice.when}</RNText>
            </View>
          </View>

          <RNText style={styles.dialogTitle} accessibilityLabel={shortTitle}>
            {keepAllKo(shortTitle)}
          </RNText>

          <ScrollView style={styles.dialogBodyScroll} contentContainerStyle={styles.dialogBody}>
            {notice.body.map((block, blockIndex) =>
              block.kind === "bullet" ? (
                <View key={`${notice.id}-${blockIndex}`} style={styles.bulletRow}>
                  <RNText style={[styles.bulletMark, { color: tone }]}>{"✦"}</RNText>
                  <RNText style={styles.bodyText} accessibilityLabel={block.text}>
                    {keepAllKo(block.text)}
                  </RNText>
                </View>
              ) : (
                <RNText
                  key={`${notice.id}-${blockIndex}`}
                  style={styles.bodyText}
                  accessibilityLabel={block.text}
                >
                  {keepAllKo(block.text)}
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
                accessibilityState={{ disabled: !onPrevious }}
              >
                <RNText style={[styles.pagerArrow, !onPrevious && styles.pagerDisabled]}>{"‹"}</RNText>
              </Pressable>
              <RNText style={styles.pagerText}>{`${index + 1} / ${PRODUCT_NOTICES.length}`}</RNText>
              <Pressable
                onPress={onNext}
                disabled={!onNext}
                hitSlop={8}
                accessibilityRole="button"
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
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selected = selectedIndex == null ? null : PRODUCT_NOTICES[selectedIndex];

  const data = useMemo(() => [...PRODUCT_NOTICES], []);

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.screenWindow}>
        <MdTopAppBar title={ko ? "공지사항" : "Notices"} onBack={() => router.back()} />
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          renderItem={({ item, index }) => {
            const unread = noticeCenter.hydrated && noticeCenter.isUnread(item.id);
            return (
              <Pressable
                onPress={() => setSelectedIndex(index)}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${item.listMeta}`}
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
                      {item.title}
                    </RNText>
                  </View>
                  <RNText style={styles.rowMeta}>{item.listMeta}</RNText>
                </View>
                <RNText style={styles.chevron}>{"›"}</RNText>
              </Pressable>
            );
          }}
        />
      </View>

      {selected && selectedIndex != null ? (
        <NoticeDialog
          visible
          notice={selected}
          index={selectedIndex}
          onClose={() => setSelectedIndex(null)}
          onList={() => setSelectedIndex(null)}
          onConfirm={() => {
            void noticeCenter.markSeen(selected.id);
            setSelectedIndex(null);
          }}
          onPrevious={
            selectedIndex > 0 ? () => setSelectedIndex((value) => (value == null ? 0 : value - 1)) : undefined
          }
          onNext={
            selectedIndex < PRODUCT_NOTICES.length - 1
              ? () => setSelectedIndex((value) => (value == null ? 0 : value + 1))
              : undefined
          }
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: m3.accent.cosmicBase, padding: m3.spacing.s3 },
  screenWindow: { flex: 1, borderRadius: m3.shape.extraLarge, overflow: "hidden", backgroundColor: m3.color.surface },
  list: {
    paddingHorizontal: m3.spacing.s4,
    paddingTop: m3.spacing.s2,
    paddingBottom: m3.spacing.s8,
  },
  noticeRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s3,
    paddingHorizontal: m3.spacing.s3,
    paddingVertical: m3.spacing.s3,
    backgroundColor: m3.color.surfaceContainerHighest,
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
    padding: 22,
    backgroundColor: m3.color.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: withAlpha(m3.color.primary, 0.18),
    ...m3.elevation.level3,
  },
  dialogMaintenance: { borderColor: withAlpha(m3.color.error, 0.3) },
  dialogHeader: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s3 },
  dialogIcon: {
    width: 48,
    height: 48,
    borderRadius: m3.shape.large,
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
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "700",
    marginTop: m3.spacing.s5,
  },
  dialogBodyScroll: { marginTop: m3.spacing.s4, maxHeight: 260 },
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
