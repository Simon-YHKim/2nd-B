// sources read/write field contract.
//
// The live `sources.created_at` -> `captured_at` P0 was the home screen ordering the
// sources query by a column that does not exist on `sources`. jest's Supabase mock did
// not catch it. This contract pins it: every `sources` field a shipped file SELECTs or
// ORDERs by must be a field createSource WRITES, or a DB-managed column.
//
// ⚠ 2026-09-08: 전에는 **src/app/index.tsx 하나만** 봤다. 그 화면이 P0 를 낸 곳이라
// 그렇게 시작했지만, 위험은 그 파일의 성질이 아니라 **질의의 성질**이다. 홈의 레거시
// 반쪽이 legacy/screens/index.tsx 로 나가면서 이 검사는 대상을 잃었고 - 파일을
// 바꿔 다는 대신 **배송되는 모든 질의**로 넓혔다. 실측으로 오늘 여덟 파일이 걸린다.
// 한 화면만 지키는 검사는 그 화면이 사라지면 같이 사라진다.
//
// Static parse (no DB / no mock), the same technique as scripts/check-constraints.ts:
// it reads the real source files so a read/write rename is caught at CI.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

function readSrc(rel: string): string {
  return readFileSync(join(__dirname, rel), "utf8");
}

/** 배송되는 ts/tsx. 검사·목은 질의를 실행하지 않는다. */
function shippingSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", "__tests__", "__mocks__"].includes(entry.name)) shippingSources(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

interface SourcesRead {
  file: string;
  fields: string[];
}

// Read side: every `.from("sources")` in shipped code — its .select(...) fields plus the
// .order(...) column (the column the P0 got wrong). `select("*")` names no column, so it
// cannot get a column name wrong; it is counted as a query but contributes no fields.
function sourcesReads(): SourcesRead[] {
  const out: SourcesRead[] = [];
  for (const file of shippingSources(join(process.cwd(), "src"))) {
    const src = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    let at = src.indexOf('.from("sources")');
    while (at >= 0) {
      const block = src.slice(at, at + 400);
      const select = block.match(/\.select\(\s*"([^"]*)"/);
      const order = block.match(/\.order\(\s*"([^"]+)"/);
      const fields = select && select[1] !== "*" ? select[1].split(",").map((f) => f.trim()) : [];
      if (order) fields.push(order[1].trim());
      const rel = relative(process.cwd(), file).split(sep).join("/");
      out.push({ file: rel, fields: [...new Set(fields.filter(Boolean))] });
      at = src.indexOf('.from("sources")', at + 10);
    }
  }
  return out;
}

// Write side: the fields createSource writes (CreateSourceInput in wiki/queries.ts).
function createSourceWriteFields(): string[] {
  const src = readSrc("../queries.ts");
  const m = src.match(/interface CreateSourceInput\s*\{([^}]*)\}/);
  if (!m) throw new Error("CreateSourceInput not found in wiki/queries.ts");
  return [...m[1].matchAll(/^\s*(\w+)\s*[?:]/gm)].map((x) => x[1]);
}

// Columns the database manages — index.tsx may read/order these even though
// createSource never writes them (id is a uuid default, captured_at a timestamp default).
const DB_MANAGED = new Set(["id", "captured_at", "user_id"]);

describe("sources read/write field contract", () => {
  const reads = sourcesReads();

  test("스캐너가 실제로 질의를 찾았다 - 0건 통과를 막는다", () => {
    // "위반 0건" 과 "아무 질의도 못 봤다" 는 다른 상태다.
    expect(reads.length).toBeGreaterThanOrEqual(8);
    expect(reads.some((r) => r.fields.length > 0)).toBe(true);
  });

  test("배송이 읽거나 정렬하는 sources 열은 전부 쓰이거나 DB 가 만든다", () => {
    const written = new Set(createSourceWriteFields());
    const offenders = reads.flatMap((r) =>
      r.fields
        .filter((f) => !written.has(f) && !DB_MANAGED.has(f))
        .map((f) => `${r.file} -> ${f}`),
    );
    // offender = createSource 가 쓰지도 않고 DB 가 만들지도 않는 열을 읽거나
    // 정렬한다 — created_at/captured_at P0 가 정확히 그것이었다.
    expect(offenders).toEqual([]);
  });
});
