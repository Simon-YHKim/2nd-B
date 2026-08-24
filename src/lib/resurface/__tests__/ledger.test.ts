// 채점 원장이 규율을 지키는가.
//
// ① 노출·판정이 실제로 원장으로 나가는가 (배선)
// ② '무시'가 이벤트가 아니라 파생값인가 (관측 불가능한 것을 쓰지 않기)
// ③ 실패가 화면·판정을 막지 않는가 (fail-soft)
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { scoreResurface } from "../score";
import type { ResurfaceLedgerRow } from "../ledger";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const row = (
  from: string, to: string, event: ResurfaceLedgerRow["event"], at = "2026-08-25",
): ResurfaceLedgerRow => ({ from_page: from, to_page: to, event, shown_rank: null, created_at: at });

describe("채점 (순수 함수)", () => {
  it("적중·빗나감·방치를 가른다", () => {
    const s = scoreResurface([
      row("a", "b", "shown"), row("a", "b", "ratified"),
      row("c", "d", "shown"), row("c", "d", "rejected"),
      row("e", "f", "shown"),
    ]);
    expect(s).toEqual({ shownPairs: 3, hits: 1, misses: 1, ignored: 1 });
  });

  it("⚠ 노출 없는 판정은 채점 밖 — 꺼내기가 보여준 것만 꺼내기의 점수다", () => {
    const s = scoreResurface([row("a", "b", "ratified")]);
    expect(s.shownPairs).toBe(0);
    expect(s.hits).toBe(0);
  });

  it("빈 원장은 전부 0 — 점수를 지어내지 않는다", () => {
    expect(scoreResurface([])).toEqual({ shownPairs: 0, hits: 0, misses: 0, ignored: 0 });
  });
});

describe("배선 (/digest)", () => {
  const src = read("src/app/digest.tsx");

  it("노출을 순위와 함께 남긴다 (uuid 쌍 그대로 — 문자열 키 재조립 금지)", () => {
    expect(src).toContain("recordResurfaceShown(");
    expect(src).toContain("fromPage: r.from_page, toPage: r.to_page, rank: i");
  });

  it("판정은 성공 뒤에만 남긴다", () => {
    // rejectInferredLink 는 wiki_links 행을 DELETE 한다 — 이 원장이 거절의
    // 유일한 흔적이므로, 판정 성공 이후 줄에 있어야 한다.
    const m = /await rejectInferredLink\(userId, p\.from_page, p\.to_page\);[\s\S]{0,500}?recordResurfaceDecision\(userId, p\.from_page, p\.to_page/.exec(src);
    expect(m).not.toBeNull();
  });
});

describe("마이그레이션 규율 (0145)", () => {
  const sql = read("db/migrations/0145_resurface_ledger.sql");

  it("append-only — UPDATE·DELETE 정책이 없고 권한도 걷는다", () => {
    expect(sql).not.toMatch(/FOR UPDATE/);
    expect(sql).not.toMatch(/FOR DELETE/);
    expect(sql).toContain("REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER");
  });

  it("⚠ wiki_links 로 FK 를 걸지 않는다 — 거절이 원본을 지운다", () => {
    expect(sql).not.toContain("REFERENCES public.wiki_links");
  });

  it("RLS 식이 initplan 안전형이다 (0144 교훈)", () => {
    expect(sql).toContain("(select auth.uid())");
    expect(sql).not.toMatch(/=\s*auth\.uid\(\)/);
  });

  it("무시는 이벤트가 아니다", () => {
    expect(sql).toContain("CHECK (event IN ('shown', 'ratified', 'rejected'))");
    expect(sql).not.toContain("'ignored'");
  });
});

describe("내보내기 포함 (PIPA)", () => {
  it("export-account 가 새 테이블을 안다", () => {
    expect(read("supabase/functions/export-account/index.ts")).toContain("resurface_ledger");
  });
});
