import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

/**
 * R3 (연구 정합성) — 같은 논문이 두 배치에 들어갈 때 **서지 정보가 갈라지는** 문제.
 *
 * 같은 DOI 를 두 seed 가 들고 있는 것 자체는 결함이 아니다. 원장이 "인제스션 결정이
 * 필요하다"고 남긴 상태이고, framework 가 다른 것은 소유가 다르다는 뜻이라 의도된 차이다.
 *
 * 결함은 **서지 동일성이 깨지는 것**이다. 실측에서 `10.1176/appi.ps.20250086` 의 6번째
 * 저자가 `crisis-detection.sql` 에서는 `Alyssa Burnett`, `crisis-detection-global.sql`
 * 에서는 `Aaron Burnett` 이었다. Crossref 등록 기록은 **Alyssa** 다. 바로 옆 저자가
 * `Aaron Kofner` 라서 이름이 번진 것으로 보인다 — 26차의 `Marisa`→`Mark Alcock` 과
 * 같은 계열이다.
 *
 * 이 검사는 **같은 DOI 를 든 행들의 저자 배열과 URL 이 서로 같은지**만 본다.
 * framework/age_range/locale 이 다른 것은 소유·적용 범위의 판단이므로 여기서 막지 않는다
 * (그건 별도 인제스션 결정이다). 저자와 URL 은 판단이 아니라 사실이라 갈릴 이유가 없다.
 */
const SEED_DIR = resolve(__dirname, "../../../../supabase/seed");
const DOI = /10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/;

type Row = { seed: string; doi: string; authors: string; url: string; title: string };

function tuples(sql: string): string[] {
  const low = sql.toLowerCase();
  const ins = low.indexOf("insert into");
  if (ins < 0) return [];
  const v = low.indexOf("\nvalues", ins);
  if (v < 0) return [];
  const body = sql.slice(v + "\nvalues".length);
  const out: string[] = [];
  let depth = 0;
  let inStr = false;
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (inStr) {
      if (c === "'") {
        if (body[i + 1] === "'") { i += 1; continue; }
        inStr = false;
      }
      continue;
    }
    if (c === "'") { inStr = true; continue; }
    if (c === "(") { if (depth === 0) start = i + 1; depth += 1; continue; }
    if (c === ")") {
      depth -= 1;
      if (depth === 0) out.push(body.slice(start, i));
      continue;
    }
    if (c === ";" && depth === 0) break;
  }
  return out;
}

function collect(): Row[] {
  const rows: Row[] = [];
  for (const f of readdirSync(SEED_DIR).filter((x) => x.endsWith(".sql"))) {
    const sql = readFileSync(join(SEED_DIR, f), "utf8");
    for (const t of tuples(sql)) {
      const d = t.match(DOI);
      if (!d) continue;
      const authors = t.match(/ARRAY\[[^\]]*\]/);
      const url = t.match(/https?:\/\/[^'\s]+/);
      const title = t.match(/'([^']{10,140})'/);
      rows.push({
        seed: f,
        doi: d[0].replace(/[.,)]+$/, ""),
        authors: authors ? authors[0].replace(/\s+/g, "") : "",
        url: url ? url[0] : "",
        title: title ? title[1] : "",
      });
    }
  }
  return rows;
}

const rows = collect();

function byDoi(): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const list = m.get(r.doi) ?? [];
    list.push(r);
    m.set(r.doi, list);
  }
  return m;
}

describe("the same DOI carries the same bibliographic identity in every seed", () => {
  const shared = [...byDoi().entries()].filter(([, list]) =>
    new Set(list.map((r) => r.seed)).size > 1);

  test("the corpus actually has shared DOIs — otherwise this guard proves nothing", () => {
    // A guard over an empty set always passes. Pin that the set is non-empty so a
    // future refactor that drops the duplicates makes this visible instead of silent.
    expect(shared.length).toBeGreaterThan(0);
  });

  test("author lists match across seeds", () => {
    const mismatched = shared
      .filter(([, list]) => new Set(list.map((r) => r.authors)).size > 1)
      .map(([doi, list]) => ({ doi, seeds: list.map((r) => `${r.seed}: ${r.authors}`) }));
    expect(mismatched).toEqual([]);
  });

  test("source URLs match across seeds", () => {
    const mismatched = shared
      .filter(([, list]) => new Set(list.map((r) => r.url)).size > 1)
      .map(([doi, list]) => ({ doi, seeds: list.map((r) => `${r.seed}: ${r.url}`) }));
    expect(mismatched).toEqual([]);
  });

  test("the Burnett row specifically matches the registered record", () => {
    // Crossref 10.1176/appi.ps.20250086 lists the sixth author as Alyssa Burnett.
    // `Aaron Burnett` was the neighbouring author's given name bleeding across.
    const list = byDoi().get("10.1176/appi.ps.20250086") ?? [];
    expect(list.length).toBeGreaterThan(1);
    for (const r of list) {
      expect(r.authors).toContain("AlyssaBurnett");
      expect(r.authors).not.toContain("AaronBurnett");
    }
  });
});
