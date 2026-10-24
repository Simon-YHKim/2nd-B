import { maskRecordBodyIdentifiers, selectRecordBodyExcerpts, recordBodyAudit, recordReadAllowed,
  RECORD_READ_ENABLED, type RecordBodyCandidate } from "../record-read";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const candidate = (changes: Partial<RecordBodyCandidate> = {}): RecordBodyCandidate => ({
  id, userId: "owner", kind: "note", body: "I worked on a small project.", relevance: 1,
  aiHold: false, supersededBy: null, containsHealthMeasurements: false, ...changes,
});

test.each([true, false, null])("dormant even with stored consent; age=%s", minor => {
  expect(RECORD_READ_ENABLED).toBe(false);
  for (const consent of [true, false, null, "true", 1]) expect(recordReadAllowed(minor, consent)).toBe(false);
});

test.each([
  ["mail a.b+tag@example.com please", "mail [email] please"],
  ["010-1234-5678", "[number]"], ["+1 (415) 555-0199", "[number]"],
  ["account 110-123-456789", "account [number]"],
  ["０１０\u200b１２３４５６７８", "[number]"],
  ["DE89 3704 0044 0532 0130 00", "[account]"],
  ["2026, 12 pages and 3 ideas", "2026, 12 pages and 3 ideas"],
])("masks contacts/accounts: %s", (input, expected) => expect(maskRecordBodyIdentifiers(input)).toBe(expected));

test("masks before the cut and counts Unicode characters without splitting pairs", () => {
  const results = selectRecordBodyExcerpts([candidate({ body: "😀".repeat(595) + "010-1234-5678" })], "owner", 1, false);
  expect(Array.from(results[0].body)).toHaveLength(600);
  expect(results[0].body).toBe("😀".repeat(595) + "[numb");
  expect(results[0].body).not.toContain("010");
});

test.each([
  { userId: "another" }, { aiHold: true }, { supersededBy: "new-version" },
  { containsHealthMeasurements: true }, { kind: "health" }, { kind: "audit_response" },
  { relevance: NaN }, { relevance: Infinity }, { relevance: 0 }, { body: "  " },
  { body: "I want to kill myself." }, { body: "x".repeat(700) + " I want to kill myself." },
  { body: "지금 죽고 싶어." }, { body: "I want.to die." },
  { aiHold: undefined }, { supersededBy: undefined }, { containsHealthMeasurements: undefined },
])("excludes unsafe/unknown evidence %j", patch => {
  expect(selectRecordBodyExcerpts([candidate(patch as Partial<RecordBodyCandidate>)], "owner", 3, false)).toEqual([]);
});

test.each([true, null, undefined])("excludes minor or unresolved age %s", minor => {
  expect(selectRecordBodyExcerpts([candidate()], "owner", 1, minor as boolean | null)).toEqual([]);
});

test("filters before ranking/limit, deduplicates IDs and preserves inputs", () => {
  const records = [candidate({ aiHold: true, relevance: 20 }), candidate({ id: "b", relevance: 2 }),
    candidate({ id: "c", relevance: 3 }), candidate({ id: "c", relevance: 1 }), candidate({ id: "a", relevance: 2 })];
  const before = JSON.stringify(records);
  expect(selectRecordBodyExcerpts(records, "owner", 3, false).map(r => r.id)).toEqual(["c", "a", "b"]);
  expect(JSON.stringify(records)).toBe(before);
});

test.each([0, -1, 0.5, Infinity, NaN])("no implicit N when limit is %s", limit => {
  expect(selectRecordBodyExcerpts([candidate()], "owner", limit, false)).toEqual([]);
});

test("audit contains only UUID and validated SHA-256 hex", () => {
  expect(recordBodyAudit(id, "A".repeat(64))).toEqual({ recordId: id, bodyHash: "a".repeat(64) });
  for (const [key, hash] of [["raw body", "a".repeat(64)], [id, "private text"], [id, "a".repeat(63)]]) {
    expect(() => recordBodyAudit(key, hash)).toThrow("invalid_record_body_audit");
  }
});
