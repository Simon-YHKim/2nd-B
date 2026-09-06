# Claude Code 인수인계 프롬프트: 2nd-Brain 보안 작업 계속

당신은 2nd-Brain 저장소의 보안 전수 점검·개선을 Codex에서 인수받는다.
이 문서는 **2026-09-07 00:24:49 KST 기준 정본**이다. 이전 260906 프롬프트보다 이 파일을 우선한다.
현재는 로컬 부분 통합 단계이며 보안 작업 전체·릴리스·운영 적용은 완료되지 않았다.

## 0. 첫 응답과 필독

- 사용자에게 한국어로 결론과 3~6줄 계획부터 보고한다.
- 다음을 순서대로 직접 읽는다.
  1. `E:\2ndB\.worktrees\security-handoff-260906\CLAUDE.md`
  2. 이 worktree의 `docs/HANDOFF.md` 최상단 Latest 블록
  3. `docs/SESSION-OWNERSHIP.md`
  4. 이 파일 전체
- 보안에는 `cso`/`security-orchestrator`, 구현에는 `karpathy-guidelines`/`simon-tdd`, 분리에는 `simon-worktree` 규칙을 적용한다.
- 한 에이전트·한 배치 수정 파일은 최대 5개다. 공유 dirty tree를 권위 원본으로 쓰지 않는다.
- 완료하지 않은 것을 완료라고 말하지 않는다.

## 1. 승인·소유권 경계

다음은 그 행동 직전 사용자 명시 승인 없이는 0건을 유지한다.

- push, PR 생성·갱신, merge
- deploy, 운영 DB write/apply, 운영 config 변경
- repo/cloud secret·variable 변경, 키 회전
- 파일/worktree/임시 폴더 삭제, 실제 계정·데이터·DB·파일 삭제 테스트

운영 DB migration, Edge Function, secrets/variables, 백업·복원, 서버 활성화는 console owner 전용이다.
코딩 세션은 코드·테스트·migration 초안·운영 인계 문서를 만든다. 서버를 먼저 적용·검증한 뒤 client를 활성화한다.
credential 값은 문서·채팅·로그에 쓰지 않는다.

## 2. 절대 건드리지 않을 상태

| 경로 | 현재 상태 | 규칙 |
|---|---|---|
| `E:\2ndB\.worktrees\2ndB\TTL-Work` | branch `claude/pixelclay-auth-mascot-font-260905`, 773 collapsed / 1,377 expanded | 수정·stage·reset·checkout·clean 금지 |
| `E:\2ndB` | main `177a5962`, 미추적 avatar PNG 8개 | pull/reset/clean 금지, 파일 보존 |
| 모든 `security-*` worktree | 아래 local commits의 보존소 | 삭제·재생성 금지, 먼저 HEAD/clean 확인 |
| 공유 `node_modules` | decode-uri-component 0.2.2의 알려진 stale 설치본 | npm install/ci 및 mutation 금지 |

worktree 제거 승인은 없다. 이 저장소는 junction을 따라 공유 node_modules를 지운 사고 이력이 있으므로 force remove하지 않는다.

## 3. 외부 상태 — 시작 시 read-only 재검증

- `origin/main`: `9f852ff73bd8b0ba8cc9b17819f78d144662df8f`
- PR #1642: OPEN / DRAFT / MERGEABLE
  - head `656edb8d2ce855fb0d39ccfbbddc1b650fd09604`
  - base `9f852ff73bd8b0ba8cc9b17819f78d144662df8f`
  - visible verify/lint/sql/web-export-smoke checks 성공
  - #1607 + #1505, migrations 0147 + 0165 포함
  - security-*는 릴리스에서 제외
- 마지막 coordinator 진술은 운영 DB에 0147 `client_revision`이 없고 0147+0165 승인 대기, DB write 0이었다.
- consent 0166~0168은 HOLD 예약이며 실제 파일이 아니다.
- local 0169 RSS, 0170 peer, canonical 0171, security 0172~0187은 push 전 반드시 전체 재스캔한다.
- Orca terminal 소유권은 검증되지 않았다. 어떤 terminal에도 자동 명령·SQL·메시지를 보내지 않는다.

## 4. 권위 있는 로컬 HEAD

| 역할 | worktree / branch | HEAD | 상태 |
|---|---|---|---|
| canonical local | `security-integration-260906` / `fix/security-integration-260906` | `cc2f131bf9dc597ac412f154f5be09729901d0db` | clean |
| Native Auth candidate | `security-native-storage-integration-260906` / `fix/security-native-storage-integration-260906` | `103d180b4b69097cc3ea08febb0601cad4e0859e` | clean, 재리뷰 필요 |
| package candidate | `security-package-integration-260907` / `fix/security-package-integration-260907` | `943d81641de0eceba67d93d4091cd125e3097280` | clean, canonical 미이식 |
| recorder source | `security-recorder-temp-disposal-260906` / `fix/security-recorder-temp-disposal-260906` | `30c20f1f45587f694ef4df4f398d4210a5f01c88` | clean |
| handoff | `security-handoff-260906` / `docs/security-handoff-260906` | 이 문서의 최신 local commit | push 없음 |

## 5. canonical에 이미 통합된 것 — 재픽 금지

- public data/proxy/key: `1aeca012` → `4b80778b` → `baeaafd7` → `8de490ee` → `6a00b865` → `2b23f158` → `009b0c39`
- native storage core: `051a9d9a` → `fb27622e` → `22a50056`
- DB 0172~0187: `bdb602a4` → `69771038` → `c78a0a91` → `34e8e04a`
- recorder steps 1~5 rebased commits: `27e0e101` → `dbe0c6d9` → `aba1ad19` → `4943e1e8` → `cc2f131b`

원본 `56677960`은 package 후보 `943d8164`가 대체한다. standalone Google/public-data/old DB migration 및
standalone Naver `96832542`도 재픽하지 않는다. recorder 원본 8a4dc3bb~2a873ab3은 이미 위 rebased commits로 들어갔다.

주의: 한 read-only 원장 결과가 `f625f7b5`와 `30c20f1f`도 통합됐다고 잘못 분류했지만 이는 사실이 아니다.
blob 검증 결과 canonical `chat-voice-input.test.ts`는 정확히 f625의 parent이며, 30c의 세 파일도 source와 다르다.
따라서 다음 두 커밋은 **미통합**이다.

## 6. 가장 먼저 할 세 작업

### A. Native Auth 최종 적대적 재리뷰

후보 순서: `e267e19f` → `49f5b621` → `103d180b`.

`103d180b`는 정확히 5파일이며 다음을 구현했다고 보고됐다.

- destructive recovery synchronous single-flight
- timeout 뒤 late exact/transient storage failure reconciliation과 detached rejection 처리
- exact `secure_storage_recovery_required`와 transient adapter failure 분리
- transient `authStorageUnavailable` + no-signout/no-destructive-CTA retry boundary
- await 뒤 epoch/storage/proof-generation lease 재검증
- UNKNOWN 상태에서 owner-null 오판 방지

검증: RED 24 → focused 76/76, auth+storage 298/298, ESLint, typecheck, cycles0, lexicon, em-dash, secret scan.
그러나 독립 재리뷰와 full verify는 미실행이다. diff를 직접 읽고 concurrent/deferred runtime tests가 실제 동작을
검증하는지 확인한다. 재리뷰 통과 전 canonical에 cherry-pick하지 않는다.

통과 후 `e267e19f` → `49f5b621` → `103d180b` 순으로 이식한다. 그다음 별도 최대 3파일 batch로:

- recovery-required 2단계 명시적 데이터 손실 동의 UI
- transient retry-only UI
- 두 gate를 `_layout.tsx`의 `!recoveryReady` loader보다 먼저 배선

자동 초기화·signOut·실제 삭제 테스트는 금지한다.

### B. recorder 마지막 두 단계

canonical은 `cc2f131b`까지다. 다음 순서만 실행한다.

1. `f625f7b5` — 1 file, 구식 `chat-voice-input.test.ts` 계약을 lease API로 갱신
2. `30c20f1f` — 3 files, owned image cache disposal

현재 `chat-voice-input`은 4/5이고 나머지 mock focused 134/134는 통과했다. f625 뒤 해당 suite green을 확인하고,
30c 뒤 image/capture focused와 lint/typecheck/cycles를 확인한다. 실제 파일을 삭제하지 않는다.

### C. package/lock

`943d8164`를 canonical에 이식한다. 정확히 package.json/package-lock.json 두 파일이다.

보존해야 할 최종 graph:

- query-string override → decode-uri-component 0.5.0
- `@react-native/community-cli-plugin` override → metro 0.84.5 + metro-config 0.84.5
- expo-secure-store dependency/plugin/lock 56.0.4
- fast-xml-parser 5.7.0
- Expo 56.0.21 refresh graph, `image-size` node 0
- top-level `overrides` 객체 정확히 1개

새 package WT에는 node_modules가 없어 static synthesized-graph 검사만 통과했다. shared install을 바꾸지 않는다.
정상 독립 dependency 환경에서 full verify/native smoke가 최종 필요하다.

## 7. 이후 remaining integration matrix

각 커밋은 5파일 이하다. old-number SQL은 제외하고 code/test만 선택 이식한다.

1. Native leaf: `f1dc41e1` → `1f86935a`, `b1e6ba28`, `f2ae2730` → `6321bed7`
2. PKCE/Naver: `ccd2211f` → `1ddbff4c`(old 0160 제외), 이후 notifications `7356d1cf`
3. Paddle: `20739aaf` → `1d9ff2ac` → `dc7ba553`(old 0161 제외) → `fbb7485f` → `a3738dea`
4. LLM: `54a29da3` → `af320a4c` → `16a97b9e` → `36e8e6e8`
5. Reward: `c2e17487` → `1e871811`
6. Peer/RSS: `f596a3b2` → `8aec9043`(0170 재스캔), `1ccf8e03`(0169 재스캔)
7. Account/export: `0565f4c0`(old 0163 제외), `905d49c4` 선택 포트
8. Links/CSP: `e10663bf`(old 0164 제외) → `b3475c34`, `9667aa01`
9. Supply/proto/background: `38dd8127` → `86fca31a` → `69d5de8a`, `024ab5e1` → `bbb3a74e`
10. Actions/CI/hook: `fd448bb3` → `030bd913`, `83f9d84f`, `53866ea2`
11. 독립: `3a476dc3`, `751f7f76`

충돌 hotspot:

- package files: `943d8164` ↔ landing/proto
- `src/lib/supabase/auth.ts`: PKCE/Naver ↔ notifications
- `src/lib/supabase/client.ts`: PKCE ↔ encrypted native storage
- deploy/dry-run workflows: landing/actions ↔ 이미 통합된 public-data quota/key
- Paddle/LLM/peer/knowledge는 각 체인 내부 순서를 보존

## 8. dirty TTL에만 있는 두 작업

`audit outbox`와 `account local purge`는 773-change 공유 dirty WT의 구현을 권위 있는 완료본으로 보지 않는다.
통째 cherry-pick하지 말고 각각 clean branch의 reviewed ≤5-file batches로 새 포팅한다.

Audit outbox 최소 계약:

- raw body length precheck, encrypted native WAL primary/recovery
- stable UUID + idempotent RPC, critical event memory-only ack 금지
- owner-scoped purge, credential/raw-content 없는 phase-only logs
- canonical 0179 contract와 tests

Account local purge 최소 계약:

- `import.history:<owner>` 정본 key, GitHub state encrypted storage
- native retry가 localStorage polyfill을 native store로 오인하지 않음
- untracked quick-draft 임의 삭제 금지, startup purge는 auth bootstrap 전
- server deletion 0186과 local purge 분리, mock-only 검증

## 9. 검증·완료 게이트

현재 알려진 증거:

- #1642 coordinator full verify 594 suites / 6,448 tests, visible CI success
- canonical DB 0171~0187 static/ACL/definer/constraints/readiness/unique 검사 통과; 운영 apply 0
- recorder source final은 과거 full verify 596 suites / 6,540 tests, cycles0였지만 현재 canonical은 마지막 두 단계 전
- Auth 후보는 위 focused gates 통과, independent review/full verify 전
- package 후보는 static graph 통과, dependency restore/native smoke 전

다음이 모두 끝나기 전 보안 완료를 선언하지 않는다.

- 모든 선택 security changes를 최신 release base에 통합
- 정상 dependency 환경에서 `npm run verify` 전체 green, runtime cycles0
- migration collision 재스캔과 SQL 검증
- Android/iOS 실기기 auth/storage/capture/import smoke
- 사용자 승인 뒤 PR/CI green과 명시 acceptance
- console owner의 DB/proxy preflight/apply/postflight
- server-first client release, failure/quota smoke
- 별도 승인 뒤 public variable 제거와 key rotation
- 결제·개인정보 전문가 검토 또는 명시적 위험 수용

## 10. 첫 실행 명령

~~~powershell
git -C 'E:\2ndB' ls-remote origin refs/heads/main
gh pr view 1642 --json state,isDraft,mergeable,headRefOid,baseRefOid,statusCheckRollup
git -C 'E:\2ndB\.worktrees\security-integration-260906' status --short
git -C 'E:\2ndB\.worktrees\security-integration-260906' log --oneline -12
git -C 'E:\2ndB\.worktrees\security-native-storage-integration-260906' status --short
git -C 'E:\2ndB\.worktrees\security-native-storage-integration-260906' show --stat 103d180b
git -C 'E:\2ndB\.worktrees\security-package-integration-260907' status --short
~~~

불일치가 있으면 수정하지 말고 먼저 사용자에게 보고한다. 첫 실작업은 `103d180b` 독립 재리뷰와 recorder `f625f7b5` 중
서로 겹치지 않는 것을 병렬화한다. 외부 mutation은 승인 전 0건을 유지한다.
