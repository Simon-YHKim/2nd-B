import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { Blob } from "node:buffer";
import i18next from "i18next";
import ts from "typescript";

import { withAiCopyTail } from "../../chat/ai-mark";
import { buildChecklistShareText, buildGoogleCalendarUrl, buildIcsEvent } from "../push";
import type { OpsRecommendation } from "../recommend-parse";
import type { OpsEventInput } from "../push";

// Run the active screen's real export handlers. Only OS/browser delivery is
// replaced; text/calendar builders, disclosure helper and translations are real.
const screen = resolve(__dirname, "../../../screens/deepspace/dds-ops-screen.tsx");
const source = ts.createSourceFile(screen, readFileSync(screen, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function handler(name: string): string {
  let found: ts.FunctionDeclaration | undefined;
  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!found) throw new Error(`Missing active export handler: ${name}`);
  return found.getText(source);
}
const code = ts.transpileModule(`${handler("eventFor")}\n${handler("runExternalAction")}\nrunExternalAction;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

const LANGUAGES = ["ko", "en", "es", "pt", "id"] as const;
const bundles = Object.fromEntries(LANGUAGES.map((language) => [language, {
  secondb: JSON.parse(readFileSync(resolve(__dirname, `../../../../locales/${language}/secondb.json`), "utf8")) as { aiCopyTail: string },
}]));
const translations = i18next.createInstance();
beforeAll(async () => {
  await translations.init({ resources: bundles, lng: "en", fallbackLng: "en", defaultNS: "secondb" });
});

const RECOMMENDATION: OpsRecommendation = {
  title: "Evening notes",
  reason: "Keep the notes you chose, then review them.",
  startsAtIso: "2026-10-17T12:00:00.000Z",
  durationMinutes: 20,
  recurrence: "weekly",
  checklist: ["Choose one note", "Write one next step"],
};

function exportHarness(language: (typeof LANGUAGES)[number]) {
  const share = jest.fn<Promise<void>, [{ message: string }]>().mockResolvedValue(undefined);
  const calendar = jest.fn<Promise<"saved">, [OpsEventInput]>().mockResolvedValue("saved");
  const openURL = jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);
  const createObjectURL = jest.fn<string, [Blob]>().mockReturnValue("blob:export-test");
  const revokeObjectURL = jest.fn();
  const click = jest.fn();
  const anchor = { href: "", download: "", click };
  const setNotice = jest.fn();
  const run = runInNewContext(code, {
    withAiCopyTail, buildChecklistShareText, buildGoogleCalendarUrl, buildIcsEvent,
    t: translations.getFixedT(language),
    nextMorningIso: () => "2026-10-18T00:00:00.000Z",
    Share: { share }, Linking: { openURL }, addEventToDeviceCalendar: calendar,
    Blob, URL: { createObjectURL, revokeObjectURL },
    document: { createElement: () => anchor },
    isCurrentOwner: (ownerId: string) => ownerId === "owner-a", setNotice,
  }) as (ownerId: string, kind: "device" | "google" | "ics" | "share", recommendation: OpsRecommendation) => Promise<void>;
  return { run, share, calendar, openURL, createObjectURL, revokeObjectURL, anchor, setNotice };
}

describe.each(LANGUAGES)("AI routine exports (%s)", (language) => {
  const tail = bundles[language].secondb.aiCopyTail;
  const disclosedReason = `${RECOMMENDATION.reason}\n\n${tail}`;

  test("text sharing carries the approved tail after the checklist", async () => {
    const h = exportHarness(language);
    const input = structuredClone(RECOMMENDATION);
    await h.run("owner-a", "share", input);
    expect(h.share).toHaveBeenCalledWith({
      message: `${RECOMMENDATION.title}\n\n- [ ] Choose one note\n- [ ] Write one next step\n\n${tail}`,
    });
    expect(input).toEqual(RECOMMENDATION);
  });

  test("a recommendation without a checklist also retains the label", async () => {
    const h = exportHarness(language);
    const { checklist: _checklist, ...input } = RECOMMENDATION;
    await h.run("owner-a", "share", input);
    expect(h.share.mock.calls[0][0].message).toBe(`${input.title}\n\n- [ ] ${input.reason}\n\n${tail}`);
  });

  test("Google Calendar details carry the label without changing event fields", async () => {
    const h = exportHarness(language);
    await h.run("owner-a", "google", RECOMMENDATION);
    const query = new URL(h.openURL.mock.calls[0][0]).searchParams;
    expect(query.get("details")).toBe(disclosedReason);
    expect(query.get("text")).toBe(RECOMMENDATION.title);
    expect(query.get("dates")).toBe("20261017T120000Z/20261017T122000Z");
    expect(query.get("recur")).toBe("RRULE:FREQ=WEEKLY");
  });

  test("ICS includes the label inside DESCRIPTION and retains valid event structure", async () => {
    const h = exportHarness(language);
    await h.run("owner-a", "ics", RECOMMENDATION);
    const blob = h.createObjectURL.mock.calls[0][0];
    const ics = await blob.text();
    const description = ics.split("\r\n").find((line) => line.startsWith("DESCRIPTION:"));
    expect(description).toBe(`DESCRIPTION:Keep the notes you chose\\, then review them.\\n\\n${tail}`);
    expect(ics).toContain("DTSTART:20261017T120000Z\r\nDTEND:20261017T122000Z\r\n");
    expect(ics.endsWith("RRULE:FREQ=WEEKLY\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n")).toBe(true);
    expect(blob.type).toBe("text/calendar;charset=utf-8");
    expect(h.anchor.download).toBe("polascope-routine.ics");
    expect(h.anchor.click).toHaveBeenCalledTimes(1);
    expect(h.revokeObjectURL).toHaveBeenCalledWith("blob:export-test");
  });

  test("the device calendar receives the label in notes and the original timing", async () => {
    const h = exportHarness(language);
    await h.run("owner-a", "device", RECOMMENDATION);
    expect(h.calendar).toHaveBeenCalledWith({
      title: RECOMMENDATION.title, description: disclosedReason,
      startsAtIso: RECOMMENDATION.startsAtIso, durationMinutes: 20, recurrence: "weekly",
    });
    expect(h.setNotice).toHaveBeenCalledWith({ tone: "normal", keys: ["push.savedNote"] });
  });
});

test("generic builders keep directly entered text unlabelled", () => {
  expect(buildChecklistShareText("My plan", ["My own task"])).toBe("My plan\n\n- [ ] My own task");
  const url = buildGoogleCalendarUrl({ title: "My plan", description: "My own reason", startsAtIso: RECOMMENDATION.startsAtIso! });
  expect(new URL(url!).searchParams.get("details")).toBe("My own reason");
});
