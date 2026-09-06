import { readFileSync, readdirSync } from "fs";
import { resolve, join } from "path";

/**
 * R4 (기술 흐름 정합성) — 지워진 계정의 JWT 로 하는 뒤늦은 업로드.
 *
 * `delete-account` 는 auth.users 를 지우고 raw-clippings 를 훑는다. 그런데 이미
 * 발급된 JWT 는 만료까지 유효하고 `auth.uid()` 는 토큰 `sub` 클레임을 읽지 테이블을
 * 조회하지 않는다. 0074 의 INSERT 정책은 경로 접두사만 봤으므로, 그 토큰으로 sweep
 * 이 끝난 **뒤에** `raw-clippings/<지워진uid>/` 에 새 객체를 올릴 수 있었다. 소유자
 * 행이 없는 고아 PII 다.
 *
 * 0188 이 쓰기에만 존재 확인을 건다. Postgres 를 Jest 에서 못 돌리므로 소스 계약으로
 * 지킨다(`edge-jwt-hardening.test.ts` 관행). 주석은 걷어낸다 — 검사를 **언급만** 하는
 * 주석이 없는 코드를 가리면 안 된다.
 */
const MIGRATIONS = resolve(__dirname, "../../../../db/migrations");
const FENCE = "0188_raw_clippings_deleted_account_fence.sql";

function stripSqlComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");
}

const code = stripSqlComments(readFileSync(join(MIGRATIONS, FENCE), "utf8"));

/** The four policy bodies, keyed by the command they guard. */
function policyBody(command: "select" | "insert" | "update" | "delete"): string {
  const name = `raw_clippings_owner_${command}`;
  const start = code.indexOf(`CREATE POLICY "${name}"`);
  expect(start).toBeGreaterThan(-1);
  const end = code.indexOf("$p$;", start);
  expect(end).toBeGreaterThan(start);
  return code.slice(start, end);
}

const EXISTS_CHECK = /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.users\s+WHERE\s+id\s*=\s*\(\s*select\s+auth\.uid\(\)\s*\)\s*\)/i;

describe("0188 fences raw-clippings writes behind a still-existing profile", () => {
  test("the migration file exists and claims a number no other migration uses", () => {
    const numbers = readdirSync(MIGRATIONS)
      .filter((f) => /^\d{4}_.*\.sql$/.test(f))
      .map((f) => f.slice(0, 4));
    const mine = FENCE.slice(0, 4);
    expect(numbers.filter((n) => n === mine)).toHaveLength(1);
  });

  test("INSERT requires the profile row to still exist", () => {
    expect(policyBody("insert")).toMatch(EXISTS_CHECK);
  });

  test("UPDATE requires it on BOTH the USING and the WITH CHECK side", () => {
    const body = policyBody("update");
    const using = body.slice(body.indexOf("USING"), body.indexOf("WITH CHECK"));
    const withCheck = body.slice(body.indexOf("WITH CHECK"));
    expect(using).toMatch(EXISTS_CHECK);
    expect(withCheck).toMatch(EXISTS_CHECK);
  });

  test("SELECT and DELETE deliberately do NOT carry the existence check", () => {
    // Blocking reads protects nothing the deletion did not already remove, and
    // blocking deletes would stop the very cleanup we want.
    expect(policyBody("select")).not.toMatch(EXISTS_CHECK);
    expect(policyBody("delete")).not.toMatch(EXISTS_CHECK);
  });

  test("every policy still scopes to the owner's path prefix in this bucket", () => {
    for (const cmd of ["select", "insert", "update", "delete"] as const) {
      const body = policyBody(cmd);
      expect(body).toContain("bucket_id = 'raw-clippings'");
      expect(body).toMatch(/\(storage\.foldername\(name\)\)\[1\]\s*=\s*\(\s*select\s+auth\.uid\(\)\s*\)::text/i);
    }
  });

  test("no bare auth.uid() survives — 0102's loop never covered storage.objects", () => {
    // 0102 rewrites pg_policies WHERE schemaname = 'public' (0102:50,103), so the
    // storage bucket policies were outside it. A bare call is re-evaluated per row
    // and re-arms the auth_rls_initplan advisor finding this repo already cleared.
    const bare = code.match(/(?<!select\s)auth\.uid\(\)/gi) ?? [];
    const wrapped = code.match(/\(\s*select\s+auth\.uid\(\)\s*\)/gi) ?? [];
    expect(wrapped.length).toBeGreaterThan(0);
    expect(bare.length).toBe(0);
  });

  test("it stays a no-op where storage.* is absent (plain-Postgres CI replay)", () => {
    expect(code).toMatch(/to_regclass\('storage\.objects'\)\s+IS\s+NULL/i);
    expect(code).toMatch(/RETURN;/);
  });
});
