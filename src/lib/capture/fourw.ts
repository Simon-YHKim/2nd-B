// 4W1H structured capture (rev2 P4a, 담기): five format boxes — 누가 / 언제 /
// 어디서 / 무엇을 / 어떻게 — composed into ONE plain-text note body. Transient
// capture mode (like voice/todo): saves through createRecord(kind:"note") with
// a #fourw tag, so it rides the existing records + safety (C9/C3) path with no
// new DB kind. Pure + tested; the screen owns state and rendering.

export const FOURW_KEYS = ["who", "when", "where", "what", "how"] as const;
export type FourWKey = (typeof FOURW_KEYS)[number];
export type FourWFields = Record<FourWKey, string>;

export const EMPTY_FOURW: FourWFields = { who: "", when: "", where: "", what: "", how: "" };

export const FOURW_LABEL: Record<"en" | "ko", Record<FourWKey, string>> = {
  ko: { who: "누가", when: "언제", where: "어디서", what: "무엇을", how: "어떻게" },
  en: { who: "Who", when: "When", where: "Where", what: "What", how: "How" },
};

/** The one required box: 무엇을 (what happened / what it is). */
export function fourWHasContent(fields: FourWFields): boolean {
  return fields.what.trim().length > 0;
}

/**
 * Compose the note body: one "라벨: 값" line per filled box, in 4W1H order.
 * Empty boxes are skipped so the saved piece stays honest about what was
 * actually captured. Returns "" when nothing is filled.
 */
export function composeFourWBody(fields: FourWFields, locale: "en" | "ko"): string {
  const labels = FOURW_LABEL[locale];
  return FOURW_KEYS.map((key) => {
    const value = fields[key].trim();
    return value.length > 0 ? `${labels[key]}: ${value}` : null;
  })
    .filter((line): line is string => line !== null)
    .join("\n");
}
