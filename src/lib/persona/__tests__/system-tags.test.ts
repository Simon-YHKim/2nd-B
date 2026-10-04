// App-written scaffolding tags vs the user's own topics (QA 261004 D-07, gate
// SG-01 / BL-01).
//
// /discover and /research showed first_light, first_light:affirm and interview
// as the user's topics because they stripped only domain:. The first fix judged
// a tag by its spelling alone, so a hashtag the user typed ("Interview" for a job
// interview, "todo", "recall") vanished from /discover, /research chips and the
// shared-tag links too. The rule now reads the record the tag sits on: reserved
// namespaces are always the app's, a bare word only when the record proves it.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isReservedAppTag, stripSystemTags } from "../domain-stars";
import { withDomainTag } from "../../records/detect-domain";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("isReservedAppTag", () => {
  it("is true only inside the app's namespaces, case- and space-insensitively", () => {
    for (const tag of ["domain:career", "DOMAIN:growth", "first_light:affirm", "FIRST_LIGHT:soft", " entry-ui:ko "]) {
      expect({ tag, reserved: isReservedAppTag(tag) }).toEqual({ tag, reserved: true });
    }
    for (const tag of ["interview", "todo", "voice", "first_light", "domain", "entry-ui", "first light", "reading"]) {
      expect({ tag, reserved: isReservedAppTag(tag) }).toEqual({ tag, reserved: false });
    }
  });
});

describe("stripSystemTags", () => {
  it("empties the rows the app writes on its own", () => {
    // Stored shapes: createRecord puts the one domain: tag first.
    expect(stripSystemTags(["domain:growth", "first_light", "first_light:soft"], { kind: "note" })).toEqual([]);
    expect(
      stripSystemTags(["domain:career", "interview", "recall", "screener", "entry-ui:ko"], { kind: "audit_response" }),
    ).toEqual([]);
    // Interview rows saved before entry-ui existed (2026-09-30) carry the same kind.
    expect(stripSystemTags(["domain:career", "Interview", "recall", "screener"], { kind: "audit_response" })).toEqual([]);
    expect(stripSystemTags(["domain:rest", "Voice"], { kind: "note" })).toEqual([]);
    expect(stripSystemTags(["domain:collect", " todo "], { kind: "note" })).toEqual([]);
  });

  it("keeps the user's hashtags beside the app's marker", () => {
    expect(stripSystemTags(["domain:rest", "voice", "reading"], { kind: "note" })).toEqual(["reading"]);
    // A record saved before domain: tags existed: the mode marker is simply first.
    expect(stripSystemTags(["todo", "weekend"], { kind: "note" })).toEqual(["weekend"]);
    // A voice note the user hashtagged "todo": only the first one is the marker.
    expect(stripSystemTags(["domain:rest", "voice", "todo"], { kind: "note" })).toEqual(["todo"]);
  });

  it("keeps a tag the user typed even when the app writes the same word (gate SG-01 / BL-01)", () => {
    // A journal is free text plus hashtags; nothing on it is a capture marker.
    expect(
      stripSystemTags(["domain:career", "Interview", "todo", "recall", "Voice", "screener"], { kind: "journal" }),
    ).toEqual(["Interview", "todo", "recall", "Voice", "screener"]);
    // Kind unknown: no proof the app wrote it, so it stays.
    expect(stripSystemTags(["domain:career", "interview", "todo", "voice", "recall"])).toEqual([
      "interview",
      "todo",
      "voice",
      "recall",
    ]);
    // On a note, interview/recall are not markers; first_light without its
    // first_light:<choice> pair is not the TTFV note.
    expect(stripSystemTags(["domain:growth", "first_light", "interview", "recall"], { kind: "note" })).toEqual([
      "first_light",
      "interview",
      "recall",
    ]);
    // voice/todo on an interview record are not that record's markers.
    expect(stripSystemTags(["domain:career", "interview", "todo"], { kind: "audit_response" })).toEqual(["todo"]);
  });
});

describe("the writers store what the rule reads", () => {
  it("TTFV writes the first_light pair on a note", () => {
    const ttfv = read("src/screens/deepspace/onboarding/TTFVScreen.tsx");
    expect(ttfv).toMatch(/kind: "note" as const,[\s\S]{0,200}tags: \["first_light", `first_light:\$\{args\.choice\}`\]/);
  });

  it("the recall interview writes its tags on an audit_response record", () => {
    const interview = read("src/app/interview.tsx");
    expect(interview).toMatch(
      /kind: "audit_response",[\s\S]{0,700}tags: \["interview", "recall", "screener", `entry-ui:\$\{locale\}`\]/,
    );
  });

  it("capture writes the voice/todo mode first on a note, and createRecord puts domain: before it", () => {
    const capture = read("src/app/capture.tsx");
    expect(capture).toMatch(/const baseTag = noteMode;\s*const tags = \[\s*baseTag,/);
    expect(capture).toMatch(/kind: "note",\s*body: noteBody,\s*tags,/);
    expect(read("src/lib/records/create.ts")).toContain(
      "[domainTagFor(args.domainIntent), ...stripDomainTags(args.tags ?? [])]",
    );
    expect(withDomainTag(["todo", "weekend"], "a plain line")).toEqual([expect.stringMatching(/^domain:/), "todo", "weekend"]);
  });
});

describe("one rule, fed the record's kind", () => {
  it("load-domain-levels and the topic surfaces all call it with kind", () => {
    const levels = read("src/lib/persona/load-domain-levels.ts");
    expect(levels).toMatch(/import \{[^}]*\bstripSystemTags\b[^}]*\} from "\.\/domain-stars"/);
    expect(levels).not.toMatch(/function isSystemTag|new Set\(\["voice"/);
    for (const [rel, call] of [
      ["src/lib/persona/load-domain-levels.ts", "stripSystemTags(tags, { kind: row.kind })"],
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
    // Without kind every bare word is kept, and the app's interview / voice /
    // todo markers come back as "interests" (D-07 again).
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
