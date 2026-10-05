// Source contracts for the server-side deletion receipt (0217, Simon decision
// Q-261004-42 = A): the migration, the delete-account wiring and the read-only
// lookup function. Behaviour of the SQL itself runs in supabase-dry-run.yml
// (the numbered replay applies 0217 and its end-state DO block).
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "..", "..");
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");
const stripSqlComments = (sql: string) => sql.replace(/--[^\n]*/g, "");
const stripTsComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const migration = read("db", "migrations", "0217_account_deletion_receipts.sql");
const sql = stripSqlComments(migration);
const rollback = read("db", "migrations", "rollback", "0217_down.sql");
const deleteAccount = stripTsComments(read("supabase", "functions", "delete-account", "index.ts"));
const receiptFn = stripTsComments(read("supabase", "functions", "account-deletion-receipt", "index.ts"));
const receiptShape = stripTsComments(read("supabase", "functions", "account-deletion-receipt", "receipt-shape.ts"));
const config = read("supabase", "config.toml");

describe("0217 receipt table holds no account identifier", () => {
  const table = /CREATE TABLE IF NOT EXISTS public\.account_deletion_receipts \(([\s\S]*?)\n\);/.exec(sql)?.[1] ?? "";

  test("the table has exactly the five non-identifying columns", () => {
    expect(table).not.toBe("");
    const columns = table.split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[a-z_]+ /.test(line) && !line.startsWith("CONSTRAINT"))
      .map((line) => line.split(" ")[0]);
    expect(columns).toEqual(["id", "erased_at", "expires_at", "sweeps", "sweeps_reported_at"]);
    // An owner-named column would pull the table into check:erasure-registry G1
    // and turn the receipt back into personal data.
    expect(table).not.toMatch(/user_id|owner|session|email|hash/i);
    expect(sql).toMatch(/a\.attname NOT IN \('id', 'erased_at', 'expires_at', 'sweeps', 'sweeps_reported_at'\)/);
  });

  test("RLS is forced and no client role holds any table privilege", () => {
    expect(sql).toMatch(/ALTER TABLE public\.account_deletion_receipts ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.account_deletion_receipts FORCE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.account_deletion_receipts\s+FROM PUBLIC, anon, authenticated, service_role/);
    expect(sql).not.toMatch(/GRANT [^;]* ON TABLE public\.account_deletion_receipts/);
    expect(sql).not.toMatch(/CREATE POLICY/);
  });

  test("a receipt expires after 365 days and expired rows are neither read nor kept", () => {
    expect(sql).toMatch(/v_erased_at \+ interval '365 days'/);
    expect(sql).toMatch(/r\.expires_at > pg_catalog\.now\(\)/);
    expect(sql).toMatch(/DELETE FROM public\.account_deletion_receipts AS r\s+WHERE r\.expires_at <= pg_catalog\.now\(\)/);
    expect(sql).toMatch(/cron\.schedule\(\s*'purge-expired-account-deletion-receipts'/);
    expect(sql).toMatch(/pg_available_extensions WHERE name = 'pg_cron'/);
  });
});

describe("0217 issues the receipt atomically with the profile erasure", () => {
  test("a BEFORE DELETE trigger on public.users turns the pending number into the receipt", () => {
    expect(sql).toMatch(/CREATE TRIGGER trg_users_issue_account_deletion_receipt\s+BEFORE DELETE ON public\.users\s+FOR EACH ROW EXECUTE FUNCTION public\.issue_account_deletion_receipt\(\)/);
    const trigger = sql.slice(sql.indexOf("FUNCTION public.issue_account_deletion_receipt()"));
    const read = trigger.indexOf("SELECT t.pending_receipt_id");
    const insert = trigger.indexOf("INSERT INTO public.account_deletion_receipts");
    const clear = trigger.indexOf("SET pending_receipt_id = NULL");
    expect(read).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(read);
    expect(clear).toBeGreaterThan(insert);
  });

  test("a receipt failure never blocks the erasure", () => {
    const trigger = sql.slice(
      sql.indexOf("FUNCTION public.issue_account_deletion_receipt()"),
      sql.indexOf("REVOKE ALL ON FUNCTION public.issue_account_deletion_receipt()"),
    );
    expect(trigger).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING 'account_deletion_receipt_not_issued';/);
    expect(trigger).toMatch(/RETURN OLD;/);
    expect(trigger).not.toMatch(/RAISE EXCEPTION/);
  });

  test("the pending number lives on the 0192 tombstone, unique while set", () => {
    expect(sql).toMatch(/to_regclass\('public\.account_deletion_tombstones'\) IS NULL/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS pending_receipt_id uuid/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_tombstones_pending_receipt_key[\s\S]*WHERE pending_receipt_id IS NOT NULL/);
  });

  test("a requested number already used, or hung on another account, is replaced", () => {
    const attach = sql.slice(
      sql.indexOf("FUNCTION public.attach_account_deletion_receipt("),
      sql.indexOf("REVOKE ALL ON FUNCTION public.attach_account_deletion_receipt"),
    );
    expect(attach).toMatch(/FROM public\.account_deletion_receipts AS r WHERE r\.id = v_receipt/);
    expect(attach).toMatch(/t\.pending_receipt_id = v_receipt\s+AND t\.user_id <> p_user_id/);
    expect(attach).toMatch(/v_receipt := pg_catalog\.gen_random_uuid\(\)/);
  });
});

describe("0217 functions are service-only, search_path-pinned definers", () => {
  const rpcs = [
    "attach_account_deletion_receipt(uuid, uuid)",
    "record_account_deletion_receipt_sweeps(uuid, jsonb)",
    "get_account_deletion_receipt(uuid)",
    "purge_expired_account_deletion_receipts()",
  ];

  test.each(rpcs)("%s is revoked from every client role and granted to service_role", (signature) => {
    const name = signature.replace(/\(.*$/, "");
    const escaped = signature.replace(/[()]/g, "\\$&");
    expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${escaped}\\s+FROM PUBLIC, anon, authenticated, service_role`));
    expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${escaped}\\s+TO service_role`));
    const body = sql.slice(sql.indexOf(`FUNCTION public.${name}(`));
    expect(body.slice(0, 400)).toMatch(/SECURITY DEFINER\s+SET search_path = ''\s+SET row_security = off/);
  });

  test("the trigger function is granted to nobody", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.issue_account_deletion_receipt\(\)\s+FROM PUBLIC, anon, authenticated, service_role/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.issue_account_deletion_receipt/);
  });

  test("RPCs re-check the service role from the JWT claims", () => {
    for (const name of ["attach_account_deletion_receipt", "record_account_deletion_receipt_sweeps", "get_account_deletion_receipt"]) {
      const body = sql.slice(sql.indexOf(`FUNCTION public.${name}(`), sql.indexOf(`REVOKE ALL ON FUNCTION public.${name}`));
      expect(body).toMatch(/v_role IS DISTINCT FROM 'service_role'/);
    }
  });

  test("recorded observations are limited to six keys with boolean or null values", () => {
    const record = sql.slice(
      sql.indexOf("FUNCTION public.record_account_deletion_receipt_sweeps("),
      sql.indexOf("REVOKE ALL ON FUNCTION public.record_account_deletion_receipt_sweeps"),
    );
    for (const key of [
      "profile_erased", "deletion_fenced", "raw_clippings_erased",
      "raw_clippings_empty_at_check", "record_photos_erased", "record_photos_empty_at_check",
    ]) expect(record).toContain(`'${key}'`);
    expect(record).toMatch(/jsonb_typeof\(entry\.value\) NOT IN \('boolean', 'null'\)/);
    expect(record).toMatch(/AND r\.sweeps_reported_at IS NULL/);
  });

  test("no top-level transaction wrapper (Supabase CLI wraps the file)", () => {
    expect(migration).not.toMatch(/^\s*BEGIN\s*;/im);
    expect(migration).not.toMatch(/^\s*COMMIT\s*;/im);
  });

  test("the rollback removes everything 0217 adds", () => {
    for (const fragment of [
      "cron.unschedule",
      "DROP TRIGGER IF EXISTS trg_users_issue_account_deletion_receipt ON public.users",
      "DROP FUNCTION IF EXISTS public.purge_expired_account_deletion_receipts()",
      "DROP FUNCTION IF EXISTS public.get_account_deletion_receipt(uuid)",
      "DROP FUNCTION IF EXISTS public.record_account_deletion_receipt_sweeps(uuid, jsonb)",
      "DROP FUNCTION IF EXISTS public.issue_account_deletion_receipt()",
      "DROP FUNCTION IF EXISTS public.attach_account_deletion_receipt(uuid, uuid)",
      "DROP INDEX IF EXISTS public.account_deletion_tombstones_pending_receipt_key",
      "DROP COLUMN IF EXISTS pending_receipt_id",
      "DROP TABLE IF EXISTS public.account_deletion_receipts",
    ]) expect(rollback).toContain(fragment);
  });
});

describe("delete-account records the receipt without letting it block erasure", () => {
  test("the number is hung right before Auth deletion and confirmed right after", () => {
    const attach = deleteAccount.indexOf("'attach_account_deletion_receipt'");
    const authDelete = deleteAccount.indexOf("await deleteAuthUserWithReconciliation(");
    const photos = deleteAccount.indexOf("preDeletionPhotos = await eraseRawClippings");
    const record = deleteAccount.indexOf("'record_account_deletion_receipt_sweeps'");
    const respond = deleteAccount.indexOf("receipt_id: receiptId");
    expect(photos).toBeGreaterThan(-1);
    expect(attach).toBeGreaterThan(photos);
    expect(authDelete).toBeGreaterThan(attach);
    expect(record).toBeGreaterThan(authDelete);
    expect(respond).toBeGreaterThan(record);
  });

  test("the deletion target still comes only from the verified JWT", () => {
    expect(deleteAccount).toMatch(/p_user_id: authUser\.id, p_receipt_id: requestId \?\? crypto\.randomUUID\(\)/);
    expect(deleteAccount).toMatch(/deleteAuthUserWithReconciliation\(admin\.auth\.admin, authUser\.id\)/);
  });

  test("a receipt number is returned only when the receipt row was proven to exist", () => {
    expect(deleteAccount).toMatch(/if \(!recordError && recorded === true\) receiptId = pendingReceiptId;/);
    expect(deleteAccount).toMatch(/let receiptId: string \| null = null;/);
  });

  test("receipt RPC failures are logged and swallowed, never turned into a failed deletion", () => {
    const attachBlock = deleteAccount.slice(
      deleteAccount.indexOf("let pendingReceiptId"),
      deleteAccount.indexOf("await deleteAuthUserWithReconciliation("),
    );
    expect(attachBlock).toMatch(/catch \{\s+safeLog\('receipt_attach_failed'\);\s+\}/);
    expect(attachBlock).not.toMatch(/return jsonResponse/);
  });

  test("only `{}` or exactly one lowercase request id is accepted", () => {
    const source = read("supabase", "functions", "delete-account", "index.ts");
    const literal = /const REQUEST_ID_BODY_RE =\s*(\/.+\/);/.exec(source)?.[1];
    expect(literal).toBeDefined();
    const re = new Function(`return ${literal};`)() as RegExp;
    const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    expect(re.exec(`{"request_id":"${id}"}`)?.[1]).toBe(id);
    for (const body of [
      `{"request_id":"${id.toUpperCase()}"}`,
      `{"request_id": "${id}"}`,
      `{"request_id":"${id}","user_id":"${id}"}`,
      `{"user_id":"${id}"}`,
      `{"request_id":"${id}"} `,
      "{}",
    ]) expect(re.test(body)).toBe(false);
  });
});

describe("account-deletion-receipt is a read-only lookup by number", () => {
  test("it reads one RPC and writes nothing", () => {
    expect(receiptFn).toMatch(/admin\.rpc\('get_account_deletion_receipt'/);
    expect(receiptFn).not.toMatch(/\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    expect((receiptFn.match(/admin\.rpc\(/g) ?? []).length).toBe(1);
  });

  test("it trusts no identity: no JWT decoding, no getUser", () => {
    // (`authorization` still appears once: the CORS allow-headers list.)
    expect(receiptFn).not.toMatch(/atob\(|getUser\(|\.sub\b|headers\.get\(\s*'authorization'/i);
  });

  test("not found is a 200 with a null receipt, so a missing function can never read as not found", () => {
    expect(receiptFn).toMatch(/if \(data === null\) return jsonResponse\(req, \{ receipt: null \}\);/);
    expect(receiptFn).not.toMatch(/, 404\)/);
  });

  test("only the known receipt fields leave the server (behaviour: __tests__/receipt-shape.test.ts)", () => {
    expect(receiptShape).toMatch(/export function publicReceipt\(/);
    expect(receiptFn).toMatch(/const receipt = publicReceipt\(data\);/);
    expect(receiptFn).toMatch(/receipt\.id !== receiptId/);
    expect(receiptShape).not.toMatch(/from ['"]/);
  });

  test("the request is one strict, flat, tiny JSON object", () => {
    expect(receiptFn).toMatch(/const MAX_BODY_BYTES = 256;/);
    expect(receiptFn).toMatch(/readStrictJsonObject\(req, MAX_BODY_BYTES, MAX_BODY_DEPTH\)/);
    expect(receiptFn).toMatch(/const requested = receiptIdFromBody\(body\);/);
    expect(receiptShape).toMatch(/keys\.length !== 1 \|\| keys\[0\] !== 'receipt_id'/);
  });

  test("the gateway keeps verify_jwt on (the app sends the publishable key)", () => {
    const block = /\[functions\.account-deletion-receipt\]([\s\S]*?)(?:\n\[|$)/.exec(config)?.[1] ?? "";
    expect(block).toMatch(/^verify_jwt = true$/m);
  });
});
