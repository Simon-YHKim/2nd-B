// App-written scaffolding tags vs the user's own topics (QA 261004 D-07, gate
// SG-01 / BL-01 / SG-03).
//
// /discover and /research showed first_light, first_light:affirm and interview
// as the user's topics because they stripped only domain:. The first fix judged
// a tag by its spelling alone, the second by the record's kind and the tag's
// position, and both still dropped tags the user chose: an "Interview" added to
// an /audit answer, the one tag /dashboard's capture writes from /capture?tag=,
// a first_light pair the user typed. The rule now proves a tag is the app's only
// by the exact array a writer stores, and keeps anything it cannot prove.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isReservedAppTag, provenUserTags, stripSystemTags, tagSources } from "../domain-stars";
import { withDomainTag } from "../../records/detect-domain";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("isReservedAppTag (the namespaces record detail refuses to add by hand)", () => {
  it("is true only inside the app's namespaces, case- and space-insensitively", () => {
    for (const tag of ["domain:career", "DOMAIN:growth", "first_light:affirm", "FIRST_LIGHT:soft", " entry-ui:ko "]) {
      expect({ tag, reserved: isReservedAppTag(tag) }).toEqual({ tag, reserved: true });
    }
    for (const tag of ["interview", "todo", "voice", "first_light", "domain", "entry-ui", "first light", "reading"]) {
      expect({ tag, reserved: isReservedAppTag(tag) }).toEqual({ tag, reserved: false });
    }
  });
});

describe("stripSystemTags: what each writer stores is the app's", () => {
  it("empties the rows the app writes on its own", () => {
    // TTFV first-run note: createRecord puts the one domain: tag first.
    expect(stripSystemTags(["domain:growth", "first_light", "first_light:soft"], { kind: "note" })).toEqual([]);
    expect(stripSystemTags(["domain:growth", "first_light", "first_light:affirm"], { kind: "note" })).toEqual([]);
    // The recall interview, with and without entry-ui (added 2026-09-30, #1941).
    expect(
      stripSystemTags(["domain:career", "interview", "recall", "screener", "entry-ui:ko"], { kind: "audit_response" }),
    ).toEqual([]);
    expect(stripSystemTags(["domain:career", "interview", "recall", "screener"], { kind: "audit_response" })).toEqual(
      [],
    );
  });

  it("drops only the listed word of a writer whose other tags are outside this rule", () => {
    // The drill interview before #745 (2026-07-05) stored interview first.
    expect(
      stripSystemTags(["domain:growth", "interview", "life_audit", "period-teen", "layers-3"], {
        kind: "audit_response",
      }),
    ).toEqual(["life_audit", "period-teen", "layers-3"]);
    // Call reflection stores [call_reflection, voice]: its voice is the app's (gate SG-03).
    expect(stripSystemTags(["domain:relation", "call_reflection", "voice"], { kind: "note" })).toEqual([
      "call_reflection",
    ]);
  });

  it("still finds the writer's tags after the app moves domain: or the user adds a tag", () => {
    // Record detail's Move puts domain: last; /reasoning puts domain: and
    // reasoning:ratified first; record detail appends the user's tag at the end.
    expect(stripSystemTags(["first_light", "first_light:affirm", "domain:career"], { kind: "note" })).toEqual([]);
    expect(
      stripSystemTags(["domain:career", "reasoning:ratified", "first_light", "first_light:affirm"], { kind: "note" }),
    ).toEqual(["reasoning:ratified"]);
    expect(
      stripSystemTags(["domain:career", "interview", "recall", "screener", "entry-ui:en", "Interview", "recall-practice"], {
        kind: "audit_response",
      }),
    ).toEqual(["Interview", "recall-practice"]);
    expect(stripSystemTags(["domain:recreation", "call_reflection", "voice", "mom"], { kind: "note" })).toEqual([
      "call_reflection",
      "mom",
    ]);
  });
});

describe("stripSystemTags: a tag the user chose is kept (gate SG-01 / BL-01)", () => {
  it("keeps a tag added to an /audit answer, even when the interview writes that word", () => {
    // /audit stores [life_audit, <framework>] on kind audit_response; record
    // detail appends the user's tags. Kind alone proves nothing.
    expect(
      stripSystemTags(["domain:growth", "life_audit", "values", "Interview", "recall", "screener"], {
        kind: "audit_response",
      }),
    ).toEqual(["life_audit", "values", "Interview", "recall", "screener"]);
    expect(stripSystemTags(["domain:growth", "life_audit", "values", "interview"], { kind: "audit_response" })).toEqual(
      ["life_audit", "values", "interview"],
    );
  });

  it("keeps the first tag of a note, which /dashboard's capture or record detail can write", () => {
    // /dashboard's capture stores [<tag from /capture?tag=>]; an untagged note
    // (that capture with no tag, a pending import) gets its first tag in record
    // detail. Capture's own voice/todo mode stores the same shape, so it is unclear.
    expect(stripSystemTags(["domain:collect", "todo"], { kind: "note" })).toEqual(["todo"]);
    expect(stripSystemTags(["domain:recreation", "voice"], { kind: "note" })).toEqual(["voice"]);
    expect(stripSystemTags(["domain:recreation", "voice", "todo"], { kind: "note" })).toEqual(["voice", "todo"]);
  });

  it("keeps a first_light pair the user typed anywhere but the TTFV note's own slot", () => {
    // Capture writes its mode first, so a hashtag never takes the TTFV slot.
    expect(
      stripSystemTags(["domain:growth", "voice", "first_light", "first_light:soft"], { kind: "note" }),
    ).toEqual(["voice", "first_light", "first_light:soft"]);
    // A journal is free text plus hashtags.
    expect(stripSystemTags(["domain:growth", "first_light", "first_light:soft"], { kind: "journal" })).toEqual([
      "first_light",
      "first_light:soft",
    ]);
    // Added in record detail to a note that already had a tag.
    expect(
      stripSystemTags(["domain:growth", "memo", "first_light", "first_light:soft"], { kind: "note" }),
    ).toEqual(["memo", "first_light", "first_light:soft"]);
    // Lone, reversed, or an unknown choice is not what TTFV stores.
    expect(stripSystemTags(["domain:growth", "first_light:soft"], { kind: "note" })).toEqual(["first_light:soft"]);
    expect(stripSystemTags(["domain:growth", "first_light:soft", "first_light"], { kind: "note" })).toEqual([
      "first_light:soft",
      "first_light",
    ]);
    expect(stripSystemTags(["domain:growth", "first_light", "first_light:maybe"], { kind: "note" })).toEqual([
      "first_light",
      "first_light:maybe",
    ]);
  });

  it("compares the writer's exact spelling, and needs the kind", () => {
    expect(stripSystemTags(["domain:growth", "First_Light", "first_light:soft"], { kind: "note" })).toEqual([
      "First_Light",
      "first_light:soft",
    ]);
    expect(
      stripSystemTags(["domain:career", "Interview", "recall", "screener"], { kind: "audit_response" }),
    ).toEqual(["Interview", "recall", "screener"]);
    expect(stripSystemTags(["domain:career", "interview", "recall", "screener"], { kind: "note" })).toEqual([
      "interview",
      "recall",
      "screener",
    ]);
    expect(stripSystemTags(["domain:career", "interview", "recall", "screener", "entry-ui:en"])).toEqual([
      "interview",
      "recall",
      "screener",
      "entry-ui:en",
    ]);
    expect(stripSystemTags(["domain:career", "Interview", "todo", "recall", "Voice"], { kind: "journal" })).toEqual([
      "Interview",
      "todo",
      "recall",
      "Voice",
    ]);
  });
});

describe("provenUserTags: what counts as the user organizing the record", () => {
  it("drops the app's tags and the unclear first tag of a note, keeps the rest", () => {
    // load-domain-levels always treated voice/todo as how a record was captured.
    expect(provenUserTags(["domain:collect", "todo"], { kind: "note" })).toEqual([]);
    expect(provenUserTags(["domain:recreation", "voice", "reading"], { kind: "note" })).toEqual(["reading"]);
    expect(provenUserTags(["domain:growth", "first_light", "first_light:affirm"], { kind: "note" })).toEqual([]);
    expect(provenUserTags(["domain:career", "todo", "interview"], { kind: "journal" })).toEqual(["todo", "interview"]);
    expect(provenUserTags(["domain:growth", "life_audit", "values", "Interview"], { kind: "audit_response" })).toEqual([
      "life_audit",
      "values",
      "Interview",
    ]);
  });

  it("labels each tag once", () => {
    expect(tagSources(["domain:recreation", "voice", "first_light", "first_light:soft"], { kind: "note" })).toEqual([
      "app",
      "unclear",
      "user",
      "user",
    ]);
  });
});

describe("the writers store what the rule reads", () => {
  it("TTFV writes the first_light pair on a note, with one of two choices", () => {
    const ttfv = read("src/screens/deepspace/onboarding/TTFVScreen.tsx");
    expect(ttfv).toMatch(/kind: "note" as const,[\s\S]{0,200}tags: \["first_light", `first_light:\$\{args\.choice\}`\]/);
    expect(ttfv).toContain('export type TTFVChoice = "affirm" | "soft";');
  });

  it("the recall interview writes its tags on an audit_response record, in ko or en", () => {
    const interview = read("src/app/interview.tsx");
    expect(interview).toMatch(
      /kind: "audit_response",[\s\S]{0,700}tags: \["interview", "recall", "screener", `entry-ui:\$\{locale\}`\]/,
    );
    expect(interview).toContain('const locale = (i18n.language === "ko" ? "ko" : "en") as "ko" | "en";');
  });

  it("/audit writes life_audit first, so its answers never take the interview's slot", () => {
    expect(read("src/app/audit.tsx")).toMatch(/kind: "audit_response",[\s\S]{0,300}tags: \["life_audit", /);
  });

  it("call reflection writes [call_reflection, voice] on a note", () => {
    expect(read("src/app/call-reflection.tsx")).toMatch(
      /kind: "note",[\s\S]{0,200}tags: \["call_reflection", "voice"\],/,
    );
  });

  it("capture writes its mode first on a note, and createRecord puts domain: before it", () => {
    const capture = read("src/app/capture.tsx");
    expect(capture).toMatch(/const baseTag = noteMode;\s*const tags = \[\s*baseTag,/);
    expect(capture).toMatch(/kind: "note",\s*body: noteBody,\s*tags,/);
    expect(read("src/lib/records/create.ts")).toContain(
      "[domainTagFor(args.domainIntent), ...stripDomainTags(args.tags ?? [])]",
    );
    expect(withDomainTag(["todo", "weekend"], "a plain line")).toEqual([expect.stringMatching(/^domain:/), "todo", "weekend"]);
  });

  it("later tag edits keep the writer's order and refuse the app's namespaces", () => {
    const detail = read("src/screens/deepspace/dds-record-detail-screen.tsx");
    // Without this a user could rebuild the TTFV pair by hand on an untagged note.
    expect(detail).toContain("if (isReservedAppTag(tag))");
    expect(detail).toContain("const nextTags = [...currentTags, tag];");
    expect(detail).toContain("return [...stripDomainTags(tags), domainTagFor(target)]");
    const reasoning = read("src/app/reasoning.tsx");
    expect(reasoning).toContain('const REASONING_RATIFIED_TAG = "reasoning:ratified";');
    expect(reasoning).toMatch(
      /domainTagFor\(proposal\.domain\),\s*REASONING_RATIFIED_TAG,\s*\.\.\.stripDomainTags\(latestTags\)/,
    );
  });
});

describe("one rule, fed the record's kind", () => {
  it("load-domain-levels and the topic surfaces all call it with kind", () => {
    const levels = read("src/lib/persona/load-domain-levels.ts");
    expect(levels).toMatch(/import \{[^}]*\bprovenUserTags\b[^}]*\} from "\.\/domain-stars"/);
    expect(levels).not.toMatch(/function isSystemTag|new Set\(\["voice"/);
    for (const [rel, call] of [
      ["src/lib/persona/load-domain-levels.ts", "provenUserTags(tags, { kind: row.kind })"],
      ["src/lib/trends/rising.ts", "stripSystemTags(row.tags ?? [], { kind: row.kind })"],
      ["src/lib/records/records-graph.ts", "stripSystemTags(r.tags ?? [], { kind: r.kind })"],
      ["src/lib/records/records-research.ts", "{ kind: source?.kind },"],
    ] as const) {
      const src = read(rel);
      expect({ rel, call: src.includes(call) }).toEqual({ rel, call: true });
      expect({ rel, domainOnly: src.includes("stripDomainTags(") }).toEqual({ rel, domainOnly: false });
    }
  });

  it("every read that feeds it selects kind", () => {
    // Without kind no writer's array can be proven, and the app's first_light
    // and interview tags come back as "interests" (D-07 again).
    const gather = read("src/lib/trends/gather.ts");
    expect(gather).toMatch(/\.from\("records"\)\s*\.select\("[^"]*\bkind\b[^"]*"\)/);
    expect(gather).toContain("kind: r.kind");
    expect(read("src/lib/persona/load-domain-levels.ts")).toMatch(
      /\.from\("records"\)\s*\.select\("[^"]*\bkind\b[^"]*"\)/,
    );
    // /research reads listRecentRecords.
    expect(read("src/lib/records/create.ts")).toMatch(
      /export async function listRecentRecords[\s\S]{0,900}\.select\("id, kind, [^"]*"\)/,
    );
    expect(read("src/screens/deepspace/DeepSpaceDesignScreens.tsx")).toMatch(
      /listRecentRecords\(userId\)\s*\.then\(\(rows\) => \{\s*if \(alive\) setRecords\(rows as GraphRecord\[\]\)/,
    );
  });
});
