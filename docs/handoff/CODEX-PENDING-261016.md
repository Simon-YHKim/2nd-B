# 미병합 후보와 읽기 설계 동결 · 2026-10-16

사용자의 세션종료 지시로 새 단계는 시작하지 않는다. 아래는 각 작성자가 현재작업을 동결한 원문이다. 작성자검사 완료는 독립PASS·전체검증·CI·병합·앱완료가 아니다. 원문 안 root진행중/현재main/경로는 작성시점이며, 최종 상태는 CODEX-EXECUTION-261015.md가 우선한다. S2b/C3/P R2는 미병합, S2/T43usage는 제품0이다. 원문파일과 해시·검증스크립트·원FAIL은 비공개 증거 묶음에 보존한다.

---

## T16 S2b 원자적 최종저장

원본: `t16-s2b-implementation-handoff.md`.

# T16 S2b author handoff — frozen, independent review pending

Stopped at the user's instruction to finish the current work and prepare `/simon-handoff`.
No next implementation slice, independent review, PR, push, numbered promotion or production action was started.

## Exact checkpoint

- Author agent: `/root/content_ledger_design`.
- WT: `/workspace/2nd-B/.worktrees/interview-atomic-finalize-s2b-261016`.
- Branch: `feat/interview-atomic-finalize-s2b-261016`.
- Frozen source HEAD: `a3a5f2b0e1c3aa49f0e2d839791009224f22ba52`.
- Parent/base: `fb17f929b8758c7015dada3aaf32f20e5d60eab2`.
- Reviewed integration baseline: `fb7f08e9ca230570b6d55e1ebdfb49a34e5d1da9` (root S2a integration).
- `fb17f929` merged that baseline into the original S2a-based branch; its tracked diff from `fb7f08e9` is zero. The packet-test add/add conflict was resolved to exact `fb7f08e9` bytes. There are no hidden S2a edits.
- Working tree clean; shared `node_modules` symlink retained.
- Exactly 9 files / 3,688 added lines relative to the reviewed integration baseline. Most SQL is the preserved actual 0225 core and explicit old-function restoration in down, not a second simplified implementation.
- Proof: `/workspace/scratch/t16-s2b-implementation-proof.json`.
  SHA-256 `049e6dc4323f23f9963b1a07f02ca39109bdf3a6bd83a0a4a1cd245ac2dd47ac`.

## Approved source scope

1. `db/migration-drafts/UNNUMBERED_interview_atomic_finalize.sql` — new, 1,884 lines.
2. `db/migration-drafts/rollback/UNNUMBERED_interview_atomic_finalize_down.sql` — new, 1,124 lines.
3. `db/migration-drafts/tests/interview-atomic-finalize.sql` — new, actual-role transaction regression.
4. `db/migration-drafts/tests/interview-atomic-finalize-erasure.sql` — new, real FK/trigger paths.
5. `db/migration-drafts/tests/interview-atomic-finalize-rollback.sql` — new, empty-down boundary.
6. `scripts/test-interview-atomic-finalize-sql.mjs` — new, fresh local clone runner and actual two-connection races.
7. `docs/design/interview-content-authority.md` — appended S2b contract and activation limits.
8. `scripts/__tests__/supabase-security-drafts.test.ts` — registered pending draft/real lane.
9. `.github/workflows/supabase-dry-run.yml` — explicit fresh full-schema clone lane and runner path trigger.

All 236 numbered migration files and all four original 0225 test files are byte-identical to the baseline. Frozen S2a packet/auth, both tests and tsconfig are byte-identical to `499f1f26`. Per-file hashes are in the proof. The document is append-only relative to S2a; S1 draft/runner/registry remain unchanged.

## Implemented preparation (inactive)

- SQL strict bounded packet validation, typed canonical framing and digest independently recomputed from the original immutable intent tuple. The actual S2a leaf/renderer is loaded by the runner; no copied JS canonicalizer.
- Service-only finalizer facade and private self-validating boundary; explicit owner, live Auth session/expiry and owner fence. No fabricated `auth.uid()`/JWT GUC.
- Actual 0225 commit and owned-verdict bodies shared behind private cores, with work rule/context checks. Legacy r0 wrappers retained.
- Original reserve key/revision/digest → one transaction containing record, transcript/head/turns, verdict linkage, coverage and immutable receipt. Rejected core/late expiry rolls back every partial effect.
- Lookup returns original receipt and current record/hold observation in one snapshot. Same request never creates a second record. Changed payload conflicts; existing generic record is never adopted.
- Late owned RED can raise current hold without rewriting `holdAtCommit` or historical receipt/coverage. Invalid owned verdict cleanup preserves the old 0225 behavior.
- Record/head/turn/session/fold/discard/sweep/profile/Auth erasure clears content digest and terminalizes work. Erased NULL cannot rebind/reopen; body resend stops before digest comparison.
- Owner try-lock + work NOWAIT on inverse deletion, owner/work/session order on new boundaries; busy sweeper skips the work. No global relation lock in normal traffic.
- Auth BEFORE deletion clears/locks works then deletes owned work metadata while the Auth FK still exists; profile-only deletion retains terminal receipt. This avoids the actual cascade-order failure discovered during author regression.
- One-way dormant protocol guard; new work can pin r1-q5 only after an explicit future protocol transition. Existing r0 never changes. `no_verdict` plus local pass may credit while model layer remains NULL. No operation here flips the protocol.
- Metrics/fold use immutable work rule instead of `max(rule_set)`. Mixed preexisting history rejects draft application.
- Legacy known interview record/coverage and close/discard/commit paths gated for v2; ordinary notes/other audits retained. New lifecycle never INSERTs a missing session or increments starts again.
- Empty down restores exact old functions/view and S1 request; any used authority/work/wipe refuses before DDL.

## Executed tests — final exact source

Final command, exit 0:

```sh
node scripts/test-interview-atomic-finalize-sql.mjs polascope_t16_ci_delta_261016 t16_finalize_test_run5
```

- Fresh `t16_finalize_test_run5` cloned the local container's fully replayed current 236-file schema before any draft. Runner checked installed migration ledger and actual erasure owner-lock floor before applying S1/S2b.
- **15 new actual-DB groups PASS**. These include all four original 0225 controls unchanged: regression SQL, rollback/reapply SQL, Python concurrency, Python security. The Python tests retain actual wait-event assertions through a temporary local Docker psql shim.
- Same-intent concurrent commit/ACK lookup, conflicting payload, wipe-first/save-first, actual owner/work/session-key/session-row/verdict/coverage wait then Auth expiry, final six-hour check, live Auth state change after work wait, inverse record/head/turn/session/profile/Auth NOWAIT refusal, unique record-key conflict, used rollback preservation all PASS.
- Actual SQL atomic fault after core writes verifies record/head/coverage/receipt/audit state rollback. Hold, immutable receipt, r1-q5 NULL model, protocol downgrade guard, ordinary-note/other-audit preservation, exact terminal erasure and late RED after parent deletion PASS.
- Actual S2a ↔ PostgreSQL canonical/body comparisons, fixed golden SHA `06ae245e7f9a56a8b8f5494adfcef49cd5be600cbd2ad81ce1749aa7e36c2ce1`, Unicode/raw bytes/UUID/max-safe revision/trailing question cases, malformed packet cases, exact **262144-byte success / +1 rejection** PASS.
- Existing draft registration Jest: **32 PASS**.
- Targeted ESLint on new runner + registration test: **exit 0**.
- `git diff --check`: PASS.
- Numbered migration byte comparison: **236 unchanged**.

Evidence (hashes in proof):

- `/workspace/scratch/t16-s2b-runner-r5.log` — complete successful final clone run.
- `/workspace/scratch/t16-s2b-registration-jest.log` — 32 PASS.
- `/workspace/scratch/t16-s2b-targeted-eslint-final.log` — empty/exit 0.
- `/workspace/scratch/t16-s2b-numbered-bytes.json` — complete numbered manifest.
- `/workspace/scratch/t16-s2b-commit_core-delta.diff`, `t16-s2b-verdict_core-delta.diff` — actual old body versus shared core deltas.

Earlier author failures remain in scratch; they are not rewritten as successes:
initial SQL syntax/canonical attempt, mistaken test expectation about saved audit hashes (0225 clears the answer digest; audit hashes follow erasure), CI role-floor test setup, actual Auth FK cascade-order failure, runner replacement-string `$$` escaping, psql default root role, and the 32-turn size fixture falling below the intended boundary. The final size fixture uses 33 turns with an exact computed last length. `t16-s2b-runner-r3.log` was an earlier 15-group PASS before the extra fixed-golden/size/parent-deleted late-RED cases. R4's size-fixture assertion failed; final R5 includes those cases and passes. These are author iterations, **not independent-review BLOCK rounds**.

## Not yet verified / remaining risks

- **Independent S2b review pending. No PASS verdict. S2b BLOCK count has not started.** S0 historical BLOCK1 and S2a implementation BLOCK1 remain; no reset.
- Root full `npm run verify`, type-check and cycles were **not run** for S2b (root owns slots). CI YAML has been registered and its local command executed, but **no remote S2b CI/PR/push/merge** exists.
- Only synthetic service artifacts exist. The real server C9 safety judgment, S2a approved-label renderer and actual `withDomainTag` detector must be combined at an exact tuple/digest/rule-bound trusted service boundary. The artifact's source string/summary is not proof of safety. No current client flag is trusted as safe.
- No actual finalization endpoint, real Auth request, OpenAI/Claude verdict adapter, old-v1 provenance recovery, native/client receipt recovery or caller activation exists. The database draft alone does not complete T16/S2 or the user's 76-item goal.
- No XP/embedding outbox/deduplication contract was invented. Those effects remain disconnected.
- JSONB loses duplicate-key evidence; a future caller must use the actual bounded S2a strict decoder before SQL. SQL parsing does not replace ingress validation.
- CI's local service stub lacks production BYPASSRLS and its old bootstrap lacks record-table DML grants. Metrics rows are checked as fixture administrator; INVOKER record/coverage guards get explicit owner-RLS test grants only inside the rolled-back fixture. No production ACL was changed for a test.
- Arbitrary administrator DML/DDL is outside supported concurrent app traffic. The runner deliberately uses it to hold rows and verify refusal/rollback. Normal shipped writer graph must be reviewed again before actual rollout.
- r1-q5 cutover must include the separately approved narrow known-bare fact local-gate version and both actual model parsers/proxies; no model measurement was run here.
- No production DB, real API/model, numbered promotion, protocol activation, APK/browser/parity change or phone validation occurred.

## Resume commands — only after the next session authorizes continuing

Read the exact frozen diff and this proof, then assign independent review to an agent who did not implement S2b. Do not treat author evidence as independent PASS.

```sh
git -C /workspace/2nd-B/.worktrees/interview-atomic-finalize-s2b-261016 status --short
git -C /workspace/2nd-B/.worktrees/interview-atomic-finalize-s2b-261016 diff --stat fb7f08e9 a3a5f2b0
```

For independent SQL replay, create a **new disposable clone**, never reuse used R5 or pass a production URL. The container must still have the fresh complete numbered floor; if it is gone, replay the existing CI schema bootstrap and migrations first. The runner itself rejects a database with S1 already installed.

```sh
docker --host unix:///var/run/docker.sock exec -i polascope_t16_ci_delta_261016 psql -X -U postgres -d template1 -v ON_ERROR_STOP=1 -c 'CREATE DATABASE t16_finalize_test_review_r1 TEMPLATE postgres'
cd /workspace/2nd-B/.worktrees/interview-atomic-finalize-s2b-261016
node scripts/test-interview-atomic-finalize-sql.mjs polascope_t16_ci_delta_261016 t16_finalize_test_review_r1
```

Then root schedules full/type/cycles, integrates with latest main while checking all frozen file bytes, obtains independent integration/delta review as needed, and only then handles draft PR/CI. Any activation remains a separate gated slice. Do not edit numbered 0225 or the existing four control scripts to make this draft pass.

## Earlier work from this agent (for root's session-wide handoff)

- **D3a design R2 independent PASS** H0/M0/L0; BLOCK1 preserved. Contract `/workspace/scratch/t38-d3a-content-ledger-contract-r2.md`, SHA `8b7c6b0bab9e845f40b873d21b0a3d13d7ff97e8a789766cc9b7ee6da253afe0`. R2 included the omitted record-photos 100-item batches/unknown drain and explicit start/CAS barriers. Code was assigned to another agent; do not infer its present state here.
- **B2R integration independent PASS** at `2c50be85ba56b149fac47490444325e1662efb41`, `/workspace/scratch/review-interview-s0-b2-integration.md`. Root received that independent result earlier; use root's later merge/CI facts.
- **T16 S1** initial `d9838953` independently passed, then root full found missing pendingDrafts/CI lane. Approved two-file registration delta frozen `4cf30beac594cf9321785a237cce9815aa05b672`, independently passed. Root confirmed PR **#2602 merged**, main then `01fb82c4`. Exact review `/workspace/scratch/review-t16-s1-ci-delta.md`, SHA `d9cf122010579fa0628d2a678e4f53818ac1b06746653fa2881913b119423409`. S1 itself still inactive.
- **T16 S2a** R1 `62c3409a` was BLOCK H0/M1/L0 for type errors, preserved. Approved six-file R2 `499f1f264abcc568f02c64228de7cb6d0333d3cc` fixes test fixture types and enables `allowImportingTsExtensions` without excluding checks. Root independent R2 **PASS H0/M0/L0/new M0**, type 0/cycles 0/115 tests PASS. Review `/workspace/scratch/review-t16-s2a-r2.md`, SHA `139774bda4385c58733644f9a01fd3f5af1654ecd7a79ce50ecdd3694071a3a9`. Root's integration `fb7f08e9` is the S2b baseline. Root owns any subsequent full/PR/merge status; do not assume it from this agent's last message.

No additional work starts after this handoff.

---

## T38 대화 실행 C3

원본: `t38-c3-handoff.md`.

# T38 C3 frozen handoff

현재 단계만 마무리한 인수 자료다. 사용자 지시로 새 단계 착수 없음. 독립 검토·최종 통합 전이며 C3 PASS나 실제 앱 완료를 주장하지 않는다.

- WT: `/workspace/2nd-B/.worktrees/chat-operation-captured-261016`
- Branch: `feat/chat-operation-captured-261016`
- Frozen HEAD: `c86cec9fb3f11bbbe3d255c2df4a24cb6cf4369f` (clean)
- Prepared base: `06337b920a5b7084962f224b7ea3ae4df742a4e0` = main `6eb5db40bea9f7009a3160577206c354c04bb164` + frozen C1c R2 `7a9d70fb4f79c19fa078c8968b3e60a565b66d47`.
- 원 C1c WT clean/동결 유지. C1c R2 독립 PASS, H0/M0/L0/새 M0, 과거 BLOCK1 유지. D3a/C1b/C1c는 준비 기반 선행이고 main 활성 기능과 구별한다.
- C3 범위: 새 `session-operation.ts`, 새 실제 통합검사, `docs/design/chat-session-operation.md`의 3파일, +617/-0. 기존 B ports 수정 0. 보호 파일 23개는 준비 base와 byte 동일.

## 동작

실제 owner/session/content와 account lease를 묶는 `createChatOperationFactory`다. 생성 I/O 0, 원 JWT/signal/operation ID와 고정 quota step, 1회 인증·실행을 유지한다. 본문/history/callback을 고정하고 caller observer는 내부 원 ledger capability로 대체한다. 실제 acquire → issued 동기 dispatch → settlement를 사용하며 body gate와 원 ticket 확인 권한을 분리한다.

content wipe의 true ACK 뒤에도 pending/unknown은 삭제 permit을 막는다. 발행 quota는 response headers 이후 body 파싱까지 원 signal을 유지하며, release 요청은 settlement 뒤 underlying lease를 한 번 해제한다. hold/ABA/terminal은 즉시 abort하고 원 ticket의 unknown/late receipt를 지우지 않는다. B 생성/retire 재진입의 sticky false ACK, local/final RED 단일 notice, 기존 busy-clear 거부, completion no-replay를 보존했다. 위기를 이유로 새 자동 wipe는 하지 않는다.

## 실행 증거

- 관련 29 suites / **911 PASS**: 새 실제 A/B/C3/lease/ledger/usage/conversation 통합 52개 포함. auth/SDK/fetch I/O만 대역이며, lease release의 spy는 실제 원 메서드를 실행하는 관측이다.
- C1c R1 원 반례 12개 기대 불변 **12 PASS**. 경로와 observation 출력만 바꾸었음을 normalized byte 비교로 확인했다.
- 음성 대조 10종 실제 실행: issued wipe abort 5 FAIL, premature release 5 FAIL, dispatch 뒤 pending 표시 1 FAIL, hold 무시 2 FAIL, body close 무시 1 FAIL, late settlement에 body gate 4 FAIL, replay 허용 2 FAIL, history 공유 1 FAIL, double release 1 FAIL, session authority 제거 1 FAIL. 모두 exit 1/runtime suite 0, 정상 소스는 수정하지 않은 별도 transformer다.
- lint / lexicon(1790파일) / staged diff check PASS.
- 초기 23 PASS와 추가 검사 44 PASS/3 FAIL 원 로그도 보존. 3 FAIL은 테스트가 존재하지 않는 `clearAndStart`를 호출한 하네스 API 오류다. 실제 busy-clear 거부와 명시 retirement 뒤 clear 계약으로 바로잡아 47 PASS, 마지막 확장된 전체 관련 911 PASS를 얻었다. 원 실패를 음성 대조 성공으로 세지 않는다.
- **standalone type/cycles/full 미실행**: root 지시에 따라 최종 통합 `npm run verify`에서 실행해야 한다. 현재 C3 independent review pending, C3 BLOCK0이며 PASS 아님.

## 다음 인수자의 우선순위

1. frozen C3를 구현자와 분리해 독립 검토한다. 미확인 runtime 타입·순환·전체 검사는 최종 통합에서 수행한다.
2. root C1c 통합 full의 법무 source-anchor 2 FAIL 보완 delta를 별도로 반영/독립 검토한다. root가 보고한 누락은 DPIA 137-171/158-163, 13핀+485줄이며 제품 변경 0이다. 이 C3 WT에서는 공유 소스를 바꾸지 않았다.
3. 관련 선행을 최신 main에 통합해 verify/CI/독립 PASS 기준을 충족한 뒤에만 PR 완료를 주장한다. 이번 frozen branch는 push 0이다.
4. UI/H·D3b·D4·F·I는 여전히 미완료다. 실제 일반 동의 취소 생산자 연결, 앱/폰 검증, T39 서버 예약/재질문/두 기기/프로세스 종료 복구도 별도 증거가 필요하다. mutable SDK SELECT의 JWT 고정을 주장하지 않는다.

## 자료

- Receipt: `/workspace/scratch/t38-c3-receipt.json` SHA256 `8f4bf66d8fbea0073458661a5ab5af8fb49e43c65284fd527b953bd4766a0f83`
- Source proof: `/workspace/scratch/t38-c3-source-proof.json` SHA256 `87e81f4dfb3fd63086656f64f78b6460dced9da5cfe098fe7d6f9b623630a606`
- 관련: `/workspace/scratch/t38-c3-related.json` 및 `.log`, 정확 명령은 `-related-command.json`.
- 원 반례: `/workspace/scratch/t38-c3-original.test.ts/.config.cjs/.json/.log`, 원 observation 출력 보존.
- 대조: `/workspace/scratch/t38-c3-controls.py`, `/workspace/scratch/t38-c3-controls/results.json` 및 개별 source/config/transform/log/json.
- 선행 독립: `/workspace/scratch/review-t38-c1c-r2.md` SHA256 `af77f5fad047d387ab3aabd5ff625324281a1381219f5eea30c232c37207e5d6`; proof `751aab2bfc6278f43cc09d0c5c82b935ad1aa20571deffb8aea75284d20bee11`.

---

## T38 삭제 전송 P R2

원본: `t38-d3bp-r2-handoff.md`.

# T38 D3b-P R2 인수인계

현재 보완을 마치고 동결했다. **독립 R2 검토·통합 type/cycles/full·CI는 PENDING**이다. 독립 PASS나 main 병합으로 보고하지 않는다. 사용자 요청에 따라 다음 O 구현은 시작하지 않고 인수인계한다.

- exact HEAD `dc1a4e3815a422aa6f7e1d7ada40aa99a2117138`
- WT `/workspace/2nd-B/.worktrees/content-wipe-transport-261016`, branch `feat/content-wipe-transport-261016`, clean.
- 준비 기반 `7ba1dc93752cdf4538cb1dc3dd5497bb6f9f74ab`; root main64bf + 검토된 D3a/C1b 준비 통합이다. 아직 병합/운영으로 세지 않는다.
- R1 `625299ce8c2734c900f623f274cbfa70078d0f0a`를 부모로 보존. R2 delta 3파일 +64/-8, 전체 P 승인 범위는 5파일이다.
- 원 독립 R1은 H0/M1/L0/새M1, **D3b-P BLOCK1 유지**. D3a 설계 BLOCK1/구현 BLOCK1과 별개다.

## R1 문제와 R2 계약

R1은 Preference-Applied의 count=exact를 필수로 요구했다. 그러나 근거로 인용한 PostgREST SHA `48aa08248b3953f99a0a2ef78c32604cc87b244b`의 실제 CORS는 Content-Range를 노출하면서 Preference-Applied는 노출하지 않는다. 실제 Chromium에서 정상 200/204·*/1 응답 6개가 모두 unknown이 됐다. 원 browser script/result/log/bundle 및 frozen 소스, 원 6 PASS/6 FAIL을 그대로 보존했다.

R2는 **원 고정 count=exact DELETE 요청 + 실제 mutation count의 정확한 */N + 해당 200/204 status**를 증거로 쓴다. 같은 SHA의 Query MutateReadPlan은 EXPLAIN 없는 mainWrite를 쓰고, Statements mainWrite는 mutation CTE를 pg_catalog.count로 센다. Response가 그 rsQueryTotal을 */N으로 반환한다. GET의 planned/estimated/read range를 이 증거로 대체하지 않는다.

Preference-Applied가 null이면 CORS 비노출과 양립하므로 이 헤더만을 이유로 실제 count를 버리지 않는다. **헤더가 보이면 기존 빈값·추정 count·충돌 count·tx=rollback 거부는 그대로**다. count 누락/비정상/unsafe, 다른 성공 status, 잘못된 JSON 등은 여전히 unknown/count:null이며 재발행하거나 0으로 바꾸지 않는다. 기존 65개 transport 검사는 삭제/수정 없이 13개가 추가됐다.

지원 전제는 신뢰 endpoint가 요청/응답 계약을 지키고 `db-tx-end=commit` 또는 `commit-allow-override`를 사용하는 것이다. 요청은 tx=rollback을 보내지 않는다. response override/proxy가 count/status/transaction 의미를 바꾸거나 강제 rollback인 환경은 지원하지 않는다. 숨겨진 rollback 설정을 클라이언트가 감지할 수 있다고 주장하지 않는다. tx=commit을 넣어도 강제 rollback 설정을 이길 수 없다.

**운영 gateway 설정/버전은 확인되지 않았다. 이 전제가 확인되기 전 H/O/새 경로를 활성화하면 안 된다.** 로컬 PASS가 이 조건을 해제하지 않는다. 현재 caller0/UI0/운영0이므로 활성화는 없다.

## 실행한 검사

- 관련 실제 repo **22 suites /725 PASS /0 FAIL/skip/runtime**. `t38-d3bp-r2-related.json/.log`, 명령 JSON에 전체 경로 보존.
- 중복 부분집합 2 suites/148 PASS = transport78/photo70. R2 새 검사13개. 전체725와 합산하지 않는다.
- 원 독립 browser oracle는 output prefix와 HEAD 설명 metadata만 바꾼 사본으로 **12 PASS/0 FAIL/runtime0**. 기대값/실행 논리는 동일하다. actual helper + Chromium154 + 두 localhost origin의 실제 CORS/fetch를 사용했다.
- 추가 실제 browser **16조건×6table=96 PASS**: 숨겨진 preference에서 실제0/7count, missing/unknown/readrange/negative/fraction/unsafe count, wrongstatus, 보이는 빈 preference/planned/estimated/mixedcount/rollback/case rollback/commit. 각 행마다 원 JWT·signal·고정 Prefer·DELETE1 및 실제 cors type을 검증했다.
- R2 negative controls 3개는 각 **6/23/6 assertion FAIL, runtime0**으로 검출: 숨겨진 preference 재필수화, count null→0, 보이는 모순 검사 제거. 필터로 실행한 나머지 skip은 이 선택 실행의 skip이다.
- 실제 browser에 R1 helper를 다시 주입한 대조도 **6 PASS/6 FAIL/runtime0**으로 원 CORS 결함을 다시 검출했다. 저장소 제품을 바꾸지 않은 esbuild 소스 대조다.
- scoped lint/lexicon/emdash/diff PASS. type/cycles/full은 root의 통합 verify 소유이며 여기서 실행하지 않았다. CI/push 미실행.

로컬 HTTP 서버는 고정 공개 PostgREST 응답/CORS 계약의 I/O 대역이다. 제품 helper/브라우저 fetch/Headers는 mock하지 않았다. 실제 DB transaction, 운영 gateway, 폰, 운영 삭제 증거가 아니다. hidden rollback 환경이 안전하다는 증거도 아니다.

## 보존과 범위

원 P/R1 증거 및 frozen source **103개 해시**를 대조했다. prepared 의존/보호 13파일, 기존 P photo 제품·검사 2파일은 R1과 byte 동일하다. 기존 P9 negative controls 및 최초 fixture128 PASS/6 FAIL도 원본 보존하며 이번 R2의 재실행 수로 세지 않는다.

원 실제 legacy photo **3 PASS/2 FAIL은 그대로 미해결**이다. R2는 1arg deleteAllUserData의 다음 usage/사진 batch 진행을 수정하지 않는다. 그 원 test/result SHA를 preservation JSON에 포함한다. 실제 leaf+lease+P+delete-bulk를 연결하는 O와 D4 writer 참여, C3/H/UI 활성화는 미완료다.

O 준비 WT `/workspace/2nd-B/.worktrees/content-wipe-execution-261016`, branch `feat/content-wipe-execution-261016`, HEAD `406d1e204ece7ef749e680a9d42623ffc022ec76`는 root prepared `621506d5`에 **P R1**을 cherry-pick한 준비물뿐이다. clean, **O 제품 편집0**이며 최신 P R2는 아직 들어 있지 않다. 이 WT를 최신/활성 완료로 혼동하지 말 것. 사용자가 현재 작업 뒤 인수인계를 요청해 O는 시작하지 않았다.

## 다음 담당자가 할 일

1. exact dc1a4e38에 독립 R2 검토를 수행한다. 원 R1 finding/report/반례를 보존하고 같은 browser 기대를 재실행한다. 새 중간 지적0/PASS를 확보하기 전 완료 처리하지 않는다. P BLOCK1 유지, 3회 BLOCK 중단 기준 유지.
2. root가 최신 통합 기반으로 type/cycles/full과 CI를 수행한다. 이 handoff에는 그 결과가 없다.
3. 이후 승인된 O4 범위를 재개한다면 최신 검토된 P를 통합하고 byte proof를 남긴다. `/workspace/scratch/t38-d3b-execution-scope.md` 승인 계약과 root의 lease ownership 보완을 먼저 확인한다. caller owner capability는 검사만 하고 release하지 않으며, factory가 명시 begin/resume마다 만든 account session lease만 auth1/releaseonce한다. beginWipe는 첫 await/파괴 I/O 전에 동기 실행한다.
4. O 실제 경로에서 원 photo 실패 기대(next usage0/next batch0), 늦은 ticket settlement와 현재 body gate 분리, unknown 자동 retry0, 원 manifest와 DBcount 분리, derived partial을 실제 leaf+lease+P+delete-bulk로 검증한다. P 완료를 O/D4/앱 완료로 세지 않는다.
5. 실제 활성화 전 정상 commit endpoint 계약을 확인한다. 미확인 상태에서는 새 경로 활성화 금지다.

증거 묶음: `/workspace/scratch/t38-d3bp-r2-receipt.json`, `t38-d3bp-r2-source-proof.json`, `t38-d3bp-r2-preservation.json`, `t38-d3bp-r2-static-results.json`. 원 report는 `/workspace/scratch/review-t38-d3bp-r1.md`, 원 proof는 같은 prefix `-proof.json`이다.

---

## 인터뷰 S2 계획

원본: `interview-s2-handoff.md`.

# 인터뷰 담당 최종 인수 — S1 동결 · S2 읽기 설계

사용자가 현재 작업까지만 마치고 세션 전체 인수를 요청했다. **S2 구현을 시작하지 않았으며 새 WT도 만들지 않았다.** 다음 담당자가 이 문서의 미완료를 완료로 합산하지 않는다.

## S1 구현과 검토

- exact: 91b12cd32837cdaf5f2b54aacf6ff4da477ec201
- branch: feat/interview-short-answers-261016
- WT: /workspace/2nd-B/.worktrees/interview-short-answers-261016 (clean, 변경 금지)
- base: U343b5df28394a484fbdb4a1eb656bb0403d0634a
- 변경3파일: continuity.ts, continuity.test.ts, interview-verdict-states.test.ts.
- 의미: KO8/EN14·최소2자 관문 제거. 승인된8개 bare 장소 전체일치만 fact에서 제외. 알 수 없는 이름/장소·한 글자 감정·숫자·emoji는 모델 후보. Q5 missing만 local fallback, none/other/error/RED/quota 계약 그대로.
- author: 관련20suite1044PASS, negative7 각expectedFAIL1/runtime0, lint/lexicon/diff PASS. standalone type/cycles/full은 하지 않았고 root 통합verify로 넘겼다.
- author 인수: /workspace/scratch/interview-s1-handoff.md SHA a01ca19969c9356fc253afecbf21f41b8bd12bcf45f20cf47c3a22a9cfe2e71d
- author proof: /workspace/scratch/interview-s1-proof.json SHA 3ed8ce319f41785859ef6b032d3cf3d1460b7cf04c9ce1d0bc01e92f5c6f5036
- root 독립 R1 PASS H0/M0/L0·새M0·BLOCK0. 관련20suite1044PASS와73hash/원함수/기대값 보존을 root가 대조했다.
- 독립 보고: /workspace/scratch/review-interview-s1-r1.md SHA 8a3e3f28b0c71d6b47295129109b895a8c7bce6493b27e9e080aa40a79233dad
- 독립 proof SHA: d21fcbe6cc45fb49471200927709f6a2e32a0f64c2b32991aa1afcfe6f32f873

## 최신 통합 상태 — root가 이어 마무리 중

root가 전달한 통합8e74 full 결과는 1166suite PASS·1suite FAIL, 21071PASS·1FAIL·1skip이다. 유일 실패는 src/lib/i18n/__tests__/korean-in-code.test.ts의 newlyMixed continuity.ts이며, 승인된 닫힌 장소 입력 매칭5개 한글을 번역 문구로 분류한 것이다. root가 KOREAN_BY_DESIGN의 기존 허용 기제에 “사용자 입력 매칭용 닫힌 장소 문법, 표시/번역 문구 아님” 근거 한 줄을 추가하고 별도 독립 검토 중이다.

이것은 root의 보고를 기록한 것이며 author가 full을 다시 실행한 결과가 아니다. 원본 로그 /workspace/scratch/interview-short-answer-integration-full.log와 수정 뒤 독립검토/전체 검사/CI/main/8081 결과는 **root 최종 세션 인수에서 최신값으로 갱신**해야 한다. 여기에서 S1 전체 완료·앱 반영 완료를 선언하지 않는다.

## S2: 읽기 설계와 반례까지

설계: /workspace/scratch/interview-s2-scene-choice-contract-r1.md
실제 baseline receipt: /workspace/scratch/interview-s2-baseline/receipt.json
현재 동작 rows: /workspace/scratch/interview-s2-baseline/rows.json

actual send/ask/changeAngle/keepIt로4개 재현이 PASS했다. 기존145검사는 이름 필터로 제외했으며 PASS에 더하지 않는다.

1. local 비답→model none의 두 시도가 현재 streak1로 잡힌다.
2. 같은 scene에서 concrete로 바꾸면 abandoned가 삭제된다.
3. “사실4답”이라는 문서 요약과 달리 concreteOnly는 앞선 feeling/meaning도 포함한 전체 인정 progress4를 센다. root는 이 기존 predicate를 유지하고 결과만 자동종료→scene선택으로 바꾸라고 지시했다.
4. 실제 keepIt의 성공 안내/귀환은 record와coverage 두 ACK 뒤다. 새 저장 선택도 이 계약을 유지해야 한다.

제안 범위는 정확21파일이다. 제품 행동7(screen/probe/번역5), 설명주석1, 실행기1, 검사11, 설계문서1이다. 상세 목록과 전환표·원결정 출처는 설계에 있다. **이 목록은 범위 제안이고 구현/독립 설계 승인이 아니다.**

다음 우선순위는 원Q6 두 실패 선택과 Q13 scene 완료 세 선택을 구현하기 전에 이 설계를 검토·승인하는 것이다. same/other/missing/error/quota를 유지하면서 local/model을 사용자 시도당1로 합산한다. 같은 scene의 abandoned는 more/concrete에서도 남고 새scene만 초기화한다. more는 같은 scene를 이어가며 과거 answered/coverage를 질문 전용 요청으로 덮지 않는다.

저장 버튼 클릭을 저장 성공으로 세지 않는다. 기존 keepIt의 record/coverage 비원자성·unknown 재시도 중복은 T16 미완료다. 새 scene save의 snapshot을 고정하고 성공 전 more/new/이동을 막는 상세 안은 다음 설계 검토 대상이다. dormant v2 snapshot에는 scene/stuck/continue 상태가 없으므로 저장/복원을 활성화하지 않는다.

## 보호 및 남은 일

- #2440 누적BLOCK3 동결. stop 확인/보류답/브라우저 Back/RESET 기능을 S2 이름으로 복사·재검토하지 않는다.
- D3 설계BLOCK2, B1 구현BLOCK2, B3 설계BLOCK1을 보존한다.
- U/S1 exact replay는32행·입력RED2제외·30replay, 현재 안내 소실0이다. 원109 감소FAIL2/support1과911 잔여는 그대로이며 모델 활성화는 막혀 있다. 이 수치는 새 실모델 품질·native/UI parity 증거가 아니다.
- S2 구현0, S3 말투/이번대화 후속0, 새 prompt/실모델 호출0, SQL/운영 쓰기0.
- S1 원 WT와 이전 proof/handoff는 hash 동결을 유지한다. S2 이후 실제 구현은 독립 WT와 root가 지정한 최종 통합 base에서 한다.

이 문서는 인터뷰 담당 부분 인수이며 세션 전체 진행률/PR/CI/서버/앱 상태는 root의 최종 인수가 정본이다.


---

## 인터뷰 S2 상세 계약

원본: `interview-s2-scene-choice-contract-r1.md`.

# S2 두 실패 선택 · 장면 완료 선택 — 읽기 설계 R1

작성자 /root/interview_b3_resume2. **사용자 종료 지시에 따라 읽기 조사와 현재 동작 재현까지만 동결했다. 제품 구현0, 새 WT0, 독립 설계 판정 전이다.** 아래 21파일은 다음 세션의 범위 제안이며 승인된 구현 완료가 아니다.

기준 S1: 91b12cd32837cdaf5f2b54aacf6ff4da477ec201, WT /workspace/2nd-B/.worktrees/interview-short-answers-261016. 원 WT는 clean 동결이다. S1 독립 R1 PASS H0/M0/L0·BLOCK0이며 보고서는 /workspace/scratch/review-interview-s1-r1.md, SHA 8a3e3f28b0c71d6b47295129109b895a8c7bce6493b27e9e080aa40a79233dad다. root의 최신 통합 full에는 Korean-in-code 분류 실패1이 남아 있다. 아래 상태를 S1 전달 완료로 읽지 않는다.

## 먼저 짚은 상충과 승인 출처

| 원문 | 현재 코드와의 차이 | 다음 구현 기준 |
|---|---|---|
| DECISIONS-2026-10-07_12.md:63, 02:42 Q6 세 번 실패 | 같은 날 03:00 결정이 대체 | 오래된 세 번을 근거로 자동 종료를 유지하지 않는다. |
| 같은 파일:70, 03:00 Q6 두 번 시도 뒤 다른 장면 질문, 거절하면 그 칸을 비운 채 다음 층, 그 장면 끝까지 비움 | 현 코드는 두 번째도 발판, 세 번째 전체 종료. local→model 혼합은 두 시도 뒤 streak1 | 확정 실패를 답 시도당1로 합산하고 두 번째에 선택. decline한 층은 같은 scene에서 다시 묻지 않는다. |
| 같은 파일:61,71 Q5 | no_verdict는 local, other는 인정·실패 모두 아님 | S1/T36 true/false/null/undefined+unsettled 계약 유지. |
| DECISIONS.md:74, 10-14 13:44 Q12 | 예전 기준선 먼저 순서를 대체 | 종료 규칙 먼저, 그 뒤 실제 모델 측정. 코드 검사로 모델 품질 완료를 주장하지 않는다. |
| 같은 줄 Q13 | 저장 화면 대신 [이 이야기 더 · 다른 장면 · 저장하고 마치기] | 자동 done/ended 대신 대화 안 세 선택. 클릭과 저장 ACK 분리. |
| 같은 줄 Q14/Q15 | 이번 대화 범위, 말투는 실제 모델 확인 뒤 | 현재 currentScene prompt 범위와 prompt/schema 유지. 새 모델·지시문 활성화0. |
| 10-07 파일:60 Q3 | 저장 선택한 세션만 사용자와 연결, 자동 저장 금지 | 선택 표시·more/new 자체는 저장0. explicit save만 기존 keepIt 호출. |
| review-interview-stop-confirmation-r3.md | 실제 브라우저 Back이 RESET이 되어 원문 소실, #2440 누적 BLOCK3 | stop/Back/RESET 구현을 S2에 복사하거나 재검토하지 않는다. |

**‘사실4답’이라는 이전 요약을 정정한다.** 실제 probe.ts:270의 concreteOnly는 currentScene의 모든 인정/현재 낙관 답 progress.length >= 4를 센다. 앞선 feeling/meaning도 포함된다. 별도 fact-only4 승인 원문은 찾지 못했다. root는 이 실제 predicate와4라는 숫자를 보존하고 결과만 자동 session finish→scene-choice로 바꾸도록 지시했다. 새 fact-only 상한을 만들지 않는다.

같은 scene의 changeAngle("concrete")가 abandoned를 비우는 것도 원Q6과 충돌한다. root는 두 실패의 local/model 합산과 이 재질문 경계를 S2에서 같이 닫는 범위가 정당하다고 확인했다.

## 실제 S1 base 재현

/workspace/scratch/interview-s2-baseline/에 S1 actual callback harness를 복사했다. import만 절대경로로 바꾸고 제품 send/ask/changeAngle/keepIt를 AST 실행했다. 모델/저장/native setter만 기존 I/O seam이다. **4 PASS**, 원145검사는 이름 필터로 제외했으며 PASS에 합산하지 않는다.

| 현재 실행 | 관측 |
|---|---|
| local 모르겠어요 → model none | 사용자2시도, model1, streak1, donefalse. local 턴 answered는 미설정 |
| abandoned=[fact,meaning] → 같은 scene concrete | abandoned=[], pendingfact |
| 앞선 fact/feeling/meaning 인정 → concrete→fact 인정 | fact2/feeling1/meaning1, 전체progress4라 donetrue |
| 실제 keepIt의 record/coverage 각각 deferred | record ACK 전·coverage ACK 전 success/route0. 두 ACK 뒤 toast1,700ms 뒤 route1 |

rows.json/result.json/test.log와 복제 검사/config를 보관했다. 이 PASS는 현재 동작 재현이며 새 동작 PASS가 아니다. 모델·운영 호출0이다.

## 다음 구현에 제안할 API

중복 planner를 새로 만들지 않고 실제 probe.ts의 NextMove/thread 분기를 확장한다.

- NextMove에 sceneChoice(reason=complete/concrete-complete/no-open-layer/question-exhausted), stuckChoice(layer)를 추가한다. finish는 기존 명시 stop 의미와 별도 local guard에 남긴다.
- thread에 continueScene?: boolean을 추가한다. 기본false, 사용자의 ‘이 이야기 더’ 선택만true로 만든다.
- failedAttemptMove(layer, attempts)를 공통화하여 첫 확정 실패에는 scaffold, 둘째 이상에는 stuckChoice를 반환한다. MAX_SCAFFOLDS_PER_LAYER를1로 내리지 않는다. 기존 고정 발판 둘과 legacy thread 없는 caller는 그대로다.
- ask에는 질문 전용 옵션 {continueScene?: boolean, questionOnly?: true}를 제안한다. more/decline으로 다음 질문만 만들 때 기존 마지막 사용자 턴 answered/unsettled와 coverage를 덮지 않는다.
- ask 반환은 question/scene-choice/stuck-choice/limited/failed/stale/crisis/finished처럼 명시한다. more/decline 오류를 성공한 전환으로 추측하지 않는다.
- 새 선택 ref/state는 원 owner lease·instance·period·conversation locale·minor·growthOrigin·현재 history·일회용 token에 묶는다. 동기 ref를 먼저 소비하고 state setter는 표시만 담당한다. queued updater에서도 원 소유권/token을 검사한다.

정확 함수명/타입은 구현 전 독립 설계 검토에서 확정할 제안이다. 현재 존재하는 API라고 주장하지 않는다.

## 상태 전환표

| 사건 | 다음 상태 | 원문·판정·호출 규칙 |
|---|---|---|
| 첫 local 비답 | active, 같은 층 발판 | 원문1 + answered:false, 실패1, 모델0, credit0 |
| 첫 안전 model none | active, 같은 층 발판 | 원문1 + false, 실패1, 모델1, credit0 |
| local/model 어느 순서든 둘째 확정 실패 | stuck-choice, 다른 장면으로 갈까요? | 실패2, done/endedfalse, 자동 세 번째 요청0 |
| same/missing | 다음 층 또는 scene-choice | S1 local gate 통과 시 asked층만1, 실패0 |
| other | 같은 층 active | null, 실패수 유지, 모든 credit0, 자동 재호출0 |
| 요청 오류 | 같은 층 재시도 | 새 답만 unsettled, 기존 실패수 유지, credit0 |
| quota | 요청 전 질문·draft·choice/continue snapshot | 실패수/abandoned/coverage 원복, 자동 재요청0 |
| stuck-choice + 다른 장면 | 새 scene, 기존 고정 anotherScene 질문 | 명시 선택 때만 sceneStart1; abandoned/stuck/continue 초기화; 모델0·저장0; 앞선 원문/coverage 보존 |
| stuck-choice + 이 질문 건너뛰기(거절) | 해당 층 abandoned → 다음 허용 층 또는 scene-choice | 새 credit0; 그 scene 끝까지 재질문0; 다음 질문은 명시 선택당 최대1요청 |
| normal 다섯 층 인정 또는 모든 허용층 처리 | scene-choice 세 선택 | 마지막 안전 판정 확정 뒤만. abandoned를 인정했다고 꾸미지 않음 |
| concreteOnly progress>=4 | scene-choice 세 선택 | 기존 전체progress predicate 유지, 마지막 판정 확정 뒤만 |
| 사용 가능한 층0 | scene-choice, more 비활성 | 전부abandoned 또는 concrete모드 fact포기. 사실만 선택을 몰래 feeling 질문으로 뒤집지 않음 |
| scene-choice + 이 이야기 더 | continueScene=true, 같은 scene 추가 질문 | 기존 열린층 추천, 명시 선택당 최대1요청; sceneStart0·원문/coverage 삭제0 |
| more 이후 답 | 같은 scene 계속 | 완료 predicate만 유예. 같은 판정/위기/실패 규칙 유지. 새5층 라운드·새4답 상한0 |
| more/decline 질문 전용 요청 오류·한도 | 원 선택 유지 + 오류/한도 안내 | 과거 답 판정 변경0·새 실패0·자동 저장/scene 변경0 |
| 모델 질문 소진 | scene-choice(question-exhausted) | 같은 질문 강제 반복/자동 종료/자동 추가요청0 |
| 저장하고 마치기 클릭 | 기존 keepIt 저장중 표시 | 클릭만으로 saved/done/route0, 아래 ACK 규칙 |
| 출력RED/earlyRED→lateGREEN | 기존 finish +root 위기안내 | 일반 선택·credit·후속질문0 |
| 기존 명시 stop/여기까지/Back | 기존 경로 | #2440 확인/보류답/RESET 기능 추가0 |

같은 scene의 concrete 전환에서는 abandoned와 continueScene을 유지한다. fact가 이미 abandoned면 부활시키지 않는다. pending층이 그대로면 실패수도 유지하고, 실제 다음 층 질문으로 옮길 때 그 질문의 실패수를 시작한다. 이전에 인정된 coverage를 나중에 포기했다는 이유로 지우지 않는다.

continueScene은 명시 more 뒤 완료 predicate만 유예한다. 같은 scene 전체 원문을 유지하고 기존 nextLayerSuggestion의 열린층 추천을 사용한다. 새 횟수 상한이나 자동 LLM 반복을 만들지 않는다. 모든 층이 닫혔으면 질문을 만들어내지 않는다.

12개 무답 local guard는 별도로 보존한다. localPromptsExhausted의 배열 보호/모델 없는 skip 반복 제한을 새 scene 버튼이 우회하지 않게 한다. 이것은 전체 사용자 답12턴 상한이 아니다.

## 저장 클릭·ACK와 T16 경계

대화 아래 선택 옆에도 기존 drill.saveBody 설명을 보여 준다. 저장하고 마치기는 중간 저장 화면으로 자동 이동하는 버튼이 아니라 기존 keepIt를 호출하는 명시 저장 행위다. 현재 동의 진입·withFollowup:false·원문 구성·coverage delta·안전 결과·toast·귀환 경로를 유지한다.

같은 렌더 두 탭을 막을 동기 save-in-flight ref를 saving state 앞에 둔다. scene 저장을 시작하면 선택의 history/coverage snapshot을 고정하고 more/new/ordinarysend를 잠근다. **record + addCoverage 두 ACK와 현재 owner/mount 확인 뒤에만 기존 성공 toast/700ms 귀환**을 허용한다. 실패에서는 원문/저장 대상을 보존하고 성공 안내·자동 scene 변경0이다. 실패 안내를 닫아도 같은 저장 대상으로만 기존 재시도를 제공하고 more/new로 본문을 바꾸지 않는 안이다.

현재 keepIt의 record 성공/coverage 실패·응답 유실 뒤 중복 가능성은 기존 부채다. durable save intent/서버 원자성/unknown 조회는 T16 선행이므로 S2 상태 이름만으로 해결됐다고 주장하지 않는다. 자동 재시도·새 key 발급·저장 복원·SQL 변경0. root는 기존 실제 ACK 계약만 새 선택에 연결하고 이 한계를 숨기지 말라고 지시했다.

현재 dormant v2 snapshot은 scene/stuck/continue를 표현하지 않는다. 새 상태를 active/ended로 접어서 저장하거나 UI writer를 켜지 않는다. 후속 T16 schema/version/restore가 이 메모리 계약을 표현해야 활성화할 수 있다. 기존 v2 roundtrip 검사는 표현 가능한 원상태만 증명한다.

## #2440과 안전 원문 보호

- continuity.ts 전체는 S1과 동일. stop regex/skip/currentScene 변경0.
- InterviewFrame header/router.back, useGoHomeStop predicate, finish body, send의 입력RED와 answerDisposition stop/skip 분기는 byte 동일 보호. 새 ordinary-send 선택 잠금은 그 뒤에 둔다.
- usePreventRemove/beforeRemove/GO_BACK/POP/RESET, 보류 stop 답/dialog, continuedAfterStop을 추가·복사하지 않는다. 이 선택은 확정 실패/scene 진전 뒤의 선택이다.
- buildSystemPrompt/buildUserPrompt/PROBE_SCHEMA/parser/readAnsweredLayer/usableQuestion, B1/B2/boundary/classifier, 기존 저장본문 구성은 hash로 보호한다.
- U의 원 lease/request/instance/redSeen/ended, shared guidance row와 scroll priority 유지. 새 선택이 안내 행을 가리거나 자동 scrollToEnd로 밀지 않는 회귀 필요.
- D3 설계BLOCK2/B1 구현BLOCK2/B3 설계BLOCK1/#2440 BLOCK3 보존. S1 PASS를 S2 PASS로 재사용하지 않는다.

## 제안 cohesive 범위 — 21파일

다음 세션에서 root 범위 승인과 설계 검토 뒤 구현할 목록이다. 제품 행동7파일, 설명 주석1, 실행기1, 검사11, 설계문서1이다.

| 파일 | 목적 |
|---|---|
| src/lib/interview/probe.ts | nextMove의 두 선택/2실패/continue/abandoned. prompt/parser 보호 |
| src/app/interview.tsx | 실제 선택 소유권/표시, 혼합 실패, 질문전용 ask, mode 보존, 저장 동기잠금/ACK |
| locales/ko/interview.json | sceneChoice/continueScene/newScene/saveAndFinish/changeSceneChoice/skipLayer 6키 |
| locales/en/interview.json | 같은6키 |
| locales/es/interview.json | 같은6키. 모델 locale 활성화 아님 |
| locales/pt/interview.json | 같은6키 |
| locales/id/interview.json | 같은6키 |
| src/lib/interview/session-end.ts | 낡은3실패/5층 자동끝/짧은답 주석 정정. guard와quota 함수 보호 |
| src/lib/interview/__tests__/continuity.test.ts | 새 nextMove 결과/continue/abandoned. S1 gate 기대 보호 |
| src/lib/interview/__tests__/stuck.test.ts | 실제 nextProbe target source anchor 갱신, legacy/비답 검사 유지 |
| src/lib/interview/__tests__/scene-progress.test.ts | 옛3회/15회 자동끝을 승인2실패/선택 불변식으로 갱신. copied simulator만 주증거로 쓰지 않음 |
| src/lib/interview/__tests__/session-end.test.ts | 설명/구조 참조 정합,12무답 guard·quota 유지 |
| src/app/__tests__/interview-verdict-states.test.ts | 기존 actual harness 확장, 승인으로 바뀐 기대만 수정, 혼합/decline/more/saveACK |
| src/app/__tests__/interview-crisis-lifecycle.test.ts | actual ask 새 closure, 선택중RED/owner/ABA/hold/queued setter와Urow/scroll |
| src/app/__tests__/interview-quota-stay.test.ts | choice/continue snapshot, 질문전용 실패, 늦은 입력과 같은 렌더 경합 |
| src/app/__tests__/interview-scene-choice.test.ts (새) | 실제 JSX와 버튼 handler/SSR/접근성/disabled/원문 보존 |
| src/lib/safety/__tests__/crisis-obfuscation.test.ts | ko/en 실제 문자열 +6만 반영하고 전체 문구 스캔 유지 |
| scripts/replay-claude-interview-adapter.ts | 실제 ask 새 closure 연결. loss식·원corpus·closedloader 보호 |
| scripts/__tests__/replay-claude-interview-adapter.test.ts | actual adapter 상태/참조검사·역사10행/raw109FAIL |
| scripts/__tests__/interview-guidance-adapter.test.ts | actual 선택과guidance 공존·loader 부정 대조 |
| docs/design/interview-scene-choice-261016.md (새) | 결정·전환·보호·변경 기대 근거·검증·T16 미완료 |

21파일 밖이 필요하면 실제 의존/실패와 추가 범위를 root에 먼저 제시한다. storage/서버/auth/Back 확장은 이 목록에 없다.

## 다음 검증과 완료 기준

1. baseline4를 desired actual callback 회귀로 전환. local/model 순서 네 조합, other/error/quota 사이 두 실패, 성공 reset, 모든 층·concrete 전환을 실행한다.
2. 최종층 same/missing만 scene-choice; none/other/error/RED는 낙관 완료0. five/기존concrete4/all-skipped/질문소진을 구분한다.
3. more 클릭 전 자동호출0, 클릭당 최대1; questionOnly가 과거 answered/unsettled/coverage를 덮지 않음. 새scene만sceneStart, 포기층 재방문0.
4. 각 선택 doubletap, same-render send↔choice, old버튼, ownerABA/hold/context/instance, queued updater, unmount, latequota/error, RED→GREEN를 실제 콜백으로 검증한다.
5. 실제 keepIt의 record/coverage ACK 두 단계·owner 전환·실패·snapshot 고정과 버튼 잠금. durable 멱등/unknown 완료 증거로 확대하지 않음.
6. 기존 S1/B3 테스트 재사용. 안내 역사10행 현재소실0, 원raw109FAIL2/support1 및911 잔여 보존. 3회복원/포기층삭제/choice→finish/questionOnly 과거판정 덮기/saveACK 전toast mutation은 반드시 실패해야 한다.
7. exact freeze→독립PASS·새M0→root 통합verify(type/cycles/full)/CI/main→동일 설정8081/앱 QA. 모델 품질 측정은 후속이며 여기 live0.

다음 세션의 첫 단계는 이 읽기 설계와 저장 실패 잠금/질문전용 재시도 상세를 독립 검토해 확정하는 것이다. **이번 세션은 사용자 종료 지시에 따라 구현을 시작하지 않았다.**


---

## T43 reasoning usage 계획

원본: `t43-reasoning-usage-read-plan.md`.

# T43 reasoning 사용량 조회 조사 · 구현 전 범위

기준 main `fc15cf869521afa5898485ac40d6ee34e6d8b2a0`. 제품 편집 0, 운영 호출 0, full/type 0. root가 C2 exact `9518964d467bec4cb31a6d48439746d1ead6b382`를 독립 검토하는 동안 읽기 조사만 했다. C2 지적이 오면 먼저 수정한다. 이 문서는 구현/독립 PASS/병합 보고가 아니다.

## 승인 원문과 먼저 구분할 충돌

- `DECISIONS-2026-10-13.md:125`, 20:43 항목 ④: **「응답이 없을 때 이미 쓰는 문장과 [다시 시도], 못 불러온 숫자는 「...」 (추천)」** 및 인터넷 띠를 모두 선택했다. T43 `docs/handoff/CODEX-EXECUTION-261015.md:494~`는 Q-261013-21~24 / Z40 / Z80을 연결한다.
- `src/lib/entitlements/usage.ts:98~148`의 기존 계약은 의도적으로 FAIL OPEN이다. 조회 오류→0, 원장 오류→광고 집계 mirror를 돌려주며, 기존 회귀 검사도 이 동작을 요구한다. 이것을 전역에서 throw로 바꾸면 자동 실행과 보상 정산 경로가 같이 바뀐다.
- 따라서 **기존 API와 다른 소비자 정책은 그대로 두고, 별도 opt-in 엄격 조회를 실제 reasoning 화면부터 연결**하는 것이 첫 단위다. 새 권한/차감/보상 정책이나 SQL을 제안하지 않는다.
- 원장 오류에 구매 크레딧이 없는 mirror를 표시하는 것도 현재값 확인 성공이 아니다. counter가 성공했어도 원장 오류면 strict 결과 전체는 미확인이다. `credit_summary_self`가 반환하는 값만 크레딧 정본으로 쓴다.

## 실제 코드에서 확인한 경로

| 경로 | 현재 상태 | 이번 범위 |
|---|---|---|
| `entitlements/usage.ts:98~148` | counter 오류/throw→모두0; 원장 오류→mirror; 비정상 숫자→0. error 응답은 두 Promise가 끝난 뒤 검사 | **기존 함수 byte 보존**. 별도 strict 모듈 추가 |
| `app/reasoning.tsx:881~940` 최초 목록 | record/source/legacy usage를 한 Promise.all에 넣고 10초 기한. usage가 오류를0으로 바꿔 정상 목록·남은 횟수로 나타남 | usage를 독립 소유 상태로 분리. 목록 원래 범위/정렬/선택/복구 유지 |
| `app/reasoning.tsx:790~797` refreshUsage | mounted 검사만 있음. 오류0·무기한 대기·이전 계정 응답 덮어쓰기 가능 | 같은 strict 상태·기한·owner lease/epoch/시도 검사 사용 |
| `app/reasoning.tsx:546~557` autoRunCanUseQuota 및 auto enqueue 둘 | legacy getter로 weekly base 판정, 마지막 base1회 수동 보존; rewarded는 자동에 쓰지 않음 | 함수/자동 흐름 byte 보존, 새 strict getter로 바꾸지 않음 |
| `ReasoningLimitSheet.tsx:112~211` | usage 읽기·광고 cap·pendingRewardBaseline을 같이 사용. refresh가 settlement 진전을 판정하고 onWatch가 광고→grant→refresh 수행 | 그대로 보존. 화면의 조회 재시도는 이 onWatch/onChanged를 호출하지 않음. 시트 오류0는 **후속 미완료** |
| `ConstellationHome.tsx:568~587` | auto pref와 legacy usage 병렬→bubble 횟수/보상/행동 표시 | 그대로 보존. 후속 독립 상태 도입 필요 |
| `northstar.tsx:73~96,113~` | legacy usage가 제안 admission에도 연결 | 그대로 보존. 단순 숫자 수정으로 함께 바꾸지 않음 |
| `dds-plans-screen.tsx:131~173` | 전용 strict 상태는 있으나 비정상숫자→0, ad earned는 mirror 폴백, Promise.all 뒤 오류 확인 | 공유 strict 정본으로 바로 재사용하지 않음. 후속 소비자 전환 대상 |

SQL 근거: `0057_usage_counters.sql:13~21`은 `(user_id,month_bucket)` PK와 nonnegative int. `0137_credit_read_scope.sql:79~110`은 로그인되지 않았으면 42501, `credit_summary_self()` **인수 없음**, `auth.uid()` 대상으로 `available`/`ad_earned_this_month`를 계산한다. `usage.ts`가 설명하는 0135 이후 mirror는 구매분을 표현하지 못한다. 0089/0092 원자적 서버 차감/예약 및 SSV는 이 작업에서 그대로 둔다.

## 실행한 결함 baseline

`/workspace/scratch/t43-reasoning-usage-baseline/`에서 기존 `reasoning-list-read-failure.test.ts`의 actual screen/hook harness를 재사용했다. 실제 `ReasoningScreen` + 실제 `getReasoningUsage`를 실행하고 Supabase transport만 fake로 제어했다. 실제 account-epoch와 JSX 값을 검사한다. 제품 코드를 복제해 새 구현으로 검증하지 않았다.

**8 PASS = 결함 재현 7 + 성공 빈 값 대조 1. 수정 성공 수가 아니다.**

1. counter 응답 error → 화면이 주2회 남음을 정상 표시, 실패/재시도 없음.
2. used2·mirror0 + 원장 응답 error → 소진 표시, 크레딧 확인 실패 안내 없음.
3. 원장 available=`"bad"` → 소진 표시, 실패 안내 없음.
4. counter는 즉시 error, 원장 무응답 → 즉시 실패를 못 보여주고 목록의 10초까지 기다림.
5. ready used1 뒤 시트 onChanged와 같은 refresh 경로에서 counter error → 남은1을 가짜 남은2로 교체.
6. 추가 refresh 무응답 → 60초 뒤에도 예전 숫자를 확인된 값처럼 유지, 재시도 없음.
7. A의 늦은 추가 refresh → B의 최신 used2를 used0으로 덮음. 목록은 B인 채 숫자는 A의 응답.
8. 정상 `data:[]` counter + 유효 `available:0,ad_earned_this_month:0` 원장은 실제 남은2가 맞음.

receipt: `source-proof.json`, `baseline.test.ts`, `jest.config.json`, `run.log`, `result.json`. 테스트 시작/종료 source hash 동일. grant/reserve/model 실제 호출 0; RPC fake는 `credit_summary_self`의 무인수 호출만 허용했다. 첫 scratch 설정에서 asset mapper를 빠뜨려 폰트 파싱 때문에 8 setup FAIL이 났고, `initial-harness-*` 원본을 보존했다. 제품 문제가 아니라 config를 보완한 뒤 8 PASS다. 기존 전체 회귀를 이 8개로 대신하지 않는다.

## 제안하는 정확한 cohesive 6파일

| 파일 | 변경 목적 |
|---|---|
| **신규** `src/lib/entitlements/reasoning-usage-read.ts` | 별도 `readReasoningUsageStrict` 및 검증. 기존 `ReasoningUsage`, KST bucket 계산 재사용. legacy 파일 수정0 |
| **신규** `src/lib/reasoning/use-reasoning-usage-read.ts` | reasoning 전용 pending/ready/error/timeout, actual owner/epoch/focus/시도 수명, read-only retry, 후속 refresh |
| `src/app/reasoning.tsx` | 최초 목록에서 usage 분리, 모든 화면 사용량 읽기를 hook으로 연결, unknown 숫자/안내/재시도 및 수동 시작 경계 |
| **신규** `src/lib/entitlements/__tests__/reasoning-usage-read.test.ts` | 실제 strict loader + SDK chain/응답/기한전 소유권/무인수RPC/숫자 검증 |
| `src/app/__tests__/reasoning-list-read-failure.test.ts` | 기존 actual harness에 strict transport·focus·계정 구독을 연결하고 목록 회귀와 usage 경쟁을 함께 검사 |
| **신규** `docs/design/reasoning-usage-read.md` | UI 상태·호출자 경계·보호 증거·남은 소비자/실제 기기 검증 기록 |

제품3+검사2+문서1=6파일. 테스트 harness 공용 파일·legacy usage·자동 큐·보상 시트·홈·northstar·plans·SQL 수정0. 기존 source-pin이 실제로 막으면 삭제/완화하지 않고 추가 정확 범위를 먼저 보고한다. import cycles/type/full은 root 슬롯에서 통합 검증한다.

## strict 응답 계약

- 한 시점의 Date에서 week/month를 함께 고정한다. 서버 count는 현재 **week row만** 필요하므로 `user_id,month_bucket,reasoning_used`를 owner와 week로 제한해 읽는다. monthly reward mirror를 읽거나 fallback으로 쓰지 않는다. 원장은 기존 무인수 `credit_summary_self()` 하나다.
- 두 읽기는 병렬로 시작하되 **각 결과의 error와 schema를 각 branch에서 즉시 reject**한 뒤 join한다. 즉 이미 아는 counter 오류가 다른 원장의 hang에 가려지지 않는다. 반대 경우도 같아야 한다.
- strict loader는 필수 `assertCurrent`를 받아 시작/각 SDK dispatch 직전/각 continuation 및 반환 직전에 실행한다. 첫 dispatch로 owner가 바뀌면 두 번째 dispatch가 나가지 않아야 한다. 검사는 caller 소유권이며 auth.uid() 서버 권한 판정을 대신하지 않는다.
- 성공 counter `[]`만 누락 row=used0이다. null/object/비배열/중복/foreign owner/다른 bucket/필수값 누락은 실패. valid row의 used와 summary의 available/ad_earned는 **유한·안전·0이상 정수인 number**만 받는다. 문자열/불리언/null/음수/소수/Infinity/NaN을 Number/coerce/clamp로 성공화하지 않는다.
- 원장 `null`, `{}`, `[]`, error, throw는 0이 아니다. SQL 정상 무크레딧은 유효 object 안 숫자0이므로 성공 빈 값과 구별할 수 있다. 추가 expiry 필드는 현재 화면이 소비하지 않아 바꾸지 않는다.
- 최종 결과는 기존 ReasoningUsage shape를 갖되 성공만 resolve한다. counter가 성공하고 원장만 실패했어도 부분0 합성은 하지 않는다. caller가 error/timeout 상태를 갖는다.
- 읽기 도중 KST week/month가 바뀌면 옛 bucket 결과를 현재 숫자로 publish하지 않는다. 새 현재 bucket 읽기 또는 명시 재시도로 연결하는 동작을 테스트에 고정해야 한다. 서버와 클라이언트 시계 차이 자체를 해결하는 변경은 아니다.

## 화면 상태표와 수명

| 현재 strict 상태 | 숫자/CTA | 재시도와 다른 흐름 |
|---|---|---|
| 첫 pending / refresh pending | 숫자 `...`, 기존 loading 문구. 이전 숫자를 현재값으로 보이지 않음 | 시작할 수 없고 상태 읽기만 진행. 기록 목록은 별도 상태 |
| ready, counter[], 유효 원장0 | 확인된 used0 및 기존 weekly base 표시 | 정상 수동 실행/한도 정책 그대로 |
| ready, used2/available50 | base0과 구매/보상 크레딧50을 기존 split 표시, cap 소진으로 잘못 막지 않음 | 기존 remainingReasoning과 서버 원자적 gate 사용 |
| ready, 실제 base0/credit0 | 기존 소진 문구·limit sheet 동작 | 실패 문구로 바꾸지 않음 |
| counter/원장 I/O 또는 schema error | `...` + 기존 loadFailed + retry; 빈 권한/소진을 단정하지 않음 | retry는 이 두 read만. record/source/recovery/proposal/grant/reserve/generate 호출0 |
| 10초 hang | `...` + 기존 timeout 안내 + retry | timeout 이후 늦은 값/오류는 새 시도에 영향0 |
| owner 전환/hold/ABA/blur/unmount | 이전 ready도 현재값으로 쓰지 않음 | 캡처 retry 및 늦은 callback은 publication/dispatch0. refocus 새 read만 |
| 완료된 review 또는 현재 생성 중 | usage 미확인과 독립해서 기존 review/취소 동작 유지 | 조회 실패로 proposal/선택을 지우거나 생성/저장을 재실행하지 않음 |

소유권은 hook instance+실제 account lease/epoch+focus session+각 read attempt다. userId 문자열만으로 A→B→A를 통과시키지 않는다. account transition 구독으로 React 재렌더 전에도 취소하며 queued updater 안에서도 현재 scope를 확인한다. timeout/교체/cleanup은 timer와 보류 작업 관찰을 정리한다. SDK가 abort되지 않더라도 늦은 결과는 보이지 않는다.

`refreshUsage`는 후속 refund/run-limit/onChanged에서도 같은 owned strict 상태를 갱신한다. **refresh/retry 횟수나 focus 상태가 바뀌어 recovery effect 의존성을 바꾸면 안 된다.** 현 recovery effect는 `[refreshUsage,userId]`이므로 hook의 callback identity를 무심코 연결하면 recovery RPC를 다시 실행하는 결함이 된다. 구현에서 owner-bound stable callback과 captured lease를 분리하고, 오래된 recovery/run callback이 다른 owner나 ABA 세대의 새 refresh를 대신 실행하지 못하게 한다. owner 세대 변경 시 과거 callback 자체를 거절하며 hold 동안 새 recovery를 시작하지 않는지 실제 호출 수로 확인한다. 이 경계를 단순 source-pin 보존 주장으로 대신하지 않는다.

목록 재시도는 records/sources만, 사용량 재시도는 counter/summary만. ready 목록이 있어도 usage가 미확인인 수동 시작은 button 및 오래된 onPress 경계에서 둘 다 차단한다. 자동 실행 함수/원자적 reserve/완료/환불/보상은 변경하지 않는다. 무제한은 tier에서 유도되는 값이지만, 화면 전체의 현재 usage 확인 전 임의의0 크레딧이나 가짜 ready 영수증을 만들지 않는다. 해당 tier에서 기존 review/cancel은 계속 가능하다.

## 구현 후 필수 검증

1. 위 baseline 7개를 수정 후 기대값으로 고정하고 true-empty 대조 유지. 실제 loader를 쓰는 actual screen 검사를 유지한다.
2. source별 응답error/reject/malformed/validempty, peer hang fail-fast, read-only RPC 이름/무인수/owner필터/일관bucket, 숫자/중복/foreign 경계.
3. 9999/10000ms, late success/reject, retry→retry, stale captured press, queued updater, owner/hold/cancel/ABA/unmount/blur/refocus, 첫 SDK dispatch에서 owner 변경→후속0.
4. refresh identity 변화로 recoverStaleRuns/listPendingProposals가 재실행되지 않음. 실제 refresh pending/실패/retry 동안 grant/reserve/runReasoningBatch/callLlm 0. 최초 authorized recovery count는 따로 유지한다.
5. 자동 함수와 enqueue 둘, batch/reservation/apply 함수, legacy usage 전체 및 ReasoningLimitSheet/ConstellationHome/northstar/SQL의 원 hash/AST 보호. legacy `usage-reads-ledger.test.ts`의 의도된 fail-open 검사 삭제0.
6. 기존 목록 선택·정렬·pending-review·profile/minor·배경 run·환불 receipt·reward SSV/settlement·주별 cap/월별 credit 회귀 실행. 목록과 usage를 분리한 기대값만 실제 계약에 맞게 수정한다.
7. 실제 source-copy negative: legacy getter 재연결, 오류0 합성, 원장mirror폴백, lease/attempt 검사 제거, refresh 의존성으로 recovery 반복, retry가 list/생성 호출. 각 지정 assertion에서 FAIL이며 runtime setup 오류0임을 확인한다.

## 남는 일과 우선순위

1. C2 독립 지적이 오면 수정 우선.
2. 이 6파일 범위/strict 성공·실패 계약을 root가 확인한 후 별도 WT에서 구현. 독립 검토와 통합 full/CI/병합은 별도.
3. 다음 단위는 ReasoningLimitSheet를 먼저: unknown 숫자와 보상 확인을 분리하되 SSV ticket/정산 정책을 유지해야 한다. 그 뒤 ConstellationHome·northstar·plans의 실제 소비자 전환을 각각 검토한다.
4. 실제 기기/8081 동일설정 확인 전 앱 완료라고 보고하지 않는다. 이 범위가 끝나도 T43 전체가 끝나는 것은 아니다.
