// Friendly bilingual labels for the Framework union from questions.ts.
// Source-of-truth for trait-family naming on persona surfaces. Avoids
// raw enum strings like "sdt:autonomy" leaking to the UI.

import type { Framework } from "./questions";

export const FRAMEWORK_LABEL: Record<"en" | "ko", Record<Framework, string>> = {
  en: {
    "big_five:openness": "Big Five · Openness",
    "big_five:conscientiousness": "Big Five · Conscientiousness",
    "big_five:extraversion": "Big Five · Extraversion",
    "big_five:agreeableness": "Big Five · Agreeableness",
    "big_five:neuroticism": "Big Five · Neuroticism",
    "sdt:autonomy": "Self-Determination · Autonomy",
    "sdt:competence": "Self-Determination · Competence",
    "sdt:relatedness": "Self-Determination · Relatedness",
    "via:character_strength": "VIA · Character strength",
    "attachment:secure": "Attachment · Secure base",
    "attachment:anxiety": "Attachment · Anxiety",
    "attachment:avoidance": "Attachment · Avoidance",
  },
  ko: {
    "big_five:openness": "Big Five · 개방성",
    "big_five:conscientiousness": "Big Five · 성실성",
    "big_five:extraversion": "Big Five · 외향성",
    "big_five:agreeableness": "Big Five · 친화성",
    "big_five:neuroticism": "Big Five · 신경성",
    "sdt:autonomy": "자기결정성 · 자율성",
    "sdt:competence": "자기결정성 · 유능감",
    "sdt:relatedness": "자기결정성 · 관계성",
    "via:character_strength": "VIA · 성격 강점",
    "attachment:secure": "애착 · 안정 기반",
    "attachment:anxiety": "애착 · 불안",
    "attachment:avoidance": "애착 · 회피",
  },
};

export function labelFramework(framework: string, locale: "en" | "ko"): string {
  const map = FRAMEWORK_LABEL[locale];
  return (map as Record<string, string>)[framework] ?? framework;
}
