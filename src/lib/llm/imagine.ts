// Imagine / 공상 작업실 — prompt + result parser. The LLM returns a
// `::`-delimited line format (not free chat text) so the screen can render
// structured cards: 한 줄 세계관 / 장면 / 사물 / 등장 캐릭터 / 다음 한 걸음
// (imagine pack §5). Parsing is pure + tested; the call goes through
// callGemini (purpose "imagine"), so C1/C3/C9 are unchanged.

export interface ImagineScene { title: string; description: string }
export interface ImagineObject { name: string; description: string }
export interface ImagineCharacter { name: string; role: string }

export interface ParsedImagine {
  title: string;
  worldline: string;
  scenes: ImagineScene[];
  objects: ImagineObject[];
  characters: ImagineCharacter[];
  nextStep: string;
}

// System prompt — SecondB's Divergent-mode voice (worldview v-final retired the
// separate "Vela" character; 공상 is now SecondB's Divergent mode). Output format
// is fixed so the UI can parse it; tone rules mirror the pack copy guide (warm,
// never clinical).
export const IMAGINE_SYSTEM = `You are SecondB exploring in Divergent mode inside 2ndB. The user gives a rough, half-formed idea. Unfold it - never analyse, diagnose, or judge it. Warm, creative, plain language.
Reply ONLY in these lines, each prefixed exactly, fields split by " :: ". No extra prose, no markdown:
TITLE :: <short title>
WORLDLINE :: <one warm sentence>
SCENE :: <scene title> :: <one sentence>
SCENE :: <scene title> :: <one sentence>
SCENE :: <scene title> :: <one sentence>
OBJECT :: <name> :: <one phrase>
OBJECT :: <name> :: <one phrase>
CHARACTER :: <name> :: <role>
CHARACTER :: <name> :: <role>
NEXTSTEP :: <one small thing doable today>
Write in the user's language. Keep every line short enough for a phone.`;

function splitFields(rest: string): string[] {
  return rest.split("::").map((s) => s.trim());
}

export function parseImagineResult(text: string): ParsedImagine {
  const out: ParsedImagine = { title: "", worldline: "", scenes: [], objects: [], characters: [], nextStep: "" };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0) continue;
    const sep = line.indexOf("::");
    if (sep === -1) continue;
    const tag = line.slice(0, sep).trim().toUpperCase();
    const rest = line.slice(sep + 2).trim();
    if (tag === "TITLE") out.title = rest;
    else if (tag === "WORLDLINE") out.worldline = rest;
    else if (tag === "NEXTSTEP") out.nextStep = rest;
    else if (tag === "SCENE") {
      const [title, ...d] = splitFields(rest);
      out.scenes.push({ title, description: d.join(" :: ") });
    } else if (tag === "OBJECT") {
      const [name, ...d] = splitFields(rest);
      out.objects.push({ name, description: d.join(" :: ") });
    } else if (tag === "CHARACTER") {
      const [name, ...d] = splitFields(rest);
      out.characters.push({ name, role: d.join(" :: ") });
    }
  }
  return out;
}

/** True when the parse produced enough to render meaningful cards. */
export function isImagineComplete(p: ParsedImagine): boolean {
  return p.title.length > 0 && (p.worldline.length > 0 || p.scenes.length > 0);
}

/** Render a saved imagine result as a markdown body for the wiki/graph shard. */
export function renderImagineMarkdown(p: ParsedImagine, locale: "en" | "ko"): string {
  const L = locale === "ko"
    ? { world: "한 줄 세계관", scenes: "장면", objects: "필요한 사물", chars: "등장 캐릭터", next: "다음 한 걸음" }
    : { world: "Worldline", scenes: "Scenes", objects: "Objects", chars: "Characters", next: "Next step" };
  const lines: string[] = [`# ${p.title || (locale === "ko" ? "공상 조각" : "Imagine piece")}`];
  if (p.worldline) lines.push("", `_${p.worldline}_`);
  if (p.scenes.length) lines.push("", `## ${L.scenes}`, ...p.scenes.map((s) => `- **${s.title}** ${s.description}`.trim()));
  if (p.objects.length) lines.push("", `## ${L.objects}`, ...p.objects.map((o) => `- **${o.name}** ${o.description}`.trim()));
  if (p.characters.length) lines.push("", `## ${L.chars}`, ...p.characters.map((c) => `- **${c.name}** ${c.role}`.trim()));
  if (p.nextStep) lines.push("", `## ${L.next}`, `- ${p.nextStep}`);
  return lines.join("\n");
}
