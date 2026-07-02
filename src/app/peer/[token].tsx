// T5 F2 — informant landing (no account, spec §6). Opened from the one-time
// link the subject shared out-of-band. Everything here talks ONLY to the
// peer-respond edge function; there is no session and no informant PII.
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams } from "expo-router";

import { Text } from "@/components/ui/Text";
import { MdButton, MdCard, SegBtn } from "@/components/m3";
import { m3 } from "@/lib/theme/m3";
import { deepSpace, spacing } from "@/lib/theme/tokens";
import { getEnv } from "@/lib/env";

type Phase = "loading" | "form" | "done" | "withdrawn" | "expired" | "invalid" | "already";

const TRAITS = ["extraversion", "conscientiousness", "agreeableness"] as const;
type Trait = (typeof TRAITS)[number];

async function callPeerRespond(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${getEnv().EXPO_PUBLIC_SUPABASE_URL}/functions/v1/peer-respond`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: getEnv().EXPO_PUBLIC_SUPABASE_ANON_KEY,
      authorization: `Bearer ${getEnv().EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
}

export default function PeerInformant() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { t } = useTranslation("peer");
  const [phase, setPhase] = useState<Phase>("loading");
  const [ratings, setRatings] = useState<Partial<Record<Trait, number>>>({});
  const [ackLlm, setAckLlm] = useState(false);
  const [ackOverseas, setAckOverseas] = useState(false);
  const [minor, setMinor] = useState(false);
  const [guardian, setGuardian] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!token) {
      setPhase("invalid");
      return;
    }
    callPeerRespond({ action: "load", token })
      .then((r) => {
        if (!alive) return;
        const s = r.status ?? r.error;
        if (s === "pending") setPhase("form");
        else if (s === "accepted") setPhase("already");
        else if (s === "withdrawn" || s === "declined") setPhase("withdrawn");
        else if (s === "expired") setPhase("expired");
        else setPhase("invalid");
      })
      .catch(() => alive && setPhase("invalid"));
    return () => {
      alive = false;
    };
  }, [token]);

  const complete = TRAITS.every((k) => ratings[k] != null) && ackLlm && ackOverseas && (!minor || guardian);

  async function submit() {
    if (!token || !complete || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await callPeerRespond({
        action: "submit",
        token,
        ratings,
        informantIsMinor: minor,
        guardianConsent: guardian,
        llmProcessingAck: ackLlm,
        overseasTransferAck: ackOverseas,
      });
      if (r.ok) setPhase("done");
      else setError(t("submitError"));
    } catch {
      setError(t("submitError"));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!token || busy) return;
    setBusy(true);
    try {
      await callPeerRespond({ action: "withdraw", token });
      setPhase("withdrawn");
    } finally {
      setBusy(false);
    }
  }

  const scale = (v?: number) => (v == null ? [] : [String(v)]);
  const scaleSegs = [1, 2, 3, 4, 5].map((n) => ({ key: String(n), label: String(n) }));

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <Text variant="heading" style={styles.title}>{t("title")}</Text>

      {phase === "loading" ? <Text variant="body" color="textMuted">{t("loading")}</Text> : null}
      {phase === "invalid" ? <Text variant="body" color="textMuted">{t("invalid")}</Text> : null}
      {phase === "expired" ? <Text variant="body" color="textMuted">{t("expired")}</Text> : null}
      {phase === "withdrawn" ? <Text variant="body" color="textMuted">{t("withdrawnNote")}</Text> : null}

      {phase === "already" ? (
        <MdCard variant="outlined" style={styles.card}>
          <Text variant="body">{t("alreadyNote")}</Text>
          <MdButton variant="outlined" label={t("withdrawCta")} onPress={() => void withdraw()} disabled={busy} />
        </MdCard>
      ) : null}

      {phase === "done" ? (
        <MdCard variant="outlined" style={styles.card}>
          <Text variant="body">{t("doneNote")}</Text>
          <Text variant="caption" color="textSubtle">{t("doneKeepLink")}</Text>
        </MdCard>
      ) : null}

      {phase === "form" ? (
        <>
          <MdCard variant="filled" style={styles.card}>
            <Text variant="body">{t("intro")}</Text>
            <Text variant="caption" color="textSubtle">{t("privacyPoints")}</Text>
          </MdCard>

          {TRAITS.map((trait) => (
            <MdCard key={trait} variant="outlined" style={styles.card}>
              <Text variant="body">{t(`trait.${trait}`)}</Text>
              <Text variant="caption" color="textSubtle">{t("scaleHint")}</Text>
              <SegBtn
                segments={scaleSegs}
                selected={scale(ratings[trait])}
                onSelect={(k) => setRatings((prev) => ({ ...prev, [trait]: Number(k) }))}
              />
            </MdCard>
          ))}

          <MdCard variant="outlined" style={styles.card}>
            <CheckRow label={t("ackLlm")} checked={ackLlm} onToggle={() => setAckLlm((v) => !v)} />
            <CheckRow label={t("ackOverseas")} checked={ackOverseas} onToggle={() => setAckOverseas((v) => !v)} />
            <CheckRow label={t("minorRow")} checked={minor} onToggle={() => setMinor((v) => !v)} />
            {minor ? (
              <CheckRow label={t("guardianRow")} checked={guardian} onToggle={() => setGuardian((v) => !v)} />
            ) : null}
          </MdCard>

          {error ? <Text variant="caption" style={styles.error}>{error}</Text> : null}
          <MdButton
            variant="filled"
            label={busy ? t("submitting") : t("submitCta")}
            onPress={() => void submit()}
            disabled={!complete || busy}
          />
          <Text variant="caption" color="textSubtle" style={styles.foot}>{t("withdrawAnytime")}</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

function CheckRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <View style={styles.checkRow}>
      <MdButton
        variant={checked ? "tonal" : "outlined"}
        label={checked ? "✓" : " "}
        onPress={onToggle}
        accessibilityLabel={label}
        style={styles.checkBox}
      />
      <Text variant="caption" style={styles.checkLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: deepSpace.bgEdge },
  scroll: { padding: spacing.lg, gap: spacing.md, maxWidth: 560, width: "100%", alignSelf: "center", paddingBottom: 48 },
  title: { marginTop: spacing.lg },
  card: { padding: spacing.md, gap: spacing.sm },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  checkBox: { minWidth: 48 },
  checkLabel: { flex: 1 },
  error: { color: m3.color.error },
  foot: { textAlign: "center", marginTop: spacing.xs },
});
