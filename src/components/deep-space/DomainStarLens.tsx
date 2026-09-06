/**
 * Native domain lenses for the rev2 star-detail screen.
 *
 * The Claude handoff gives every life-domain star a different visual grammar.
 * This component preserves that grammar while replacing the prototype's sample
 * numbers with owner-scoped product data. When a structured source has not been
 * filled yet, the visual stays in place and says so instead of inventing data.
 *
 * Android discipline:
 * - record lists are deliberately bounded before `.map()` (no unbounded
 *   ScrollView children);
 * - the relationship SVG is capped at 24 nodes;
 * - there are no animated SVG filters, gradients, or large off-screen canvases.
 */
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";
import { useTranslation } from "react-i18next";

import { MdButton, MdCard, ProgressLinear, m3TextStyle } from "@/components/m3";
import type { LadderLevel } from "@/lib/persona/brightness";
import type { DomainId } from "@/lib/persona/domain-stars";
import type { LifePeriod } from "@/lib/interview/probe";
import {
  listEntriesForMonth,
  monthBucket,
  summarizeMonth,
  type LedgerEntry,
  type MonthSummary,
} from "@/lib/finance/ledger";
import { listPeople, type Person, type RelationKind } from "@/lib/relation/people";
import { layoutPeopleMap } from "@/lib/relation/people-map-layout";
import { listRecreationItems, type RecreationItem } from "@/lib/recreation/items";
import { listRecentSamples, type HealthSampleRow } from "@/lib/supabase/health";
import { m3 } from "@/lib/theme/m3";
import { flattenAlpha } from "@/lib/theme/tokens";
import { ringCells, stepLine } from "@/components/pixel/pixel-line";
import { PixelNodeSvg, PixelStarSvg } from "@/components/pixel/PixelStarSvg";

/**
 * 이 파일의 반투명 색은 **미리 합성한다** — PIXEL-CLAY 절대 규칙 4.
 *
 * 바닥: `m3.color.surfaceContainerLow` — 렌즈 카드 배경.
 *
 * ⚠ 스크림·백드롭은 여기 안 거친다. 아래 깔린 것을 모르는 채 덮는 층이라
 *   미리 합성할 수 없고, 규칙 4가 그 자리에 요구하는 것은 **디더**다.
 */
const lensAlpha = (c: string, a: number): string => flattenAlpha(c, a, m3.color.surfaceContainerLow);

/**
 * 관계 지도의 색 — 원래 `lensAlpha(…)` 였다. 미리 합성해 불투명 색으로 둔다
 * (PIXEL-CLAY 규칙 4). 바닥은 이 지도가 앉은 카드 배경이다.
 */
const LENS_MAP_GROUND = m3.color.surfaceContainerLow;
const LENS_RING_FILL = flattenAlpha(m3.accent.starDim, 0.16, LENS_MAP_GROUND);
const lensLinkFill = (c: string) => flattenAlpha(c, 0.28, LENS_MAP_GROUND);
const lensNodeFill = (c: string) => flattenAlpha(c, 0.92, LENS_MAP_GROUND);

export interface DomainLensRecord {
  id: string;
  topic: string | null;
  body: string | null;
  created_at: string;
  audit_period: string | null;
}

interface StructuredLensData {
  status: "idle" | "loading" | "ready" | "error";
  finance?: { entries: LedgerEntry[]; summary: MonthSummary };
  people?: Person[];
  recreation?: RecreationItem[];
  health?: HealthSampleRow[];
}

const RELATION_COLOR: Record<RelationKind, string> = {
  family: m3.accent.moodPositive,
  partner: m3.accent.moodNegative,
  friend: m3.accent.starCore,
  colleague: m3.accent.star,
  mentor: m3.accent.polaris,
  other: m3.accent.starDim,
};

type LensLocale = "en" | "ko" | "es" | "pt" | "id";

type LensCopyKey =
  | "career.section"
  | "career.main"
  | "career.side"
  | "career.emptyMain"
  | "career.emptySide"
  | "career.open"
  | "finance.section"
  | "finance.empty"
  | "finance.open"
  | "finance.expense"
  | "finance.income"
  | "finance.ratio"
  | "finance.cashFlow"
  | "relation.section"
  | "relation.empty"
  | "relation.open"
  | "relation.openFull"
  | "relation.me"
  | "relation.foot"
  | "growth.section"
  | "growth.empty"
  | "growth.start"
  | "health.section"
  | "health.coverage"
  | "health.empty"
  | "health.sleepSection"
  | "health.sleepEmpty"
  | "health.connect"
  | "recreation.section"
  | "recreation.fill"
  | "recreation.emptyAxis"
  | "recreation.solo"
  | "recreation.together"
  | "recreation.empty"
  | "recreation.foot"
  | "recreation.open"
  | "collect.section"
  | "collect.empty"
  | "state.loadingA11y"
  | "state.loadingBody"
  | "state.errorBody"
  | "state.errorAction";

const LENS_COPY: Record<LensLocale, Record<LensCopyKey, string>> = {
  en: {
    "career.section": "The path you have built",
    "career.main": "Main",
    "career.side": "Side",
    "career.emptyMain": "Add an achievement and its real record will join this path.",
    "career.emptySide": "Connected official records will organize here as education, awards, licenses, and experience.",
    "career.open": "Open career",
    "finance.section": "This month",
    "finance.empty": "Add income and expenses to see this month's flow and category mix here.",
    "finance.open": "Open ledger",
    "finance.expense": "Expense",
    "finance.income": "Income",
    "finance.ratio": "Expense compared with income",
    "finance.cashFlow": "Cash flow",
    "relation.section": "My people",
    "relation.empty": "Add one person to begin a real map centered on you.",
    "relation.open": "Open people map",
    "relation.openFull": "Open full people map",
    "relation.me": "Me",
    "relation.foot": "Distance shows closeness; starlight color shows relation type.",
    "growth.section": "Chapters in your records",
    "growth.empty": "Add a growth moment and its real chapter will open here.",
    "growth.start": "Start reflection",
    "health.section": "Today's health records",
    "health.coverage": "Coverage",
    "health.empty": "No connected health records yet.",
    "health.sleepSection": "Sleep record trend",
    "health.sleepEmpty": "Connect sleep records to see the recent pattern as bars.",
    "health.connect": "Connect data",
    "recreation.section": "Rest map",
    "recreation.fill": "Fill",
    "recreation.emptyAxis": "Empty",
    "recreation.solo": "Solo",
    "recreation.together": "Together",
    "recreation.empty": "Rest moments become stars here.",
    "recreation.foot": "Current items stay neutral at the center. Solo/together and empty/fill classification will build from future entries.",
    "recreation.open": "Open rest records",
    "collect.section": "Waiting to organize",
    "collect.empty": "There are no records waiting to be organized.",
    "state.loadingA11y": "Loading domain lens",
    "state.loadingBody": "Fitting the lens to your real records.",
    "state.errorBody": "The structured records did not load just now. Try their source screen.",
    "state.errorAction": "Open all records",
  },
  ko: {
    "career.section": "쌓아온 길",
    "career.main": "메인",
    "career.side": "사이드",
    "career.emptyMain": "성과를 담으면 이 길에 실제 기록이 이어져요.",
    "career.emptySide": "공식 이력은 연동된 자료가 생기면 학력, 수상, 자격, 경력 순으로 정리돼요.",
    "career.open": "커리어 전체 보기",
    "finance.section": "이번 달 가계",
    "finance.empty": "수입과 지출을 담으면 이번 달 흐름과 카테고리 구성이 여기에 보여요.",
    "finance.open": "가계 열기",
    "finance.expense": "지출",
    "finance.income": "수입",
    "finance.ratio": "수입 대비 지출",
    "finance.cashFlow": "현금 흐름",
    "relation.section": "나의 사람들",
    "relation.empty": "사람을 한 명 담으면 나를 중심으로 실제 관계 지도가 시작돼요.",
    "relation.open": "사람 지도 열기",
    "relation.openFull": "관계 지도 전체 보기",
    "relation.me": "나",
    "relation.foot": "가까움은 중심과의 거리, 관계 종류는 별빛 색으로 보여요.",
    "growth.section": "기록의 시간대",
    "growth.empty": "성장의 장면을 담으면 실제 기록의 시간대가 한 장씩 열려요.",
    "growth.start": "회상 시작하기",
    "health.section": "오늘의 건강 기록",
    "health.coverage": "기록 범위",
    "health.empty": "연결된 건강 기록이 아직 없어요.",
    "health.sleepSection": "수면 기록의 흐름",
    "health.sleepEmpty": "수면 기록을 연결하면 최근 흐름이 막대로 나타나요.",
    "health.connect": "데이터 연결",
    "recreation.section": "휴식 지도",
    "recreation.fill": "채움",
    "recreation.emptyAxis": "비움",
    "recreation.solo": "혼자",
    "recreation.together": "함께",
    "recreation.empty": "휴식을 담으면 여기에 별이 생겨요.",
    "recreation.foot": "현재 항목은 중심에 모아 두었어요. 혼자·함께, 비움·채움 분류는 다음 입력부터 쌓여요.",
    "recreation.open": "휴식 기록 보기",
    "collect.section": "정리 대기",
    "collect.empty": "아직 분류를 기다리는 기록이 없어요.",
    "state.loadingA11y": "도메인 렌즈 불러오는 중",
    "state.loadingBody": "실제 기록으로 렌즈를 맞추는 중이에요.",
    "state.errorBody": "전용 기록을 잠깐 불러오지 못했어요. 원본 화면에서 다시 확인해 주세요.",
    "state.errorAction": "기록 전체 보기",
  },
  es: {
    "career.section": "El camino que has construido",
    "career.main": "Principal",
    "career.side": "Lateral",
    "career.emptyMain": "Agrega un logro y su registro real se unira a este camino.",
    "career.emptySide": "Los registros oficiales conectados se ordenaran aqui como estudios, premios, licencias y experiencia.",
    "career.open": "Abrir carrera",
    "finance.section": "Este mes",
    "finance.empty": "Agrega ingresos y gastos para ver aqui el flujo del mes y la mezcla por categoria.",
    "finance.open": "Abrir libro",
    "finance.expense": "Gasto",
    "finance.income": "Ingreso",
    "finance.ratio": "Gasto frente a ingreso",
    "finance.cashFlow": "Flujo de caja",
    "relation.section": "Mi gente",
    "relation.empty": "Agrega una persona para empezar un mapa real centrado en ti.",
    "relation.open": "Abrir mapa de personas",
    "relation.openFull": "Abrir mapa completo de personas",
    "relation.me": "Yo",
    "relation.foot": "La distancia muestra cercania; el color de la luz muestra el tipo de relacion.",
    "growth.section": "Capitulos en tus registros",
    "growth.empty": "Agrega un momento de crecimiento y su capitulo real aparecera aqui.",
    "growth.start": "Iniciar recuerdo",
    "health.section": "Registros de salud de hoy",
    "health.coverage": "Cobertura",
    "health.empty": "Aun no hay registros de salud conectados.",
    "health.sleepSection": "Tendencia de sueno",
    "health.sleepEmpty": "Conecta registros de sueno para ver el patron reciente como barras.",
    "health.connect": "Conectar datos",
    "recreation.section": "Mapa de descanso",
    "recreation.fill": "Llenar",
    "recreation.emptyAxis": "Vaciar",
    "recreation.solo": "Solo",
    "recreation.together": "Juntos",
    "recreation.empty": "Los momentos de descanso se vuelven estrellas aqui.",
    "recreation.foot": "Los elementos actuales quedan neutrales en el centro. La clasificacion solo/juntos y vaciar/llenar crecera con entradas futuras.",
    "recreation.open": "Abrir registros de descanso",
    "collect.section": "Pendiente de organizar",
    "collect.empty": "No hay registros esperando organizacion.",
    "state.loadingA11y": "Cargando lente de dominio",
    "state.loadingBody": "Ajustando la lente a tus registros reales.",
    "state.errorBody": "Los registros estructurados no cargaron ahora. Revisa su pantalla de origen.",
    "state.errorAction": "Abrir todos los registros",
  },
  pt: {
    "career.section": "O caminho que voce construiu",
    "career.main": "Principal",
    "career.side": "Lateral",
    "career.emptyMain": "Adicione uma conquista e o registro real entrara neste caminho.",
    "career.emptySide": "Registros oficiais conectados serao organizados aqui como educacao, premios, licencas e experiencia.",
    "career.open": "Abrir carreira",
    "finance.section": "Este mes",
    "finance.empty": "Adicione renda e gastos para ver aqui o fluxo do mes e a mistura por categoria.",
    "finance.open": "Abrir livro",
    "finance.expense": "Gasto",
    "finance.income": "Renda",
    "finance.ratio": "Gasto em relacao a renda",
    "finance.cashFlow": "Fluxo de caixa",
    "relation.section": "Minhas pessoas",
    "relation.empty": "Adicione uma pessoa para iniciar um mapa real centrado em voce.",
    "relation.open": "Abrir mapa de pessoas",
    "relation.openFull": "Abrir mapa completo de pessoas",
    "relation.me": "Eu",
    "relation.foot": "A distancia mostra proximidade; a cor da luz mostra o tipo de relacao.",
    "growth.section": "Capitulos nos seus registros",
    "growth.empty": "Adicione um momento de crescimento e o capitulo real aparecera aqui.",
    "growth.start": "Iniciar lembranca",
    "health.section": "Registros de saude de hoje",
    "health.coverage": "Cobertura",
    "health.empty": "Ainda nao ha registros de saude conectados.",
    "health.sleepSection": "Tendencia de sono",
    "health.sleepEmpty": "Conecte registros de sono para ver o padrao recente em barras.",
    "health.connect": "Conectar dados",
    "recreation.section": "Mapa de descanso",
    "recreation.fill": "Preencher",
    "recreation.emptyAxis": "Esvaziar",
    "recreation.solo": "Sozinho",
    "recreation.together": "Juntos",
    "recreation.empty": "Momentos de descanso viram estrelas aqui.",
    "recreation.foot": "Os itens atuais ficam neutros no centro. A classificacao sozinho/juntos e esvaziar/preencher crescera com entradas futuras.",
    "recreation.open": "Abrir registros de descanso",
    "collect.section": "Aguardando organizacao",
    "collect.empty": "Nao ha registros aguardando organizacao.",
    "state.loadingA11y": "Carregando lente de dominio",
    "state.loadingBody": "Ajustando a lente aos seus registros reais.",
    "state.errorBody": "Os registros estruturados nao carregaram agora. Confira a tela de origem.",
    "state.errorAction": "Abrir todos os registros",
  },
  id: {
    "career.section": "Jalur yang sudah kamu bangun",
    "career.main": "Utama",
    "career.side": "Samping",
    "career.emptyMain": "Tambahkan pencapaian, lalu catatan aslinya akan masuk ke jalur ini.",
    "career.emptySide": "Catatan resmi yang terhubung akan tersusun di sini sebagai pendidikan, penghargaan, lisensi, dan pengalaman.",
    "career.open": "Buka karier",
    "finance.section": "Bulan ini",
    "finance.empty": "Tambahkan pemasukan dan pengeluaran untuk melihat arus bulan ini dan campuran kategorinya.",
    "finance.open": "Buka buku kas",
    "finance.expense": "Pengeluaran",
    "finance.income": "Pemasukan",
    "finance.ratio": "Pengeluaran dibanding pemasukan",
    "finance.cashFlow": "Arus kas",
    "relation.section": "Orang-orangku",
    "relation.empty": "Tambahkan satu orang untuk memulai peta nyata yang berpusat padamu.",
    "relation.open": "Buka peta orang",
    "relation.openFull": "Buka peta orang penuh",
    "relation.me": "Aku",
    "relation.foot": "Jarak menunjukkan kedekatan; warna cahaya menunjukkan jenis hubungan.",
    "growth.section": "Bab dalam catatanmu",
    "growth.empty": "Tambahkan momen bertumbuh dan bab nyatanya akan muncul di sini.",
    "growth.start": "Mulai refleksi",
    "health.section": "Catatan kesehatan hari ini",
    "health.coverage": "Cakupan",
    "health.empty": "Belum ada catatan kesehatan yang terhubung.",
    "health.sleepSection": "Tren catatan tidur",
    "health.sleepEmpty": "Hubungkan catatan tidur untuk melihat pola terbaru sebagai batang.",
    "health.connect": "Hubungkan data",
    "recreation.section": "Peta istirahat",
    "recreation.fill": "Mengisi",
    "recreation.emptyAxis": "Mengosongkan",
    "recreation.solo": "Sendiri",
    "recreation.together": "Bersama",
    "recreation.empty": "Momen istirahat menjadi bintang di sini.",
    "recreation.foot": "Item saat ini tetap netral di tengah. Klasifikasi sendiri/bersama dan kosong/isi akan terbentuk dari entri berikutnya.",
    "recreation.open": "Buka catatan istirahat",
    "collect.section": "Menunggu dirapikan",
    "collect.empty": "Tidak ada catatan yang menunggu untuk dirapikan.",
    "state.loadingA11y": "Memuat lensa domain",
    "state.loadingBody": "Menyesuaikan lensa dengan catatan nyatamu.",
    "state.errorBody": "Catatan terstruktur belum termuat sekarang. Coba layar sumbernya.",
    "state.errorAction": "Buka semua catatan",
  },
};

const CAREER_CREDENTIALS: Record<LensLocale, string[]> = {
  en: ["Education", "Service", "Awards", "Licenses", "Experience"],
  ko: ["학력", "병역", "수상", "자격", "경력"],
  es: ["Estudios", "Servicio", "Premios", "Licencias", "Experiencia"],
  pt: ["Educacao", "Servico", "Premios", "Licencas", "Experiencia"],
  id: ["Pendidikan", "Layanan", "Penghargaan", "Lisensi", "Pengalaman"],
};

const HEALTH_LABEL: Record<string, Record<LensLocale, string>> = {
  steps: { ko: "걸음", en: "Steps", es: "Pasos", pt: "Passos", id: "Langkah" },
  workout: { ko: "움직임", en: "Movement", es: "Movimiento", pt: "Movimento", id: "Gerak" },
  sleep: { ko: "수면", en: "Sleep", es: "Sueno", pt: "Sono", id: "Tidur" },
  heart_rate: { ko: "심박", en: "Heart rate", es: "Ritmo cardiaco", pt: "Batimento", id: "Detak jantung" },
};

function lensCopy(locale: LensLocale, key: LensCopyKey) {
  return LENS_COPY[locale]?.[key] ?? LENS_COPY.en[key];
}

function numberLocale(locale: LensLocale) {
  return ({ en: "en-US", ko: "ko-KR", es: "es-ES", pt: "pt-BR", id: "id-ID" } as const)[locale];
}

function netFlowLabel(locale: LensLocale, money: string) {
  if (locale === "ko") return `이번 달 순흐름 ${money}`;
  if (locale === "es") return `Flujo neto este mes ${money}`;
  if (locale === "pt") return `Fluxo liquido este mes ${money}`;
  if (locale === "id") return `Arus bersih bulan ini ${money}`;
  return `Net flow this month ${money}`;
}

function decadeLabel(locale: LensLocale, decade: number) {
  if (locale === "ko") return `${decade}년대`;
  if (locale === "es") return `Anios ${decade}`;
  if (locale === "pt") return `Anos ${decade}`;
  if (locale === "id") return `${decade}-an`;
  return `${decade}s`;
}

function recordsCountLabel(locale: LensLocale, count: number) {
  if (locale === "ko") return `${count}개 기록`;
  if (locale === "es") return `${count} registros`;
  if (locale === "pt") return `${count} registros`;
  if (locale === "id") return `${count} catatan`;
  return `${count} records`;
}

type GrowthChapterKey = `period:${LifePeriod}` | `decade:${number}` | "undated";

// Canonical interview periods plus links created before the seven-star rename.
// Unknown values deliberately fall through to created_at instead of being
// silently called "now".
const GROWTH_PERIOD_ALIAS: Readonly<Record<string, LifePeriod>> = {
  infancy: "infancy",
  childhood: "infancy",
  school: "school",
  teens: "school",
  twenties: "twenties",
  "20s": "twenties",
  later: "later",
  thirties: "later",
  forties: "later",
  fifties: "later",
  sixties: "later",
  seventies: "later",
  work: "work",
  now: "now",
  current: "now",
};

function growthChapterKey(record: DomainLensRecord): GrowthChapterKey {
  const period = record.audit_period ? GROWTH_PERIOD_ALIAS[record.audit_period] : undefined;
  if (period) return `period:${period}`;

  const year = new Date(record.created_at).getFullYear();
  return Number.isFinite(year) ? `decade:${Math.floor(year / 10) * 10}` : "undated";
}

function localeFromLanguage(language: string | undefined, koFallback: boolean): LensLocale {
  if (language?.startsWith("ko")) return "ko";
  if (language?.startsWith("es")) return "es";
  if (language?.startsWith("pt")) return "pt";
  if (language?.startsWith("id")) return "id";
  return koFallback ? "ko" : "en";
}

function useStructuredLensData(userId: string, domain: DomainId): StructuredLensData {
  const [data, setData] = useState<StructuredLensData>({ status: "idle" });

  useEffect(() => {
    let alive = true;
    const structured = domain === "finance" || domain === "relation" || domain === "recreation" || domain === "health";
    if (!structured) {
      setData({ status: "idle" });
      return () => {
        alive = false;
      };
    }

    setData({ status: "loading" });
    void (async () => {
      try {
        if (domain === "finance") {
          const month = monthBucket(new Date());
          const entries = await listEntriesForMonth(userId, month);
          if (alive) setData({ status: "ready", finance: { entries, summary: summarizeMonth(entries, month) } });
          return;
        }
        if (domain === "relation") {
          const people = await listPeople(userId);
          if (alive) setData({ status: "ready", people });
          return;
        }
        if (domain === "recreation") {
          const recreation = await listRecreationItems(userId);
          if (alive) setData({ status: "ready", recreation });
          return;
        }
        const health = await listRecentSamples(userId, 50);
        if (alive) setData({ status: "ready", health });
      } catch (error) {
        console.warn("[star-lens] structured data failed", (error as Error).message);
        if (alive) setData({ status: "error" });
      }
    })();

    return () => {
      alive = false;
    };
  }, [domain, userId]);

  return data;
}

function SectionLabel({ children }: { children: string }) {
  return <RNText style={[m3TextStyle("titleMedium"), styles.sectionLabel]}>{children}</RNText>;
}

function EmptyPanel({
  body,
  action,
  route,
}: {
  body: string;
  action: string;
  route: string;
}) {
  return (
    <MdCard variant="outlined" style={styles.emptyCard}>
      <RNText style={[m3TextStyle("bodyMedium"), styles.muted]}>{body}</RNText>
      <MdButton variant="text" label={action} onPress={() => router.push(route as never)} />
    </MdCard>
  );
}

function RecordTimeline({
  records,
  empty,
}: {
  records: DomainLensRecord[];
  empty: string;
}) {
  const visible = records.slice(0, 8);
  if (visible.length === 0) {
    return <RNText style={[m3TextStyle("bodyMedium"), styles.timelineEmpty]}>{empty}</RNText>;
  }
  return (
    <View>
      {visible.map((record, index) => (
        <Pressable
          key={record.id}
          onPress={() => router.push({ pathname: "/record/[id]", params: { id: record.id } })}
          accessibilityRole="button"
          accessibilityLabel={record.topic ?? record.body?.split("\n")[0] ?? ""}
          style={styles.timelineRow}
        >
          <View style={styles.timelineRail}>
            <View style={styles.timelineDot} />
            {index < visible.length - 1 ? <View style={styles.timelineLine} /> : null}
          </View>
          <View style={styles.timelineCopy}>
            <RNText style={[m3TextStyle("labelSmall"), styles.monoMuted]}>
              {new Date(record.created_at).getFullYear()}
            </RNText>
            <RNText style={[m3TextStyle("bodyLarge"), styles.timelineTitle]} numberOfLines={1}>
              {record.topic ?? record.body?.split("\n")[0]}
            </RNText>
            {record.body ? (
              <RNText style={[m3TextStyle("bodySmall"), styles.muted]} numberOfLines={2}>
                {record.body}
              </RNText>
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function CareerLens({ records, locale }: { records: DomainLensRecord[]; locale: LensLocale }) {
  const [track, setTrack] = useState<"main" | "side">("main");
  const credentials = CAREER_CREDENTIALS[locale] ?? CAREER_CREDENTIALS.en;
  return (
    <>
      <SectionLabel>{lensCopy(locale, "career.section")}</SectionLabel>
      <View style={styles.segmented}>
        {(["main", "side"] as const).map((key) => {
          const selected = track === key;
          return (
            <Pressable
              key={key}
              onPress={() => setTrack(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.segment, selected && styles.segmentOn]}
            >
              <RNText style={[m3TextStyle("labelLarge"), selected ? styles.segmentTextOn : styles.segmentText]}>
                {key === "main" ? lensCopy(locale, "career.main") : lensCopy(locale, "career.side")}
              </RNText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.legendRow}>
        {credentials.map((label, index) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, index % 2 === 1 && styles.legendDotViolet]} />
            <RNText style={[m3TextStyle("labelSmall"), styles.legendText]}>{label}</RNText>
          </View>
        ))}
      </View>
      <MdCard variant="outlined" style={styles.timelineCard}>
        {track === "main" ? (
          <RecordTimeline
            records={records}
            empty={lensCopy(locale, "career.emptyMain")}
          />
        ) : (
          <View style={styles.sideEmpty}>
            <RNText style={[m3TextStyle("bodyMedium"), styles.muted]}>
              {lensCopy(locale, "career.emptySide")}
            </RNText>
            <MdButton variant="text" label={lensCopy(locale, "career.open")} onPress={() => router.push("/career")} />
          </View>
        )}
      </MdCard>
    </>
  );
}

function FinanceLens({
  payload,
  locale,
}: {
  payload: StructuredLensData["finance"];
  locale: LensLocale;
}) {
  if (!payload || payload.entries.length === 0) {
    return (
      <>
        <SectionLabel>{lensCopy(locale, "finance.section")}</SectionLabel>
        <EmptyPanel
          body={lensCopy(locale, "finance.empty")}
          action={lensCopy(locale, "finance.open")}
          route="/ledger"
        />
      </>
    );
  }

  const { entries, summary } = payload;
  const money = (value: number) => `₩${Math.round(value).toLocaleString(numberLocale(locale))}`;
  const ratio = summary.income > 0 ? Math.min(1, summary.expense / summary.income) : summary.expense > 0 ? 1 : 0;
  const categoryTotal = Math.max(1, summary.byCategory.reduce((sum, row) => sum + row.total, 0));

  return (
    <>
      <SectionLabel>{lensCopy(locale, "finance.section")}</SectionLabel>
      <MdCard variant="outlined" style={styles.financeCard}>
        <View style={styles.financeHeadline}>
          <View style={styles.flexOne}>
            <RNText style={[m3TextStyle("labelSmall"), styles.muted]}>{lensCopy(locale, "finance.expense")}</RNText>
            <RNText style={styles.money}>{money(summary.expense)}</RNText>
          </View>
          <View style={styles.financeRight}>
            <RNText style={[m3TextStyle("labelSmall"), styles.muted]}>{lensCopy(locale, "finance.income")}</RNText>
            <RNText style={[m3TextStyle("bodyMedium"), styles.financeIncome]}>{money(summary.income)}</RNText>
          </View>
        </View>
        <ProgressLinear
          value={ratio}
          accessibilityLabel={lensCopy(locale, "finance.ratio")}
          style={styles.financeProgress}
        />
        <RNText style={[m3TextStyle("bodySmall"), styles.muted]}>
          {netFlowLabel(locale, money(summary.net))}
        </RNText>
        {summary.byCategory.length > 0 ? (
          <>
            <View style={styles.categoryBar}>
              {summary.byCategory.slice(0, 5).map((category, index) => (
                <View
                  key={category.category}
                  style={[
                    styles.categorySlice,
                    { flex: Math.max(0.02, category.total / categoryTotal) },
                    index % 2 === 1 && styles.categorySliceAlt,
                  ]}
                />
              ))}
            </View>
            <View style={styles.categoryList}>
              {summary.byCategory.slice(0, 4).map((category, index) => (
                <View key={category.category} style={styles.categoryRow}>
                  <View style={[styles.categoryDot, index % 2 === 1 && styles.categoryDotAlt]} />
                  <RNText style={[m3TextStyle("bodySmall"), styles.flexOneText]} numberOfLines={1}>
                    {category.category}
                  </RNText>
                  <RNText style={[m3TextStyle("labelSmall"), styles.mono]}>{money(category.total)}</RNText>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </MdCard>

      <SectionLabel>{lensCopy(locale, "finance.cashFlow")}</SectionLabel>
      <MdCard variant="outlined" style={styles.financeCard}>
        {entries.slice(0, 4).map((entry) => (
          <View key={entry.id} style={styles.flowRow}>
            <View style={[styles.flowMark, entry.kind === "income" ? styles.flowMarkIn : styles.flowMarkOut]} />
            <RNText style={[m3TextStyle("bodyMedium"), styles.flexOneText]} numberOfLines={1}>
              {entry.note || entry.category}
            </RNText>
            <RNText
              style={[
                m3TextStyle("labelMedium"),
                styles.mono,
                entry.kind === "income" ? styles.flowIn : styles.flowOut,
              ]}
            >
              {`${entry.kind === "income" ? "+" : "-"}${money(entry.amount_krw)}`}
            </RNText>
          </View>
        ))}
      </MdCard>
    </>
  );
}

function RelationLens({ people, locale }: { people: Person[] | undefined; locale: LensLocale }) {
  const visiblePeople = (people ?? []).slice(0, 24);
  const nodes = useMemo(() => layoutPeopleMap(visiblePeople), [visiblePeople]);
  if (nodes.length === 0) {
    return (
      <>
        <SectionLabel>{lensCopy(locale, "relation.section")}</SectionLabel>
        <EmptyPanel
          body={lensCopy(locale, "relation.empty")}
          action={lensCopy(locale, "relation.open")}
          route="/people"
        />
      </>
    );
  }

  return (
    <>
      <SectionLabel>{lensCopy(locale, "relation.section")}</SectionLabel>
      <Pressable
        onPress={() => router.push("/people")}
        accessibilityRole="button"
        accessibilityLabel={lensCopy(locale, "relation.openFull")}
        style={styles.mapCard}
      >
        <Svg width="100%" height="100%" viewBox="0 0 1000 1000">
          {/* 거리 고리 — 원이었다. 셀 격자 위에서는 **사각 링**이 정직하다
              (원을 셀로 근사하면 계단이 지저분해진다). 규칙 1·4. */}
          {[160, 310, 460].map((radius) =>
            ringCells(500, 500, radius, 8).map((p, i) => (
              <Rect key={`r${radius}-${i}`} x={p.x} y={p.y} width={8} height={8} fill={LENS_RING_FILL} />
            )),
          )}
          {nodes.map((node) =>
            stepLine(500, 500, node.x * 1000, node.y * 1000, 8).map((p, i) => (
              <Rect
                key={`line-${node.id}-${i}`}
                x={p.x}
                y={p.y}
                width={8}
                height={8}
                fill={lensLinkFill(RELATION_COLOR[node.kind])}
              />
            )),
          )}
          <PixelStarSvg cx={500} cy={500} r={32} fill={m3.accent.polaris} />
          <SvgText x={500} y={560} fill={m3.color.onSurface} fontSize={30} textAnchor="middle">
            {lensCopy(locale, "relation.me")}
          </SvgText>
          {nodes.map((node) => {
            const radius = 16 + node.closeness * 3;
            return (
              <G key={node.id}>
                <PixelNodeSvg
                  cx={node.x * 1000}
                  cy={node.y * 1000}
                  r={radius}
                  fill={lensNodeFill(RELATION_COLOR[node.kind])}
                />
                <SvgText
                  x={node.x * 1000}
                  y={node.y * 1000 - radius - 12}
                  fill={m3.color.onSurface}
                  fontSize={24}
                  textAnchor="middle"
                >
                  {node.name.length > 7 ? `${node.name.slice(0, 6)}…` : node.name}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </Pressable>
      <RNText style={[m3TextStyle("bodySmall"), styles.mapFoot]}>
        {lensCopy(locale, "relation.foot")}
      </RNText>
    </>
  );
}

function GrowthLens({ records, locale }: { records: DomainLensRecord[]; locale: LensLocale }) {
  const { t } = useTranslation("home");
  const groups = useMemo(() => {
    const map = new Map<GrowthChapterKey, DomainLensRecord[]>();
    for (const record of records.slice(0, 40)) {
      const chapter = growthChapterKey(record);
      const bucket = map.get(chapter) ?? [];
      bucket.push(record);
      map.set(chapter, bucket);
    }
    // listDomainRecords is newest-first. Map insertion order therefore keeps
    // the chapter whose latest record is newest at the top.
    return [...map.entries()].slice(0, 6);
  }, [records]);

  return (
    <>
      <SectionLabel>{lensCopy(locale, "growth.section")}</SectionLabel>
      <MdCard variant="outlined" style={styles.growthCard}>
        {groups.length === 0 ? (
          <View style={styles.sideEmpty}>
            <RNText style={[m3TextStyle("bodyMedium"), styles.muted]}>
              {lensCopy(locale, "growth.empty")}
            </RNText>
            <MdButton
              variant="text"
              label={lensCopy(locale, "growth.start")}
              onPress={() => router.push("/audit?origin=domain-growth")}
            />
          </View>
        ) : (
          groups.map(([chapter, items], index) => {
            const chapterLabel = chapter.startsWith("period:")
              ? t(`ds.star.${chapter.slice("period:".length)}`)
              : chapter.startsWith("decade:")
                ? decadeLabel(locale, Number(chapter.slice("decade:".length)))
                : lensCopy(locale, "growth.section");
            return (
              <View key={chapter} style={styles.chapterRow}>
                <View style={styles.chapterRail}>
                  <View style={[styles.chapterDot, index === 0 && styles.chapterDotNow]} />
                  {index < groups.length - 1 ? <View style={styles.chapterLine} /> : null}
                </View>
                <View style={styles.chapterBody}>
                  <View style={styles.chapterHead}>
                    <RNText style={[m3TextStyle("titleMedium"), styles.onSurface]}>{chapterLabel}</RNText>
                    <RNText style={[m3TextStyle("labelSmall"), styles.monoMuted]}>
                      {recordsCountLabel(locale, items.length)}
                    </RNText>
                  </View>
                  <ProgressLinear value={Math.min(1, items.length / 10)} style={styles.chapterProgress} />
                  <RNText style={[m3TextStyle("bodySmall"), styles.muted]} numberOfLines={2}>
                    {items[0]?.topic ?? items[0]?.body?.split("\n")[0]}
                  </RNText>
                </View>
              </View>
            );
          })
        )}
      </MdCard>
    </>
  );
}

function HealthLens({
  samples,
  level,
  locale,
}: {
  samples: HealthSampleRow[] | undefined;
  level: LadderLevel | null;
  locale: LensLocale;
}) {
  const recent = samples ?? [];
  const coverage = Math.max(0, Math.min(1, ((level ?? 1) - 1) / 4));
  const radius = 43;
  const latestByMetric = new Map<string, HealthSampleRow>();
  for (const sample of recent) {
    if (!latestByMetric.has(sample.metric_type)) latestByMetric.set(sample.metric_type, sample);
  }
  const stats = [...latestByMetric.values()].slice(0, 3);
  const sleep = recent.filter((sample) => sample.metric_type === "sleep").slice(0, 7).reverse();
  const maxSleep = Math.max(1, ...sleep.map((sample) => sample.value));

  return (
    <>
      <SectionLabel>{lensCopy(locale, "health.section")}</SectionLabel>
      <MdCard variant="outlined" style={styles.healthCard}>
        <View style={styles.healthTop}>
          <View style={styles.ringWrap}>
            {/* 진행 링 — `strokeDasharray` 였다. 셀에서 진행은 테두리를 도는
                칸 중 앞에서부터 n칸이다(규칙 1). 12시에서 시계방향으로 돈다. */}
            <Svg width={112} height={112} viewBox="0 0 112 112">
              {(() => {
                const cells = ringCells(56, 56, radius, 10);
                const lit = Math.round(cells.length * Math.max(0, Math.min(1, coverage)));
                return cells.map((p, i) => (
                  <Rect
                    key={i}
                    x={p.x}
                    y={p.y}
                    width={10}
                    height={10}
                    fill={i < lit ? m3.color.primary : m3.color.surfaceContainerHighest}
                  />
                ));
              })()}
            </Svg>
            <View style={styles.ringText}>
              <RNText style={styles.ringLevel}>{`L${level ?? 1}`}</RNText>
              <RNText style={[m3TextStyle("labelSmall"), styles.muted]}>{lensCopy(locale, "health.coverage")}</RNText>
            </View>
          </View>
          <View style={styles.healthStats}>
            {stats.length > 0 ? (
              stats.map((sample) => (
                <View key={sample.id} style={styles.healthStat}>
                  <RNText style={[m3TextStyle("bodySmall"), styles.muted]}>
                    {HEALTH_LABEL[sample.metric_type]?.[locale] ?? sample.metric_type}
                  </RNText>
                  <RNText style={[m3TextStyle("labelLarge"), styles.healthValue]}>
                    {`${Number(sample.value.toFixed(1)).toLocaleString()} ${sample.unit}`}
                  </RNText>
                </View>
              ))
            ) : (
              <RNText style={[m3TextStyle("bodyMedium"), styles.muted]}>
                {lensCopy(locale, "health.empty")}
              </RNText>
            )}
          </View>
        </View>
      </MdCard>

      <SectionLabel>{lensCopy(locale, "health.sleepSection")}</SectionLabel>
      <MdCard variant="outlined" style={styles.sleepCard}>
        {sleep.length === 0 ? (
          <View style={styles.sideEmpty}>
            <RNText style={[m3TextStyle("bodyMedium"), styles.muted]}>
              {lensCopy(locale, "health.sleepEmpty")}
            </RNText>
            <MdButton variant="text" label={lensCopy(locale, "health.connect")} onPress={() => router.push("/import-hub")} />
          </View>
        ) : (
          <View style={styles.sleepBars}>
            {sleep.map((sample) => (
              <View key={sample.id} style={styles.sleepCol}>
                <RNText style={[m3TextStyle("labelSmall"), styles.monoMuted]}>{Number(sample.value.toFixed(1))}</RNText>
                <View style={[styles.sleepBar, { height: Math.max(12, (sample.value / maxSleep) * 74) }]} />
                <RNText style={[m3TextStyle("labelSmall"), styles.muted]}>
                  {new Date(sample.started_at).toLocaleDateString(numberLocale(locale), { weekday: "short" })}
                </RNText>
              </View>
            ))}
          </View>
        )}
      </MdCard>
    </>
  );
}

function RecreationLens({
  items,
  locale,
}: {
  items: RecreationItem[] | undefined;
  locale: LensLocale;
}) {
  const visible = (items ?? []).slice(0, 8);
  return (
    <>
      <SectionLabel>{lensCopy(locale, "recreation.section")}</SectionLabel>
      <MdCard variant="outlined" style={styles.restCard}>
        <View style={styles.restMap}>
          <View style={styles.axisVertical} />
          <View style={styles.axisHorizontal} />
          <RNText style={[m3TextStyle("labelSmall"), styles.axisTop]}>{lensCopy(locale, "recreation.fill")}</RNText>
          <RNText style={[m3TextStyle("labelSmall"), styles.axisBottom]}>{lensCopy(locale, "recreation.emptyAxis")}</RNText>
          <RNText style={[m3TextStyle("labelSmall"), styles.axisLeft]}>{lensCopy(locale, "recreation.solo")}</RNText>
          <RNText style={[m3TextStyle("labelSmall"), styles.axisRight]}>{lensCopy(locale, "recreation.together")}</RNText>
          {visible.length === 0 ? (
            <View style={styles.restEmpty}>
              <RNText style={[m3TextStyle("bodyMedium"), styles.restEmptyText]}>
                {lensCopy(locale, "recreation.empty")}
              </RNText>
            </View>
          ) : (
            <View style={styles.restCluster}>
              {visible.map((item, index) => (
                <View
                  key={item.id}
                  style={[
                    styles.restNodeWrap,
                    {
                      transform: [
                        { translateX: ((index % 3) - 1) * 48 },
                        { translateY: (Math.floor(index / 3) - 1) * 46 },
                      ],
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.restNode,
                      item.status === "active" ? styles.restNodeActive : item.status === "done" ? styles.restNodeDone : null,
                    ]}
                  />
                  <RNText style={[m3TextStyle("labelSmall"), styles.restNodeText]} numberOfLines={1}>
                    {item.title}
                  </RNText>
                </View>
              ))}
            </View>
          )}
        </View>
        <View style={styles.restFoot}>
          <RNText style={[m3TextStyle("bodySmall"), styles.muted]}>
            {lensCopy(locale, "recreation.foot")}
          </RNText>
          <MdButton variant="text" label={lensCopy(locale, "recreation.open")} onPress={() => router.push("/rest")} />
        </View>
      </MdCard>
    </>
  );
}

function CollectLens({ records, locale }: { records: DomainLensRecord[]; locale: LensLocale }) {
  return (
    <>
      <SectionLabel>{lensCopy(locale, "collect.section")}</SectionLabel>
      <MdCard variant="outlined" style={styles.timelineCard}>
        <RecordTimeline
          records={records}
          empty={lensCopy(locale, "collect.empty")}
        />
      </MdCard>
    </>
  );
}

export function DomainStarLens({
  domain,
  userId,
  records,
  level,
  ko,
}: {
  domain: DomainId;
  userId: string;
  records: DomainLensRecord[];
  level: LadderLevel | null;
  ko: boolean;
}) {
  const { i18n } = useTranslation();
  const locale = localeFromLanguage(i18n.language, ko);
  const structured = useStructuredLensData(userId, domain);

  if (structured.status === "loading") {
    return (
      <MdCard variant="outlined" style={styles.loadingCard}>
        <ProgressLinear accessibilityLabel={lensCopy(locale, "state.loadingA11y")} />
        <RNText style={[m3TextStyle("bodyMedium"), styles.muted]}>
          {lensCopy(locale, "state.loadingBody")}
        </RNText>
      </MdCard>
    );
  }

  if (structured.status === "error") {
    return (
      <EmptyPanel
        body={lensCopy(locale, "state.errorBody")}
        action={lensCopy(locale, "state.errorAction")}
        route="/records"
      />
    );
  }

  switch (domain) {
    case "career":
      return <CareerLens records={records} locale={locale} />;
    case "finance":
      return <FinanceLens payload={structured.finance} locale={locale} />;
    case "relation":
      return <RelationLens people={structured.people} locale={locale} />;
    case "growth":
      return <GrowthLens records={records} locale={locale} />;
    case "health":
      return <HealthLens samples={structured.health} level={level} locale={locale} />;
    case "recreation":
      return <RecreationLens items={structured.recreation} locale={locale} />;
    case "collect":
      return <CollectLens records={records} locale={locale} />;
  }
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
    fontWeight: "700",
    marginTop: 24,
    marginBottom: 10,
  },
  onSurface: { color: m3.color.onSurface, fontFamily: m3.font.brand },
  muted: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  mono: { color: m3.color.onSurface, fontFamily: m3.font.mono },
  monoMuted: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.mono },
  flexOne: { flex: 1 },
  flexOneText: { flex: 1, color: m3.color.onSurface, fontFamily: m3.font.brand },
  emptyCard: { padding: 16, gap: 8, alignItems: "flex-start" },
  loadingCard: { marginTop: 20, padding: 16, gap: 14 },

  segmented: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderRadius: m3.shape.none,
    backgroundColor: m3.color.surfaceContainerHigh,
  },
  segment: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: m3.shape.none },
  segmentOn: { backgroundColor: m3.color.secondaryContainer },
  segmentText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  segmentTextOn: { color: m3.color.onSecondaryContainer, fontFamily: m3.font.brand, fontWeight: "700" },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12, marginBottom: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: m3.shape.none, backgroundColor: m3.color.primary },
  legendDotViolet: { backgroundColor: m3.color.tertiary },
  legendText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  timelineCard: { padding: 14 },
  timelineRow: { flexDirection: "row", gap: 12, minHeight: 74 },
  timelineRail: { width: 18, alignItems: "center" },
  timelineDot: { width: 11, height: 11, borderRadius: m3.shape.none, marginTop: 5, backgroundColor: m3.color.primary },
  timelineLine: { width: 2, flex: 1, marginTop: 5, backgroundColor: m3.color.outlineVariant },
  timelineCopy: { flex: 1, paddingBottom: 14, gap: 2 },
  timelineTitle: { color: m3.color.onSurface, fontFamily: m3.font.brand, fontWeight: "700" },
  timelineEmpty: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, paddingVertical: 12 },
  sideEmpty: { gap: 8, alignItems: "flex-start" },

  financeCard: { padding: 16 },
  financeHeadline: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  financeRight: { alignItems: "flex-end" },
  financeIncome: { color: m3.color.onSurface, fontFamily: m3.font.mono, fontWeight: "600" },
  money: { color: m3.color.onSurface, fontFamily: m3.font.mono, fontSize: 24, lineHeight: 32, fontWeight: "700" },
  financeProgress: { height: 8, borderRadius: m3.shape.none, marginTop: 12, marginBottom: 8 },
  categoryBar: { flexDirection: "row", height: 14, gap: 2, marginTop: 16, overflow: "hidden", borderRadius: m3.shape.none },
  categorySlice: { minWidth: 4, backgroundColor: m3.color.primary },
  categorySliceAlt: { backgroundColor: m3.color.tertiary },
  categoryList: { gap: 8, marginTop: 12 },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  categoryDot: { width: 8, height: 8, borderRadius: m3.shape.none, backgroundColor: m3.color.primary },
  categoryDotAlt: { backgroundColor: m3.color.tertiary },
  flowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 42,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderRadius: m3.shape.none,
    backgroundColor: m3.color.surfaceContainerHighest,
  },
  flowMark: { width: 8, height: 8, borderRadius: m3.shape.none },
  flowMarkIn: { backgroundColor: m3.accent.moodPositive },
  flowMarkOut: { backgroundColor: m3.color.tertiary },
  flowIn: { color: m3.accent.moodPositive },
  flowOut: { color: m3.color.onSurface },

  mapCard: {
    aspectRatio: 1.2,
    borderRadius: m3.shape.none,
    borderWidth: 1,
    borderColor: m3.color.outlineVariant,
    backgroundColor: lensAlpha(m3.color.surfaceContainerLow, 0.9),
    overflow: "hidden",
  },
  mapFoot: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, marginTop: 8 },

  growthCard: { padding: 14 },
  chapterRow: { flexDirection: "row", gap: 12, minHeight: 88 },
  chapterRail: { width: 16, alignItems: "center" },
  chapterDot: {
    width: 10,
    height: 10,
    borderRadius: m3.shape.none,
    marginTop: 6,
    borderWidth: 2,
    borderColor: m3.color.outline,
    backgroundColor: m3.color.surface,
  },
  chapterDotNow: { width: 13, height: 13, borderRadius: m3.shape.none, borderWidth: 0, backgroundColor: m3.color.primary },
  chapterLine: { width: 2, flex: 1, marginTop: 4, backgroundColor: m3.color.outlineVariant },
  chapterBody: { flex: 1, paddingBottom: 16 },
  chapterHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  chapterProgress: { marginTop: 8, marginBottom: 7 },

  healthCard: { padding: 16 },
  healthTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  ringWrap: { width: 112, height: 112, alignItems: "center", justifyContent: "center" },
  ringText: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  ringLevel: { color: m3.color.onSurface, fontFamily: m3.font.mono, fontSize: 30, lineHeight: 32, fontWeight: "700" },
  healthStats: { flex: 1, gap: 7 },
  healthStat: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: m3.shape.none,
    backgroundColor: m3.color.surfaceContainerHigh,
  },
  healthValue: { color: m3.color.onSurface, fontFamily: m3.font.mono, fontWeight: "700" },
  sleepCard: { padding: 16 },
  sleepBars: { height: 126, flexDirection: "row", alignItems: "flex-end", gap: 7 },
  sleepCol: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end", gap: 5 },
  sleepBar: { width: "68%", minHeight: 12, borderTopLeftRadius: 0, borderTopRightRadius: 0, backgroundColor: m3.color.primary },

  restCard: { padding: 14 },
  restMap: {
    height: 250,
    position: "relative",
    overflow: "hidden",
    borderRadius: m3.shape.none,
    backgroundColor: m3.color.surfaceContainerHighest,
  },
  axisVertical: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "50%",
    width: 1,
    backgroundColor: m3.color.outlineVariant,
  },
  axisHorizontal: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    height: 1,
    backgroundColor: m3.color.outlineVariant,
  },
  axisTop: { position: "absolute", top: 7, left: "48%", color: m3.color.onSurfaceVariant },
  axisBottom: { position: "absolute", bottom: 7, left: "48%", color: m3.color.onSurfaceVariant },
  axisLeft: { position: "absolute", left: 7, top: "47%", color: m3.color.onSurfaceVariant },
  axisRight: { position: "absolute", right: 7, top: "47%", color: m3.color.onSurfaceVariant },
  restEmpty: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", paddingHorizontal: 46 },
  restEmptyText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand, textAlign: "center" },
  restCluster: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  restNodeWrap: { position: "absolute", width: 82, alignItems: "center", gap: 4 },
  restNode: { width: 17, height: 17, borderRadius: m3.shape.none, borderWidth: 2, borderColor: m3.color.primary },
  restNodeActive: { backgroundColor: m3.color.primary },
  restNodeDone: { backgroundColor: m3.color.tertiary, borderColor: m3.color.tertiary },
  restNodeText: { width: 82, textAlign: "center", color: m3.color.onSurface, fontFamily: m3.font.brand },
  restFoot: { marginTop: 12, gap: 4, alignItems: "flex-start" },
});
