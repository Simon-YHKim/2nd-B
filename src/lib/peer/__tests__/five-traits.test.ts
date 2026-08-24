// 피어 5문항 확장 — 두 함정이 다시 열리지 않게.
//
// ① 무음 소실: 구서버는 새 2키를 400 이 아니라 **조용히 폐기**했다. 서버가
//    필수 3 + 선택 2 로 갈라져 있어야 구앱(3키)과 신앱(5키)이 공존한다.
// ② 재식별: 집계의 min-N 게이트가 전체 n 기준이면 3키·5키 혼재 시 신규 특성
//    평균이 응답자 1명 원점수 그대로 노출된다 — 키별 게이트여야 한다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const SERVER = read("supabase/functions/peer-respond/index.ts");
const CLIENT = read("src/app/peer/[token].tsx");
const RPC = read("db/migrations/0146_t5_seen_aggregate_per_key.sql");

describe("서버 검증 — 필수 3 + 선택 2", () => {
  it("필수 3키는 그대로, 선택 2키가 갈라져 있다", () => {
    expect(SERVER).toContain("const TRAITS = ['extraversion', 'conscientiousness', 'agreeableness']");
    expect(SERVER).toContain("const OPTIONAL_TRAITS = ['openness', 'neuroticism']");
  });

  it("⚠ 선택 키는 없으면 통과(구앱), 있는데 불량이면 거부(무음 소실 금지)", () => {
    const block = /for \(const t of OPTIONAL_TRAITS\) \{[\s\S]*?\n  \}/.exec(SERVER)?.[0] ?? "";
    expect(block).toContain("if (v === undefined) continue;");
    expect(block).toContain("return null;");
  });
});

describe("클라이언트 — 5문항", () => {
  it("TRAITS 가 다섯이고 순서는 필수 3 먼저", () => {
    expect(CLIENT).toContain(
      '["extraversion", "conscientiousness", "agreeableness", "openness", "neuroticism"]',
    );
  });
});

describe("집계 — 키별 min-N (재식별 가드)", () => {
  it("⚠ 전체 n 게이트가 아니라 키별 HAVING 이다", () => {
    expect(RPC).toContain("HAVING count(*) >= 3");
    expect(RPC).not.toMatch(/cnt AS \(SELECT count/);
  });

  it("반환 시그니처는 그대로 (클라이언트 무변경)", () => {
    expect(RPC).toContain("RETURNS TABLE(trait text, avg_score numeric, informant_count integer)");
  });
});

describe("로케일 — 다섯 문항이 다섯 로케일에", () => {
  it.each(["en", "ko", "es", "pt", "id"])("%s", (loc) => {
    const d = JSON.parse(read(`locales/${loc}/peer.json`)) as {
      trait: Record<string, string>;
      subjectIntro: string;
    };
    for (const t of ["extraversion", "conscientiousness", "agreeableness", "openness", "neuroticism"]) {
      expect(typeof d.trait[t]).toBe("string");
      expect(d.trait[t].length).toBeGreaterThan(5);
    }
  });

  it("초대 안내가 낮은 상관관계 통찰을 나른다 (ko)", () => {
    const ko = JSON.parse(read("locales/ko/peer.json")) as { subjectIntro: string };
    expect(ko.subjectIntro).toContain("최근에 만난 사람");
  });

  it("문항 수 문구가 다섯으로 갱신됐다 (ko·en)", () => {
    expect(read("locales/ko/peer.json")).toContain("질문 다섯 개");
    expect(read("locales/en/peer.json")).toContain("Five quick questions");
    expect(read("locales/ko/peer.json")).not.toContain("질문 세 개");
  });
});
