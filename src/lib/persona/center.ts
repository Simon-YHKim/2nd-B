// "나의 중심" / Center-of-me cards — the §7-2 card restructure from the
// 2026-05-29 handoff (Cosmic Phase 1, item 5). Three short cards that sit
// at the top of the persona screen and speak in the Core Brain
// first-person-plural village voice ("우리"):
//
//   1) 지금 가장 밝은 방향   — the trait burning brightest right now
//   2) 요즘 불 켜진 동네     — the area we've returned to most
//   3) 이걸 만든 조각        — the pieces (assessments/records) behind it
//
// This is a PURE derivation over an already-built PersonaCard, so it's
// trivially testable and never touches the network. The persona screen
// only renders these when a PersonaCard exists, so we can assume the
// inputs are present (traits always are; mbti/attachment/values may not).

import type { PersonaCard, PersonaTraits } from "./build";
import { labelFramework } from "../audit/frameworkLabels";
import { cosmic } from "../theme/tokens";

export interface CenterCard {
  id: "direction" | "neighborhood" | "pieces";
  /** Localized card title (the village label). */
  title: string;
  /** Localized body, first-person-plural Core Brain voice. */
  body: string;
  /** Character accent hex tied to the card's meaning. */
  accent: string;
}

// Brightest-direction phrasing per trait. We frame the single highest
// trait positively, even neuroticism (→ "sensitivity / 예민함") so the
// voice never tips into clinical/deficit framing.
const TRAIT_DIRECTION: Record<"en" | "ko", Record<keyof PersonaTraits, string>> = {
  en: {
    openness: "openness",
    conscientiousness: "follow-through",
    extraversion: "reaching outward",
    agreeableness: "warmth toward others",
    neuroticism: "sensitivity",
  },
  ko: {
    openness: "개방성",
    conscientiousness: "성실함",
    extraversion: "바깥으로 향하는 마음",
    agreeableness: "타인을 향한 다정함",
    neuroticism: "예민함",
  },
};

/** The trait with the highest score. Ties resolve by Big Five order. */
function brightestTrait(traits: PersonaTraits): keyof PersonaTraits {
  const order: (keyof PersonaTraits)[] = [
    "openness",
    "conscientiousness",
    "extraversion",
    "agreeableness",
    "neuroticism",
  ];
  return order.reduce((best, k) => (traits[k] > traits[best] ? k : best), order[0]);
}

/** Join a list with locale-appropriate separators ("a, b, and c" / "a, b, c"). */
function joinSources(parts: string[], locale: "en" | "ko"): string {
  if (parts.length === 0) return locale === "ko" ? "첫 조각들" : "your first pieces";
  if (parts.length === 1) return parts[0];
  if (locale === "ko") return parts.join(", ");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function buildCenterCards(persona: PersonaCard, locale: "en" | "ko"): CenterCard[] {
  const ko = locale === "ko";

  // 1) 지금 가장 밝은 방향
  const trait = brightestTrait(persona.traits);
  const directionLabel = TRAIT_DIRECTION[locale][trait];
  const direction: CenterCard = {
    id: "direction",
    title: ko ? "지금 가장 밝은 방향" : "Brightest direction now",
    body: ko
      ? `요즘 가장 밝게 켜진 방향은 '${directionLabel}' 쪽이에요.`
      : `What's lit brightest in you right now leans toward ${directionLabel}.`,
    accent: cosmic.signalMint,
  };

  // 2) 요즘 불 켜진 동네 — the framework family we've touched, or a gentle
  //    "still gathering" line when nothing has been measured yet.
  const topFramework = persona.values[0];
  const neighborhood: CenterCard = {
    id: "neighborhood",
    title: ko ? "요즘 불 켜진 동네" : "The lit-up neighborhood",
    body: topFramework
      ? ko
        ? `요즘 우리가 자주 머문 동네는 '${labelFramework(topFramework, locale)}' 쪽이에요.`
        : `Lately we keep wandering back to ${labelFramework(topFramework, locale)}.`
      : ko
        ? "아직 한 동네로 모이는 중이에요. 조금만 더 쌓이면 불이 켜질 거예요."
        : "Still settling into one neighborhood — a little more and it'll light up.",
    accent: cosmic.signalBlue,
  };

  // 3) 이걸 만든 조각 — name the signals that fed the model.
  const sources: string[] = [];
  sources.push(
    persona.traitsSource === "bfi"
      ? ko
        ? "Big Five 실측"
        : "a measured Big Five"
      : ko
        ? "일기 기반 추정"
        : "a journal-based estimate",
  );
  if (persona.mbti) sources.push("MBTI");
  if (persona.attachment) sources.push(ko ? "애착 스타일" : "attachment style");
  const frameworkCount = persona.values.length;
  if (frameworkCount > 0) {
    sources.push(ko ? `${frameworkCount}개 프레임워크` : `${frameworkCount} frameworks`);
  }
  const pieces: CenterCard = {
    id: "pieces",
    title: ko ? "이걸 만든 조각" : "The pieces behind this",
    body: ko
      ? `지금 이 모습은 ${joinSources(sources, locale)}에서 모은 조각이에요.`
      : `This shape is pieced together from ${joinSources(sources, locale)}.`,
    accent: cosmic.pixelLamp,
  };

  return [direction, neighborhood, pieces];
}
