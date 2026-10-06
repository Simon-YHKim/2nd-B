// H1 (2026-10-07): comms/location imports leave a mark the database can check (0223), and a
// second import of the same bank statement books nothing new (0224). These pin the client side
// of both and the parts of the two migrations the client relies on. If either side changes,
// change the other in the same PR.
import fs from "node:fs";
import path from "node:path";

import { buildSourcePayload } from "../../wiki/ingest-helpers";
import { LEDGER_IMPORT_KEY_PREFIX, ledgerImportKey } from "../ledger-ratify";
import {
  buildProposals,
  IMPORT_KIND_FRONTMATTER_KEY,
  MINOR_LOCKED_IMPORT_KINDS,
  proposalsToMarkdown,
} from "../proposals";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const KAKAO = "2024년 1월 5일 오후 3:42, 수민 : 금요일 저녁에 볼까?";
const SMS = '<smses><sms address="01012345678" date="1704430920000" type="1" body="내일 3시에 만나자" /></smses>';
const LOCATION = JSON.stringify({
  timelineObjects: [
    { placeVisit: { location: { latitudeE7: 374220000, longitudeE7: 1270000000, name: "합정 카페" }, duration: { startTimestamp: "2024-01-05T20:00:00Z" } } },
  ],
});

describe("the import_kind mark (0223)", () => {
  test.each([
    ["kakao", KAKAO],
    ["sms", SMS],
    ["takeout-location", LOCATION],
  ] as const)("%s proposals carry the mark into the captured source's frontmatter", (kind, content) => {
    const { proposals } = buildProposals(kind, content, "ko");
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals.every((p) => p.lockedImport === kind)).toBe(true);
    const built = buildSourcePayload(proposalsToMarkdown(kind, proposals, "ko"), null, "self_knowledge");
    expect(built.payload.frontmatter[IMPORT_KIND_FRONTMATTER_KEY]).toBe(kind);
    // The note keeps its usual title; the mark lives only in frontmatter.
    expect(built.payload.title).toBe(`${kind} 가져오기`);
  });

  test("other imports carry no mark", () => {
    const { proposals } = buildProposals("ics", "BEGIN:VEVENT\nSUMMARY:Standup\nDTSTART:20240105T090000Z\nEND:VEVENT");
    expect(proposals.some((p) => p.lockedImport)).toBe(false);
    const built = buildSourcePayload(proposalsToMarkdown("Calendar", proposals, "en"), null, "self_knowledge");
    expect(built.payload.frontmatter[IMPORT_KIND_FRONTMATTER_KEY]).toBeUndefined();
  });

  test("the hub screen locks exactly the kinds the data layer marks", () => {
    // ImportHubScreen derives its own MINOR_LOCKED_KINDS from the tile table. Read the tiles
    // instead of importing the screen, so this stays a data-layer test.
    const screen = read("src/screens/deepspace/import/ImportHubScreen.tsx");
    const locked = new Set<string>();
    for (const m of screen.matchAll(/minorLocked: true, kind: "([a-z-]+)"/g)) {
      if (m[1] !== "unknown") locked.add(m[1]);
    }
    expect([...locked].sort()).toEqual([...MINOR_LOCKED_IMPORT_KINDS].sort());
  });

  test("0223 checks the same key and the same kinds, against the server-derived minor tier", () => {
    const sql = read("db/migrations/0223_minor_locked_import_sources.sql");
    expect(sql).toContain("CREATE TRIGGER sources_minor_import_clamp");
    expect(sql).toContain("BEFORE INSERT OR UPDATE ON sources");
    expect(sql).toContain(`NEW.frontmatter ->> '${IMPORT_KIND_FRONTMATTER_KEY}'`);
    const listed = /IN \(([^)]*)\)/.exec(sql)?.[1] ?? "";
    const kinds = [...listed.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort();
    expect(kinds).toEqual([...MINOR_LOCKED_IMPORT_KINDS].sort());
    expect(sql).toMatch(/minor_tier IS DISTINCT FROM 'adult'/);
    expect(sql).toContain("minor_import_locked");
    expect(sql).toContain("ERRCODE = 'P0001'");
    expect(sql).not.toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public");
  });
});

describe("the ledger import key (0224)", () => {
  const coffee = { occurredOn: "2026-06-03", kind: "expense" as const, amountKrw: 4500, label: "커피" };

  test("keys match the format 0224 checks", () => {
    const sql = read("db/migrations/0224_ops_ledger_import_key.sql");
    const pattern = /import_key ~ '([^']+)'/.exec(sql)?.[1];
    expect(pattern).toBeDefined();
    expect(new RegExp(pattern as string).test(ledgerImportKey(coffee, 0))).toBe(true);
    expect(ledgerImportKey(coffee, 0).startsWith(LEDGER_IMPORT_KEY_PREFIX)).toBe(true);
  });

  test("the unique index is not partial, so PostgREST can name it as the conflict target", () => {
    const sql = read("db/migrations/0224_ops_ledger_import_key.sql");
    const index = /CREATE UNIQUE INDEX[^;]*;/.exec(sql)?.[0] ?? "";
    expect(index).toContain("ON ops_ledger (user_id, import_key)");
    expect(index).not.toMatch(/WHERE/i);
  });

  test("same row, same key; identical rows in one import get different keys", () => {
    expect(ledgerImportKey(coffee, 0)).toBe(ledgerImportKey({ ...coffee }, 0));
    expect(ledgerImportKey(coffee, 0)).not.toBe(ledgerImportKey(coffee, 1));
    expect(ledgerImportKey(coffee, 0)).not.toBe(ledgerImportKey({ ...coffee, amountKrw: 4600 }, 0));
    expect(ledgerImportKey(coffee, 0)).toBe(ledgerImportKey({ ...coffee, label: "  커피 " }, 0));
  });
});
