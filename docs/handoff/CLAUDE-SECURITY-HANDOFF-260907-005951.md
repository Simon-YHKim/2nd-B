# Claude Code 인수인계 프롬프트 — 2nd-Brain 보안 작업 계속

당신은 Codex가 진행하던 2nd-Brain 보안 전수 점검·개선을 인수받는다. 이 문서는
**2026-09-07 00:59:51 KST 기준 최신 정본**이다. 이전 `CLAUDE-SECURITY-HANDOFF-*`보다 이 파일을 우선한다.
현재 상태는 **로컬 부분 통합**이며 보안 작업, 릴리스, 운영 적용은 완료되지 않았다.

## 1. 첫 응답과 필독

1. 사용자에게 한국어로 현재 결론과 3~6줄 실행 계획부터 보고한다.
2. 다음 파일을 직접 처음부터 끝까지 읽는다.
   - `E:\2ndB\.worktrees\security-handoff-260906\CLAUDE.md`
   - 이 worktree의 `docs/HANDOFF.md` 최상단 Latest 블록
   - `docs/SESSION-OWNERSHIP.md`
   - 이 파일 전체
3. `cso`/`security-orchestrator`, `karpathy-guidelines`, `simon-tdd`, `simon-worktree` 규칙을 적용한다.
4. 아래 명령으로 외부 상태와 각 권위 worktree의 HEAD/clean을 read-only 재검증한다. 불일치하면 수정하지 말고 먼저 보고한다.
5. 한 에이전트·한 배치는 수정 파일 최대 5개다. 완료하지 않은 것을 완료라고 말하지 않는다.

## 2. 승인·소유권 경계

다음은 그 행동 직전 사용자의 명시 승인 없이는 **0건**을 유지한다.

- push, PR 생성·갱신, merge
- deploy, 운영 DB write/apply, 운영 config 변경
- repository/cloud secret·variable 변경, 키 회전
- 파일/worktree/임시 폴더 삭제
- 실제 계정·데이터·DB·파일을 삭제하는 테스트

운영 migration, Edge Function, secrets/variables, 백업·복원, 서버 활성화는 console owner 전용이다.
코딩 세션은 코드·테스트·migration 초안·운영 인계 문서까지만 만든다. 서버를 먼저 적용·검증한 뒤 client를 활성화한다.
credential 값은 문서·채팅·로그에 쓰지 않는다. Orca terminal 소유권은 검증되지 않았으므로 어떤 terminal에도 자동 전송하지 않는다.

## 3. 절대 건드리지 않을 상태

| 경로 | 기준 상태 | 규칙 |
|---|---|---|
| `E:\2ndB\.worktrees\2ndB\TTL-Work` | `claude/pixelclay-auth-mascot-font-260905`, 약 773 collapsed / 1,377 expanded changes | 수정·stage·reset·checkout·clean 금지 |
| `E:\2ndB` | local main `177a5962`, 사용자 미추적 avatar PNG 8개 | pull/reset/clean/delete 금지 |
| 모든 `security-*` worktree | 아래 clean commits의 보존소 | 삭제·재생성 금지, 먼저 status 확인 |
| 공유 `E:\2ndB\node_modules` | `decode-uri-component` 0.2.2 stale 설치본 | npm install/ci 및 mutation 금지 |

worktree 제거 승인은 없다. 이 저장소는 junction을 따라 공유 `node_modules`를 삭제한 사고 이력이 있으므로 force remove하지 않는다.

## 4. 외부 상태 — 00:59 KST read-only 확인값

- `origin/main`: `9f852ff73bd8b0ba8cc9b17819f78d144662df8f`
- PR #1642: OPEN / DRAFT / MERGEABLE
  - head `656edb8d2ce855fb0d39ccfbbddc1b650fd09604`
  - base `9f852ff73bd8b0ba8cc9b17819f78d144662df8f`
  - 표시된 verify/lint/sql/web-export-smoke checks 성공
  - #1607 + #1505, migrations 0147 + 0165 포함; `security-*`는 제외
- 마지막 coordinator 진술: 운영 DB에 0147 `client_revision`이 없고 0147+0165 승인 대기, DB write 0.
- consent 0166~0168은 HOLD 예약이며 실제 파일이 아니다.
- local 0169 RSS, 0170 peer, canonical 0171, security 0172~0187은 push 전 전체 재스캔한다.

## 5. 권위 있는 로컬 HEAD

| 역할 | worktree / branch | HEAD | 판정 |
|---|---|---|---|
| canonical local | `security-integration-260906` / `fix/security-integration-260906` | `e6b884542e27af8e6b95b123ec281e58a4ccfd68` | clean |
| Native Auth candidate | `security-native-storage-integration-260906` / `fix/security-native-storage-integration-260906` | `6f94087f488875efc7eb30a60797d966dbbb0b19` | clean, **BLOCK** |
| package source | `security-package-integration-260907` / `fix/security-package-integration-260907` | `943d81641de0eceba67d93d4091cd125e3097280` | clean; canonical에는 rebased `0f958f72`로 통합됨 |
| recorder source | `security-recorder-temp-disposal-260906` / `fix/security-recorder-temp-disposal-260906` | `30c20f1f45587f694ef4df4f398d4210a5f01c88` | clean; canonical에는 7단계 모두 통합됨 |
| handoff | `security-handoff-260906` / `docs/security-handoff-260906` | 이 파일을 담는 최신 local commit | push 없음 |

## 6. canonical에 이미 통합된 것 — 재픽 금지

순서는 아래와 같다.

- public data/proxy/key: `1aeca012` → `4b80778b` → `baeaafd7` → `8de490ee` → `6a00b865` → `2b23f158` → `009b0c39`
- native storage core: `051a9d9a` → `fb27622e` → `22a50056`
- DB 0172~0187: `bdb602a4` → `69771038` → `c78a0a91` → `34e8e04a`
- recorder 7단계: `27e0e101` → `dbe0c6d9` → `aba1ad19` → `4943e1e8` → `cc2f131b` → `8dbbe25d` → `ac2e83e3`
- package/lock: `0f958f72`
- native leaf: `538f345a` → `1591a2ba` → `c5eaf373` → `b2fa3030` → `9041536f`
- PKCE/Naver 1단계: `e6b88454` (`ccd2211f`의 충돌 수술 통합본)

원본 recorder commits와 package `943d8164`, native leaf 원본, standalone Google/public-data/old DB migrations를 다시 cherry-pick하지 않는다.

### canonical 최신 검증

- PKCE/Naver 1단계: 정확히 5파일, focused 154/154, ESLint error 0, typecheck, runtime require cycles 0,
  diff/충돌 marker/high-confidence secret scan 통과. 기존 encrypted storage와 recovery identity proof 보존.
- recorder 7단계: related 194/194, lint/typecheck/cycles 0. 실제 파일 삭제 테스트 없음.
- native leaf: 각 단계 focused 333/333, 214/214, 258/258, 167/167, 83/83 및 lint/typecheck/cycles 통과.
- package graph: exact 2 files, graph 14/14. `secure-store` 56.0.4, decode lock 0.5, Metro 0.84.5,
  fast-xml-parser 5.7, image-size 0. 공유 stale install 때문에 decode runtime 1건만 알려진 환경 실패.
- canonical 전체 `npm run verify`는 최신 HEAD에서 아직 실행하지 않았다.

## 7. 최우선 blocker — Native Auth recovery

`103d180b`와 후속 pending-lease `6f94087f`를 canonical에 넣지 않는다. 독립 리뷰 판정은 **BLOCK**이다.

### `6f94087f` P1 결함

1. no-arg clear가 호출 시점의 현재 lease를 캡처한다. B claim 뒤 stale A가 호출하면 B 소유권을 지울 수 있다.
2. A와 B persist가 연속 실패하면 B가 미확정 `previous=A`를 복원해 실패한 A를 disk 없이 부활시킨다.
3. web의 늦은 historical storage event(`null/A`)가 local 최신 B memory lock을 덮는다. handler 시점의 실제 storage 값을 다시 읽어야 한다.
4. legacy proof upgrade write 실패 회귀 테스트가 없다.
5. Web Storage의 `getItem`→`removeItem`은 진짜 cross-tab CAS가 아니다. token-specific key 또는 Web Lock 같은 원자화 없이
   restart durability까지 보장한다고 주장하지 않는다. Native single-module queue는 explicit lease일 때만 안전하다.

먼저 **정확히 2파일**(`recovery-proof-store.ts`와 해당 test)만 수정한다.

- no-arg clear는 fail-closed/no-op로 만들고, 실제 mutation은 explicit expected lease만 허용한다.
- rollback은 직전 in-flight owner가 아니라 last-known-durable snapshot을 사용하며 현재 owner만 rollback한다.
- storage event 처리 시 `event.newValue`를 신뢰하지 말고 현재 storage를 재조회한다.
- RED tests: B claim 후 stale A clear, A+B 연속 write 실패, local B 뒤 stale event, legacy upgrade write 실패.
- focused test, auth+storage suite, lint, typecheck, cycles, diff, secret scan 뒤 clean commit하고 독립 재리뷰한다.

### 그다음 분리 배치

1. Auth consumer/finalizer 배치: pending revision snapshot, 모든 clear에 expected lease, signOut 시작 lease와
   `SIGNED_OUT` finalizer 공유, current epoch/proof/pending/no-fault일 때만 ready release. `SIGNED_OUT` 선행·late B·cancel/reject runtime tests.
2. reset form 배치: `completeRecovery(): Promise<boolean>`로 바꾸고 stale/no-op은 false; true일 때만 완료 UI/toast. 행동 테스트 포함.
3. UI 배치: recovery-required 2단계 명시 동의와 transient retry-only gate를 `_layout.tsx`의 `!recoveryReady` loader보다 먼저 배선.
   자동 초기화·자동 signOut·실제 삭제 테스트 금지.
4. 위 전부 GREEN 및 독립 리뷰 후에만 `e267e19f` → `49f5b621` → `103d180b`와 승인된 후속 commits를 canonical에 이식한다.

기존 `103d180b`의 별도 차단점도 보존한다: terminal signout race, UI gate 부재, stale/no-op인데 reset 완료로 표시하는 문제,
raw error logging과 vacuous source assertion(P2).

## 8. 다음 canonical integration 순서

Auth blocker 수정과 겹치지 않게 다음 작업을 병렬화할 수 있다.

1. PKCE/Naver `1ddbff4c`에서 old `db/migrations/0160_oauth_naver_rate_limit.sql`을 제외한 4파일만 선택 이식.
2. notifications `7356d1cf`.
3. Paddle `20739aaf` → `1d9ff2ac` → `dc7ba553`(old 0161 제외) → `fbb7485f` → `a3738dea`.
4. LLM `54a29da3` → `af320a4c` → `16a97b9e` → `36e8e6e8`.
5. reward `c2e17487` → `1e871811`.
6. peer/RSS `f596a3b2` → `8aec9043`(0170 재스캔), `1ccf8e03`(0169 재스캔).
7. account/export `0565f4c0`(old 0163 제외), `905d49c4` 선택 포트.
8. links/CSP `e10663bf`(old 0164 제외) → `b3475c34`, `9667aa01`.
9. supply/proto/background `38dd8127` → `86fca31a` → `69d5de8a`, `024ab5e1` → `bbb3a74e`.
10. actions/CI/hook `fd448bb3` → `030bd913`, `83f9d84f`, `53866ea2`.
11. 독립 `3a476dc3`, `751f7f76`.

각 단계에서 source commit의 file list와 canonical diff를 먼저 읽고, old-number SQL은 제외한다. 충돌은 수술 해결하고
기존 public-data quota/key, encrypted storage, recovery proof, release-base 동작을 보존한다.

## 9. dirty TTL에만 있는 작업

`audit outbox`와 `account local purge`는 공유 dirty WT에서 통째로 가져오지 않는다. clean branch에 reviewed ≤5-file batches로 새 포팅한다.

- Audit outbox: raw body length precheck, encrypted native WAL, stable UUID/idempotent RPC, critical event memory-only ack 금지,
  owner-scoped purge, phase-only logs, canonical 0179 contract.
- Account purge: `import.history:<owner>` 정본 key, GitHub state encrypted storage, native retry가 localStorage polyfill을 오인하지 않음,
  untracked quick-draft 임의 삭제 금지, startup purge는 auth bootstrap 전, server deletion 0186과 local purge 분리.

## 10. 완료 게이트

다음이 전부 끝나기 전 “보안 완료”를 선언하지 않는다.

- 선택한 security changes를 최신 release base에 통합
- 정상 독립 dependency 환경에서 `npm run verify` 전체 green과 runtime cycles 0
- migration collision 재스캔과 SQL 검증
- Android/iOS 실기기 auth/storage/capture/import smoke
- 사용자 승인 뒤 push/PR, CI green, 명시 acceptance
- console owner의 DB/proxy preflight/apply/postflight
- server-first client release와 failure/quota smoke
- 별도 승인 뒤 public variable 제거와 key rotation
- 결제·개인정보 전문가 검토 또는 명시적 위험 수용

AI 감사는 전문 보안 감사·침투테스트를 대체하지 않는다.

## 11. 첫 실행 명령

~~~powershell
git -C 'E:\2ndB' ls-remote origin refs/heads/main
gh pr view 1642 --json state,isDraft,mergeable,headRefOid,baseRefOid,statusCheckRollup
git -C 'E:\2ndB\.worktrees\security-integration-260906' status --short
git -C 'E:\2ndB\.worktrees\security-integration-260906' log --oneline -20
git -C 'E:\2ndB\.worktrees\security-native-storage-integration-260906' status --short
git -C 'E:\2ndB\.worktrees\security-native-storage-integration-260906' show --stat 6f94087f
git -C 'E:\2ndB\.worktrees\security-native-storage-integration-260906' show 6f94087f -- src/lib/auth/recovery-proof-store.ts
~~~

첫 실작업은 `6f94087f`의 2파일 RED→GREEN 보수와 `1ddbff4c` 선택 이식 중 서로 겹치지 않는 것을 병렬화한다.
외부 mutation은 승인 전 0건을 유지한다.
