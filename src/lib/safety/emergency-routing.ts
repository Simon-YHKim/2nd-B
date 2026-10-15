// Closed, explicit statements of an immediate physical emergency or an active
// threat to the writer. A language is never evidence of the writer's country.
import { EMERGENCY_PHRASES, HOTLINES, type HotlineId, type Locale } from "./lexicon";

export type EmergencyLane = "medical_emergency" | "immediate_threat";

function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
}

const patterns = (["medical_emergency", "immediate_threat"] as const).flatMap((lane) =>
  (["ko", "en"] as const).flatMap((language) => EMERGENCY_PHRASES[lane][language].map((phrase) => {
    const escaped = normalize(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return {
      lane,
      // Closed Korean phrases also accept joined spacing. The word itself is
      // unchanged; this never promotes a bare noun such as a knife or medicine.
      pattern: new RegExp(`(?:^|[^\\p{L}\\p{N}_])${language === "ko" ? escaped.replace(/ /g, " *") + "(?:요)?" : escaped}(?=$|[^\\p{L}\\p{N}_])`, "u"),
    };
  })),
);

export function matchEmergencyLane(text: string): EmergencyLane | null {
  const normalized = normalize(text);
  // Where both explicit signals occur, an already occurring physical emergency
  // takes priority. Self-harm language alone never selects the threat lane.
  return patterns.find(({ pattern }) => pattern.test(normalized))?.lane ?? null;
}

export function parseEmergencyLane(value: unknown): EmergencyLane | null {
  return value === "medical_emergency" || value === "immediate_threat" ? value : null;
}

/** Closed routing metadata only; ordinary and old support responses stay unchanged. */
export function emergencyLanePayload(text: string): { crisis_lane?: EmergencyLane } {
  const lane = matchEmergencyLane(text);
  return lane ? { crisis_lane: lane } : {};
}

export function emergencyHotline(lane: EmergencyLane): HotlineId {
  return lane === "medical_emergency" ? "KR_119" : "KR_112";
}

export function emergencyHotlineForText(text: string): HotlineId | undefined {
  const lane = matchEmergencyLane(text);
  return lane ? emergencyHotline(lane) : undefined;
}

export function emergencyRoute(value: unknown): { hotline: HotlineId; label: string; number: string } | undefined {
  const lane = parseEmergencyLane(value);
  if (!lane) return undefined;
  const hotline = emergencyHotline(lane);
  return { hotline, ...HOTLINES[hotline] };
}

export function emergencyLaneForHotline(hotline: HotlineId | undefined): EmergencyLane | null {
  return hotline === "KR_119" ? "medical_emergency" : hotline === "KR_112" ? "immediate_threat" : null;
}

export function emergencyGuidance(hotline: HotlineId | undefined, locale: Locale): { text: string; version: string } | null {
  const lane = emergencyLaneForHotline(hotline);
  if (!lane) return null;
  // The number is explicitly conditional on being in South Korea, including on
  // Korean screens. No GPS, country inference, automatic call, or empty tel link.
  const text = lane === "medical_emergency"
    ? locale === "ko"
      ? "지금 신체에 위험이 있다면 현지 긴급전화로 연락해 주세요. 한국에 계시면 119입니다. 가능하면 가까운 사람에게 도움을 요청해 주세요."
      : "If you are in physical danger now, contact your local emergency service. In South Korea, call 119. If you can, ask someone nearby for help."
    : locale === "ko"
      ? "누군가 지금 위협하고 있다면 가능한 경우 안전한 곳으로 이동해 현지 긴급전화로 연락해 주세요. 한국에 계시면 112입니다."
      : "If someone is threatening you now, move to a safe place if you can and contact your local emergency service. In South Korea, call 112.";
  return { text, version: `red-${lane}-${locale}-v1` };
}
