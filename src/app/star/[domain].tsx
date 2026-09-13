// 도메인 별 렌즈 (rev2 11-star): tapping a life-domain star on the home
// constellation opens THIS screen — a per-domain lens, not the flat wiki list.
// Mirrors the reference 11-star: domain header, a 세컨비 briefing, the
// paired actions, and a distinct visual lens for every life domain.
//
// HONESTY: the reference briefing shows a fabricated analysis ("최근 3주의 64%가
// 일이었어요"). We never invent that — the briefing derives from the real record
// count, or a neutral prompt when the star is empty (same real-or-neutral
// discipline as the values/data/career screens). Structured sources such as
// the ledger, people map, recreation items and health samples stay real too.
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Redirect, router, useLocalSearchParams } from "expo-router";

import {
  DomainStarLens,
  type DomainLensRecord,
} from "@/components/deep-space/DomainStarLens";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { MdButton, MdCard, m3TextStyle } from "@/components/m3";
import { SecondbHead } from "@/components/deepspace/SecondbHead";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PremiumLoadingState } from "@/components/premium";
import { useAuth } from "@/lib/auth/AuthContext";
import { useFocusRefetch } from "@/lib/nav/use-focus-refetch";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DOMAIN_STARS, getDomainStar, isDomainId, domainTagFor, type DomainId } from "@/lib/persona/domain-stars";
import { evidenceDateLabel } from "@/lib/persona/evidence";
import { loadDomainLevels } from "@/lib/persona/load-domain-levels";
import type { LadderLevel } from "@/lib/persona/brightness";
import { filedDomainOf } from "@/lib/records/domain-screen";
import { getPieceSummary, parsePieceId, type PieceSummary } from "@/lib/records/get-piece";
import { m3 } from "@/lib/theme/m3";
import { deepSpace, flattenAlpha } from "@/lib/theme/tokens";

// ⚠ **바탕 선언** (PIXEL-CLAY 규칙 4 — 정적 반투명 금지).
//   이 화면은 `DeepSpaceScreen` 의 스테이지 위에 앉는다 — 스테이지가
//   `stageFloor` 를 0.92 로 깔고 그 아래가 `bgEdge` 다.
//   바탕이 틀리면 알파를 그대로 두는 것보다 나쁘니 옮기는 사람은 여기부터 다시 재야 한다.
const STAR_GROUND = flattenAlpha(m3.accent.stageFloor, 0.92, deepSpace.bgEdge);
const starAlpha = (c: string, a: number): string => flattenAlpha(c, a, STAR_GROUND);


// Layer B remains hidden: this slot mirrors the prototype's compact top-bar
// caption with the domain's own visual lens, not a psychological construct.
type ShippedLocale = "en" | "ko" | "es" | "pt" | "id";
type LocaleCopy = Record<ShippedLocale, string>;

function shippedLocale(language: string | undefined): ShippedLocale {
  const base = language?.toLowerCase().split("-")[0];
  if (base === "ko" || base === "es" || base === "pt" || base === "id") return base;
  return "en";
}

const DOMAIN_HEADER_META: Record<DomainId, LocaleCopy> = {
  career: { en: "Built path", ko: "쌓아온 길", es: "Trayectoria", pt: "Caminho construído", id: "Jalur yang dibangun" },
  finance: { en: "Monthly flow", ko: "이번 달 흐름", es: "Flujo mensual", pt: "Fluxo do mês", id: "Alur bulanan" },
  growth: { en: "Record chapters", ko: "기록의 시간대", es: "Capítulos", pt: "Capítulos", id: "Bab catatan" },
  relation: { en: "My people", ko: "나의 사람들", es: "Mi gente", pt: "Minhas pessoas", id: "Orang-orangku" },
  health: { en: "Health records", ko: "건강 기록", es: "Registros de salud", pt: "Registros de saúde", id: "Catatan kesehatan" },
  recreation: { en: "Rest map", ko: "휴식 지도", es: "Mapa de descanso", pt: "Mapa de descanso", id: "Peta istirahat" },
  collect: { en: "To organize", ko: "정리 대기", es: "Por organizar", pt: "Para organizar", id: "Perlu dirapikan" },
};

const DOMAIN_ACTION: Record<
  DomainId,
  { primary: LocaleCopy; secondary: LocaleCopy; route: string }
> = {
  career: {
    primary: { en: "Add achievement", ko: "성과 입력", es: "Añadir logro", pt: "Adicionar conquista", id: "Tambah pencapaian" },
    secondary: { en: "Drill Down", ko: "Drill Down", es: "Profundizar", pt: "Aprofundar", id: "Gali lebih dalam" },
    route: "/career-drilldown",
  },
  finance: {
    primary: { en: "Add entry", ko: "내역 입력", es: "Añadir entrada", pt: "Adicionar item", id: "Tambah entri" },
    secondary: { en: "Open ledger", ko: "가계 보기", es: "Abrir libro", pt: "Abrir livro", id: "Buka buku catatan" },
    route: "/ledger",
  },
  growth: {
    primary: { en: "Add a moment", ko: "장면 담기", es: "Añadir momento", pt: "Adicionar momento", id: "Tambah momen" },
    secondary: { en: "Reflect", ko: "회상하기", es: "Reflexionar", pt: "Refletir", id: "Refleksi" },
    // Keep the source star through period selection and the interview so the
    // saved recall returns here and carries an explicit growth-domain intent.
    route: "/audit?origin=domain-growth",
  },
  relation: {
    primary: { en: "Add a person", ko: "사람 담기", es: "Añadir persona", pt: "Adicionar pessoa", id: "Tambah orang" },
    secondary: { en: "People map", ko: "사람 지도", es: "Mapa de personas", pt: "Mapa de pessoas", id: "Peta orang" },
    route: "/people",
  },
  health: {
    primary: { en: "Add a record", ko: "기록 담기", es: "Añadir registro", pt: "Adicionar registro", id: "Tambah catatan" },
    secondary: { en: "Connect data", ko: "데이터 연결", es: "Conectar datos", pt: "Conectar dados", id: "Hubungkan data" },
    // "/import" hosts the actual device-health connect path (Health Connect /
    // HealthKit ingest into health_samples — the table this star's
    // crossSourceAgreement reads). "/import-hub"'s health FILE import lands in
    // `sources` and can never feed health_samples, so the star's own CTA was
    // pointing at the one import surface that could not light it (P0②).
    route: "/import",
  },
  recreation: {
    primary: { en: "Add rest", ko: "휴식 담기", es: "Añadir descanso", pt: "Adicionar descanso", id: "Tambah istirahat" },
    secondary: { en: "Rest map", ko: "휴식 지도", es: "Mapa de descanso", pt: "Mapa de descanso", id: "Peta istirahat" },
    route: "/rest",
  },
  collect: {
    primary: { en: "Capture", ko: "담기", es: "Capturar", pt: "Capturar", id: "Tangkap" },
    secondary: { en: "See records", ko: "기록 보기", es: "Ver registros", pt: "Ver registros", id: "Lihat catatan" },
    route: "/records",
  },
};

async function listDomainRecords(userId: string, domain: DomainId): Promise<DomainLensRecord[]> {
  const { data, error } = await getSupabaseClient()
    .from("records")
    .select("id, topic, body, created_at, audit_period")
    .eq("user_id", userId)
    .contains("tags", [domainTagFor(domain)])
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw error;
  return (data ?? []) as DomainLensRecord[];
}

function StarHeaderAction({
  caption,
  level,
}: {
  caption: string;
  level: LadderLevel | null;
}) {
  const displayLevel = level ?? 1;
  return (
    <View style={s.headerAction}>
      <RNText style={[m3TextStyle("bodySmall"), s.headerCaption]} numberOfLines={1}>
        {caption}
      </RNText>
      <View style={s.headerGauge}>
        {[1, 2, 3, 4, 5].map((value) => (
          <View
            key={value}
            style={[s.headerSegment, value <= displayLevel ? s.headerSegmentOn : s.headerSegmentOff]}
          />
        ))}
      </View>
      <RNText style={[m3TextStyle("labelMedium"), s.levelText]}>{`L${displayLevel}`}</RNText>
    </View>
  );
}

// The seven domain stars are a fixed set, so pre-render one static page per
// domain in the web export. Without this, /star/<domain> has no static HTML on
// GitHub Pages and a direct hit falls back to 404.html; pre-rendering makes each
// lens resolve on a direct URL and keeps the route in the client route tree.
export async function generateStaticParams(): Promise<{ domain: string }[]> {
  return DOMAIN_STARS.map((d) => ({ domain: d.slug }));
}

export default function DomainStarScreen() {
  const { domain, pieceId } = useLocalSearchParams<{ domain: string; pieceId?: string | string[] }>();
  const { t, i18n } = useTranslation("deepspace");
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  const locale = shippedLocale(i18n.resolvedLanguage ?? i18n.language);
  const { userId, loading } = useAuth();

  const [rows, setRows] = useState<DomainLensRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [level, setLevel] = useState<LadderLevel | null>(null);

  const valid = typeof domain === "string" && isDomainId(domain);
  const domainId = valid ? (domain as DomainId) : null;

  // P1 (Simon 결정 2026-09-13 22:26): /capture 저장 후 버튼과 기록 상세의 영역 버튼이
  // pieceId 로 가리킨 조각 하나를 이 화면 맨 위에 보여준다. 아래 목록은 records 만 읽어서,
  // /capture 가 저장한 소스는 이 카드가 아니면 여기서 안 보인다.
  //
  // 주소에는 누구든 아무 id 나 넣을 수 있다. 그래서 형식을 통과한 id 만 읽고
  // (parsePieceId), 읽기는 본인 행으로 좁히며(getPieceSummary: user_id 필터 + owner RLS),
  // 그 조각이 이 영역에 담긴 것일 때만 보여준다. 남의 id · 없는 id · 읽기 실패는 전부
  // "카드 없음"이다. 에러 화면도, id 나 태그가 남는 로그도 없다.
  const pieceRef = parsePieceId(pieceId);
  const pieceOrigin = pieceRef?.origin ?? null;
  const pieceUuid = pieceRef?.uuid ?? null;

  // 몇 번째 읽기인가. 읽은 결과는 자기 읽기 번호를 달고 온다.
  //
  // M1 (PR #1812 인가 게이트, 2026-09-14): 카드를 눌러 상세에서 이 조각의 영역을 옮기고 뒤로
  // 오면, 이 화면은 마운트된 채 주소도 그대로라 읽기가 다시 돌지 않았고 처음 읽은 태그로 옛
  // 영역의 카드가 남았다. 그래서 포커스가 돌아올 때마다 한 번 더 읽는다. 처음 뜰 때의 읽기는
  // 아래 effect 가 맡는다(useFocusRefetch 는 첫 포커스를 건너뛴다). 폴링도 자동 재시도도 없다.
  const [pieceReadNo, setPieceReadNo] = useState(0);
  const [pieceResult, setPieceResult] = useState<{
    readNo: number;
    piece: PieceSummary | null;
  } | null>(null);
  useFocusRefetch(() => setPieceReadNo((n) => n + 1), Boolean(userId && domainId && pieceUuid));

  useEffect(() => {
    if (!userId || !domainId || !pieceOrigin || !pieceUuid) return;
    let alive = true;
    getPieceSummary(userId, { origin: pieceOrigin, uuid: pieceUuid })
      .then((found) => {
        if (alive) setPieceResult({ readNo: pieceReadNo, piece: found });
      })
      .catch(() => {
        if (alive) setPieceResult(null);
      });
    return () => {
      alive = false;
    };
  }, [userId, domainId, pieceOrigin, pieceUuid, pieceReadNo]);

  // 지금 읽기의 결과만 쓴다. 돌아와서 다시 읽는 동안에는 지난 읽기의 카드를 보이지 않는다 -
  // 옛 태그로 "여기 담겼어요"라고 잠깐이라도 말하느니 다 읽을 때까지 비워 둔다.
  const shownPiece = pieceResult !== null && pieceResult.readNo === pieceReadNo ? pieceResult.piece : null;

  // 지금 주소가 가리키는 조각이고 이 영역에 담긴 것일 때만 보인다. 주소가 바뀌어 새 읽기가
  // 끝나기 전에도 지난 조각이 남아 보이지 않는다. 담긴 곳은 domain: 태그로 잰다 - /capture 의
  // 기록 저장은 collect 로도 보내므로(Simon 결정 2026-09-14 01:45) 생활 영역만 보는 lifeDomainOf 가
  // 아니라 filedDomainOf 다. 태그가 없는 조각은 어느 영역에도 담긴 것이 아니다.
  const piece =
    shownPiece !== null &&
    shownPiece.origin === pieceOrigin &&
    shownPiece.uuid === pieceUuid &&
    domainId !== null &&
    filedDomainOf(shownPiece.tags) === domainId
      ? shownPiece
      : null;

  const refresh = useCallback(() => {
    if (!userId || !domainId) return;
    listDomainRecords(userId, domainId)
      .then((r) => {
        setRows(r);
        setFailed(false);
      })
      .catch((e) => {
        console.warn("[star] list failed", (e as Error).message);
        setRows([]);
        setFailed(true);
      });
    // Real record-based domain level (L1–L5) — no LLM, no fabrication.
    loadDomainLevels(userId)
      .then((b) => setLevel(b.domainLevels[domainId] ?? null))
      .catch(() => setLevel(null));
  }, [userId, domainId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) return null;
  if (!userId) return <Redirect href="/sign-in" />;
  if (!domainId) return <Redirect href="/" />;

  const name = ko ? getDomainStar(domainId).nameKo : getDomainStar(domainId).nameEn;
  const headerMeta = DOMAIN_HEADER_META[domainId][locale];
  const action = DOMAIN_ACTION[domainId];
  const count = rows?.length ?? 0;
  const pieceTitle = piece?.title?.trim() || t("star.untitled");
  const pieceDate = piece ? evidenceDateLabel(piece.created_at, ko ? "ko" : "en") : null;

  // Honest briefing: real count or a neutral empty prompt — never a fabricated
  // "N% was work" analysis.
  const briefing =
    rows === null
      ? t("star.briefingOpening")
      : count === 0
        ? t("star.briefingEmpty")
        : count === 1
          ? t("star.briefingCountOne", { n: count })
          : t("star.briefingCount", { n: count });

  return (
    <DeepSpaceScreen
      active="home"
      header="none"
      variant="museumLike"
      title={name}
      onBack={() => router.back()}
      action={<StarHeaderAction caption={headerMeta} level={level} />}
    >
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {/* P1: 보낸 곳이 가리킨 조각. 이 영역에 담긴 것일 때만 뜬다. */}
        {piece ? (
          <View style={s.pieceSlot}>
            <PixelPressable
              variant="frame"
              onPress={() =>
                router.push(
                  piece.origin === "source"
                    ? { pathname: "/record/[id]", params: { id: piece.uuid, origin: "source" } }
                    : { pathname: "/record/[id]", params: { id: piece.uuid } },
                )
              }
              accessibilityLabel={`${t("star.pieceHere")}. ${pieceTitle}`}
              accessibilityHint={t("star.pieceOpenHint")}
              fullWidth
              contentStyle={s.pieceCard}
            >
              <View style={s.pieceCopy}>
                <RNText style={[m3TextStyle("labelMedium"), s.pieceEyebrow]}>{t("star.pieceHere")}</RNText>
                <RNText numberOfLines={2} style={[m3TextStyle("bodyLarge"), s.pieceTitle]}>
                  {pieceTitle}
                </RNText>
                {pieceDate ? (
                  <RNText style={[m3TextStyle("bodySmall"), s.pieceDate]}>{pieceDate}</RNText>
                ) : null}
              </View>
              <PixelGlyph name="chevronRight" color={m3.color.onSurfaceVariant} size={24} />
            </PixelPressable>
          </View>
        ) : null}

        {/* 세컨비 briefing (honest) */}
        <MdCard variant="outlined" style={s.briefCard}>
          <SecondbHead size={30} track={false} />
          <RNText style={[m3TextStyle("bodyMedium"), s.briefText]}>{briefing}</RNText>
        </MdCard>

        {/* action pair — mirrors 11-star 성과 입력 / Drill Down */}
        <View style={s.actions}>
          <MdButton
            variant="tonal"
            label={action.primary[locale]}
            // med#1 (map knownBug): capturing FROM a star must carry that
            // star's domain tag — a bare /capture push let auto-classification
            // file the piece under a different star than the one the user was
            // standing on.
            onPress={() => router.push({ pathname: "/capture-full", params: { tag: `domain:${domainId}` } })}
            style={s.actionBtn}
          />
          <MdButton
            variant="outlined"
            label={action.secondary[locale]}
            onPress={() => router.push(action.route as never)}
            style={s.actionBtn}
          />
        </View>

        {/* Distinct domain lens — real structured data or an honest empty state. */}
        {rows === null ? (
          <PremiumLoadingState message={t("star.loading")} />
        ) : failed ? (
          <MdCard variant="outlined" style={s.stateCard}>
            <RNText style={[m3TextStyle("bodyMedium"), s.stateText]}>
              {t("star.loadError")}
            </RNText>
            <MdButton variant="text" label={t("star.retry")} onPress={refresh} />
          </MdCard>
        ) : (
          <DomainStarLens
            domain={domainId}
            userId={userId}
            records={rows}
            level={level}
            ko={ko}
          />
        )}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 },
  headerAction: { flexDirection: "row", alignItems: "center", gap: 7, maxWidth: 184 },
  headerCaption: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, maxWidth: 76 },
  headerGauge: { flexDirection: "row", gap: 4 },
  headerSegment: { width: 12, height: 5, borderRadius: m3.shape.none },
  headerSegmentOn: { backgroundColor: m3.color.primary },
  headerSegmentOff: { backgroundColor: starAlpha(m3.color.primary, 0.2) },
  levelText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.mono, fontWeight: "700" },
  briefCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: m3.shape.none,
    backgroundColor: starAlpha(m3.color.primaryContainer, 0.34),
  },
  briefText: { flex: 1, color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, lineHeight: 20 },
  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  actionBtn: { flex: 1 },
  stateCard: { marginTop: 18, padding: 16, gap: 8, alignItems: "center" },
  stateText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, textAlign: "center" },
  pieceSlot: { marginBottom: 14 },
  pieceCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  pieceCopy: { flex: 1, gap: 2 },
  pieceEyebrow: { color: m3.color.primary, fontFamily: m3.font.brand },
  pieceTitle: { color: m3.color.onSurface, fontFamily: m3.font.brand },
  pieceDate: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
});
