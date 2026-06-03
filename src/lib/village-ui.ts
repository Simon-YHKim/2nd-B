import { cosmic } from "@/lib/theme/tokens";
import { type VillageId } from "@/lib/graph/relatedness";

export type VillageRoute = "/journal" | "/capture" | "/imagine";

export type VillageUiMeta = {
  island: "work_growth" | "relationship" | "knowledge" | "records" | "imagine" | "inspiration";
  worker: "secondb" | "archi" | "gadi" | "lulu" | "momo" | "vela" | "lumi";
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
    primaryRoute: "/journal",
    primaryLabel: { en: "Leave a growth log", ko: "성장 로그 남기기" },
    speech: {
      en: "Archon can line up the next route from the pieces you left.",
      ko: "Archon이 남겨둔 조각에서 다음 경로를 설계해 볼게요.",
    },
  },
  relation: {
    island: "relationship",
    worker: "gadi",
    accent: cosmic.pixelLamp,
    primaryRoute: "/journal",
    primaryLabel: { en: "Leave a bond log", ko: "관계 로그 남기기" },
    speech: {
      en: "Relia keeps the lamp on where trust and care cross.",
      ko: "Relia가 신뢰와 돌봄이 만나는 곳에 등불을 켜둘게요.",
    },
  },
  knowledge: {
    island: "knowledge",
    worker: "lulu",
    accent: cosmic.signalMint,
    primaryRoute: "/capture",
    primaryLabel: { en: "Capture a wisdom piece", ko: "지혜 조각 담기" },
    speech: {
      en: "Lumen keeps knowledge useful, not just stacked.",
      ko: "Lumen이 지식을 쌓아두는 데서 끝내지 않고 삶에 닿게 묶어둘게요.",
    },
  },
  records: {
    island: "records",
    worker: "momo",
    accent: cosmic.moonWhite,
    primaryRoute: "/journal",
    primaryLabel: { en: "Leave today's log", ko: "오늘의 로그 남기기" },
    speech: {
      en: "Foreman Momo keeps the logs sorted and easy to pull back out.",
      ko: "Foreman Momo가 로그를 꺼내 쓰기 좋게 정리해둘게요.",
    },
  },
  imagine: {
    island: "imagine",
    worker: "secondb",
    accent: cosmic.dreamPink,
    primaryRoute: "/journal",
    primaryLabel: { en: "Ask in divergent mode", ko: "Divergent 모드로 묻기" },
    speech: {
      en: "SecondB can turn a familiar piece sideways and look for a new route.",
      ko: "세컨비가 익숙한 조각을 비스듬히 돌려 새로운 경로를 찾아볼게요.",
    },
  },
  taste: {
    island: "inspiration",
    worker: "lumi",
    accent: cosmic.dreamPink,
    primaryRoute: "/journal",
    primaryLabel: { en: "Leave a muse log", ko: "영감 로그 남기기" },
    speech: {
      en: "Lumina can train the thread inside what keeps catching your eye.",
      ko: "Lumina가 자꾸 눈에 들어오는 것들 사이의 결을 단련해 볼게요.",
    },
  },
};

export const CORE_VILLAGE_UI = {
  island: "core" as const,
  worker: "secondb" as const,
  accent: cosmic.soulViolet,
  speech: {
    en: "Your logs are becoming Pattern Data. I can trace the brightest link.",
    ko: "당신의 로그가 Pattern Data로 모이고 있어요. 가장 밝은 Pattern Link를 따라가볼게요.",
  },
};
