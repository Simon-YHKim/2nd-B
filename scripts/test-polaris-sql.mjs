// Disposable PostgreSQL only. Explicit connection arguments, no env defaults.
// node scripts/test-polaris-sql.mjs 55479 polaris_local polaris_test_v2
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const [port, user, database] = process.argv.slice(2);
if (!/^\d{4,5}$/.test(port ?? "") || Number(port) > 65535 ||
    !/^polaris_[a-z0-9_]+$/.test(user ?? "") || !/^polaris_test[a-z0-9_]*$/.test(database ?? "")) {
  throw new Error("Use an explicit disposable polaris_test database and polaris_ user on localhost.");
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root,"db/migration-drafts/tests/polaris-generation-contract.sql");
const cutover = readFileSync(resolve(root,"db/migrations/0135_credit_cutover.sql"),"utf8");
const latestFunctions = ["credit_refund_spend_internal","spend_credits"].map((name) => {
  const match = cutover.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`));
  if (!match) throw new Error(`Missing current credit API: ${name}`);
  return match[0];
}).join("\n");
const erasure = readFileSync(resolve(root,"db/migrations/0189_erasure_registry.sql"),"utf8");
const erasureTable = erasure.match(/CREATE TABLE IF NOT EXISTS public\.erasure_registry \([\s\S]*?\n\);/)?.[0];
const erasureRpc = erasure.match(/CREATE OR REPLACE FUNCTION public\.erase_my_data\([\s\S]*?\$erase_my_data\$;/)?.[0];
const tombstone = readFileSync(resolve(root,"db/migration-drafts/UNNUMBERED_account_deletion_completion_fence.sql"),"utf8")
  .match(/CREATE TABLE IF NOT EXISTS public\.account_deletion_tombstones \([\s\S]*?\n\);/)?.[0];
if (!erasureTable || !erasureRpc || !tombstone) throw new Error("Missing current erasure/deletion fence contracts");
const sql = readFileSync(fixture,"utf8")
  .replace("-- @LOAD_LATEST_CREDIT_CONTRACT@",() => latestFunctions)
  .replace("-- @LOAD_ERASURE_CONTRACT@",() => `${erasureTable}\n${erasureRpc}\n${tombstone}`)
  .replace(/^\\ir (.+)$/gm, (_match,path) => `\\ir '${resolve(dirname(fixture),path).replaceAll("\\","/")}'`);
// PGHOSTADDR/PGSERVICE can override -h. Keep only the disposable local password;
// -X also prevents psqlrc from issuing a separate connection or SQL command.
const env = Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => !/^PG/i.test(key) || key === "PGPASSWORD"));
const connectionArgs = ["-X","--no-password","-h","127.0.0.1","-p",port,"-U",user,"-d",database,"-v","ON_ERROR_STOP=1"];
const result = spawnSync("psql",connectionArgs,{
  input:sql,encoding:"utf8",env,windowsHide:true,timeout:60_000,
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
if (process.exitCode === 0) {
  const args = [...connectionArgs,"-At"];
  const owner = "11111111-1111-4111-8111-111111111111";
  const query = (statement) => new Promise((done,reject) => {
    const child = spawn("psql",args,{env,windowsHide:true,timeout:60_000});
    let out=""; let err="";
    child.stdout.on("data",chunk => { out+=chunk; });
    child.stderr.on("data",chunk => { err+=chunk; });
    child.on("error",reject);
    child.on("close",code => done({code,out,err}));
    child.stdin.end(`SET test.user_id='${owner}';\n${statement}`);
  });
  const reserve = key => `BEGIN; SELECT public.reserve_polaris_generation('${owner}','${key}')->>'generation_id'; SELECT pg_sleep(0.1); COMMIT;`;
  const repeated = await Promise.all([query(reserve("race-same-key")),query(reserve("race-same-key"))]);
  const ids = repeated.map(r => r.out.match(/[0-9a-f]{8}-[0-9a-f-]{27}/)?.[0]);
  if (repeated.some(r=>r.code!==0) || !ids[0] || ids[0]!==ids[1]) throw new Error("Concurrent same-key idempotency failed");
  await query(`SELECT public.cancel_polaris_generation('${owner}','${ids[0]}');`);
  const competing = await Promise.all([query(reserve("race-first-key")),query(reserve("race-second-key"))]);
  if (competing.filter(r=>r.code===0).length!==1) throw new Error("Concurrent distinct-key reservation failed");
  const winningId = competing.find(r=>r.code===0).out.match(/[0-9a-f]{8}-[0-9a-f-]{27}/)?.[0];
  if (!winningId) throw new Error("No race winner returned");
  const cleanup = await query(`SELECT public.cancel_polaris_generation('${owner}','${winningId}'); SELECT reasoning_used FROM public.usage_counters WHERE user_id='${owner}';`);
  if (cleanup.code!==0 || !cleanup.out.trim().endsWith("2")) throw new Error("Race cancellation did not refund exactly once");
  process.stdout.write("PASS: two real concurrent PostgreSQL clients, same-key idempotency and distinct-key serialization\n");
  const resetApprovals = await query(`UPDATE public.personas SET patterns=patterns||jsonb_build_object('role_cards_v1',
    (SELECT jsonb_agg(value||'{"status":"proposed"}'::jsonb)::text FROM jsonb_array_elements((patterns->>'role_cards_v1')::jsonb)))
    WHERE user_id='${owner}';`);
  if (resetApprovals.code!==0) throw new Error("Could not prepare approval race");
  const approve = id => `BEGIN; SELECT public.ratify_polaris_role_card('${owner}',
    (SELECT value FROM public.personas p,jsonb_array_elements((p.patterns->>'role_cards_v1')::jsonb) c(value)
      WHERE p.user_id='${owner}' AND value->>'id'='${id}'));
    SELECT pg_sleep(0.1); COMMIT;`;
  const approvals = await Promise.all([query(approve("maker")),query(approve("planner"))]);
  const approvalCount = await query(`SELECT count(*) FROM public.personas p,jsonb_array_elements((p.patterns->>'role_cards_v1')::jsonb) c
    WHERE p.user_id='${owner}' AND c->>'status'='ratified';`);
  if (approvals.some(r=>r.code!==0) || !approvalCount.out.trim().endsWith("2")) throw new Error("Concurrent approvals lost a sibling");
  process.stdout.write("PASS: two concurrent PostgreSQL approvals preserve both displayed cards\n");
  const oldCard = {id:"maker",label:"Maker",summary:"The displayed summary",status:"proposed",claimStrength:2,
    evidence:{domains:["work"],constructs:["self-reported narrative (same-source)"]},evidenceRefs:["record:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]};
  const drafts = [{...oldCard,summary:"The newly generated summary"},{...oldCard,id:"planner",label:"Planner"}];
  const prepareSettlementRace = await query(`UPDATE public.users SET tier='brain' WHERE id='${owner}';
    UPDATE public.personas SET patterns=patterns||jsonb_build_object('role_cards_v1',$cards$${JSON.stringify([oldCard])}$cards$::text)
      WHERE user_id='${owner}';
    SELECT public.reserve_polaris_generation('${owner}','approval-settlement-race')->>'generation_id';`);
  const generation = prepareSettlementRace.out.match(/[0-9a-f]{8}-[0-9a-f-]{27}/)?.[0];
  if (prepareSettlementRace.code!==0 || !generation) throw new Error("Could not prepare settlement race");
  if ((await query(`SELECT public.claim_polaris_generation('${owner}','${generation}');`)).code!==0) throw new Error("Could not claim settlement race");
  const [approval,settlement] = await Promise.all([
    query(`BEGIN; SELECT public.ratify_polaris_role_card('${owner}',$card$${JSON.stringify(oldCard)}$card$::jsonb); SELECT pg_sleep(0.1); COMMIT;`),
    query(`BEGIN; SELECT public.settle_polaris_generation('${owner}','${generation}',$cards$${JSON.stringify(drafts)}$cards$::jsonb); SELECT pg_sleep(0.1); COMMIT;`),
  ]);
  const deckResult = await query(`SELECT patterns->>'role_cards_v1' FROM public.personas WHERE user_id='${owner}';`);
  const deck = JSON.parse(deckResult.out.trim().split("\n").at(-1));
  const maker = deck.find(card=>card.id==="maker");
  const expectedMaker = approval.code===0 ? {status:"ratified",summary:oldCard.summary} : {status:"proposed",summary:drafts[0].summary};
  if (settlement.code!==0 || maker?.status!==expectedMaker.status || maker?.summary!==expectedMaker.summary ||
      !deck.some(card=>card.id==="planner" && card.status==="proposed")) throw new Error("Approval/settlement race lost an approval or a new draft");
  process.stdout.write("PASS: concurrent generation settlement preserves approvals or rejects a stale displayed card\n");
  const erasureOwner = "55555555-5555-4555-8555-555555555555";
  const erasureRecord = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const erasePrep = await query(`SET test.user_id='${erasureOwner}';
    INSERT INTO auth.users VALUES('${erasureOwner}'); INSERT INTO public.users(id) VALUES('${erasureOwner}');
    INSERT INTO public.records(id,user_id,kind,audit_period,tags,body) VALUES('${erasureRecord}','${erasureOwner}','audit_response','work',ARRAY['interview'],'Delete this interview.');
    SELECT public.reserve_polaris_generation('${erasureOwner}','concurrent-erasure')->>'generation_id';`);
  const eraseGeneration = erasePrep.out.match(/[0-9a-f]{8}-[0-9a-f-]{27}/)?.[0];
  if (erasePrep.code!==0 || !eraseGeneration) throw new Error("Could not prepare concurrent erasure");
  if ((await query(`SELECT public.claim_polaris_generation('${erasureOwner}','${eraseGeneration}');`)).code!==0) throw new Error("Could not claim concurrent erasure");
  const eraseCard = {...oldCard,evidenceRefs:[`record:${erasureRecord}`]};
  const [erased,erasureSettlement] = await Promise.all([
    query(`SET test.user_id='${erasureOwner}'; BEGIN; DELETE FROM public.records WHERE user_id='${erasureOwner}'; SELECT pg_sleep(0.1); COMMIT;`),
    query(`BEGIN; SELECT public.settle_polaris_generation('${erasureOwner}','${eraseGeneration}',$cards$${JSON.stringify([eraseCard])}$cards$::jsonb); SELECT pg_sleep(0.1); COMMIT;`),
  ]);
  const eraseCheck = await query(`SELECT NOT EXISTS(SELECT 1 FROM public.records WHERE user_id='${erasureOwner}')
    AND NOT EXISTS(SELECT 1 FROM public.polaris_generations WHERE user_id='${erasureOwner}' AND (evidence<>'[]'::jsonb OR status IN ('reserved','running')))
    AND NOT EXISTS(SELECT 1 FROM public.personas WHERE user_id='${erasureOwner}' AND patterns->>'role_cards_v1'<>'[]');`);
  if (erased.code!==0 || erasureSettlement.code!==0 || eraseCheck.code!==0 || !eraseCheck.out.trim().endsWith("t")) throw new Error("Concurrent erasure left evidence or resurrected a role");
  process.stdout.write("PASS: concurrent record deletion and settlement neither deadlock nor resurrect evidence/cards\n");
  const claimPrep = await query(`SET test.user_id='${erasureOwner}';
    INSERT INTO public.records(id,user_id,kind,audit_period,tags,body) VALUES('${erasureRecord}','${erasureOwner}','audit_response','work',ARRAY['interview'],'Delete before claim.');
    SELECT public.reserve_polaris_generation('${erasureOwner}','concurrent-claim-erasure')->>'generation_id';`);
  const claimGeneration = claimPrep.out.match(/[0-9a-f]{8}-[0-9a-f-]{27}/)?.[0];
  if (claimPrep.code!==0 || !claimGeneration) throw new Error("Could not prepare claim/erasure race");
  const [claimErased,claimRace] = await Promise.all([
    query(`SET test.user_id='${erasureOwner}'; BEGIN; DELETE FROM public.records WHERE user_id='${erasureOwner}'; SELECT pg_sleep(0.1); COMMIT;`),
    query(`BEGIN; SELECT public.claim_polaris_generation('${erasureOwner}','${claimGeneration}'); SELECT pg_sleep(0.1); COMMIT;`),
  ]);
  if (claimErased.code!==0 || (claimRace.code!==0 && !claimRace.err.includes("polaris_reservation_required"))) throw new Error("Claim/erasure lock order failed");
  process.stdout.write("PASS: concurrent claim/deletion allows only a committed snapshot or a rejected reservation\n");
}
