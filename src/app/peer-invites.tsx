// T5 F2 — subject-side peer invites (spec §6, schema 0064). Create a one-time
// link (raw token lives ONLY in the share sheet), see invite states, revoke.
// Aggregate viewing stays in the Seen lens (F3); this screen is only the
// invitation ledger.
import { useCallback, useEffect, useState } from "react";
import { ScrollView, Share, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect } from "expo-router";

import { Text } from "@/components/ui/Text";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { Field, MdButton, MdCard, MdChip } from "@/components/m3";
import { useAuth } from "@/lib/auth/AuthContext";
import { deepSpace, spacing, withAlpha } from "@/lib/theme/tokens";
import {
  createPeerInvite,
  listPeerInvites,
  withdrawPeerInvite,
  PEER_INVITE_MAX_PENDING,
  type PeerInvitation,
  type PeerRelationKind,
} from "@/lib/peer/invite";

const KINDS: PeerRelationKind[] = ["friend", "family", "coworker", "partner", "other"];

export default function PeerInvites() {
  const { t, i18n } = useTranslation("peer");
  const ko = i18n.language === "ko";
  const { userId, loading } = useAuth();
  const [invites, setInvites] = useState<PeerInvitation[] | null>(null);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<PeerRelationKind>("friend");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!userId) return;
    listPeerInvites(userId)
      .then(setInvites)
      .catch(() => setInvites([]));
  }, [userId]);

  useEffect(reload, [reload]);

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;

  const pendingCount = (invites ?? []).filter((i) => i.status === "pending").length;
  const canCreate = !busy && pendingCount < PEER_INVITE_MAX_PENDING;

  async function create() {
    if (!userId || !canCreate) return;
    setBusy(true);
    setNotice(null);
    try {
      const { link } = await createPeerInvite(userId, kind, label);
      setLabel("");
      reload();
      // The raw token exists only here: hand it straight to the share sheet.
      await Share.share({ message: `${t("shareMessage")}\n${link}` });
    } catch {
      setNotice(t("createError"));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!userId || busy) return;
    setBusy(true);
    try {
      await withdrawPeerInvite(userId, id);
      reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <DeepSpaceScreen active="lens">
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="heading">{t("subjectTitle")}</Text>
        <Text variant="caption" color="textSubtle">{t("subjectIntro")}</Text>

        <MdCard variant="outlined" style={styles.card}>
          <Field
            label={t("labelField")}
            value={label}
            onChangeText={setLabel}
            placeholder={ko ? "예) 대학 동기" : "e.g. college friend"}
          />
          <View style={styles.kindRow}>
            {KINDS.map((k) => (
              <MdChip key={k} kind="filter" label={t(`kind.${k}`)} selected={kind === k} onPress={() => setKind(k)} />
            ))}
          </View>
          <MdButton
            variant="filled"
            label={busy ? t("creating") : t("createCta")}
            onPress={() => void create()}
            disabled={!canCreate}
          />
          {pendingCount >= PEER_INVITE_MAX_PENDING ? (
            <Text variant="caption" color="textSubtle">{t("pendingCap")}</Text>
          ) : null}
          {notice ? <Text variant="caption" color="textSubtle">{notice}</Text> : null}
          <Text variant="caption" color="textSubtle">{t("privacyLine")}</Text>
        </MdCard>

        {invites === null ? (
          <Text variant="caption" color="textSubtle">{t("loading")}</Text>
        ) : invites.length === 0 ? (
          <MdCard variant="outlined" style={styles.card}>
            <Text variant="body" color="textMuted">{t("emptyList")}</Text>
          </MdCard>
        ) : (
          invites.map((inv) => (
            <MdCard key={inv.id} variant="outlined" style={styles.rowCard}>
              <View style={styles.rowHead}>
                <Text variant="body" style={styles.rowLabel} numberOfLines={1}>
                  {inv.invited_label ?? t(`kind.${inv.relation_kind}`)}
                </Text>
                <Text variant="caption" style={statusStyle(inv.status)}>{t(`status.${inv.status}`)}</Text>
              </View>
              <View style={styles.rowFoot}>
                <Text variant="caption" color="textSubtle">{inv.created_at.slice(0, 10)}</Text>
                {inv.status === "pending" ? (
                  <MdButton
                    variant="text"
                    label={t("revokeCta")}
                    onPress={() => void revoke(inv.id)}
                    disabled={busy}
                  />
                ) : null}
              </View>
            </MdCard>
          ))
        )}
        <Text variant="caption" color="textSubtle" style={styles.foot}>{t("aggregateNote")}</Text>
      </ScrollView>
    </DeepSpaceScreen>
  );
}

function statusStyle(status: PeerInvitation["status"]) {
  if (status === "accepted") return { color: deepSpace.mint };
  if (status === "pending") return { color: deepSpace.accentSoft };
  return { color: withAlpha(deepSpace.text, 0.45) };
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  card: { padding: spacing.md, gap: spacing.sm },
  rowCard: { padding: spacing.md, gap: spacing.xs },
  rowHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  rowLabel: { flex: 1 },
  rowFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kindRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  foot: { textAlign: "center" },
});
