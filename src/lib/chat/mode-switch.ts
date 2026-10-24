import type { Rev2PersonaId } from "./rev2-personas";

/** Presentation only: an unknown older turn must not invent a mode change. */
export function modeSwitchPersona(
  previous: Rev2PersonaId | undefined,
  next: Rev2PersonaId | undefined,
): Rev2PersonaId | null {
  return previous !== undefined && next !== undefined && previous !== next ? next : null;
}
