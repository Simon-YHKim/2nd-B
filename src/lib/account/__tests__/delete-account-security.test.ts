import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "..", "..");
const edgePath = join(root, "supabase", "functions", "delete-account", "index.ts");
const authDeletePath = join(root, "supabase", "functions", "delete-account", "delete-auth-user.ts");
const storagePath = join(root, "supabase", "functions", "delete-account", "storage-erasure.ts");
const migrationPath = join(root, "db", "migrations", "0186_account_deletion_hardening.sql");
const fenceMigrationPath = join(root, "db", "migrations", "0188_raw_clippings_deleted_account_fence.sql");
const completionDraftPath = join(
  root,
  "db",
  "migration-drafts",
  "UNNUMBERED_account_deletion_completion_fence.sql",
);
const obsoleteMigrationPath = join(root, "db", "migrations", "0163_account_deletion_hardening.sql");
const dpiaPath = join(root, "docs", "legal", "DPIA-2ndB-minors-draft.md");
const edge = `${readFileSync(storagePath, "utf8")}\n${readFileSync(authDeletePath, "utf8")}\n${readFileSync(edgePath, "utf8")}`;
const code = edge.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const fenceMigration = existsSync(fenceMigrationPath) ? readFileSync(fenceMigrationPath, "utf8") : "";
const completionDraft = existsSync(completionDraftPath)
  ? readFileSync(completionDraftPath, "utf8")
  : "";
const dpia = readFileSync(dpiaPath, "utf8");

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
    const sessionRpcAt = code.indexOf("'begin_account_deletion'");
    const deleteAt = code.indexOf("await deleteAuthUserWithReconciliation(");
    expect(getUserAt).toBeGreaterThan(-1);
    expect(sessionRpcAt).toBeGreaterThan(getUserAt);
    expect(deleteAt).toBeGreaterThan(sessionRpcAt);
  });

  test("fences writes, flat-enumerates all raw storage, then deletes Auth", () => {
    expect(code).toMatch(/jsr:@supabase\/supabase-js@2\.106\.1/);
    expect(code).toMatch(/STORAGE_PAGE_SIZE = 1000/);
    expect(code).toMatch(/MAX_STORAGE_OPERATIONS_PER_SWEEP = 4/);
    expect(code).toMatch(/MAX_STORAGE_PATH_BYTES = 1024/);
    expect(code).toMatch(/bucket\.listV2\(\{/);
    expect(code).toMatch(/prefix: ownerPrefix/);
    expect(code).toMatch(/with_delimiter: false/);
    expect(code).not.toMatch(/cursor:/);
    expect(code).toMatch(/storage_cleanup_in_progress/);

    const firstList = code.indexOf("bucket.listV2({");
    const remove = code.indexOf("bucket.remove(paths)");
    const finalEmpty = code.indexOf("paths.length === 0");
    const fenceAt = code.indexOf("'begin_account_deletion'");
    const preflightAt = code.indexOf("preDeletionStorage = await eraseRawClippings");
    const deleteAt = code.indexOf("await deleteAuthUserWithReconciliation(");
    expect(firstList).toBeGreaterThan(-1);
    expect(remove).toBeGreaterThan(firstList);
    expect(finalEmpty).toBeGreaterThan(firstList);
    expect(finalEmpty).toBeLessThan(remove);
    expect(fenceAt).toBeGreaterThan(finalEmpty);
    expect(preflightAt).toBeGreaterThan(finalEmpty);
    expect(preflightAt).toBeGreaterThan(fenceAt);
    expect(deleteAt).toBeGreaterThan(preflightAt);
  });

  test("observes the exact removal set and claims erasure only behind the durable fence", () => {
    expect(code).toMatch(/removeResponse = await bucket\.remove\(paths\)/);
    expect(code).toMatch(/confirmed\.size !== requested\.size/);
    expect(code).toMatch(/storage_remove_incomplete/);
    expect(code).toMatch(/profile_erased: profileErased/);
    expect(code).toMatch(/deletion_fenced: true/);
    expect(code).toMatch(/raw_clippings_erased: true/);
    expect(code).toMatch(/raw_clippings_empty_at_check: true/);
    expect(code).toMatch(/raw_clippings_removed:/);
  });

  test("reconciles an ambiguous Auth delete before checking the profile cascade", () => {
    expect(code).toMatch(/await deleteAuthUserWithReconciliation\(/);
    expect(code).toMatch(/auth_delete_unconfirmed/);
    const reconciledDelete = code.indexOf("await deleteAuthUserWithReconciliation(");
    const profileCheck = code.indexOf(".from('users')", reconciledDelete);
    expect(reconciledDelete).toBeGreaterThan(-1);
    expect(profileCheck).toBeGreaterThan(reconciledDelete);
    expect(code).not.toContain("postDeletionStorage");
  });

  test("fails closed with bounded upstream calls and safe responses", () => {
    expect(code).toMatch(/UPSTREAM_TIMEOUT_MS/);
    expect(code).toMatch(/AbortSignal\.timeout\(UPSTREAM_TIMEOUT_MS\)/);
    expect(code).toMatch(/MAX_STORAGE_OPERATIONS_PER_SWEEP = 4/);
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
  test("uses the integrated migration and does not resurrect its provisional number", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(obsoleteMigrationPath)).toBe(false);
    expect(migration).not.toMatch(/^\s*BEGIN\s*;/im);
    expect(migration).not.toMatch(/^\s*COMMIT\s*;/im);
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

  test("records the historical 0186 bounded flat markdown contract", () => {
    expect(migration).toMatch(/file_size_limit\s*=\s*1048576/);
    expect(migration).toMatch(/allowed_mime_types\s*=\s*ARRAY\['text\/markdown'\]::text\[\]/);
    expect(migration).toMatch(/array_length\(storage\.foldername\(name\), 1\) = 1/);
    expect(migration).toMatch(/name LIKE auth\.uid\(\)::text \|\| '\/%\.md'/);
    expect(migration).toMatch(/EXISTS \([\s\S]*FROM public\.users AS active_user[\s\S]*active_user\.id = \(SELECT auth\.uid\(\)\)/);
    expect((migration.match(/raw_clippings_owner_insert/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((migration.match(/raw_clippings_owner_update/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  test("keeps the later 0188 override visible as a release-blocking forward-migration hold", () => {
    expect(fenceMigration).toMatch(/CREATE POLICY "raw_clippings_owner_insert"/);
    expect(fenceMigration).not.toMatch(/array_length\(storage\.foldername\(name\), 1\) = 1/);
    expect(dpia).toMatch(/same forward migration must restore 0186's flat `\.md` write bound/);
    expect(dpia).toMatch(/P1 \/ release-blocking for confirmed Storage erasure/);
  });
});

describe("unnumbered account deletion completion forward draft", () => {
  test("stays outside the active migration directory until a number is reserved", () => {
    expect(existsSync(completionDraftPath)).toBe(true);
    expect(completionDraft).toMatch(/UNNUMBERED/);
    expect(completionDraft).not.toMatch(/^\s*(?:BEGIN|COMMIT)\s*;/im);
  });

  test("creates a durable service-only tombstone and begin RPC", () => {
    expect(completionDraft).toMatch(/CREATE TABLE[^;]+public\.account_deletion_tombstones/i);
    expect(completionDraft).toMatch(/ALTER TABLE public\.account_deletion_tombstones ENABLE ROW LEVEL SECURITY/);
    expect(completionDraft).toMatch(/ALTER TABLE public\.account_deletion_tombstones FORCE ROW LEVEL SECURITY/);
    expect(completionDraft).toMatch(/REVOKE ALL ON TABLE public\.account_deletion_tombstones[\s\S]*?service_role/);
    expect(completionDraft).not.toMatch(/GRANT [^;]* ON TABLE public\.account_deletion_tombstones/);
    expect(completionDraft).toMatch(/FUNCTION public\.begin_account_deletion\([\s\S]*?VOLATILE[\s\S]*?SECURITY DEFINER[\s\S]*?SET row_security = off/);
    expect(completionDraft).toMatch(/SET search_path = ''/);
    expect(completionDraft).toMatch(/pg_advisory_xact_lock\(/);
    expect(completionDraft).toMatch(/FROM public\.users AS u[\s\S]*FOR UPDATE/);
    expect(completionDraft).toMatch(/INSERT INTO public\.account_deletion_tombstones/);
    expect(completionDraft).toMatch(/REVOKE ALL ON FUNCTION public\.begin_account_deletion[^;]+FROM PUBLIC, anon, authenticated, service_role/);
    expect(completionDraft).toMatch(/GRANT EXECUTE ON FUNCTION public\.begin_account_deletion[^;]+TO service_role/);
  });

  test("keeps the old RPC name as a fencing compatibility wrapper", () => {
    expect(completionDraft).toMatch(/FUNCTION public\.verify_account_deletion_session\([\s\S]*?VOLATILE/);
    expect(completionDraft).toMatch(/public\.begin_account_deletion\(p_user_id, p_session_id, p_issued_at\)/);
  });

  test("serializes raw Storage writes before checking the committed fence", () => {
    expect(completionDraft).toMatch(/FUNCTION public\.guard_raw_clipping_account_deletion\(\)[\s\S]*?VOLATILE[\s\S]*?SECURITY DEFINER[\s\S]*?SET row_security = off/);
    expect(completionDraft).toMatch(/pg_advisory_xact_lock_shared\(/);
    expect(completionDraft).toMatch(/FROM public\.users AS u[\s\S]*FOR KEY SHARE/);
    expect(completionDraft).toMatch(/BEFORE INSERT OR UPDATE ON storage\.objects/);
    const rowLockAt = completionDraft.indexOf("FOR KEY SHARE");
    const fenceCheckAt = completionDraft.indexOf("FROM public.account_deletion_tombstones", rowLockAt);
    expect(rowLockAt).toBeGreaterThan(-1);
    expect(fenceCheckAt).toBeGreaterThan(rowLockAt);
  });

  test("restores 0186's flat non-empty markdown write policies", () => {
    expect(completionDraft).toMatch(/file_size_limit\s*=\s*1048576/);
    expect(completionDraft).toMatch(/allowed_mime_types\s*=\s*ARRAY\['text\/markdown'\]::text\[\]/);
    expect((completionDraft.match(/array_length\(storage\.foldername\(name\), 1\) = 1/g) || []).length)
      .toBeGreaterThanOrEqual(3);
    expect((completionDraft.match(/name LIKE \(SELECT auth\.uid\(\)\)::text \|\| '\/%\.md'/g) || []).length)
      .toBeGreaterThanOrEqual(3);
  });
});
