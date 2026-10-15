// REVIVE SOURCE (되살리기 원본) — moved out of the build on 2026-10-05.
//
//   was:  src/app/core-brain.tsx   (the legacy tail of CoreBrainScreen + CoreShell's legacy arm + the helpers and styles only it used)
//   why:  the EXPO_PUBLIC_UI rollback lever itself was removed (Simon decision
//         Q-261004-11 C), so this half is in no build at all. It is kept in the
//         repo as a revive source (Q-261004-12 A, conflict resolution 1): move
//         what is worth keeping into the shipped Polaris deck (CoreBrainScreen's deep-space block) first.
//   read: an EXCERPT, not the whole file. The route stays live and kept its
//         deep-space half; only the pieces the lever made dead are copied
//         below, verbatim, with their original line numbers. The imports
//         are not repeated: they resolve against the route file at e0b274d0.
//         A byte copy of the whole route file also sits at
//         E:/Legacy/2ndB/src/app/core-brain.tsx (MANIFEST batch qa261004-lever).
//   run:  not buildable from here — legacy/ is excluded from tsconfig, jest,
//         eslint and metro, and src/lib/ui-mode.ts no longer exists. To run it,
//         read the route file from history:
//           git show e0b274d0:src/app/core-brain.tsx
//
// 되살린 뒤: 되살리기가 끝나면 이 파일을 git rm 하고 INDEX.md 표에서 줄을 뺀다.
// 그 뒤로는 E:/Legacy/2ndB 사본과 git 이력만 남는다(결정 Q-261004-12 A · 상충 해소 ①).
//
// Nothing in src/ imports this file. See legacy/screens/INDEX.md.


// Imports only this half used (src/app/core-brain.tsx @e0b274d0):
//   React (default) · PremiumAppShell · PremiumCTA · SceneHero · StatTile
//   (@/components/premium) · HOME_STAR_IDS (@/lib/persona/home-stars) ·
//   brightnessVisual · brightnessBand · BrightnessBand
//   (@/lib/persona/brightness-visual) · CompanionMoment
//   (@/components/art/CompanionSprite) · CORE_VILLAGE_UI (@/lib/village-ui)

// ---- lines 50-58: imports the loaders below used (only these lines) ----
import type { DomainId } from "@/lib/persona/domain-stars";
import { loadDomainLevels, type DomainBrightness } from "@/lib/persona/load-domain-levels";
import { listInferredLinkDetails } from "@/lib/wiki/queries";
import { loadProfileStarLevel } from "@/lib/persona/load-profile-star";
import type { LadderLevel } from "@/lib/persona/brightness";

// ---- lines 71-73 ----
// D-25: Polaris brightness shows as a qualitative band, never a raw %.
const SOUL_CORE_BAND_KO: Record<BrightnessBand, string> = { dim: "흐릿", fair: "보통", bright: "밝음" };
const SOUL_CORE_BAND_EN: Record<BrightnessBand, string> = { dim: "dim", fair: "fair", bright: "bright" };

// ---- lines 141-154: CoreShell (the PremiumAppShell arm is the dead one) ----
// identical and live in both. (LensView is the 7-axis per-trait view — wrong fit
// for the aggregate Polaris readout, so it is no longer used here.)
//
// 2026-09-30 (Simon localhost QA): on deep-space the Polaris is a card over the
// constellation, not a page. The route is a transparent modal and the shell is
// PolarisCardOverlay (swipe up / down to close, left / right through the deck).
// States that are not a deck (loading, load error) sit in one Polaris card.
function CoreShell({ children, deck = false }: { children: ReactNode; deck?: boolean }) {
  return isDeepSpaceUI() ? (
    <PolarisCardOverlay>{deck ? children : <PolarisCardSurface>{children}</PolarisCardSurface>}</PolarisCardOverlay>
  ) : (
    <PremiumAppShell>{children}</PremiumAppShell>
  );
}

// ---- lines 198-331: CoreBrainScreen() state and loads, verbatim. The live
// route kept most of this; what left with the tail is domainBrightness +
// loadDomainLevels, profileLevel + loadProfileStarLevel, and pendingLinkCount +
// listInferredLinkDetails (the /digest 'next step' door, Q-261004-34). ----
function CoreBrainScreenLegacyLoads() {
  const [persona, setPersona] = useState<PersonaCard | null>(null);
  const [evidence, setEvidence] = useState<OriginShard[]>([]);
  const [domainBrightness, setDomainBrightness] = useState<DomainBrightness | null>(null);
  const [sevenLevels, setSevenLevels] = useState<SevenLevels | null>(null);
  const [profileLevel, setProfileLevel] = useState<LadderLevel | null>(null);
  const [strengths, setStrengths] = useState<LoadedStrengths | null>(null);
  const [building, setBuilding] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadErrorUserId, setLoadErrorUserId] = useState<string | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [evidenceReloadKey, setEvidenceReloadKey] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingLinkCount, setPendingLinkCount] = useState(0);
  const [portraitSignals, setPortraitSignals] = useState<SelfPortraitSignals | null>(null);
  const [roleCards, setRoleCards] = useState<RoleCard[]>([]);
  const [roleCardsUserId, setRoleCardsUserId] = useState<string | null>(null);
  const [rolePending, setRolePending] = useState(false);
  const [roleError, setRoleError] = useState(false);
  const [roleErrorCode, setRoleErrorCode] = useState("");
  const [quota, setQuota] = useState<PolarisQuota | null>(null);
  const roleBusy = useRef(false);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const { moment: companionMoment, fire: fireCompanion } = useCompanionMoment();

  useEffect(() => {
    // The snapshot path is SELECT-only. Still wait for auth/profile hydration so
    // the effect cannot query under an unresolved or stale user identity.
    if (loading || !userId || hasProfile !== true || isMinor === null) return;
    let cancelled = false;
    setBuilding(true);
    setLoadError(false);
    setLoadErrorUserId(null);
    setPortraitSignals(null);
    (async () => {
      try {
        const [ev, nextDomainBrightness, nextStars, nextProfileLevel, nextStrengths] = await Promise.all([
          loadCoreBrainEvidence(userId, locale),
          loadDomainLevels(userId).catch(() => null),
          loadSevenLevels(userId).catch(() => null),
          loadProfileStarLevel(userId).catch(() => null),
          loadLatestStrengths(getSupabaseClient(), userId).catch(() => null),
        ]);
        const snapshot = ev.length > 0 ? await loadPersonaSnapshot(userId) : null;
        const p = snapshot && nextStars
          ? { ...snapshot, soulCoreBrightness: nextStars.northStarBrightness }
          : snapshot;
        if (!cancelled) {
          setEvidence(ev);
          setPersona(p);
          setDomainBrightness(nextDomainBrightness);
          setSevenLevels(nextStars);
          setProfileLevel(nextProfileLevel);
          setStrengths(nextStrengths);
          setResolvedUserId(userId);
          // 아치 lights up when the center surfaces a fresh connection (companion pack §3).
          if (p) fireCompanion("connectionFound");
        }
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[core-brain] load failed", (e as Error).message);
        if (!cancelled) {
          setPersona(null);
          setEvidence([]);
          setDomainBrightness(null);
          setSevenLevels(null);
          setProfileLevel(null);
          setStrengths(null);
          setPortraitSignals(null);
          setResolvedUserId(null);
          setLoadError(true);
          setLoadErrorUserId(userId);
        }
      } finally {
        if (!cancelled) setBuilding(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, userId, hasProfile, isMinor, locale, fireCompanion, reloadKey]);

  // /digest 조건부 문("다음 한 걸음")의 게이트 — 스냅샷 mount 로드는 SELECT-only
  // 단일 로드라는 계약(위 이펙트 주석·core-brain-minor-gate.test)이 있어 거기에
  // 합류시키지 않는다. 이 보조 조회는 실패·지연해도 화면 빌드를 막지 않는다.
  useEffect(() => {
    if (loading || !userId || hasProfile !== true || isMinor === null) return;
    let cancelled = false;
    listInferredLinkDetails(userId)
      .then((links) => {
        if (!cancelled) setPendingLinkCount(links.length);
      })
      .catch(() => {
        if (!cancelled) setPendingLinkCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [loading, userId, hasProfile, isMinor, reloadKey]);
  // Re-focus refreshes only cheap DB evidence. The initial/retry path above is
  // also read-only; persona synthesis and persistence require an explicit action.
  useFocusRefetch(() => setEvidenceReloadKey((k) => k + 1), Boolean(userId && hasProfile === true));

  useEffect(() => {
    if (evidenceReloadKey === 0 || !userId || hasProfile !== true || resolvedUserId !== userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [ev, nextDomainBrightness, nextStars, nextStrengths] = await Promise.all([
          loadCoreBrainEvidence(userId, locale),
          loadDomainLevels(userId).catch(() => null),
          loadSevenLevels(userId).catch(() => null),
          loadLatestStrengths(getSupabaseClient(), userId).catch(() => null),
        ]);
        if (!cancelled) {
          setEvidence(ev);
          if (nextDomainBrightness) setDomainBrightness(nextDomainBrightness);
          if (nextStars) setSevenLevels(nextStars);
          setStrengths(nextStrengths);
          setLoadError(false);
          setLoadErrorUserId(null);
        }
      } catch (e) {
        if (typeof console !== "undefined") console.warn("[core-brain] evidence refresh failed", (e as Error).message);
        if (!cancelled) {
          setLoadError(true);
          setLoadErrorUserId(userId);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, hasProfile, locale, evidenceReloadKey, resolvedUserId]);
}

// ---- lines 534-550: derived values the tail read (direction · neighborhood ·
// filledFields · domainLevels left with it) ----
function CoreBrainScreenLegacyDerived() {
  const visibleRoleCards = roleCardsUserId === userId ? roleCards : [];
  const cards = persona ? buildCoreCenterCards(persona, locale) : [];
  const direction = cards.find((c) => c.id === "direction");
  const neighborhood = cards.find((c) => c.id === "neighborhood");
  const pieces = cards.find((c) => c.id === "pieces");

  // 나의 모습 — the 5-field self-portrait (who / forWhom / goal / do / fuel).
  // Data contract: only measured fields are filled. Collecting rows point to an
  // honest next step; filled rows point to records filtered to their evidence.
  // The remaining three fields disclose that automatic summary is not wired yet.
  // Trait provenance gates generated role/direction copy, not these independent
  // measurement reads. They refresh on focus and can predate persona synthesis.
  const portrait = buildSelfPortrait({ persona: portraitSignals }, locale);

  const filledFields = portrait.filter((f) => f.status === "filled").length;
  const domainLevels: Record<DomainId, LadderLevel> | undefined = domainBrightness?.domainLevels;
  const starBrightness = sevenLevels?.northStarBrightness ?? null;
}

// ---- lines 858-1043: the end of CoreBrainScreen(), after the
// `if (isDeepSpaceUI()) { ... return <CoreShell deck>...; }` block at line 622 ----
function CoreBrainScreenLegacyTail() {
  return (
    <CoreShell>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SceneHero
          eyebrow={t("soulCoreEyebrow")}
          title={t("piecesGather")}
          subtitle={t("connectingLately")}
          island={CORE_VILLAGE_UI.island}
          worker={CORE_VILLAGE_UI.worker}
          accent={CORE_VILLAGE_UI.accent}
          speech={CORE_VILLAGE_UI.speech[locale]}
          primaryAction={{
            label: t("askSecondB"),
            onPress: () => router.push({ pathname: "/secondb", params: { fromNode: t("myCenter") } }),
          }}
        />
        <View style={styles.statRow}>
          <StatTile value={evidence.length} label={t("piecesWord")} accent={cosmic.pixelLamp} />
          <StatTile value={`${filledFields}/5`} label={t("selfPortrait")} accent={cosmic.soulViolet} />
          <StatTile value={persona?.values.length ?? 0} label={t("areasWord")} accent={cosmic.signalMint} />
          <StatTile
            value={
              locale === "ko"
                ? SOUL_CORE_BAND_KO[brightnessBand(persona?.soulCoreBrightness ?? 0.2)]
                : SOUL_CORE_BAND_EN[brightnessBand(persona?.soulCoreBrightness ?? 0.2)]
            }
            label={t("brightnessWord")}
            accent={cosmic.soulViolet}
          />
        </View>

        {/* 3) 요즘 가장 밝은 연결 */}
        {direction ? (
          <Section title={t("brightestConn")} accent={direction.accent}>
            <Text variant="body">{direction.body}</Text>
          </Section>
        ) : null}

        {/* 4) 밝아진 동네 / 영역 */}
        {neighborhood ? (
          <Section title={t("litNeighborhood")} accent={neighborhood.accent}>
            <Text variant="body">{neighborhood.body}</Text>
          </Section>
        ) : null}

        {/* 5) 자주 보이는 나의 모습 — 5-field self-portrait (data contract) */}
        <Section title={t("sideOfMe")} accent={cosmic.soulViolet}>
          <View style={styles.fieldList}>
            {portrait.map((field) => (
              <TouchableOpacity
                key={field.id}
                style={styles.fieldRow}
                activeOpacity={0.7}
                onPress={() => router.push(field.route as never)}
                accessibilityRole="button"
                accessibilityLabel={field.value ? `${field.label}: ${field.value}` : field.label}
                accessibilityHint={field.actionHint}
              >
                <View
                  style={[styles.fieldDot, { backgroundColor: field.status === "filled" ? cosmic.signalMint : semantic.border }]}
                />
                <View style={{ flex: 1 }}>
                  <Text variant="caption" color="textMuted" style={styles.fieldLabel}>{field.label}</Text>
                  {field.status === "filled" ? (
                    <Text variant="body">{field.value}</Text>
                  ) : (
                    <Text variant="subtle" color="textSubtle">{field.hint}</Text>
                  )}
                </View>
                <Text
                  variant="caption"
                  color="brand"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  →
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Over-trust / EU AI Act Art.50 + GDPR Art.12 (research 2026-06-28): the
              inferred persona must be disclosed as a generative approximation, not
              authoritative self-knowledge. The legacy persona screen says this; the
              canon soul-core did not, so it is added here on the inferred-self card. */}
          <Text variant="caption" color="textSubtle" style={{ marginTop: 8 }}>
            {t("aiApprox")}
          </Text>
          <Button
            label={t("lookAround")}
            variant="secondary"
            onPress={() => router.push("/persona")}
          />
        </Section>

        {/* 5b) 나를 아는 일곱 가지 — 홈이 그리는 그 일곱 (6 도메인 + 프로필).
            Simon 결정 2026-08-21: 폐기되는 심리 구인 대신 도메인을 보여준다.
            잠긴 상태(위 lockedStarRow)가 이미 도메인을 그리고 있었으므로, 이제
            잠금 전후가 **같은 일곱**을 말한다 -- 전에는 서로 달랐다.
            "곧" 배지는 사라졌다. 그건 엔진이 없는 구인 둘을 가리키던 것인데,
            도메인은 일곱 다 실재한다. 없는 걸 광고하지 않게 된다. */}
        {domainLevels ? (
          <Section title={t("sevenWays")} accent={cosmic.soulViolet}>
            <View style={styles.starRow}>
              {HOME_STAR_IDS.map((id) => {
                // 2026-08-24: 일곱이 생활 도메인에서 **나를 알아가는 자리**로 바뀌었다.
                // 이름은 홈 별자리와 같은 키(`ds.star.*`)에서 읽어 두 화면이 갈라지지
                // 않게 한다. 밝기는 아직 도메인 등급을 쓰지 않는다 -- 시기별 밝기는
                // 다음 단계(커버리지 연결)에서 붙는다.
                const level = id === "profile" ? profileLevel : null;
                const v = brightnessVisual(level ?? 1);
                const name = tHome(`ds.star.${id}`);
                return (
                  <View key={id} style={styles.starItem}>
                    <View style={[styles.starDot, { opacity: v.opacity }]} />
                    <Text variant="caption" color="textMuted" style={styles.starName}>
                      {name}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Section>
        ) : null}

        {/* 6) 이걸 만든 별가루들 — evidence */}
        <Section title={t("piecesBehind")} accent={cosmic.pixelLamp}>
          {pieces ? <Text variant="body" style={{ marginBottom: spacing.sm }}>{pieces.body}</Text> : null}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setDrawerOpen(true)}
            style={styles.evidenceBtn}
            accessibilityRole="button"
            accessibilityLabel={
              t("seeEvidencePieces", { n: evidence.length })
            }
          >
            <Text variant="body" color="brand">
              {t("seePieces", { n: evidence.length })}
            </Text>
          </TouchableOpacity>
        </Section>

        {/* 7) 다음 한 걸음 */}
        <Section title={t("nextStep")} accent={cosmic.signalMint}>
          <Text variant="body" color="textMuted" style={{ marginBottom: spacing.sm }}>
            {t("narrowStep")}
          </Text>
          <Button
            label={t("openNewAngle")}
            variant="secondary"
            onPress={() => router.push({ pathname: "/secondb", params: { mode: "divergent" } })}
          />
          <Button
            label={t("reviewProposal")}
            variant="primary"
            onPress={() => router.push("/review")}
          />
          {/* 위 /review 버튼은 self-model 비준 진입(#807)이라 목적지를 바꾸지 않는다.
              아래는 별개의 문: 추론된 위키 링크 비준(/digest)은 진입이 알림함 조건부
              카드 하나뿐이었다(2026-09-01 감사 THIN·Q2-2 승인). 알림함 카드와 같은
              게이트(대기 링크 1건 이상)만 열린다 — 빈 화면으로 유인하지 않는다. */}
          {pendingLinkCount > 0 ? (
            <Button
              label={t("openDigest", { n: pendingLinkCount })}
              variant="secondary"
              onPress={() => router.push("/digest")}
            />
          ) : null}
        </Section>

        {/* 8) 세컨비에게 이 중심으로 묻기 */}
        <PremiumCTA
          label={t("askAboutCenter")}
          variant="secondary"
          onPress={() => router.push({ pathname: "/secondb", params: { fromNode: t("myCenter") } })}
        />
      </ScrollView>

      {renderEvidenceDrawer()}
      {/* 아치 appears briefly when a fresh connection surfaces (companion pack §3) */}
      {companionMoment ? (
        <CompanionMoment moment={companionMoment} style={styles.companionFlash} />
      ) : null}
    </CoreShell>
  );
}

// ---- lines 1049-1056 ----
function Section({ title, accent, children }: { title: string; accent: string; children: ReactNode }) {
  return (
    <View style={[styles.section, { borderStartColor: accent }]}>
      <Text variant="caption" color="textMuted" style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// ---- lines 1058-1102: the whole styles sheet (the live half still uses some keys) ----
const styles = StyleSheet.create({
  scroll: { gap: spacing.lg, paddingBottom: 110 },
  companionFlash: { position: "absolute", bottom: 40, right: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg },
  hero: { alignItems: "center" },
  statRow: { flexDirection: "row", justifyContent: "space-around", gap: spacing.sm },
  starRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "space-between" },
  starItem: { width: "30%", alignItems: "center", gap: 4 },
  starDot: { width: 14, height: 14, borderRadius: m3.shape.none, backgroundColor: cosmic.soulViolet },
  starName: { textAlign: "center", fontSize: 11 },
  starSoon: { textAlign: "center", fontSize: 9, letterSpacing: 1 },
  section: {
    backgroundColor: semantic.surface,
    borderColor: semantic.border,
    borderWidth: 1,
    borderStartWidth: 3,
    borderRadius: 0,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  fieldList: { gap: spacing.xs },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  fieldLabel: { letterSpacing: 0 },
  fieldDot: { width: 8, height: 8, borderRadius: m3.shape.none },
  evidenceBtn: { paddingVertical: spacing.xs, minHeight: 44, justifyContent: "center" },
  emptyActions: { gap: spacing.md, marginTop: spacing.xl, width: "100%", maxWidth: 320 },
  backdrop: { flex: 1, justifyContent: "flex-end" },
  drawer: {
    backgroundColor: semantic.surface,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderColor: semantic.border,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: "70%",
  },
  drawerHandle: { alignSelf: "center", width: 36, height: 4, borderRadius: m3.shape.none, backgroundColor: semantic.border, marginBottom: spacing.sm },
  sectionTitle: { letterSpacing: 0, marginBottom: spacing.xs },
  evRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  evDot: { width: 6, height: 6, borderRadius: m3.shape.none, backgroundColor: semantic.brand },
  // Empty-state locked constellation: Tier-1 core + a dim ring of seven stars.
  lockedConstellation: { alignItems: "center", gap: spacing.md },
  lockedStarRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "center", maxWidth: 320 },
});
