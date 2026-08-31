import {
  DOMAIN_TAG_PREFIX,
  domainTagFor,
  isDomainId,
  isDomainTag,
  type DomainId,
} from "../persona/domain-stars";

export const LIFE_AREA_IDS = [
  "career",
  "finance",
  "relation",
  "health",
  "growth",
  "recreation",
] as const satisfies readonly DomainId[];

export type LifeAreaId = (typeof LIFE_AREA_IDS)[number];
export const LIFE_AREA_LOCALES = ["en", "ko", "es", "pt", "id"] as const;
export type LifeAreaLocale = (typeof LIFE_AREA_LOCALES)[number];

interface LifeAreaCardCopy {
  label: string;
  helper: string;
  context: string;
}

export interface LifeAreaIntentCopy {
  title: string;
  helper: string;
  selected: string;
  clear: string;
  cards: Record<LifeAreaId, LifeAreaCardCopy>;
}

export const LIFE_AREA_INTENT_COPY = {
  en: {
    title: "Start with a life area",
    helper: "Choose a context for this note. You can clear it anytime.",
    selected: "Selected life area",
    clear: "Clear area selection",
    cards: {
      career: { label: "Career", helper: "Work and career notes", context: "Career note" },
      finance: { label: "Finance", helper: "Money and budget notes", context: "Finance note" },
      relation: { label: "Relationships", helper: "People and relationship notes", context: "Relationship note" },
      health: { label: "Health", helper: "A life note you write yourself", context: "Health life note" },
      growth: { label: "Growth", helper: "Learning and goal notes", context: "Growth note" },
      recreation: { label: "Rest", helper: "Rest and leisure notes", context: "Rest note" },
    },
  },
  ko: {
    title: "생활 영역으로 시작",
    helper: "이 메모의 맥락을 고르세요. 언제든 지울 수 있어요.",
    selected: "선택한 생활 영역",
    clear: "영역 선택 지우기",
    cards: {
      career: { label: "커리어", helper: "일과 커리어 메모", context: "커리어 메모" },
      finance: { label: "재정", helper: "돈과 예산 메모", context: "재정 메모" },
      relation: { label: "관계", helper: "사람과 관계 메모", context: "관계 메모" },
      health: { label: "건강", helper: "내가 직접 쓰는 생활 메모", context: "건강 생활 메모" },
      growth: { label: "성장", helper: "배움과 목표 메모", context: "성장 메모" },
      recreation: { label: "휴식", helper: "휴식과 여가 메모", context: "휴식 메모" },
    },
  },
  es: {
    title: "Empezar por un área de vida",
    helper: "Elige el contexto de esta nota. Puedes quitarlo cuando quieras.",
    selected: "Área de vida seleccionada",
    clear: "Quitar selección de área",
    cards: {
      career: { label: "Carrera", helper: "Notas de trabajo y carrera", context: "Nota de carrera" },
      finance: { label: "Finanzas", helper: "Notas de dinero y presupuesto", context: "Nota de finanzas" },
      relation: { label: "Relaciones", helper: "Notas sobre personas y relaciones", context: "Nota de relaciones" },
      health: { label: "Salud", helper: "Una nota de vida escrita por ti", context: "Nota de vida y salud" },
      growth: { label: "Crecimiento", helper: "Notas de aprendizaje y metas", context: "Nota de crecimiento" },
      recreation: { label: "Descanso", helper: "Notas de descanso y tiempo libre", context: "Nota de descanso" },
    },
  },
  pt: {
    title: "Começar por uma área da vida",
    helper: "Escolha o contexto desta nota. Você pode limpá-lo quando quiser.",
    selected: "Área da vida selecionada",
    clear: "Limpar seleção de área",
    cards: {
      career: { label: "Carreira", helper: "Notas de trabalho e carreira", context: "Nota de carreira" },
      finance: { label: "Finanças", helper: "Notas de dinheiro e orçamento", context: "Nota de finanças" },
      relation: { label: "Relações", helper: "Notas sobre pessoas e relações", context: "Nota de relações" },
      health: { label: "Saúde", helper: "Uma nota de vida escrita por você", context: "Nota de vida e saúde" },
      growth: { label: "Crescimento", helper: "Notas de aprendizado e metas", context: "Nota de crescimento" },
      recreation: { label: "Descanso", helper: "Notas de descanso e tempo livre", context: "Nota de descanso" },
    },
  },
  id: {
    title: "Mulai dari area kehidupan",
    helper: "Pilih konteks untuk catatan ini. Pilihan dapat dihapus kapan saja.",
    selected: "Area kehidupan terpilih",
    clear: "Hapus pilihan area",
    cards: {
      career: { label: "Karier", helper: "Catatan kerja dan karier", context: "Catatan karier" },
      finance: { label: "Keuangan", helper: "Catatan uang dan anggaran", context: "Catatan keuangan" },
      relation: { label: "Relasi", helper: "Catatan tentang orang dan relasi", context: "Catatan relasi" },
      health: { label: "Kesehatan", helper: "Catatan kehidupan yang Anda tulis sendiri", context: "Catatan kehidupan dan kesehatan" },
      growth: { label: "Pertumbuhan", helper: "Catatan belajar dan tujuan", context: "Catatan pertumbuhan" },
      recreation: { label: "Istirahat", helper: "Catatan istirahat dan waktu luang", context: "Catatan istirahat" },
    },
  },
} as const satisfies Record<LifeAreaLocale, LifeAreaIntentCopy>;

export function resolveLifeAreaLocale(language: string | null | undefined): LifeAreaLocale {
  const base = (language ?? "en").toLowerCase().split("-")[0];
  return (LIFE_AREA_LOCALES as readonly string[]).includes(base) ? (base as LifeAreaLocale) : "en";
}

/** Parse only the exact reserved form. `collect` is a fallback, not a life area. */
export function lifeAreaFromTag(raw: string | null | undefined): LifeAreaId | null {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (!isDomainTag(normalized)) return null;
  const slug = normalized.slice(DOMAIN_TAG_PREFIX.length);
  if (!isDomainId(slug) || slug === "collect") return null;
  if (domainTagFor(slug) !== normalized) return null;
  return (LIFE_AREA_IDS as readonly string[]).includes(slug) ? (slug as LifeAreaId) : null;
}

export function isRecordCaptureMode(mode: string | null | undefined): boolean {
  return mode === "journal" || mode === "voice" || mode === "todo" || mode === "fourw";
}

/**
 * The selected area is composed after classifier output. Reserved domain tags
 * are instrument metadata, so a selected area replaces every earlier one and
 * is emitted exactly once without changing ordinary user tags.
 */
export function withSelectedLifeArea(tags: readonly string[], area: LifeAreaId): string[] {
  return [domainTagFor(area), ...tags.filter((tag) => !isDomainTag(tag))];
}
