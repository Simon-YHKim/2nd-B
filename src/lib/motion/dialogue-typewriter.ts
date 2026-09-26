export const TYPEWRITER_STEP_MS = 32;

const CLAUSE_PAUSE_MS = 72;
const SENTENCE_PAUSE_MS = 144;

export function dialogueDelayAfter(character: string): number {
  if (/[.!?。！？…]/u.test(character)) return SENTENCE_PAUSE_MS;
  if (/[,，:;]/u.test(character)) return CLAUSE_PAUSE_MS;
  return TYPEWRITER_STEP_MS;
}

/** Keep the sound sparse enough that a Korean syllable stream never turns into a buzz. */
export function shouldPlayDialogueBlip(character: string, visibleCount: number): boolean {
  return visibleCount % 2 === 1 && /[^\s.,!?，。！？…:;]/u.test(character);
}

export function dialogueSlice(text: string, visibleCount: number): string {
  return Array.from(text).slice(0, Math.max(0, visibleCount)).join("");
}
