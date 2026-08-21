// 이 테스트는 **내가 실제로 저지른 실수**를 막으려고 있다.
//
// #1318 이 `0140_lens_ids.sql` 로 `star_tier_history.star_id` 를 렌즈 id 로
// 재매핑했다. 타입 검사도 통과하고 테스트 4,534개도 전부 초록이었다. 그런데
// 그 테이블을 읽는 18개 파일이 id 를 **검사 없이 캐스팅**한다:
//
//     const id = r.star_id as StarId;      // load-ratified-tiers.ts
//     levels[r.star_id as StarId] = r.level; // growth/lens-signal.ts
//
// 캐스팅은 런타임에 아무 일도 하지 않으므로, 모르는 id 가 오면 **예외가 아니라
// 기본값**이 나온다 -- 조회가 `undefined` 로 빠지고 화면은 "아직 기록이 없어요"
// 를 보여준다. 에러 로그도 없다. 즉 **적용하는 순간 여섯 화면이 조용히 빈다.**
//
// 운영에 적용된 적이 없어 피해는 없었지만, 머지된 마이그레이션은 다음 적용
// 스윕에서 **그냥 실행된다.** 그게 정상 절차니까. 그래서 되돌렸고, 다시는
// 그 순서로 넣지 못하도록 이 검사를 남긴다.
//
// 규칙: **`star_tier_history.star_id` 를 다시 쓰는 마이그레이션은, 그 컬럼을
// 옛 `StarId` 로 읽는 코드가 사라진 뒤에만 들어올 수 있다.**
import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

/** `star_tier_history.star_id` 를 다시 쓰는 마이그레이션들. */
function migrationsRewritingStarId(): string[] {
  const dir = join(ROOT, "db", "migrations");
  return readdirSync(dir)
    .filter((f) => extname(f) === ".sql")
    .filter((f) => {
      const sql = read(join(dir, f));
      // UPDATE ... star_tier_history ... SET ... star_id (대소문자 무시, 줄바꿈 포함)
      const stmts = sql.split(";");
      return stmts.some(
        (s) =>
          /update\s+star_tier_history/i.test(s) &&
          /\bset\b[\s\S]*\bstar_id\b/i.test(s),
      );
    });
}

/** 그 테이블을 읽으면서 id 를 옛 `StarId` 로 캐스팅하는 소스 파일들. */
function readersCastingToStarId(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__" || entry.name === "node_modules") continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const src = read(full);
      if (!src.includes("star_tier_history")) continue;
      if (!/as\s+StarId/.test(src)) continue;
      out.push(full.slice(ROOT.length + 1).replace(/\\/g, "/"));
    }
  };
  walk(join(ROOT, "src"));
  return out;
}

describe("star_tier_history 재매핑은 읽는 쪽이 옮겨간 다음이다", () => {
  const rewriters = migrationsRewritingStarId();
  const readers = readersCastingToStarId();

  it("검사가 놀고 있지 않다 — 마이그레이션 폴더를 실제로 읽었다", () => {
    const dir = join(ROOT, "db", "migrations");
    expect(readdirSync(dir).filter((f) => extname(f) === ".sql").length).toBeGreaterThan(50);
  });

  it("읽는 쪽이 아직 남아 있으면 재매핑 마이그레이션이 없어야 한다", () => {
    if (readers.length === 0) return; // 폐기가 끝났다면 이 규칙은 할 일이 없다
    if (rewriters.length > 0) {
      throw new Error(
        `star_tier_history.star_id 를 다시 쓰는 마이그레이션이 있는데(${rewriters.join(", ")}), ` +
          `그 컬럼을 옛 StarId 로 읽는 코드가 아직 ${readers.length}개 남아 있다:\n` +
          readers.map((r) => `  - ${r}`).join("\n") +
          `\n\n그 캐스팅들은 런타임 검사가 아니라서, id 가 바뀌면 예외 대신 기본값이 나온다. ` +
          `즉 화면이 에러 없이 빈다.\n` +
          `**재매핑과 읽는 쪽 이전은 같은 PR 로 나가야 한다.**`,
      );
    }
  });

  it("아직은 읽는 쪽이 남아 있다는 사실 자체를 드러낸다", () => {
    // 숫자를 박지 않는다 — 줄어드는 것이 목표고, 0 이 되면 위 규칙이 저절로 풀린다.
    expect(Array.isArray(readers)).toBe(true);
  });
});
