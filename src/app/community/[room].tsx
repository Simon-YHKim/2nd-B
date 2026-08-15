// Community room thread (0117). Text messages, 4s focused polling (no
// realtime channel in the repo yet — $0/mo). Long-press a message for the
// closed-list report + block + delete-own actions (Play UGC). The invite
// link is owner-minted and lives only in the share sheet.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Share, StyleSheet, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { Text } from "@/components/ui/Text";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdCard, MdChip } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { deepSpace, spacing, withAlpha } from "@/lib/theme/tokens";
import { REPORT_REASONS, type ReportReason } from "@/lib/wiki/moderation";
import {
  COMMUNITY_MESSAGE_MAX,
  COMMUNITY_ROOM_POLL_MS,
  blockUser,
  communityErrorCode,
  createInvite,
  deleteOwnMessage,
  leaveRoom,
  listMessages,
  listRooms,
  reportMessage,
  roomDisplayTitle,
  sendMessage,
  type CommunityMessage,
  type CommunityRoom,
} from "@/lib/community/chat";

export default function CommunityRoomScreen() {
  const { t } = useTranslation("community");
  const { userId, loading, isMinor } = useAuth();
  const params = useLocalSearchParams<{ room?: string }>();
  const roomId = typeof params.room === "string" ? params.room : null;

  const [room, setRoom] = useState<CommunityRoom | null>(null);
  const [messages, setMessages] = useState<CommunityMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<CommunityMessage | null>(null);
  const listRef = useRef<FlatList<CommunityMessage>>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const adult = isMinor === false;
  const isOwner = useMemo(
    () => room?.members.some((m) => m.user_id === userId && m.role === "owner") ?? false,
    [room, userId],
  );

  const refresh = useCallback(() => {
    if (!userId || !roomId || !adult) return;
    listMessages(roomId)
      .then(setMessages)
      .catch(() => setMessages((prev) => prev ?? []));
    listRooms()
      .then((rooms) => setRoom(rooms.find((r) => r.id === roomId) ?? null))
      .catch(() => undefined);
  }, [userId, roomId, adult]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      pollRef.current = setInterval(refresh, COMMUNITY_ROOM_POLL_MS);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      };
    }, [refresh]),
  );

  useEffect(() => {
    if (messages?.length) listRef.current?.scrollToEnd({ animated: false });
  }, [messages?.length]);

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;
  if (!roomId) return <Redirect href="/community" />;

  async function send() {
    const body = draft.trim();
    if (!body || busy || !roomId || !userId) return;
    setBusy(true);
    setNotice(null);
    try {
      await sendMessage(roomId, userId, body);
      setDraft("");
      refresh();
    } catch (e) {
      setNotice(t(sendErrorKey(communityErrorCode(e))));
    } finally {
      setBusy(false);
    }
  }

  async function shareInvite() {
    if (!roomId || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const { link } = await createInvite(roomId);
      await Share.share({ message: `${t("roomShareMessage")}\n${link}` });
    } catch (e) {
      setNotice(t(sendErrorKey(communityErrorCode(e))));
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (!roomId || !userId || busy) return;
    setBusy(true);
    try {
      await leaveRoom(roomId, userId);
      router.replace("/community");
    } catch {
      setNotice(t("genericError"));
      setBusy(false);
    }
  }

  async function actReport(reason: ReportReason) {
    if (!selected || !userId) return;
    try {
      await reportMessage(selected.id, userId, reason);
      setNotice(t("reported"));
    } catch {
      setNotice(t("genericError"));
    }
    setSelected(null);
  }

  async function actBlock() {
    if (!selected || !userId) return;
    try {
      await blockUser(userId, selected.sender_id);
      setNotice(t("blocked"));
      refresh();
    } catch {
      setNotice(t("genericError"));
    }
    setSelected(null);
  }

  async function actDelete() {
    if (!selected) return;
    try {
      await deleteOwnMessage(selected.id);
      refresh();
    } catch {
      setNotice(t("genericError"));
    }
    setSelected(null);
  }

  const title = room ? roomDisplayTitle(room, userId, t("dmPending")) : t("title");

  return (
    <DeepSpaceScreen active="lens" variant="windowed" title={title} onBack={() => router.back()}>
      {!adult ? (
        <View style={styles.gate}>
          <MdCard variant="outlined" style={styles.gateCard}>
            <Text variant="body" color="textMuted">{t("adultOnly")}</Text>
          </MdCard>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.roomBar}>
            <Text variant="caption" color="textSubtle" style={styles.roomMeta} numberOfLines={1}>
              {room
                ? room.kind === "dm"
                  ? room.members.length < 2 ? t("dmWaiting") : t("kindDm")
                  : t("memberCount", { n: room.members.length })
                : " "}
            </Text>
            {isOwner ? (
              <MdButton variant="text" label={t("inviteCta")} onPress={() => void shareInvite()} disabled={busy} />
            ) : null}
            <MdButton variant="text" label={t("leaveCta")} onPress={() => void leave()} disabled={busy} />
          </View>

          <FlatList
            ref={listRef}
            data={messages ?? []}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text variant="caption" color="textSubtle" style={styles.empty}>
                {messages === null ? t("loading") : t("threadEmpty")}
              </Text>
            }
            renderItem={({ item }) => {
              const mine = item.sender_id === userId;
              return (
                <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
                  <MdCard
                    variant={mine ? "filled" : "outlined"}
                    style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
                    onPress={() => setSelected(item)}
                    accessibilityLabel={t("messageA11y")}
                  >
                    {!mine ? (
                      <Text variant="caption" style={styles.sender}>{item.alias ?? t("unknownSender")}</Text>
                    ) : null}
                    <Text variant="body">{item.body}</Text>
                    <Text variant="caption" color="textSubtle">{item.created_at.slice(11, 16)}</Text>
                  </MdCard>
                </View>
              );
            }}
          />

          {selected ? (
            <MdCard variant="outlined" style={styles.actionCard}>
              <Text variant="caption" color="textSubtle" numberOfLines={1}>
                {t("actionsFor", { alias: selected.alias ?? t("unknownSender") })}
              </Text>
              <View style={styles.reasonRow}>
                {REPORT_REASONS.map((r) => (
                  <MdChip key={r} kind="assist" label={t(`report.${r}`)} onPress={() => void actReport(r)} />
                ))}
              </View>
              <View style={styles.actionRow}>
                {selected.sender_id !== userId ? (
                  <MdButton variant="text" label={t("blockCta")} onPress={() => void actBlock()} />
                ) : (
                  <MdButton variant="text" label={t("deleteCta")} onPress={() => void actDelete()} />
                )}
                <MdButton variant="text" label={t("closeCta")} onPress={() => setSelected(null)} />
              </View>
            </MdCard>
          ) : null}

          {notice ? (
            <Text variant="caption" style={styles.notice} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {notice}
            </Text>
          ) : null}

          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={t("composerPlaceholder")}
              placeholderTextColor={withAlpha(deepSpace.text, 0.4)}
              style={styles.input}
              multiline
              maxLength={COMMUNITY_MESSAGE_MAX}
              accessibilityLabel={t("composerPlaceholder")}
            />
            <MdButton
              variant="filled"
              label={busy ? t("working") : t("sendCta")}
              onPress={() => void send()}
              disabled={busy || !draft.trim()}
            />
          </View>
        </View>
      )}
    </DeepSpaceScreen>
  );
}

function sendErrorKey(code: string | null): string {
  switch (code) {
    case "community_adult_only": return "adultOnly";
    case "community_room_full": return "roomFull";
    case "community_invite_cap": return "inviteCap";
    default: return "genericError";
  }
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: spacing.xs },
  gate: { padding: spacing.lg },
  gateCard: { padding: spacing.md },
  roomBar: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md },
  roomMeta: { flex: 1 },
  listContent: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  empty: { textAlign: "center", marginTop: spacing.lg },
  bubbleRow: { flexDirection: "row", justifyContent: "flex-start" },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubble: { maxWidth: "84%", padding: spacing.sm, gap: 2 },
  bubbleTheirs: { borderLeftWidth: 2, borderLeftColor: deepSpace.accentSoft },
  bubbleMine: {},
  sender: { color: deepSpace.accentSoft },
  actionCard: { marginHorizontal: spacing.md, padding: spacing.sm, gap: spacing.xs },
  reasonRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  actionRow: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.xs },
  notice: { color: deepSpace.dangerText, paddingHorizontal: spacing.md },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, padding: spacing.md, paddingTop: spacing.xs },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.text, 0.2),
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    color: deepSpace.text,
  },
});
