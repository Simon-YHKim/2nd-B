// T5 F2 — informant landing (no account, spec §6). Opened from the one-time
// link the subject shared out-of-band. Everything here talks ONLY to the
// peer-respond edge function; there is no session and no informant PII.
import { useEffect, useState } from "react";
import { Linking, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams } from "expo-router";

import { Text } from "@/components/ui/Text";
import { MdButton, MdCard, SegBtn } from "@/components/m3";
import { m3 } from "@/lib/theme/m3";
import { deepSpace, semantic, spacing } from "@/lib/theme/tokens";
import { callPeerRespond } from "@/lib/peer/peer-respond";

type Phase = "loading" | "form" | "done" | "withdrawn" | "expired" | "invalid" | "already";

// 2026-08-25: Big Five 완성. ⚠ 서버(peer-respond)가 5키를 받는 판으로 먼저
// 재배포돼 있어야 한다 — 구서버는 새 2키를 400 이 아니라 **조용히 폐기**한다.
const TRAITS = ["extraversion", "conscientiousness", "agreeableness", "openness", "neuroticism"] as const;
type Trait = (typeof TRAITS)[number];

// C10: the same floor sign-up enforces. Birth YEAR only — the coarsest signal
// that answers the question, so an informant never hands over a full birth date
// to a product they have no account with.
const MIN_INFORMANT_AGE = 14;
const CURRENT_YEAR = new Date().getFullYear();
const MAX_BIRTH_YEAR = CURRENT_YEAR;

export default function PeerInformant() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { t } = useTranslation("peer");
  const [phase, setPhase] = useState<Phase>("loading");
  const [ratings, setRatings] = useState<Partial<Record<Trait, number>>>({});
  const [ackLlm, setAckLlm] = useState(false);
  const [ackOverseas, setAckOverseas] = useState(false);
  const [minor, setMinor] = useState(false);
  const [guardian, setGuardian] = useState(false);
  const [birthYear, setBirthYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // This page has no account and no session, so the sign-up age gate that rejects
  // under-14 never runs on the informant. Without a year here, a 13-year-old can
  // become a data subject in a product that publicly says it does not accept them.
  // The client check is a courtesy; peer-respond re-derives and rejects server-side.
  const year = Number.parseInt(birthYear, 10);
  const yearLooksReal = Number.isInteger(year) && year >= 1900 && year <= MAX_BIRTH_YEAR;
  const approxAge = yearLooksReal ? CURRENT_YEAR - year : null;
  const tooYoung = approxAge != null && approxAge < MIN_INFORMANT_AGE;

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

  const complete =
    TRAITS.every((k) => ratings[k] != null) &&
    ackLlm &&
    ackOverseas &&
    yearLooksReal &&
    !tooYoung &&
    (!minor || guardian);

  async function submit() {
    if (!token || !complete || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await callPeerRespond({
        action: "submit",
        token,
        ratings,
        birthYear: year,
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

  // A withdrawal that fails on the server must NOT be reported as withdrawn. This
  // used to call the endpoint and set the phase unconditionally, so a 404/500 still
  // told the informant "철회됐어요" while their observation stayed live in the
  // aggregate. Consent withdrawal is the one thing that must never fail open.
  async function withdraw() {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await callPeerRespond({ action: "withdraw", token });
      if (r.ok) setPhase("withdrawn");
      else setError(t("withdrawError"));
    } catch {
      setError(t("withdrawError"));
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
          {/* A failed withdrawal has to be visible HERE -- the form's error slot is a
              different phase, so before this the informant saw nothing at all. */}
          {error ? (
            <Text variant="caption" style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <MdButton
            variant="outlined"
            label={busy ? t("submitting") : t("withdrawCta")}
            onPress={() => void withdraw()}
            disabled={busy}
          />
        </MdCard>
      ) : null}

      {phase === "done" ? (
        <MdCard variant="outlined" style={styles.card}>
          <Text variant="body">{t("doneNote")}</Text>
          <Text variant="caption" color="textSubtle">{t("doneKeepLink")}</Text>
          {/* done 단계 한정(2026-09-01 감사 Q2-4 승인). 동의·제출(form) 단계에는 절대
              넣지 않는다 — 동의 품질을 흐리지 않기 위한 전제다. 정적 링크라 PII·추적 없음. */}
          <MdButton
            variant="outlined"
            label={t("aboutApp")}
            onPress={() => void Linking.openURL("https://simon-yhkim.github.io/2nd-B/")}
          />
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
            <Text variant="body">{t("birthYearLabel")}</Text>
            <Text variant="caption" color="textSubtle">{t("birthYearHint")}</Text>
            <TextInput
              value={birthYear}
              onChangeText={(v) => setBirthYear(v.replace(/[^0-9]/g, "").slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              placeholder={t("birthYearPlaceholder")}
              placeholderTextColor={semantic.textSubtle}
              style={styles.yearInput}
              accessibilityLabel={t("birthYearLabel")}
            />
            {tooYoung ? (
              <Text variant="caption" style={styles.error}>{t("tooYoung")}</Text>
            ) : null}
          </MdCard>

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
  yearInput: {
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: m3.color.outline,
    borderRadius: m3.shape.none,
    color: semantic.text,
    fontSize: 16,
  },
  foot: { textAlign: "center", marginTop: spacing.xs },
});
