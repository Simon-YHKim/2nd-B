import { cosmic } from "@/lib/theme/tokens";
import { type VillageId } from "@/lib/graph/relatedness";

// All village primary CTAs now point at the unified capture screen (/journal was
// retired to a redirect; emitting it here caused a silent redirect tax).
export type VillageRoute = "/capture";

export type VillageUiMeta = {
  island: "work_growth" | "relationship" | "knowledge" | "records" | "inspiration";
  worker: "archi" | "gadi" | "lulu" | "momo" | "lumi";
  accent: string;
  primaryRoute: VillageRoute;
  primaryLabel: { en: string; ko: string };
  speech: { en: string; ko: string };
};

export const VILLAGE_UI: Record<VillageId, VillageUiMeta> = {
  work: {
    island: "work_growth",
    worker: "archi",
    accent: cosmic.signalBlue,
    primaryRoute: "/capture",
    primaryLabel: { en: "Leave a growth piece", ko: "성장 조각 남기기" },
    speech: {
      en: "I can line up the pieces that show where you're growing.",
      ko: "자라나는 조각들을 한 줄로 이어볼게요.",
    },
  },
  relation: {
    island: "relationship",
    worker: "gadi",
    accent: cosmic.pixelLamp, // Bond Core / Relia — amber
    primaryRoute: "/capture",
    primaryLabel: { en: "Leave a people piece", ko: "관계 조각 남기기" },
    speech: {
      en: "People pieces need a steady hand. I'll keep them clear and gentle.",
      ko: "관계의 조각은 조심히 다뤄볼게요.",
    },
  },
  knowledge: {
    island: "knowledge",
    worker: "lulu",
    accent: cosmic.signalMint,
    primaryRoute: "/capture",
    primaryLabel: { en: "Capture a knowledge piece", ko: "지식 조각 담기" },
    speech: {
      en: "Bring a source here and I'll help it find its shelf.",
      ko: "자료를 가져오면 찾기 쉬운 자리로 묶어둘게요.",
    },
  },
  records: {
    island: "records",
    worker: "momo",
    accent: cosmic.moonWhite, // Narrative Core / Foreman Momo — monochrome
    primaryRoute: "/capture",
    primaryLabel: { en: "Leave today's piece", ko: "오늘의 조각 남기기" },
    speech: {
      en: "Every piece is kept by time. Want to pull a memory back out?",
      ko: "모든 조각은 시간순으로 보관돼 있어요. 필요한 기억을 꺼내볼까요?",
    },
  },
  taste: {
    island: "inspiration",
    worker: "lumi",
    accent: cosmic.dreamPink, // Muse Core / Lumina
    primaryRoute: "/capture",
    primaryLabel: { en: "Leave an inspiration piece", ko: "영감 조각 남기기" },
    speech: {
      en: "What you keep liking often points toward the next spark.",
      ko: "좋아하는 것들이 다음 불빛을 알려줄 때가 있어요.",
    },
  },
};

export const CORE_VILLAGE_UI = {
  island: "core" as const,
  worker: "secondb" as const,
  accent: cosmic.soulViolet,
  speech: {
    en: "I found the brightest link. Want to narrow it into today's direction?",
    ko: "가장 밝은 연결을 찾았어요. 오늘의 방향으로 줄여볼까요?",
  },
};
