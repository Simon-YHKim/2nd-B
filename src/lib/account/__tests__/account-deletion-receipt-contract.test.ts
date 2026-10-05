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

  test("the yearly deletion the legal page promises does not rest on an unchecked scheduler (DEL2-R1-09)", () => {
    // Where pg_cron exists, the apply fails unless exactly one purge job is there.
    const check = sql.slice(sql.indexOf("DO $account_deletion_receipts_check$"));
    expect(check).toMatch(/to_regclass\('cron\.job'\) IS NOT NULL/);
    expect(check).toMatch(/FROM cron\.job WHERE jobname = \$1 AND command = \$2/);
    expect(check).toMatch(/IF v_jobs IS DISTINCT FROM 1 THEN\s+RAISE EXCEPTION/);
    // On a hosted Supabase project a missing pg_cron fails the apply instead of
    // leaving the purge to the opportunistic attach-time drain (D2A-R2-02).
    const schedule = sql.slice(sql.indexOf("DO $schedule_receipt_purge$"), sql.indexOf("DO $account_deletion_receipts_check$"));
    expect(schedule).toMatch(/WHERE name = 'pg_cron'\) THEN\s+IF EXISTS \(SELECT 1 FROM pg_catalog\.pg_roles WHERE rolname = 'supabase_admin'\) THEN\s+RAISE EXCEPTION/);
    expect(schedule.indexOf("supabase_admin")).toBeLessThan(schedule.indexOf("RAISE NOTICE '0217: pg_cron not available"));
    // Where it does not, every attach drains expired receipts (0180's shape),
    // and that cleanup can never stop the number from being attached.
    const attach = sql.slice(
      sql.indexOf("FUNCTION public.attach_account_deletion_receipt("),
      sql.indexOf("REVOKE ALL ON FUNCTION public.attach_account_deletion_receipt"),
    );
    expect(attach).toMatch(/WHERE e\.expires_at <= pg_catalog\.now\(\)[\s\S]*LIMIT 100\s+FOR UPDATE SKIP LOCKED/);
    expect(attach).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING 'account_deletion_receipt_prune_skipped';/);
    expect(attach.indexOf("account_deletion_receipt_prune_skipped")).toBeLessThan(attach.indexOf("UPDATE public.account_deletion_tombstones"));
  });
});

describe("0217 issues the receipt atomically with the profile erasure", () => {
  test("a BEFORE DELETE trigger on public.users turns the pending number into the receipt", () => {
    expect(sql).toMatch(/CREATE TRIGGER trg_users_issue_account_deletion_receipt\s+BEFORE DELETE ON public\.users\s+FOR EACH ROW EXECUTE FUNCTION public\.issue_account_deletion_receipt\(\)/);
    const trigger = sql.slice(sql.indexOf("FUNCTION public.issue_account_deletion_receipt()"));
    const read = trigger.indexOf("SELECT t.pending_receipt_ids");
    const insert = trigger.indexOf("INSERT INTO public.account_deletion_receipts");
    const clear = trigger.indexOf("SET pending_receipt_ids = NULL");
    expect(read).toBeGreaterThan(-1);
    // Cleared FIRST, issued only after (gate DEL2-R1-07): a receipt can never
    // exist while the retained tombstone still links it to the user id.
    expect(clear).toBeGreaterThan(read);
    expect(insert).toBeGreaterThan(clear);
  });

  test("a failed clear issues no receipt; a failed issue still leaves the number cleared (DEL2-R1-07)", () => {
    const trigger = sql.slice(
      sql.indexOf("FUNCTION public.issue_account_deletion_receipt()"),
      sql.indexOf("REVOKE ALL ON FUNCTION public.issue_account_deletion_receipt()"),
    );
    const clearBlock = trigger.slice(trigger.indexOf("SELECT t.pending_receipt_ids"), trigger.indexOf("INSERT INTO public.account_deletion_receipts"));
    // The clear has its own handler, which forgets the numbers (PL/pgSQL
    // variables survive a subtransaction rollback, so it must be reset by hand).
    expect(clearBlock).toMatch(/EXCEPTION WHEN OTHERS THEN\s+v_receipts := NULL;\s+RAISE WARNING 'account_deletion_receipt_not_cleared';/);
    // The insert runs in a second block, entered only with cleared numbers.
    const issueBlock = trigger.slice(trigger.indexOf("account_deletion_receipt_not_cleared"));
    expect(issueBlock).toMatch(/IF v_receipts IS NOT NULL THEN\s+BEGIN\s+v_erased_at :=/);
    expect(issueBlock).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING 'account_deletion_receipt_not_issued';/);
    expect(issueBlock).not.toContain("SET pending_receipt_ids");
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

  const attachBody = () => sql.slice(
    sql.indexOf("FUNCTION public.attach_account_deletion_receipt("),
    sql.indexOf("REVOKE ALL ON FUNCTION public.attach_account_deletion_receipt"),
  );

  test("the pending numbers live on the 0192 tombstone, one per request", () => {
    expect(sql).toMatch(/to_regclass\('public\.account_deletion_tombstones'\) IS NULL/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS pending_receipt_ids uuid\[\]/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS account_deletion_tombstones_pending_receipts_idx\s+ON public\.account_deletion_tombstones USING gin \(pending_receipt_ids\)\s+WHERE pending_receipt_ids IS NOT NULL/);
    expect(sql).not.toMatch(/\bpending_receipt_id\b/);
  });

  test("a second request adds its number instead of overwriting the first (D2A-02)", () => {
    const attach = attachBody();
    expect(attach).toMatch(/SET pending_receipt_ids = CASE\s+WHEN v_receipt = ANY \(COALESCE\(t\.pending_receipt_ids, '\{\}'::uuid\[\]\)\)\s+THEN t\.pending_receipt_ids\s+ELSE \(COALESCE\(t\.pending_receipt_ids, '\{\}'::uuid\[\]\) \|\| v_receipt\)\[/);
    expect(attach).toMatch(/GREATEST\(1, pg_catalog\.cardinality\(COALESCE\(t\.pending_receipt_ids, '\{\}'::uuid\[\]\)\) - 6\):\]/);
    // Every number still attached when the profile row goes becomes a receipt.
    const trigger = sql.slice(sql.indexOf("FUNCTION public.issue_account_deletion_receipt()"));
    expect(trigger).toMatch(/SELECT DISTINCT pending\.id, v_erased_at, v_erased_at \+ interval '365 days'\s+FROM pg_catalog\.unnest\(v_receipts\) AS pending\(id\)/);
  });

  test("a requested number already used, or hung on another account, is refused, never replaced (D2A-01)", () => {
    const attach = attachBody();
    expect(attach).toMatch(/FROM public\.account_deletion_receipts AS r WHERE r\.id = v_receipt/);
    expect(attach).toMatch(/t\.pending_receipt_ids @> ARRAY\[v_receipt\]\s+AND t\.user_id <> p_user_id/);
    expect(attach).toMatch(/THEN\s+RAISE EXCEPTION 'account_deletion_receipt_id_taken' USING ERRCODE = 'X0217';/);
    // A fresh number is drawn only when none was proposed, never over a taken one.
    expect(attach.match(/gen_random_uuid\(\)/g)).toHaveLength(1);
    expect(attach).toMatch(/v_receipt uuid := COALESCE\(p_receipt_id, pg_catalog\.gen_random_uuid\(\)\);/);
  });

  test("attach locks the profile row first and writes nothing once it is gone (D2A-R2-04)", () => {
    const attach = attachBody();
    const lock = attach.search(/FROM public\.users AS u\s+WHERE u\.id = p_user_id\s+FOR UPDATE;/);
    const gone = attach.search(/IF v_locked_user IS NULL THEN\s+RETURN NULL;/);
    const taken = attach.indexOf("account_deletion_receipt_id_taken");
    const write = attach.indexOf("UPDATE public.account_deletion_tombstones");
    expect(lock).toBeGreaterThan(-1);
    expect(gone).toBeGreaterThan(lock);
    expect(taken).toBeGreaterThan(gone);
    expect(write).toBeGreaterThan(taken);
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
      "DROP INDEX IF EXISTS public.account_deletion_tombstones_pending_receipts_idx",
      "DROP COLUMN IF EXISTS pending_receipt_ids",
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
    expect(deleteAccount).toMatch(/const proposedReceiptId = requestId \?\? crypto\.randomUUID\(\);/);
    expect(deleteAccount).toMatch(/p_user_id: authUser\.id, p_receipt_id: proposedReceiptId/);
    expect(deleteAccount).toMatch(/deleteAuthUserWithReconciliation\(admin\.auth\.admin, authUser\.id\)/);
  });

  test("a receipt number is returned only when the receipt row was proven to exist", () => {
    expect(deleteAccount).toMatch(/if \(!recordError && recorded === true\) receiptId = pendingReceiptId;/);
    expect(deleteAccount).toMatch(/let receiptId: string \| null = null;/);
  });

  test("a failed sweeps record re-checks the row before answering 'no receipt' (DEL2-R1-08)", () => {
    const record = deleteAccount.indexOf("'record_account_deletion_receipt_sweeps'");
    const recheck = deleteAccount.indexOf("'get_account_deletion_receipt'", record);
    const respond = deleteAccount.indexOf("receipt_id: receiptId");
    expect(recheck).toBeGreaterThan(record);
    expect(respond).toBeGreaterThan(recheck);
    const block = deleteAccount.slice(recheck - 200, respond);
    expect(block).toMatch(/if \(receiptId === null\) \{/);
    expect(block).toMatch(/if \(!existingError && existingId === pendingReceiptId\) receiptId = pendingReceiptId;/);
    expect(block).toMatch(/catch \{\s+safeLog\('receipt_recheck_failed'\);\s+\}/);
  });

  test("receipt RPC failures are logged and swallowed, never turned into a failed deletion", () => {
    const attachBlock = deleteAccount.slice(
      deleteAccount.indexOf("let pendingReceiptId"),
      deleteAccount.indexOf("await deleteAuthUserWithReconciliation("),
    );
    expect(attachBlock).toMatch(/catch \{\s+safeLog\('receipt_attach_failed'\);\s+\}/);
    // The only early answer is the refusal of a taken number below.
    expect(attachBlock.match(/return jsonResponse/g)).toHaveLength(1);
  });

  test("a taken number stops the request before Auth goes, never a swapped one (D2A-01)", () => {
    const attachBlock = deleteAccount.slice(
      deleteAccount.indexOf("let pendingReceiptId"),
      deleteAccount.indexOf("await deleteAuthUserWithReconciliation("),
    );
    expect(deleteAccount).toMatch(/const RECEIPT_ID_TAKEN_SQLSTATE = 'X0217';/);
    expect(sql).toMatch(/USING ERRCODE = 'X0217';/);
    expect(attachBlock).toMatch(/attachError\?\.code === RECEIPT_ID_TAKEN_SQLSTATE\s+\|\| \(!attachError && typeof attached === 'string' && attached !== proposedReceiptId\)/);
    expect(attachBlock).toMatch(/return jsonResponse\(req, \{ error: 'receipt_id_taken', deletion_fenced: true \}, 409\);/);
    // The refusal is checked before the number is accepted as this erasure's.
    expect(attachBlock.indexOf("'receipt_id_taken'")).toBeLessThan(attachBlock.indexOf("pendingReceiptId = attached;"));
    // The client reads it as "this request did not erase the account".
    const client = stripTsComments(read("src", "lib", "records", "delete-bulk.ts"));
    expect(client).toMatch(/const INTACT_ERROR_CODES = new Set\(\[[\s\S]*"receipt_id_taken",\s*\]\);/);
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
