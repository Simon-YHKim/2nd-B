import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "..", "..");
const edgePath = join(root, "supabase", "functions", "delete-account", "index.ts");
const migrationPath = join(root, "db", "migrations", "0186_account_deletion_hardening.sql");
const edge = readFileSync(edgePath, "utf8");
const code = edge.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("delete-account Edge boundary", () => {
  test("accepts only POST with an absent or allowlisted Origin", () => {
    expect(code).toMatch(/req\.method === 'OPTIONS'/);
    expect(code).toMatch(/req\.method !== 'POST'/);
    expect(code).toMatch(/if \(origin && !ALLOWED_ORIGINS\.has\(origin\)\)/);
    expect(code).not.toMatch(/return ALLOWED_ORIGINS\.has\(origin\) \? origin : 'null'/);
  });

  test("reads at most 1 KiB and accepts the exact empty object only", () => {
    expect(code).toMatch(/MAX_BODY_BYTES = 1024/);
    expect(code).toMatch(/content-length/);
    expect(code).toMatch(/reader\.read\(\)/);
    expect(code).toMatch(/totalBytes > MAX_BODY_BYTES/);
    expect(code).toMatch(/rawBody !== '\{\}'/);
  });

  test("revalidates the bearer with Auth and binds every verified claim", () => {
    expect(code).toMatch(/auth\.getUser\(token\)/);
    expect(code).toMatch(/claims\.sub !== authUser\.id/);
    expect(code).toMatch(/claims\.role !== 'authenticated'/);
    expect(code).toMatch(/SESSION_ID_RE\.test\(claims\.session_id\)/);
    expect(code).toMatch(/Number\.isInteger\(claims\.iat\)/);

    const getUserAt = code.indexOf("auth.getUser(token)");
    const sessionRpcAt = code.indexOf("'verify_account_deletion_session'");
    const deleteAt = code.indexOf("auth.admin.deleteUser");
    expect(getUserAt).toBeGreaterThan(-1);
    expect(sessionRpcAt).toBeGreaterThan(getUserAt);
    expect(deleteAt).toBeGreaterThan(sessionRpcAt);
  });

  test("recursively removes bounded raw storage and confirms empty before auth deletion", () => {
    expect(code).toMatch(/STORAGE_PAGE_SIZE = 1000/);
    expect(code).toMatch(/MAX_STORAGE_LIST_CALLS = 40/);
    expect(code).toMatch(/MAX_STORAGE_OBJECTS = 10_000/);
    expect(code).toMatch(/object\.id === null/);
    expect(code).toMatch(/prefixes\.push\(objectPath\)/);
    expect(code).toMatch(/offset: pageOffset/);
    expect(code).toMatch(/sortBy: \{ column: 'name', order: 'asc' \}/);
    expect(code).toMatch(/storage_listing_limit_exceeded/);
    expect(code).toMatch(/storage_not_empty/);

    const firstList = code.indexOf("bucket.list(prefix");
    const remove = code.indexOf("bucket.remove(paths)");
    const finalEmpty = code.indexOf("remaining.length !== 0");
    const deleteAt = code.indexOf("auth.admin.deleteUser");
    expect(firstList).toBeGreaterThan(-1);
    expect(remove).toBeGreaterThan(firstList);
    expect(finalEmpty).toBeGreaterThan(remove);
    expect(deleteAt).toBeGreaterThan(finalEmpty);
  });

  test("fails closed with bounded upstream calls and safe responses", () => {
    expect(code).toMatch(/UPSTREAM_TIMEOUT_MS/);
    expect(code).toMatch(/AbortSignal\.timeout\(UPSTREAM_TIMEOUT_MS\)/);
    expect(code).toMatch(/'cache-control': 'no-store'/);
    expect(code).not.toMatch(/detail:/);
    expect(code).not.toMatch(/\.message/);
    expect(code).not.toMatch(/String\(e\)/);
  });

  test("never pre-nulls provenance or applies a post-auth profile safety net", () => {
    expect(code).not.toMatch(/from\('knowledge_sources'\)\.update/);
    expect(code).not.toMatch(/from\('users'\)\.delete/);
  });
});

describe("0186 account deletion database contract", () => {
  test("the provisional migration exists and is one atomic transaction", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const statements = migration
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("--"));
    expect(statements[0]).toBe("BEGIN;");
    expect(statements[statements.length - 1]).toBe("COMMIT;");
  });

  test("auth deletion cascades authored rows without promoting them to curated", () => {
    expect(migration).toMatch(/FOREIGN KEY \(added_by\)[\s\S]{0,120}REFERENCES public\.users \(id\) ON DELETE CASCADE/);
    expect(migration).toMatch(/FOREIGN KEY \(verified_by\)[\s\S]{0,120}REFERENCES public\.users \(id\) ON DELETE SET NULL/);
  });

  test("a service-only definer verifies the live session and recent iat", () => {
    expect(migration).toMatch(/FUNCTION public\.verify_account_deletion_session\([\s\S]*?SECURITY DEFINER/);
    expect(migration).toMatch(/SET search_path = ''/);
    expect(migration).toMatch(/FROM auth\.sessions AS s[\s\S]*s\.id = p_session_id[\s\S]*s\.user_id = p_user_id/);
    expect(migration).toMatch(/p_issued_at < pg_catalog\.now\(\) - interval '5 minutes'/);
    expect(migration).toMatch(/p_issued_at > pg_catalog\.now\(\) \+ interval '1 minute'/);
    expect(migration).toMatch(/request\.jwt\.claims/);
    expect(migration).toMatch(/REVOKE EXECUTE ON FUNCTION public\.verify_account_deletion_session[^;]+FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.verify_account_deletion_session[^;]+TO service_role/);
  });

  test("locks raw-clippings uploads to bounded flat markdown paths", () => {
    expect(migration).toMatch(/file_size_limit\s*=\s*1048576/);
    expect(migration).toMatch(/allowed_mime_types\s*=\s*ARRAY\['text\/markdown'\]::text\[\]/);
    expect(migration).toMatch(/array_length\(storage\.foldername\(name\), 1\) = 1/);
    expect(migration).toMatch(/name LIKE auth\.uid\(\)::text \|\| '\/%\.md'/);
    expect(migration).toMatch(/EXISTS \([\s\S]*FROM public\.users AS active_user[\s\S]*active_user\.id = \(SELECT auth\.uid\(\)\)/);
    expect((migration.match(/raw_clippings_owner_insert/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((migration.match(/raw_clippings_owner_update/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
