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
const consentFixture = resolve(root,"db/migration-drafts/tests/llm-consent-snapshot-contract.sql");
const billingRole = readFileSync(resolve(root,"db/migrations/0118_billing_refund_reconciliation.sql"),"utf8")
  .match(/CREATE OR REPLACE FUNCTION public\.billing_request_role\(\)[\s\S]*?\$\$;/)?.[0];
const emailTrigger = readFileSync(resolve(root,"db/migrations/0086_require_email_confirmation.sql"),"utf8")
  .match(/CREATE TRIGGER trg_complete_verified_email_signup\s[\s\S]*?EXECUTE FUNCTION public\.complete_verified_email_signup\(\);/)?.[0];
if (!billingRole || !emailTrigger) throw new Error("Missing actual consent role/trigger helpers");
const registryFixture = resolve(root,"db/migration-drafts/tests/service-contract-erasure-registry.sql");
const rewardRateTable = readFileSync(resolve(root,"db/migration-drafts/UNNUMBERED_reward_ssv_hardening.sql"),"utf8")
  .match(/CREATE TABLE IF NOT EXISTS public\.reward_ssv_issue_rate_limits \([\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/)?.[0];
const baseRegistrySeed = erasure.match(/-- <<< erasure-registry:generated[\s\S]*?-- <<< \/erasure-registry:generated >>>/)?.[0];
const polarisProvisioning = readFileSync(resolve(root,"db/migration-drafts/UNNUMBERED_polaris_generation_allowance.sql"),"utf8");
if (!rewardRateTable || !baseRegistrySeed) throw new Error("Missing actual rate-table/registry seed contracts");
const registrySql = readFileSync(registryFixture,"utf8")
  .replace("-- @LOAD_ACTUAL_REWARD_RATE_TABLE@",() => rewardRateTable)
  .replace("-- @LOAD_ACTUAL_REGISTRY_FORWARD@",() => readFileSync(resolve(root,"db/migration-drafts/UNNUMBERED_service_contract_erasure_registry.sql"),"utf8"))
  .replace("-- @LOAD_ACTUAL_BASE_REGISTRY_SEED@",() => baseRegistrySeed)
  .replace("-- @RECREATE_ACTUAL_ERASURE_OBJECTS@",() => `${erasureTable}\n${erasureRpc}`)
  .replace("-- @REPLAY_POLARIS_PROVISIONING@",() => `EXECUTE $provisioning$${polarisProvisioning}$provisioning$;`)
  .replace(/^\\ir (.+)$/gm, (_match,path) => `\\ir '${resolve(dirname(registryFixture),path).replaceAll("\\","/")}'`);
const consentSql = readFileSync(consentFixture,"utf8")
  .replace("-- @LOAD_ACTUAL_CONSENT_HELPERS@",() => `${billingRole}\n${emailTrigger}`)
  .replace(/^\\ir (.+)$/gm, (_match,path) => `\\ir '${resolve(dirname(consentFixture),path).replaceAll("\\","/")}'`)
  .replace("-- @LOAD_SERVICE_CONSENT_MANAGEMENT_TEST@",() => readFileSync(resolve(root,"db/migration-drafts/tests/llm-service-consent-management-contract.sql"),"utf8")
    .replace(/^\\ir (.+)$/gm, (_match,path) => `\\ir '${resolve(dirname(consentFixture),path).replaceAll("\\","/")}'`));
const sql = readFileSync(fixture,"utf8")
  .replace("-- @LOAD_LATEST_CREDIT_CONTRACT@",() => latestFunctions)
  .replace("-- @LOAD_ERASURE_CONTRACT@",() => `${erasureTable}\n${erasureRpc}\n${tombstone}`)
  .replace(/^\\ir (.+)$/gm, (_match,path) => `\\ir '${resolve(dirname(fixture),path).replaceAll("\\","/")}'`)
  .replace("-- @LOAD_CONSENT_SNAPSHOT_TEST@",() => `${consentSql}\n${registrySql}`);
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
    child.stdin.end(`SET test.user_id='${owner}'; SET request.jwt.claim.role='service_role';\n${statement}`);
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

  const consentUser = "66666666-6666-4666-8666-666666666666";
  const consentRecord = "ffffffff-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const consentCards = JSON.stringify([{...oldCard,evidenceRefs:[`record:${consentRecord}`]}]);
  const trustedEvent = (subject,ack) => `INSERT INTO public.consent_records(user_id,age_band,minor_tier,consent_version,policy_version,terms_version,
    purposes,required_ack,optional_consents,llm_processing_ack,overseas_transfer_ack,sensitive_data_ack,safety_notice_ack,locale)
    VALUES('${subject}','adult','adult','2026-09-07','2026-09-26','2026-08-16','["service"]',true,'{"chat_autosave":true}',true,true,true,${ack},'en');`;
  const snapshot = async (subject) => {
    const value = await query(`SELECT public.effective_llm_consent_snapshot_v2('${subject}');`);
    if (value.code!==0) throw new Error(`Snapshot query failed: ${value.err}`);
    return JSON.parse(value.out.trim().split("\n").at(-1));
  };
  const mustPass = (results,message) => {
    if (results.some(value => value.code!==0)) throw new Error(`${message}: ${results.map(value=>value.err).join(" ")}`);
  };
  const originalToken = (await snapshot(consentUser)).token;
  mustPass(await Promise.all([
    query(`BEGIN; SELECT public.effective_llm_consent_snapshot_v2('${consentUser}'); SELECT pg_sleep(0.15); COMMIT;`),
    query(`BEGIN; ${trustedEvent(consentUser,false)} SELECT pg_sleep(0.15); COMMIT;`),
  ]),"Snapshot/new trusted receipt deadlocked");
  if ((await snapshot(consentUser)).allowed) throw new Error("New negative receipt lost to the earlier snapshot");
  mustPass([await query(trustedEvent(consentUser,true))],"Trusted re-consent fixture failed");
  if ((await snapshot(consentUser)).token===originalToken) throw new Error("New receipt reused previous token");
  const beforeAba = (await snapshot(consentUser)).token;
  mustPass(await Promise.all([
    query(`BEGIN; UPDATE public.users SET privacy_prefs='{"chat_autosave":false}' WHERE id='${consentUser}'; SELECT pg_sleep(0.15);
      UPDATE public.users SET privacy_prefs='{"chat_autosave":true}' WHERE id='${consentUser}'; COMMIT;`),
    query(`BEGIN; INSERT INTO public.consent_changes(user_id,pref_key,event_type) VALUES('${consentUser}','chat_autosave','grant'); SELECT pg_sleep(0.15); COMMIT;`),
  ]),"Preference/change-event lock order deadlocked");
  if (!(await snapshot(consentUser)).allowed || (await snapshot(consentUser)).token===beforeAba) throw new Error("Concurrent optional transition failed to invalidate");
  process.stdout.write("PASS: real concurrent receipt/event writers serialize with snapshot locks and preserve ABA invalidation\n");

  const reserveConsent = async (subject,key) => {
    const reservation = await query(`SET test.user_id='${subject}'; SELECT public.reserve_polaris_generation('${subject}','${key}')->>'generation_id';`);
    const id = reservation.out.match(/[0-9a-f]{8}-[0-9a-f-]{27}/)?.[0];
    if (reservation.code!==0 || !id) throw new Error(`Consent race reserve failed: ${reservation.err}`);
    mustPass([await query(`SELECT public.claim_polaris_generation('${subject}','${id}');`)],"Consent race claim failed");
    return id;
  };
  const consentGeneration = await reserveConsent(consentUser,"consent-settlement-race");
  const settlementToken = (await snapshot(consentUser)).token;
  const [consentSettled,consentRevoked] = await Promise.all([
    query(`BEGIN; SELECT public.settle_polaris_generation('${consentUser}','${consentGeneration}',$cards$${consentCards}$cards$::jsonb,'${settlementToken}'); SELECT pg_sleep(0.15); COMMIT;`),
    query(`BEGIN; UPDATE public.users SET privacy_prefs='{"chat_autosave":false}' WHERE id='${consentUser}'; SELECT pg_sleep(0.15); COMMIT;`),
  ]);
  if (consentRevoked.code!==0 || (consentSettled.code!==0 && !consentSettled.err.includes("llm_consent_changed"))) throw new Error("Settlement/withdrawal lock order failed");
  mustPass([await query(`SELECT public.settle_polaris_generation('${consentUser}','${consentGeneration}',NULL);`)],"Denied race refund failed");
  const consentStatus = await query(`SELECT status FROM public.polaris_generations WHERE id='${consentGeneration}';`);
  if (!consentStatus.out.trim().endsWith(consentSettled.code===0 ? "completed" : "failed") || (await snapshot(consentUser)).allowed) throw new Error("Settlement did not respect the committed withdrawal order");
  process.stdout.write("PASS: consent withdrawal and successful settlement have one transaction order; rejected work refunds\n");

  // Force the real credit-refund path, whose FK check is the reason to keep
  // Polaris's advisory lock before the consent snapshot's users row lock.
  mustPass([await query(`SET test.user_id='${consentUser}';
    UPDATE public.users SET privacy_prefs='{"chat_autosave":true}' WHERE id='${consentUser}';
    DO $$ DECLARE g uuid; BEGIN
      WHILE (SELECT count(*) FROM public.polaris_generations WHERE user_id='${consentUser}' AND spend='intro' AND status='completed')<2 LOOP
        g := (public.reserve_polaris_generation('${consentUser}','fill-intro-'||gen_random_uuid())->>'generation_id')::uuid;
        PERFORM public.claim_polaris_generation('${consentUser}',g);
        PERFORM public.settle_polaris_generation('${consentUser}',g,$cards$${consentCards}$cards$::jsonb);
      END LOOP;
    END $$;
    INSERT INTO public.usage_counters(user_id,month_bucket,reasoning_used)
      VALUES('${consentUser}',to_char(now() AT TIME ZONE 'Asia/Seoul','IYYY-"W"IW'),2)
      ON CONFLICT(user_id,month_bucket) DO UPDATE SET reasoning_used=2;
    SELECT public.grant_credits_free('${consentUser}',1,'promo');`)],"Credit race setup failed");
  const creditGeneration = await reserveConsent(consentUser,"consent-credit-refund-race");
  const creditSpend = await query(`SELECT spend FROM public.polaris_generations WHERE id='${creditGeneration}';`);
  if (creditSpend.code!==0 || !creditSpend.out.trim().endsWith("credit")) throw new Error("Credit race did not reach the actual credit path");
  const creditToken = (await snapshot(consentUser)).token;
  mustPass(await Promise.all([
    query(`BEGIN; SELECT pg_advisory_xact_lock(hashtext('polaris:${consentUser}')); SELECT pg_sleep(0.15);
      SELECT public.settle_polaris_generation('${consentUser}','${creditGeneration}',NULL); COMMIT;`),
    query(`BEGIN; SELECT public.settle_polaris_generation('${consentUser}','${creditGeneration}',$cards$${consentCards}$cards$::jsonb,'${creditToken}'); SELECT pg_sleep(0.15); COMMIT;`),
  ]),"Credit refund/verified settlement deadlocked");
  const creditCheck = await query(`SELECT b.balance_available=CASE WHEN g.status='failed' THEN 1 ELSE 0 END
    FROM public.polaris_generations g JOIN public.credit_balance b ON b.user_id=g.user_id WHERE g.id='${creditGeneration}';`);
  if (creditCheck.code!==0 || !creditCheck.out.trim().endsWith("t")) throw new Error("Credit settlement/refund did not charge or refund exactly once");
  process.stdout.write("PASS: real credit refund and verified settlement preserve lock order and exactly-once credit accounting\n");

  const deletedUser = "77777777-7777-4777-8777-777777777777";
  const deletedRecord = "77777777-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  mustPass([await query(`INSERT INTO auth.users(id) VALUES('${deletedUser}');
    INSERT INTO public.users(id,privacy_prefs) VALUES('${deletedUser}','{"chat_autosave":true}');
    INSERT INTO public.records(id,user_id,kind,audit_period,tags,body) VALUES('${deletedRecord}','${deletedUser}','audit_response','work',ARRAY['interview'],'Account deletion consent race.');
    ${trustedEvent(deletedUser,true)}`)],"Deletion fixture failed");
  const deletedGeneration = await reserveConsent(deletedUser,"consent-account-delete-race");
  const deletedToken = (await snapshot(deletedUser)).token;
  const deletedCards = JSON.stringify([{...oldCard,evidenceRefs:[`record:${deletedRecord}`]}]);
  const foreignToken = await query(`SELECT public.settle_polaris_generation('${deletedUser}','${deletedGeneration}',$cards$${deletedCards}$cards$::jsonb,'${creditToken}');`);
  if (foreignToken.code===0 || !foreignToken.err.includes("llm_consent_changed")) throw new Error("Another account's consent token authorized persistence");
  const [accountDeleted,deleteSettled] = await Promise.all([
    query(`BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('${deletedUser}',260913)); DELETE FROM auth.users WHERE id='${deletedUser}'; SELECT pg_sleep(0.15); COMMIT;`),
    query(`BEGIN; SELECT public.settle_polaris_generation('${deletedUser}','${deletedGeneration}',$cards$${deletedCards}$cards$::jsonb,'${deletedToken}'); SELECT pg_sleep(0.15); COMMIT;`),
  ]);
  if (accountDeleted.code!==0 || (deleteSettled.code!==0 && !deleteSettled.err.includes("account_deletion_in_progress"))) throw new Error("Account deletion/consent settlement deadlocked");
  const deletedCheck = await query(`SELECT NOT EXISTS(SELECT 1 FROM public.llm_consent_receipts WHERE user_id='${deletedUser}')
    AND NOT EXISTS(SELECT 1 FROM public.consent_records WHERE user_id='${deletedUser}')
    AND NOT EXISTS(SELECT 1 FROM public.polaris_generations WHERE user_id='${deletedUser}')
    AND NOT EXISTS(SELECT 1 FROM public.personas WHERE user_id='${deletedUser}');`);
  if (deletedCheck.code!==0 || !deletedCheck.out.trim().endsWith("t") || (await snapshot(deletedUser)).allowed) throw new Error("Account cascade retained consent/evidence state");
  process.stdout.write("PASS: existing account-deletion fence serializes with token settlement and cascades private receipts\n");

  const managementUser = "88888888-8888-4888-8888-888888888888";
  const requiredAcks = JSON.stringify({service:true,llmProcessing:true,overseasTransfer:true,sensitiveData:true,safetyNotice:true});
  const managementStatus = async subject => {
    const result = await query(`SELECT public.llm_service_consent_status('${subject}');`);
    mustPass([result],"Management status failed");
    return JSON.parse(result.out.trim().split("\n").at(-1));
  };
  const managementWrite = (subject,token,action) => `SELECT public.write_llm_service_consent('${subject}','service-v1','${token}',
    '${action}',$acks$${action==="grant" ? requiredAcks : "{}"}$acks$::jsonb,'en');`;
  const managementBefore = await managementStatus(managementUser);
  const receiptCountBefore = await query(`SELECT count(*) FROM public.llm_consent_receipts WHERE user_id='${managementUser}';`);
  const concurrentWrites = await Promise.all(["grant","revoke"].map(action =>
    query(`BEGIN; ${managementWrite(managementUser,managementBefore.change_token,action)} SELECT pg_sleep(0.15); COMMIT;`)));
  const receiptCountAfter = await query(`SELECT count(*) FROM public.llm_consent_receipts WHERE user_id='${managementUser}';`);
  if (concurrentWrites.filter(r=>r.code===0).length!==1 ||
      !concurrentWrites.find(r=>r.code!==0)?.err.includes("llm_service_consent_changed") ||
      Number(receiptCountAfter.out.trim().split("\n").at(-1))!==Number(receiptCountBefore.out.trim().split("\n").at(-1))+1) {
    throw new Error("Concurrent management CAS did not append exactly one receipt");
  }
  process.stdout.write("PASS: concurrent explicit grant/revoke with one displayed CAS appends exactly one trusted receipt\n");

  const collectGrantUser = "aaaa1111-1111-4111-8111-111111111111";
  const collectRevokeUser = "bbbb2222-2222-4222-8222-222222222222";
  for (const [subject,action] of [[collectGrantUser,"grant"],[collectRevokeUser,"revoke"]]) {
    const recordId = action==="grant" ? "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : "bbbb2222-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    mustPass([await query(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('${subject}','fixture@example.invalid',now());
      INSERT INTO public.users(id,birth_date,minor_tier) VALUES('${subject}','2000-01-01','adult');
      INSERT INTO public.records(id,user_id,kind,audit_period,tags,body) VALUES('${recordId}','${subject}','audit_response','work',ARRAY['interview'],'Collection lease input.');`)],"Collection fixture failed");
    const legacyResult = await query(`SELECT public.effective_llm_consent_snapshot_v2('${subject}',true);`);
    mustPass([legacyResult],"Legacy snapshot failed");
    const legacyToken = JSON.parse(legacyResult.out.trim().split("\n").at(-1)).token;
    if (!legacyToken || (await snapshot(subject)).allowed) throw new Error("Strict and collect modes did not differ for uncovered account");
    const cards = JSON.stringify([{...oldCard,evidenceRefs:[`record:${recordId}`]}]);
    if (action==="grant") {
      const allowedGeneration = await reserveConsent(subject,"collection-before-receipt");
      mustPass([await query(`SELECT public.settle_polaris_generation('${subject}','${allowedGeneration}',$cards$${cards}$cards$::jsonb,'${legacyToken}',true);`)],"Collect legacy settlement failed");
    }
    const interruptedGeneration = await reserveConsent(subject,`collection-first-${action}`);
    const before = await managementStatus(subject);
    mustPass([await query(managementWrite(subject,before.change_token,action))],"First explicit consent action failed");
    const staleSettlement = await query(`SELECT public.settle_polaris_generation('${subject}','${interruptedGeneration}',$cards$${cards}$cards$::jsonb,'${legacyToken}',true);`);
    if (staleSettlement.code===0 || !staleSettlement.err.includes("llm_consent_changed")) throw new Error(`First ${action} left a legacy request valid`);
    mustPass([await query(`SELECT public.settle_polaris_generation('${subject}','${interruptedGeneration}',NULL);`)],"Interrupted collect generation failed to refund");
    const after = await query(`SELECT public.effective_llm_consent_snapshot_v2('${subject}',true);`);
    const current = JSON.parse(after.out.trim().split("\n").at(-1));
    if (current.allowed!==(action==="grant") || current.token===legacyToken) throw new Error("Collect fell back after trusted receipt");
    const interruptedStatus = await query(`SELECT status FROM public.polaris_generations WHERE id='${interruptedGeneration}';`);
    if (!interruptedStatus.out.trim().endsWith("failed")) throw new Error("Consent-invalidated collection generation was not refunded");
  }
  process.stdout.write("PASS: collect-only legacy settlement succeeds; first grant/revoke invalidates captured lease and refunds denied persistence\n");

  const deleteBefore = await managementStatus(managementUser);
  const [managementDeleted,managementSaved] = await Promise.all([
    query(`BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('${managementUser}',260913));
      INSERT INTO public.account_deletion_tombstones(user_id,session_id) VALUES('${managementUser}',gen_random_uuid());
      DELETE FROM auth.users WHERE id='${managementUser}'; SELECT pg_sleep(0.15); COMMIT;`),
    query(`BEGIN; ${managementWrite(managementUser,deleteBefore.change_token,"grant")} SELECT pg_sleep(0.15); COMMIT;`),
  ]);
  if (managementDeleted.code!==0 || (managementSaved.code!==0 && !managementSaved.err.includes("llm_service_consent_account_unavailable"))) {
    throw new Error(`Management/deletion lock order failed: ${managementDeleted.err} ${managementSaved.err}`);
  }
  const managementDeletedCheck = await query(`SELECT NOT EXISTS(SELECT 1 FROM public.llm_consent_receipts WHERE user_id='${managementUser}')
    AND NOT EXISTS(SELECT 1 FROM public.consent_records WHERE user_id='${managementUser}')
    AND NOT EXISTS(SELECT 1 FROM public.consent_changes WHERE user_id='${managementUser}');`);
  const postDeleteWrite = await query(managementWrite(managementUser,deleteBefore.change_token,"grant"));
  if (!managementDeletedCheck.out.trim().endsWith("t") || postDeleteWrite.code===0 || !postDeleteWrite.err.includes("llm_service_consent_account_unavailable")) {
    throw new Error("Deleted account retained or recreated consent state");
  }
  process.stdout.write("PASS: management writer and account deletion serialize without deadlock; cascade and durable fence prevent consent resurrection\n");
}
