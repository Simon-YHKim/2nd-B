// Community v1 — room list + create (2026-08-10 direction: 7th home slot).
// 1:1 DM and group rooms, text only, invite-link entry only (no directory).
// Adults only, fail-closed: isMinor null (unknown) gates exactly like true;
// the server re-asserts via users.minor_tier in every RPC (0117).
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, useFocusEffect } from "expo-router";

import { Text } from "@/components/ui/Text";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Field, MdButton, MdCard, MdChip } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { inviteTokenFromInput } from "@/lib/community/invite-paste";
import { deepSpace, spacing, withAlpha } from "@/lib/theme/tokens";
import {
  COMMUNITY_GROUP_TITLE_MAX,
  COMMUNITY_LIST_POLL_MS,
  communityErrorCode,
  createDmRoom,
  createGroupRoom,
  createInvite,
  ensureCommunityProfile,
  listRooms,
  roomDisplayTitle,
  type CommunityRoom,
} from "@/lib/community/chat";

export default function Community() {
  const { t } = useTranslation("community");
  const { userId, loading, isMinor } = useAuth();
  const [alias, setAlias] = useState<string | null>(null);
  const [rooms, setRooms] = useState<CommunityRoom[] | null>(null);
  const [groupTitle, setGroupTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinInput, setJoinInput] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const adult = isMinor === false;

  const reload = useCallback(() => {
    if (!userId || !adult) return;
    listRooms()
      .then(setRooms)
      .catch(() => setRooms((prev) => prev ?? []));
  }, [userId, adult]);

  useEffect(() => {
    if (!userId || !adult) return;
    ensureCommunityProfile()
      .then(setAlias)
      .catch((e) => setNotice(t(errorKey(communityErrorCode(e)))));
  }, [userId, adult, t]);

  useFocusEffect(
    useCallback(() => {
      reload();
      pollRef.current = setInterval(reload, COMMUNITY_LIST_POLL_MS);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      };
    }, [reload]),
  );

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  async function startGroup() {
    if (!groupTitle.trim() || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const roomId = await createGroupRoom(groupTitle);
      setGroupTitle("");
      reload();
      router.push({ pathname: "/community/[room]", params: { room: roomId } });
    } catch (e) {
      setNotice(t(errorKey(communityErrorCode(e))));
    } finally {
      setBusy(false);
    }
  }

  async function startDm() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const roomId = await createDmRoom();
      const { link } = await createInvite(roomId);
      reload();
      // The raw token exists only here: hand it straight to the share sheet.
      await Share.share({ message: `${t("dmShareMessage")}\n${link}` });
    } catch (e) {
      setNotice(t(errorKey(communityErrorCode(e))));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DeepSpaceScreen active="lens" variant="windowed" title={t("title")} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {!adult ? (
          <MdCard variant="outlined" style={styles.card}>
            <Text variant="body" color="textMuted">{t("adultOnly")}</Text>
          </MdCard>
        ) : (
          <>
            <Text variant="caption" color="textSubtle">
              {alias ? t("aliasLine", { alias }) : t("intro")}
            </Text>

            <MdCard variant="outlined" style={styles.card}>
              <Text variant="body">{t("createTitle")}</Text>
              <Field
                label={t("groupField")}
                value={groupTitle}
                onChangeText={setGroupTitle}
                maxLength={COMMUNITY_GROUP_TITLE_MAX}
                placeholder={t("groupPlaceholder")}
              />
              <View style={styles.ctaRow}>
                <MdButton
                  variant="filled"
                  label={busy ? t("working") : t("groupCta")}
                  onPress={() => void startGroup()}
                  disabled={busy || !groupTitle.trim()}
                />
                <MdButton
                  variant="tonal"
                  label={t("dmCta")}
                  onPress={() => void startDm()}
                  disabled={busy}
                />
              </View>
              {notice ? (
                <Text variant="caption" style={styles.notice} accessibilityRole="alert">{notice}</Text>
              ) : null}
              <Text variant="caption" color="textSubtle">{t("inviteModelNote")}</Text>
              {/* 초대 수신구(2026-09-01 감사 Q2-3 승인). 접힌 보조 행 — 화면당 메시지
                  1개 규율을 지키기 위해 기본은 캡션 한 줄이다. 성인 게이트 분기 안쪽. */}
              {joinOpen ? (
                <>
                  <Field
                    label={t("joinLinkLabel")}
                    value={joinInput}
                    onChangeText={setJoinInput}
                    placeholder={t("joinLinkPlaceholder")}
                  />
                  <MdButton
                    variant="tonal"
                    label={t("joinLinkCta")}
                    disabled={!joinInput.trim()}
                    onPress={() => {
                      const token = inviteTokenFromInput(joinInput);
                      if (!token) {
                        setNotice(t("joinLinkInvalid"));
                        return;
                      }
                      setNotice(null);
                      router.push({ pathname: "/community/join/[token]", params: { token } });
                    }}
                  />
                </>
              ) : (
                <Pressable onPress={() => setJoinOpen(true)} accessibilityRole="button">
                  <Text variant="caption" color="brand">{t("joinLinkToggle")}</Text>
                </Pressable>
              )}
            </MdCard>

            {rooms === null ? (
              <Text variant="caption" color="textSubtle">{t("loading")}</Text>
            ) : rooms.length === 0 ? (
              <MdCard variant="outlined" style={styles.card}>
                <Text variant="body" color="textMuted">{t("empty")}</Text>
              </MdCard>
            ) : (
              rooms.map((room) => (
                <MdCard
                  key={room.id}
                  variant="outlined"
                  style={styles.roomCard}
                  onPress={() => router.push({ pathname: "/community/[room]", params: { room: room.id } })}
                >
                  <View style={styles.roomHead}>
                    <Text variant="body" style={styles.roomTitle} numberOfLines={1}>
                      {roomDisplayTitle(room, userId, t("dmPending"))}
                    </Text>
                    <MdChip
                      kind="assist"
                      label={room.kind === "dm" ? t("kindDm") : t("kindGroup", { n: room.members.length })}
                    />
                  </View>
                  <Text variant="caption" color="textSubtle">{room.last_message_at.slice(0, 16).replace("T", " ")}</Text>
                </MdCard>
              ))
            )}
            <Text variant="caption" color="textSubtle" style={styles.foot}>{t("safetyFoot")}</Text>
          </>
        )}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

function errorKey(code: string | null): string {
  switch (code) {
    case "community_adult_only": return "adultOnly";
    case "community_room_cap": return "roomCap";
    case "community_invite_cap": return "inviteCap";
    default: return "genericError";
  }
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  card: { padding: spacing.md, gap: spacing.sm },
  roomCard: { padding: spacing.md, gap: spacing.xs },
  roomHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  roomTitle: { flex: 1 },
  ctaRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  notice: { color: deepSpace.dangerText },
  foot: { textAlign: "center", color: withAlpha(deepSpace.text, 0.45) },
});
