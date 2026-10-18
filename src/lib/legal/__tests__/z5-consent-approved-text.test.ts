// Z5 (Q-261013-06 approved text, Q-261018-49 가): the seven signup-notice strings are the
// approved text word for word, es/pt/id carry the English, and the text is bound to the
// consent revision that records it. Changing a string without a new revision (and a new row
// below) fails, so one revision string can never stand for two notice bodies.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { VERIFIED_EMAIL_SIGNUP_REVISION } from "../../supabase/auth";
import { CONSENT_VERSION, PRIVACY_POLICY_VERSION, TERMS_VERSION } from "../../supabase/consent";
import { SERVICE_CONSENT_REVISION } from "../../privacy/service-consent";

const ROOT = resolve(__dirname, "../../../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8").replace(/\r\n/g, "\n");
const KEYS = ["intro", "ackService", "ackLlm", "ackOverseas", "ackSensitive", "ackSafety", "optMarketing"] as const;
const DOC = read("docs/handoff/Z5-CONSENT-APPROVED-TEXT-261013.md");

/** The quoted paragraphs under one label inside one key's section of the approved-text doc. */
function approved(key: string, label: "한국어(승인 시안):" | "English (legal draft):"): string {
  const section = new RegExp("### `notice\\." + key + "`[^\\n]*\\n([\\s\\S]*?)(?=\\n### |$)").exec(DOC)?.[1];
  if (!section) throw new Error(`no approved section for ${key}`);
  const ko = section.indexOf("한국어(승인 시안):");
  const en = section.indexOf("English (legal draft):");
  const part = label.startsWith("한국어") ? section.slice(ko, en) : section.slice(en);
  const paragraphs: string[] = [];
  let current: string[] = [];
  for (const line of part.split("\n").slice(1)) {
    if (!line.startsWith(">")) {
      if (line.trim() === "") continue;
      break;
    }
    const body = line.slice(1).trim();
    if (body === "") {
      if (current.length) paragraphs.push(current.join(" "));
      current = [];
    } else current.push(body);
  }
  if (current.length) paragraphs.push(current.join(" "));
  return paragraphs.join("\n");
}

const locale = (lang: string) =>
  (JSON.parse(read(`locales/${lang}/consent.json`)) as { notice: Record<string, string> }).notice;
const text = { ko: locale("ko"), en: locale("en") };
const digestOf = (strings: { ko: Record<string, string>; en: Record<string, string> }) =>
  createHash("sha256")
    .update(JSON.stringify(KEYS.map((key) => [key, strings.ko[key], strings.en[key]])))
    .digest("hex");

// One row per signup-notice revision since Z5. Append-only: a new notice text gets a new
// revision (and server tuple), never an edited digest.
const NOTICE_TEXT_BY_REVISION = {
  "email-v10": {
    service: "service-v5",
    tuple: ["2026-10-18", "2026-10-07", "2026-10-05"],
    digest: "b8e8004c010fd553920f52c98e19eacdc2add2cde9ea25102460feefebfafb82",
  },
} as const;

describe("Z5 approved signup-notice text", () => {
  test.each(KEYS)("%s is the approved Korean and English text, exactly", (key) => {
    expect(text.ko[key]).toBe(approved(key, "한국어(승인 시안):"));
    expect(text.en[key]).toBe(approved(key, "English (legal draft):"));
  });

  test("the overseas check keeps its four lines and the sensitive example stays", () => {
    expect(text.ko.ackOverseas.split("\n")).toHaveLength(4);
    expect(text.en.ackOverseas.split("\n")).toHaveLength(4);
    expect(text.ko.ackSensitive).toContain("건강, 신념");
    expect(text.ko.ackSafety).toContain("응급 서비스가 아니며");
  });

  test.each(["es", "pt", "id"])("%s shows the English text for every approved key", (lang) => {
    const notice = locale(lang);
    for (const key of KEYS) expect(notice[key]).toBe(text.en[key]);
  });

  test("the text is bound to the revision and document tuple that record it", () => {
    const row = NOTICE_TEXT_BY_REVISION[VERIFIED_EMAIL_SIGNUP_REVISION as keyof typeof NOTICE_TEXT_BY_REVISION];
    expect(row).toBeDefined();
    expect(SERVICE_CONSENT_REVISION).toBe(row.service);
    expect([CONSENT_VERSION, PRIVACY_POLICY_VERSION, TERMS_VERSION]).toEqual(row.tuple);
    expect(digestOf(text)).toBe(row.digest);
  });

  test("the binding fails when a string changes under the same revision", () => {
    const edited = { ko: { ...text.ko, ackSafety: `${text.ko.ackSafety} ` }, en: text.en };
    expect(digestOf(edited)).not.toBe(NOTICE_TEXT_BY_REVISION["email-v10"].digest);
  });
});
