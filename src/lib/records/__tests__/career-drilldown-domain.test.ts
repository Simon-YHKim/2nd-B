// The career drill-down files every save under the career star, in every locale
// (BL-I18NRT-01, 2026-10-05).
//
// WHY. /career-drilldown is only reached from the career star (/star/career's
// secondary action) and the career timeline (/career). Its save used to leave the
// domain to the detector (detect-domain.ts), which votes on KO substrings and EN
// word-boundary keywords only. The body it saves carries the experience type in
// the PAINTED language ("Type: Part-time work" / "Tipo: Trabajo a tiempo
// parcial" ...), so the same pick filed under career in EN ("work") and under
// collect in es/pt/id. That was latent until the screen started painting es/pt/id
// copy on first launch (renderedUiLanguage, R2B-02): before it, a lazy locale read
// EN copy until the language was re-picked in settings, so first-launch saves
// happened to file under career.
//
// The fix is the 별 담기 provenance shape that interview.tsx already uses for the
// growth star: a typed domainIntent, not a raw `domain:*` tag (createRecord strips
// those). This test reads the screen's REAL copy and the domainIntent its save
// call actually passes, and runs them through the real createRecord - so taking
// the intent out of the screen turns it red.
//
// It does not pin what the detector says about any text: if the detector learns
// es/pt/id later, nothing here should break.

const mockCallAdvisor = jest.fn();
const mockCallLlm = jest.fn();
const mockClassifyRecordCrisis = jest.fn();

jest.mock("../../llm/boundary", () => ({
  callAdvisor: (...args: unknown[]) => mockCallAdvisor(...args),
  callLlm: (...args: unknown[]) => mockCallLlm(...args),
  classifyRecordTextForCrisis: (...args: unknown[]) => mockClassifyRecordCrisis(...args),
}));

jest.mock("../../progression/xp", () => ({
  awardXpSafe: jest.fn().mockResolvedValue(null),
}));

jest.mock("../../knowledge/engines", () => ({
  buildMemorizedPattern: jest.fn(() => ({ user_id: "u1" })),
}));

const mockInsert = jest.fn();
jest.mock("../../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => ({
      insert: (row: unknown) => {
        mockInsert(row);
        return {
          select: () => ({
            single: async () => ({ data: { id: "r1" }, error: null }),
          }),
        };
      },
    }),
  }),
}));

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createRecord } from "../create";
import type { DomainId } from "../../persona/domain-stars";

const SCREEN = "src/app/career-drilldown.tsx";
const src = readFileSync(join(process.cwd(), SCREEN), "utf8").replace(/\r\n/g, "\n");

const LOCALES = ["en", "ko", "es", "pt", "id"] as const;
type CopyLocale = (typeof LOCALES)[number];

/** typeLineLabel + expTypes of one locale, read from the screen's CAREER_COPY. */
function copyOf(locale: CopyLocale): { typeLineLabel: string; expTypes: string[] } {
  const start = src.indexOf(`\n  ${locale}: {\n`, src.indexOf("const CAREER_COPY"));
  if (start < 0) throw new Error(`CAREER_COPY.${locale} not found in ${SCREEN}`);
  const m = /typeLineLabel: "([^"]+)",\s*\n\s*expTypes: \[([\s\S]*?)\]/.exec(src.slice(start));
  if (!m) throw new Error(`CAREER_COPY.${locale} has no typeLineLabel/expTypes`);
  const expTypes = Array.from(m[2].matchAll(/"([^"]+)"/g), (x) => x[1]);
  return { typeLineLabel: m[1], expTypes };
}

/** The object literal the screen hands to createRecord inside submit(). */
function saveCall(): string {
  const start = src.indexOf("await createRecord({");
  if (start < 0) throw new Error(`no createRecord call in ${SCREEN}`);
  const end = src.indexOf("\n        });", start);
  if (end < 0) throw new Error("createRecord call has no close");
  return src.slice(start, end);
}

/** The domainIntent the screen's save passes, or undefined when it passes none. */
function wiredIntent(): DomainId | undefined {
  const m = /domainIntent:\s*"([a-z]+)"/.exec(saveCall());
  return m ? (m[1] as DomainId) : undefined;
}

beforeEach(() => {
  mockCallAdvisor.mockReset();
  mockCallLlm.mockReset();
  mockClassifyRecordCrisis.mockReset().mockResolvedValue(null);
  mockInsert.mockClear();
});

describe("career drill-down: one pick, one star, five locales", () => {
  test("the parser is reading the real screen (five locales, same 11 types each)", () => {
    for (const locale of LOCALES) {
      const { typeLineLabel, expTypes } = copyOf(locale);
      expect(typeLineLabel.length).toBeGreaterThan(0);
      expect(expTypes).toHaveLength(11);
    }
    // The test rebuilds the body the way submit() does; if submit stops writing the
    // type line like this, the reconstruction below is no longer the screen's body.
    expect(src).toContain("expType ? `${copy.typeLineLabel}: ${expType}` : null");
    expect(src).toContain("topic: head,");
    expect(src).toContain('locale: isKo ? "ko" : "en",');
  });

  test("the save passes the career star as a typed domainIntent", () => {
    expect(saveCall()).toContain('domainIntent: "career"');
  });

  test("every experience type files under domain:career in en/ko/es/pt/id", async () => {
    const intent = wiredIntent();
    const copies = Object.fromEntries(LOCALES.map((l) => [l, copyOf(l)])) as Record<
      CopyLocale,
      { typeLineLabel: string; expTypes: string[] }
    >;
    const head = "Nova"; // a summary with no keyword of any domain

    for (let i = 0; i < 11; i += 1) {
      const filed: Record<string, string> = {};
      for (const locale of LOCALES) {
        const { typeLineLabel, expTypes } = copies[locale];
        mockInsert.mockClear();
        const res = await createRecord({
          userId: "u1",
          locale: locale === "ko" ? "ko" : "en",
          minor: false,
          kind: "note",
          body: [head, `${typeLineLabel}: ${expTypes[i]}`].join("\n"),
          topic: head,
          tags: ["career_drilldown"],
          domainIntent: intent,
        });
        const row = mockInsert.mock.calls[0][0] as { tags: string[] };
        expect(res.tags).toEqual(row.tags);
        filed[`${locale} "${expTypes[i]}"`] = row.tags[0];
      }
      // One object per pick, so a failure names the locale that strayed.
      expect(filed).toEqual(
        Object.fromEntries(Object.keys(filed).map((k) => [k, "domain:career"])),
      );
    }
  });
});
