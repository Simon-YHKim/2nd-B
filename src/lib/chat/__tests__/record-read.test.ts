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
  ["de89 3704 0044 0532 0130 00", "[account]"],
  ["DE89370400440532013000", "[account]"],
  ["GB82 WEST 1234 5698 7654 32 paid today", "[account] paid today"],
  ["FY24 plan for the team was ok", "FY24 plan for the team was ok"],
  ["CS50 course is going well today", "CS50 course is going well today"],
  ["kf94 mask was okay today", "kf94 mask was okay today"],
  ["GS25 store near home", "GS25 store near home"],
  ["FY24 PLAN NEXT 1234", "FY24 PLAN NEXT 1234"],
  ["2026-10-24에 만났다", "2026-10-24에 만났다"],
  ["2026/10/24, 2026.10.24, 2015-2019 대학 생활", "2026/10/24, 2026.10.24, 2015-2019 대학 생활"],
  ["월급 3500000원, 예산 3500000000원, $3500000, 3500000 USD", "월급 3500000원, 예산 3500000000원, $3500000, 3500000 USD"],
  ["3500000000원을 모았다", "3500000000원을 모았다"],
  ["2026\n1024\n3500", "2026\n1024\n3500"],
  ["카드 1234-5678-9012-3456 로 결제", "카드 [number] 로 결제"],
  ["card 4111-1111-1111-1111", "card [number]"],
  ["토스뱅크 1000-1234-5678", "토스뱅크 [number]"],
  ["새마을 9002-1234-5678-9", "새마을 [number]"],
  ["번호 1234-5678", "번호 [number]"],
  ["2019-2020-1234-5678", "[number]"],
  ["2019–2021 회사 생활, 1998-2004 학교", "2019–2021 회사 생활, 1998-2004 학교"],
  ["2015-2019 4년 동안 대학, 2019–2020 12월", "2015-2019 4년 동안 대학, 2019–2020 12월"],
  ["2001-2003 1234 계좌, 2001-2003-1234", "[number] 계좌, [number]"],
  ["친구 번호 010ㅡ1234ㅡ5678", "친구 번호 [number]"],
  ["hong @ naver.com", "[email]"], ["hong(at)naver.com", "[email]"],
  ["2026, 12 pages and 3 ideas", "2026, 12 pages and 3 ideas"],
])("masks contacts/accounts: %s", (input, expected) => expect(maskRecordBodyIdentifiers(input)).toBe(expected));

test.each(["–", "·", "ㆍ", "ㅡ", "_", "\u00AD", "\u180E"])("masks phone separator %s", separator => {
  expect(maskRecordBodyIdentifiers(`010${separator}1234${separator}5678`)).toBe("[number]");
});

test.each(["가", "a", "a."])("bounded email scan on long unspaced %s text", unit => {
  const text = unit.repeat(80_000);
  const start = performance.now();
  expect(maskRecordBodyIdentifiers(text)).toBe(text);
  expect(performance.now() - start).toBeLessThan(1500);
});

test("top N cannot exceed five even when the caller requests more", () => {
  const records = Array.from({ length: 8 }, (_, i) => candidate({ id: String(i), relevance: i + 1 }));
  expect(selectRecordBodyExcerpts(records, "owner", 100, false).map(r => r.id)).toEqual(["7", "6", "5", "4", "3"]);
});

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
