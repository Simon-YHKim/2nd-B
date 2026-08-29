// /review (memo §4 T3, demo-loop step 5): the propose -> ratify surface. Assembles
// the ready pieces - buildPersona -> proposalContextForStar -> proposeSelfModelChange
// -> RatifySheet -> applyRatify. User-triggered (no Gemini on mount). v1 proposes
// for star1 (지금의 나). Surfaces D9 tier shifts (loadTierShifts) as a re-check nudge.
// Errors degrade gracefully (no profile / offline -> friendly note).

import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { cosmic, spacing } from "@/lib/theme/tokens";
import { useAuth } from "@/lib/auth/AuthContext";
import { buildPersona } from "@/lib/persona/build";
import { proposalContextForStar } from "@/lib/persona/proposal-context";
import { proposeSelfModelChange } from "@/lib/persona/propose-self-model";
import { applyRatify, type RatifyDecision, type SelfModelProposal } from "@/lib/persona/proposal";
import { captureEvent, proposalDecided } from "@/lib/analytics";
import { RatifySheet, runRatifyDecisionOnce } from "@/components/persona/RatifySheet";
import { loadTierShifts } from "@/lib/persona/load-tier-shifts";
import { tierShiftNudge, type TierShift } from "@/lib/persona/tier-history";
import { resolveStarName } from "@/lib/persona/star-name";
import { recordStarTiers } from "@/lib/persona/record-star-tiers";
import { reactExpression } from "@/lib/companion/expression";
import { isDeepSpaceUI } from "@/lib/ui-mode";
import { DeepSpaceReviewScreen } from "@/screens/deepspace/DeepSpaceDesignScreens";

// 2026-08-25 fix: the nudge used to resolve names from SELF_UNDERSTANDING_STARS
// only, so a `seven:` ledger row leaked its raw id into the nudge sentence.
// resolveStarName knows both systems; the seven-star branch is filled in at the
// call site where t() is in scope.


type ReviewCopyLocale = "en" | "ko" | "es" | "pt" | "id";

const REVIEW_COPY: Record<
  ReviewCopyLocale,
  {
    lede: string;
    loadError: string;
    ratified: (level: number) => string;
    declined: string;
    saveFailed: string;
    saving: string;
    reopenProposal: string;
  }
> = {
  en: {
    lede: "Your assistant proposes a next step from your records. It applies only when you ratify.",
    loadError: "Couldn't load a proposal. Try again.",
    ratified: (level) => `Ratified - moved to actionable (L${level}).`,
    declined: "Folded. This proposal was not applied and leaves no record.",
    saveFailed: "Couldn't save. The proposal is still here, so try again.",
    saving: "Saving...",
    reopenProposal: "Reopen the proposal",
  },
  ko: {
    lede: "비서가 기록을 보고 다음 한 걸음을 제안해요. 승인할 때만 반영돼요.",
    loadError: "제안을 불러오지 못했어요. 다시 시도해 주세요.",
    ratified: (level) => `승인됐어요 - 실행가능(L${level})으로 올라갔어요.`,
    declined: "접어둘게요. 이 제안은 반영되지 않았고, 기록에 남지 않습니다.",
    saveFailed: "저장하지 못했어요. 제안은 그대로 있으니 다시 시도해 주세요.",
    saving: "저장 중...",
    reopenProposal: "받은 제안 다시 보기",
  },
  es: {
    lede: "Tu asistente propone un siguiente paso a partir de tus registros. Solo se aplica cuando lo ratificas.",
    loadError: "No se pudo cargar una propuesta. Inténtalo de nuevo.",
    ratified: (level) => `Ratificado - pasó a accionable (L${level}).`,
    declined: "Guardado. Esta propuesta no se aplicó y no deja registro.",
    saveFailed: "No se pudo guardar. La propuesta sigue aquí; inténtalo de nuevo.",
    saving: "Guardando...",
    reopenProposal: "Reabrir la propuesta",
  },
  pt: {
    lede: "Seu assistente propõe um próximo passo a partir dos seus registros. Só é aplicado quando você ratifica.",
    loadError: "Não foi possível carregar uma proposta. Tente novamente.",
    ratified: (level) => `Ratificado - passou para acionável (L${level}).`,
    declined: "Recolhido. Esta proposta não foi aplicada e não deixa registro.",
    saveFailed: "Não foi possível salvar. A proposta continua aqui; tente novamente.",
    saving: "Salvando...",
    reopenProposal: "Reabrir a proposta",
  },
  id: {
    lede: "Asisten Anda mengusulkan langkah berikutnya dari catatan Anda. Ini hanya berlaku saat Anda meratifikasinya.",
    loadError: "Tidak dapat memuat usulan. Coba lagi.",
    ratified: (level) => `Diratifikasi - naik ke dapat ditindaklanjuti (L${level}).`,
    declined: "Disimpan. Usulan ini tidak diterapkan dan tidak meninggalkan catatan.",
    saveFailed: "Tidak dapat menyimpan. Usulan masih ada; coba lagi.",
    saving: "Menyimpan...",
    reopenProposal: "Buka lagi usulan",
  },
};

function reviewCopyLocale(language: string): ReviewCopyLocale {
  const base = language.split("-")[0];
  return base === "ko" || base === "es" || base === "pt" || base === "id" ? base : "en";
}

interface ReviewScreenLegacySessionProps {
  userId: string | null;
  isMinor: boolean | null;
}

function ReviewScreenLegacy() {
  const { userId, isMinor } = useAuth();
  const sessionKey = `${userId ?? "signed-out"}:${isMinor === null ? "pending" : isMinor ? "minor" : "adult"}`;
  return <ReviewScreenLegacySession key={sessionKey} userId={userId} isMinor={isMinor} />;
}

function ReviewScreenLegacySession({ userId, isMinor }: ReviewScreenLegacySessionProps) {
  const { t, i18n } = useTranslation("review");
  const locale = (i18n.language === "ko" ? "ko" : "en") as "en" | "ko";
  const copy = REVIEW_COPY[reviewCopyLocale(i18n.language)];
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<SelfModelProposal | null>(null);
  // Real, resolvable record refs behind the proposal (0060), captured at build
  // time so a ratify can cite the records the card was built from — not the LLM's
  // invented proposal.citations.
  const [evidenceRefs, setEvidenceRefs] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const ratifyPendingRef = useRef(false);
  const [ratifyPending, setRatifyPending] = useState(false);
  const [shifts, setShifts] = useState<TierShift[]>([]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    // D9 (memo §10): surface stars whose tendency has shifted as a re-check nudge.
    loadTierShifts(userId)
      .then((s) => {
        if (active) setShifts(s);
      })
      .catch(() => {
        // best-effort; no shift banner on failure.
      });
    return () => {
      active = false;
    };
  }, [userId]);

  async function generate() {
    if (!userId || isMinor === null || loading || proposal !== null || ratifyPendingRef.current) return;
    setLoading(true);
    setResult(null);
    try {
      const card = await buildPersona(userId, locale, isMinor === true);
      const ctx = proposalContextForStar(card, "now");
      const nextEvidenceRefs = ctx.evidenceRefs;
      const p = await proposeSelfModelChange(
        userId,
        { kind: "star", star: "now" },
        ctx.before,
        ctx.evidence,
        5,
        locale,
        isMinor === true,
      );
      if (p) {
        setEvidenceRefs(nextEvidenceRefs);
        setProposal(p);
        setSheetOpen(true);
      } else {
        setResult(t("noProposal"));
      }
    } catch {
      setResult(copy.loadError);
    } finally {
      setLoading(false);
    }
  }

  async function handleDecision(decision: RatifyDecision) {
    await runRatifyDecisionOnce(ratifyPendingRef, async () => {
      setRatifyPending(true);
      setResult(null);
      try {
        const r = applyRatify(4, decision);
        // propose→ratify quality signal: counts only, consent-gated inside captureEvent.
        captureEvent(
          proposalDecided({ flow: "self_model", decision: decision === "ratify" ? "ratify" : "decline", count: 1 }),
        );
        if (decision === "decline") {
          setProposal(null);
          setSheetOpen(false);
          setResult(copy.declined);
          return;
        }

        let persisted = false;
        try {
          if (userId && proposal?.target.kind === "star") {
            // Persist the ratified tier so D9 history + trend detection reflect it.
            // Cite evidenceRefs (real `record:<id>` for the records this card was built
            // from), NOT proposal.citations — those are Gemini-emitted labels with no
            // real-id whitelist behind them. The write boundary re-sanitizes to
            // resolvable refs only, so a fabricated string could never survive (0060).
            persisted = await recordStarTiers(userId, { [proposal.target.star]: r.resultingLevel }, "journal", {
              origin: "ratify",
              citations: evidenceRefs,
            });
          }
        } catch {
          // The writer is fail-soft, but keep this boundary honest if that contract regresses.
          persisted = false;
        }
        setSheetOpen(false);
        if (persisted) {
          setProposal(null);
          // 승인 = a quick wink (the ratify gesture across the app).
          reactExpression("wink");
        }
        setResult(
          persisted
            ? copy.ratified(r.resultingLevel)
            : copy.saveFailed,
        );
      } finally {
        setRatifyPending(false);
      }
    });
  }

  // D9 re-check nudge, evidence-aware (0060): surfaces how many real records
  // back the shifted stars. Pure helper so the string logic stays tested.
  const nudge = tierShiftNudge(shifts, locale, (id, loc) =>
    resolveStarName(id, loc, (key) => t(`home:ds.star.${key}`)),
  );

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="caption" color="textMuted">{t("eyebrow")}</Text>
        <Text variant="body" style={styles.title}>
          {t("headline")}
        </Text>
        <Text variant="subtle" color="textMuted" style={styles.lede}>
          {copy.lede}
        </Text>
        {nudge ? (
          <Text variant="subtle" color="brand" style={styles.shifts}>{nudge}</Text>
        ) : null}
        <Button
          label={t("cta")}
          variant="primary"
          disabled={loading || ratifyPending || proposal !== null || isMinor === null}
          onPress={generate}
        />
        {loading ? <ActivityIndicator color={cosmic.soulViolet} style={styles.spinner} /> : null}
        {result ? (
          <Text variant="body" color="textMuted" style={styles.result}>{result}</Text>
        ) : null}
        {proposal !== null && !sheetOpen && !loading && !ratifyPending ? (
          <Button
            label={copy.reopenProposal}
            variant="secondary"
            onPress={() => {
              if (!ratifyPendingRef.current) setSheetOpen(true);
            }}
          />
        ) : null}
      </ScrollView>
      <RatifySheet
        proposal={proposal}
        locale={locale}
        visible={sheetOpen}
        pending={ratifyPending}
        pendingLabel={copy.saving}
        onDecision={handleDecision}
        onClose={() => {
          if (!ratifyPendingRef.current) setSheetOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: cosmic.space950 },
  body: { padding: spacing.lg, gap: spacing.sm },
  title: { marginTop: 2 },
  lede: { marginBottom: spacing.sm },
  spinner: { marginTop: spacing.sm },
  result: { marginTop: spacing.sm },
  shifts: { marginBottom: spacing.sm },
});

export default function ReviewScreen() {
  if (isDeepSpaceUI()) return <DeepSpaceReviewScreen />;
  return <ReviewScreenLegacy />;
}
