// Dormant S0-B copy preparation. No screen, logging, persistence or I/O.
import en from "../../../locales/en/safety.json";
import ko from "../../../locales/ko/safety.json";
import { systemLocaleFor } from "../i18n/locales";
import { emergencyGuidance } from "../safety/emergency-routing";
import { CRISIS_DIRECTORY_URL } from "../safety/help-directory";
import { HOTLINES } from "../safety/lexicon";
import type { ContactId, Correction, ProbeGuidance } from "./probe-guidance";

export type ProbeGuidanceBlockId = "physical-emergency" | "immediate-threat" |
  "kr-support" | "kr-youth-support" | "us-support" | "unresolved";
export type ProbeGuidanceCopy =
  | { kind: "none" }
  | { kind: "invalid"; code: "invalid-guidance" | "copy-contract" }
  | { kind: "ready"; title: string; blocks: readonly { id: ProbeGuidanceBlockId; body: string }[];
      dismissLabel: string; directory?: { label: string; hint: string; href: string } };

const contactIds: readonly ContactId[] = ["KR_119", "KR_112", "KR_1388", "KR_109", "GLOBAL_988"];
const corrections: readonly Correction[] = ["country-condition-added", "unsupported-country-removed",
  "emergency-priority", "unverified-number-removed"];

function knownList<T extends string>(value: unknown, allowed: readonly T[]): T[] | null {
  if (!Array.isArray(value) || Reflect.ownKeys(value).length !== value.length + 1) return null;
  const result: T[] = [];
  for (let i = 0; i < value.length; i++) {
    const entry = Object.getOwnPropertyDescriptor(value, String(i));
    if (!entry || !Object.hasOwn(entry, "value") || !allowed.includes(entry.value)) return null;
    result.push(entry.value);
  }
  return result;
}

/** Snapshot own data only. Unknown fields, accessors and inherited metadata are not copy inputs. */
function readGuidance(value: unknown): ProbeGuidance | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" ||
      !Object.hasOwn(descriptors[key], "value"))) return null;
    const fields = Object.fromEntries(Object.entries(descriptors).map(([key, entry]) => [key, entry.value]));
    const keys = Object.keys(fields);
    const exactKeys = (expected: readonly string[]) => keys.length === expected.length &&
      expected.every((key) => Object.hasOwn(fields, key));
    if (fields.kind === "none" && exactKeys(["kind"])) return { kind: "none" };
    if (fields.kind === "unresolved" && exactKeys(["kind", "reason"]) &&
      (fields.reason === "unsupported-contact" || fields.reason === "conflicting-intent")) {
      return { kind: "unresolved", reason: fields.reason };
    }
    if (fields.kind !== "contacts" || !exactKeys(["kind", "contacts", "physicalUrgency", "corrections"]) ||
      typeof fields.physicalUrgency !== "boolean") return null;
    const contacts = knownList(fields.contacts, contactIds);
    const knownCorrections = knownList(fields.corrections, corrections);
    if (!contacts?.length || !knownCorrections || fields.physicalUrgency !== contacts.includes("KR_119")) return null;
    return { kind: "contacts", contacts, physicalUrgency: fields.physicalUrgency, corrections: knownCorrections };
  } catch {
    return null;
  }
}

function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{([^{}]+)\}\}/g, (slot, key: string) =>
    Object.hasOwn(values, key) && /^\d+$/.test(values[key]) ? values[key] : slot);
}

/** Fixed approved copy only. Failure never becomes new guidance or a raw-text fallback. */
export function resolveProbeGuidanceCopy(
  guidance: ProbeGuidance, localeTag: string | null | undefined,
): ProbeGuidanceCopy {
  const accepted = readGuidance(guidance);
  if (!accepted) return { kind: "invalid", code: "invalid-guidance" };
  if (accepted.kind === "none") return { kind: "none" };
  try {
    const locale = systemLocaleFor(localeTag);
    const pack = locale === "ko" ? ko : en;
    const copy = pack.interviewGuidance;
    const blocks: { id: ProbeGuidanceBlockId; body: string }[] = [];
    let directory = accepted.kind === "unresolved";
    if (accepted.kind === "unresolved") {
      blocks.push({ id: "unresolved", body: copy.unresolved });
    } else {
      const contacts = new Set(accepted.contacts);
      if (contacts.has("KR_119")) blocks.push({ id: "physical-emergency", body: emergencyGuidance("KR_119", locale)?.text ?? "" });
      if (contacts.has("KR_112")) blocks.push({ id: "immediate-threat", body: emergencyGuidance("KR_112", locale)?.text ?? "" });
      if (contacts.has("KR_1388")) {
        blocks.push({ id: "kr-youth-support", body: fill(copy.krYouthSupport,
          { youthNumber: HOTLINES.KR_1388.number, supportNumber: HOTLINES.KR_109.number }) });
      } else if (contacts.has("KR_109")) {
        blocks.push({ id: "kr-support", body: fill(copy.krSupport, { supportNumber: HOTLINES.KR_109.number }) });
      }
      if (contacts.has("GLOBAL_988")) {
        blocks.push({ id: "us-support", body: fill(copy.usSupport, { supportNumber: HOTLINES.GLOBAL_988.number }) });
        directory = true;
      }
    }
    const result: Extract<ProbeGuidanceCopy, { kind: "ready" }> = {
      kind: "ready", title: copy.title, blocks, dismissLabel: pack.red.dismiss,
      ...(directory ? { directory: { label: copy.directoryLabel, hint: pack.red.directoryHint, href: CRISIS_DIRECTORY_URL } } : {}),
    };
    // Count each stored display/a11y string once, including the URL and field boundaries.
    // No duplicate full-body accessibility string or truncation is emitted.
    const strings = [result.title, ...blocks.map((block) => block.body), result.dismissLabel,
      ...(result.directory ? [result.directory.label, result.directory.hint, result.directory.href] : [])];
    if (!blocks.length || blocks.length > 3 || strings.some((text) =>
      typeof text !== "string" || !text.trim() || /[{}]/.test(text)) || Array.from(strings.join("\n")).length > 768) {
      return { kind: "invalid", code: "copy-contract" };
    }
    return result;
  } catch {
    return { kind: "invalid", code: "copy-contract" };
  }
}
