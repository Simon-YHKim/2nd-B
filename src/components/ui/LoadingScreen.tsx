// LoadingScreen — phase-driven typewriter, adaptive timing, opacity FADE-OUT.
//
// 밤하늘 별자리가 깨어나는 동안 일꾼 세포들이 분주하다 (deep-space canon). 25
// messages across 5 build phases (밤하늘 → 일곱 별 → 별자리 → 북극성 → 환영),
// each ~1.5s. Deep-space worldview (북극성 + 북두칠성 7별), not the legacy village.
//
// Behavior:
//   - Logo starts at opacity 1 and fades OUT to 0 over MIN_INTRO_MS as
//     the typing messages take over. Per user convention: all opacity
//     transitions go 100% → 0%. The brain is being "absorbed into" the
//     cells' typed work.
//   - When ready hits, logo fades back to 1 + grows + pulses (must be
//     visible to invite the tap).
//   - Tap → dolly-zoom to scale 4 → onContinue. /index picks up the
//     same scale 4 + opacity 1 frame so the handoff is seamless.

import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";

import { DeepSpaceBackdrop } from "@/components/deepspace/DeepSpaceBackdrop";
import { PixelSpriteSheet } from "@/components/pixel/PixelSpriteSheet";
import { deepSpace, typography } from "@/lib/theme/tokens";

// 오프닝 스프라이트 시트. `scripts/build-opening-strip.py` 가 **승인된 아틀라스**에서
// 만든다 — 새 그림이 아니라 원본 픽셀이다. 격자 모양은 그 스크립트의 출력과 맞춰야 한다.
const openingSheet = require("../../../assets/opening/hustlek-opening-strip.png");
const OPENING = { frameWidth: 320, frameHeight: 180, cols: 8, frames: 48, frameMs: 80 } as const;

const MESSAGE_SETS = {
  en: [
    "Opening the night sky...",
    "Scattering a first handful of stardust.",
    "Laying the deep-space floor.",
    "Planting the first point of light.",
    "Polishing the place where your constellation will form.",
    "Shaping the seven stars...",
    "Packing light into the first star.",
    "Settling the seven self-understanding stars.",
    "Lighting each star, one spark at a time.",
    "Lifting the stars into the sky.",
    "Drawing paths between stars...",
    "Stretching bright routes across the sky.",
    "Connecting stardust to stardust.",
    "Repairing a broken star path.",
    "Keeping the constellation lines clear.",
    "Lighting Polaris...",
    "Polaris is turning on at the center.",
    "Gathering light from the seven stars.",
    "Clearing the space around Polaris.",
    "Final checks before opening.",
    "Waiting for your first piece of stardust...",
    "Antenna up, ready for a new story.",
    "SecondB is getting the door ready.",
    "Preparing both hands for the first piece.",
    "Ready for the thought you bring in.",
  ],
  ko: [
    "밤하늘 펼치는 중...",
    "영차영차! 별가루 한 줌 뿌리는 중.",
    "우주 바닥 다 깔았다! 일꾼 세포 투입.",
    "읏차! 어둠에 첫 별빛 한 점 심는 중.",
    "별자리 들어설 자리, 반짝반짝 닦는 중!",
    "일곱 별 빚는 중...",
    "빛 한 줌 두 줌, 첫 별 다지기.",
    "자기이해 일곱 별, 자리 잡는 중!",
    "바쁘다 바빠! 별마다 불씨 한 점씩.",
    "별 하나 둘, 하늘 위로 띄우는 중.",
    "별과 별, 길 잇는 중...",
    "쫙쫙! 빛나는 별길 늘이는 중.",
    "별가루와 별가루, 빛 한 가닥씩 연결.",
    "찌릿! 끊긴 별길 이어 붙이는 중.",
    "별자리 엉키지 않게 조심조심!",
    "북극성 불 켜는 중...",
    "탁! 한가운데 북극성 점등.",
    "일곱 별로 빛 모으는 중!",
    "쓱싹쓱싹, 북극성 둘레 대청소.",
    "채비 막바지! 최종 점검.",
    "당신의 별가루를 기다리는 중...",
    "안테나 쫙! 새 이야기 수신 대기.",
    "세컨비 환영 채비 끝, 문 여는 중.",
    "꿀꺽. 첫 별가루 받을 두 손 모으고 대기.",
    "두근두근! 당신의 멋진 생각, 기대 중!",
  ],
  es: [
    "Abriendo el cielo nocturno...",
    "Esparciendo el primer puñado de polvo estelar.",
    "Preparando el suelo del espacio profundo.",
    "Plantando el primer punto de luz.",
    "Puliendo el lugar donde se formará tu constelación.",
    "Dando forma a las siete estrellas...",
    "Cargando luz en la primera estrella.",
    "Colocando las siete estrellas de autoconocimiento.",
    "Encendiendo cada estrella, chispa a chispa.",
    "Elevando las estrellas al cielo.",
    "Trazando caminos entre estrellas...",
    "Extendiendo rutas brillantes por el cielo.",
    "Conectando polvo estelar con polvo estelar.",
    "Reparando un camino de estrellas roto.",
    "Manteniendo claras las líneas de la constelación.",
    "Encendiendo Polaris...",
    "Polaris se enciende en el centro.",
    "Reuniendo luz de las siete estrellas.",
    "Despejando el espacio alrededor de Polaris.",
    "Revisión final antes de abrir.",
    "Esperando tu primera pieza de polvo estelar...",
    "Antena arriba, lista para una nueva historia.",
    "SecondB prepara la puerta.",
    "Preparando ambas manos para la primera pieza.",
    "Listo para la idea que traes.",
  ],
  pt: [
    "Abrindo o céu noturno...",
    "Espalhando o primeiro punhado de poeira estelar.",
    "Preparando o piso do espaço profundo.",
    "Plantando o primeiro ponto de luz.",
    "Polindo o lugar onde sua constelação vai se formar.",
    "Moldando as sete estrelas...",
    "Carregando luz na primeira estrela.",
    "Posicionando as sete estrelas de autoconhecimento.",
    "Acendendo cada estrela, faísca por faísca.",
    "Elevando as estrelas ao céu.",
    "Traçando caminhos entre estrelas...",
    "Estendendo rotas brilhantes pelo céu.",
    "Conectando poeira estelar a poeira estelar.",
    "Reparando um caminho de estrelas quebrado.",
    "Mantendo claras as linhas da constelação.",
    "Acendendo Polaris...",
    "Polaris está se acendendo no centro.",
    "Reunindo luz das sete estrelas.",
    "Limpando o espaço ao redor de Polaris.",
    "Verificações finais antes de abrir.",
    "Esperando sua primeira peça de poeira estelar...",
    "Antena erguida, pronta para uma nova história.",
    "SecondB prepara a porta.",
    "Preparando as duas mãos para a primeira peça.",
    "Pronto para a ideia que você traz.",
  ],
  id: [
    "Membuka langit malam...",
    "Menaburkan segenggam serpihan bintang pertama.",
    "Menyiapkan dasar ruang dalam.",
    "Menanam titik cahaya pertama.",
    "Memoles tempat konstelasimu akan terbentuk.",
    "Membentuk tujuh bintang...",
    "Mengisi cahaya ke bintang pertama.",
    "Menempatkan tujuh bintang pemahaman diri.",
    "Menyalakan tiap bintang, satu percikan demi satu.",
    "Mengangkat bintang-bintang ke langit.",
    "Menggambar jalur antar bintang...",
    "Merentangkan rute terang di langit.",
    "Menghubungkan serpihan bintang ke serpihan bintang.",
    "Memperbaiki jalur bintang yang putus.",
    "Menjaga garis konstelasi tetap jelas.",
    "Menyalakan Polaris...",
    "Polaris menyala di tengah.",
    "Mengumpulkan cahaya dari tujuh bintang.",
    "Membersihkan ruang di sekitar Polaris.",
    "Pemeriksaan akhir sebelum dibuka.",
    "Menunggu serpihan bintang pertamamu...",
    "Antena naik, siap menerima cerita baru.",
    "SecondB menyiapkan pintu.",
    "Menyiapkan dua tangan untuk serpihan pertama.",
    "Siap untuk pikiran yang kamu bawa.",
  ],
} as const;

type LoadingMessageLocale = keyof typeof MESSAGE_SETS;

function messageLocale(language: string | undefined): LoadingMessageLocale {
  if (language === "ko" || language?.startsWith("ko-")) return "ko";
  if (language === "es" || language?.startsWith("es-")) return "es";
  if (language === "pt" || language?.startsWith("pt-")) return "pt";
  if (language === "id" || language?.startsWith("id-")) return "id";
  return "en";
}

// Minimum time the intro plays before we'll allow the ready transition
// — guards instant warm-loads where parent.ready fires in <100ms. 2.5s
// = enough to see the first 1-2 messages.
const MIN_INTRO_MS = 2500;
// Per-message slot in the typing animation: 1s typing + 0.5s hold.
const TYPE_TARGET_MS = 1000;
const HOLD_MS = 500;
const PER_MESSAGE_MS = TYPE_TARGET_MS + HOLD_MS;
// Logo fade-in spans the minimum-intro window so it always lands at 1
// before we even consider going to ready. After that it stays at 1.

const ENTER_READY_MS = 400;    // grow to 1.05 when entering ready
const PULSE_PERIOD_MS = 1400;  // heartbeat full cycle
const ZOOM_MS = 800;           // dolly-zoom on tap
// Safety net: if the user never taps (or can't), auto-continue a few seconds
// after the ready phase so we never sit on the loader forever.
const AUTO_CONTINUE_MS = 4000;
// Hard failsafe: if the parent's `ready` never flips (e.g. an auth/profile
// fetch hangs), the typewriter would otherwise loop on the last message
// forever. After this many ms we force the ready phase regardless, so the app
// always advances (ready -> AUTO_CONTINUE_MS -> in). Generous so a normal
// (fast) load is never cut short by it.
const HARD_READY_MS = 9000;

type Phase = "typing" | "ready" | "zooming";

interface Props {
  /** Parent's actual loading state — fonts, auth, etc. The screen
   *  won't advance to 'ready' until both this flag is true AND
   *  MIN_INTRO_MS has elapsed. Optional: defaults to true. */
  ready?: boolean;
  /** Fires after the dolly-zoom completes. Parent unmounts. */
  onContinue?: () => void;
}

export function LoadingScreen({ ready = true, onContinue }: Props = {}) {
  const { width: winWidth } = useWindowDimensions();
  const { t, i18n } = useTranslation("common");
  const messages = useMemo(() => MESSAGE_SETS[messageLocale(i18n.language)], [i18n.language]);
  const [phase, setPhase] = useState<Phase>("typing");
  const [msgIdx, setMsgIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [minElapsed, setMinElapsed] = useState(false);
  // Set by the HARD_READY_MS failsafe so a hung parent.ready never strands us.
  const [forceReady, setForceReady] = useState(false);

  // Logo starts at opacity 1 and fades OUT during typing — the brain
  // "absorbs into" the cells' work. Comes back to 1 in the ready phase.
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const hintOpacity = useRef(new Animated.Value(0)).current;

  // Synchronous re-entry guard for the zoom. `phase` state is async, so a
  // user tap and the auto-continue timer can both read a stale "ready"
  // phase and each start a zoom (+ fire onContinue twice). This ref flips
  // true the instant either path begins.
  const zoomingRef = useRef(false);

  // ── min-intro gate
  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_INTRO_MS);
    return () => clearTimeout(t);
  }, []);

  // ── hard failsafe: force ready if the parent never resolves loading.
  useEffect(() => {
    const t = setTimeout(() => setForceReady(true), HARD_READY_MS);
    return () => clearTimeout(t);
  }, []);

  // ⚠ 여기 있던 페이드아웃(`opacity 1 → 0`)을 **없앴다.**
  //
  // 정지 로고였을 때는 뜻이 있었다 — 로고가 타자기 글자에 흡수되는 연출이었다.
  // 그런데 오프닝이 **프레임 재생**이 된 지금은 정반대가 된다: 걸어오고 돌아서고
  // 하늘을 보는 그 3.8초 동안 무대가 사라져서 **아무도 못 본다.**
  // 실제로 그랬다 — 프레임은 도는데 화면은 검었다(2026-08-27 실측).
  //
  // 오프닝은 보라고 있는 것이므로 타이핑 중에도 보이는 채로 둔다.

  // ── per-message typewriter — advances until parent.ready & minElapsed
  //    push us into the 'ready' phase below.
  useEffect(() => {
    if (phase !== "typing") return;
    if (msgIdx >= messages.length) return; // last message stays
    const text = messages[msgIdx];
    setTyped("");

    let i = 0;
    const typeId = setInterval(() => {
      i += 1;
      setTyped(text.slice(0, i));
      if (i >= text.length) clearInterval(typeId);
    }, Math.max(20, TYPE_TARGET_MS / text.length));

    const advanceId = setTimeout(() => {
      setMsgIdx((idx) => Math.min(idx + 1, messages.length - 1));
    }, PER_MESSAGE_MS);

    return () => {
      clearInterval(typeId);
      clearTimeout(advanceId);
    };
  }, [messages, msgIdx, phase]);

  // ── transition typing → ready when parent says ready AND min-time elapsed.
  //    No more "wait for typing to finish" — the intro adapts to actual
  //    loading speed per user directive (실제 로딩되는 속도에 맞게).
  useEffect(() => {
    if (phase !== "typing") return;
    if ((!ready && !forceReady) || !minElapsed) return;
    setPhase("ready");
    opacity.stopAnimation();
    scale.stopAnimation();
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: ENTER_READY_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1.05,
        duration: ENTER_READY_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(hintOpacity, {
        toValue: 1,
        duration: ENTER_READY_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Heartbeat — gentle, two-stage pulse.
      Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.15, duration: PULSE_PERIOD_MS / 4, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.05, duration: PULSE_PERIOD_MS / 4, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.10, duration: PULSE_PERIOD_MS / 4, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.05, duration: PULSE_PERIOD_MS / 4, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      ).start();
    });
  }, [phase, ready, forceReady, minElapsed, opacity, scale, hintOpacity]);

  // Auto-continue safety net: if we reach 'ready' and the user doesn't tap
  // within AUTO_CONTINUE_MS, advance anyway so we never strand on the loader.
  useEffect(() => {
    if (phase !== "ready") return;
    const t = setTimeout(() => startZoom(), AUTO_CONTINUE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  function startZoom() {
    if (zoomingRef.current) return;
    zoomingRef.current = true;
    setPhase("zooming");
    scale.stopAnimation();
    hintOpacity.stopAnimation();
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 4,
        duration: ZOOM_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(hintOpacity, {
        toValue: 0,
        duration: ZOOM_MS * 0.4,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onContinue?.();
    });
  }

  function handlePress() {
    if (phase === "typing") {
      // Skip path: assume ready by forcing minElapsed (parent.ready
      // might still be false but most tap-skips are warm reloads).
      setMinElapsed(true);
      return;
    }
    if (phase !== "ready") return;
    // Dolly zoom ends at scale 4 — matches /index's entry initial scale so
    // the loading→main handoff has no size jump. /index then settles to
    // scale 1.6 + opacity 0.4 over 750ms. Routed through the shared
    // startZoom() so the tap and the auto-continue timer share one guard.
    startZoom();
  }

  // Judge-rehearsal finding #3 (260717): the ready-gate hint was hardcoded
  // Korean -- the ONLY Korean surface an English-locale judge hits. (The
  // typewriter MESSAGES stay Korean for now: they are curated 세컨비-voice
  // lines gated by check:mascot-voice, translated as their own task.)
  // 시트 한 칸(320px)의 **정수배**로만 키운다. 화면이 좁으면 1배 미만으로
  // 줄이되, 그 경우는 축소라 셀 경계가 어긋나지 않는다.
  // ⚠ `winWidth` 가 첫 페인트에 0 으로 올 수 있다. 그대로 쓰면 무대가 0×0 이 되고
  //   **프레임은 도는데 화면은 검은** 상태가 된다(2026-08-27 실측). 바닥을 깐다.
  const stageWidth = Math.max(
    160,
    Math.min(winWidth > 0 ? winWidth - 32 : OPENING.frameWidth, OPENING.frameWidth),
  );

  const accessibilityLabel =
    phase === "ready" ? t("loadingGate.open") : phase === "zooming" ? t("loadingGate.opening") : t("loadingGate.loading");
  const accessibilityHint =
    phase === "ready" ? t("loadingGate.enterHint") : t("loadingGate.skipHint");

  return (
    <Pressable
      onPress={handlePress}
      disabled={phase === "zooming"}
      style={styles.root}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: phase !== "ready", disabled: phase === "zooming" }}
    >
      <DeepSpaceBackdrop />
      {/* 오프닝은 **프레임 재생**이다. 전에는 정지 초상 한 장의 opacity·scale
          트윈이었고, 그래서 걸음·회전·접안이 전부 사라져 있었다
          (design/OPENING-AUDIT-260827.md). 다섯 비트를 순서대로 살린다:
          등장 -> 접근 -> 정착 -> 시선 -> 도착.
          ⚠ 프레임 재생 자체가 계단이다(규칙 5). 여기 곡선 이징을 얹지 말 것. */}
      <Animated.View style={[styles.stage, { opacity, transform: [{ scale }] }]}>
        <PixelSpriteSheet
          source={openingSheet}
          frameWidth={OPENING.frameWidth}
          frameHeight={OPENING.frameHeight}
          cols={OPENING.cols}
          frames={OPENING.frames}
          frameMs={OPENING.frameMs}
          displayWidth={stageWidth}
        />
      </Animated.View>
      {phase === "typing" ? (
        <Text style={styles.text}>
          {typed}
          <Text style={styles.caret}>▍</Text>
        </Text>
      ) : null}
      {phase === "ready" ? (
        <Animated.Text style={[styles.hint, { opacity: hintOpacity }]}>
          {t("loadingGate.hint")}
        </Animated.Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: deepSpace.bgEdge,
    gap: 32,
  },
  // 오프닝 무대. 폭은 화면에서 계산한다(아래 stageWidth) — 시트 한 칸이
  // 320×180 이라 정수배로 키워야 픽셀이 안 흐려진다.
  stage: { alignItems: "center", justifyContent: "center" },
  text: {
    color: deepSpace.textHi,
    fontSize: typography.sizes.md,
    letterSpacing: 0,
    minHeight: 22,
  },
  caret: { color: deepSpace.mint, opacity: 0.85 },
  hint: {
    color: deepSpace.soul,
    fontSize: typography.sizes.sm,
    letterSpacing: 0,
    textAlign: "center",
  },
});
