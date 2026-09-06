# Claude Code 인수인계 프롬프트: 2nd-Brain 보안 전수 점검·개선 계속

당신은 2nd-Brain 저장소의 보안 전수 점검과 개선 작업을 Codex에서 인수받는다.
아래 상태는 2026-09-06 23:20 KST 기준이다. 결론부터 말하면 **보안 작업은 완료되지 않았고 배포되지 않았다.**
이미 만들어진 로컬 격리 커밋을 보존하면서, 통합·검증·운영 인계까지 정확하게 이어가라.

## 0. 첫 응답과 작업 방식

- 사용자에게 한국어로 결론과 짧은 3~6줄 계획부터 보고한다.
- 먼저 다음 파일을 직접 읽는다.
  - E:\2ndB\.worktrees\security-handoff-260906\CLAUDE.md
  - E:\2ndB\.worktrees\security-handoff-260906\docs\HANDOFF.md의 최상단 Latest 블록
  - E:\2ndB\.worktrees\security-handoff-260906\docs\SESSION-OWNERSHIP.md
  - E:\2ndB\.worktrees\security-handoff-260906\docs\handoff\CLAUDE-SECURITY-HANDOFF-260906.md
- 보안 작업에는 cso/security-orchestrator, 코딩에는 karpathy-guidelines와 simon-tdd,
  분리에는 simon-worktree 규칙을 적용한다.
- 한 에이전트·한 배치의 수정 파일은 최대 5개다. 독립 탐색·테스트·이식은 clean worktree에서 병렬화하되
  최종 판단과 통합은 주 세션이 한다.
- 60초 이상 사용자에게 아무 진행 상황도 알리지 않는 상태를 만들지 않는다.
- 완료하지 않은 것을 완료라고 말하지 않는다.

## 1. 절대 먼저 알아야 하는 소유권·승인 경계

1. push, PR 생성·갱신, merge, deploy, 운영 DB write/apply, 운영 설정 변경, 시크릿·변수 변경,
   키 회전, 파일·worktree·임시 폴더 삭제는 **그 행동 직전 사용자의 명시적 승인 없이는 0건**이다.
2. 운영 DB 마이그레이션 적용, Edge Function 배포, repo secret/variable, 백업·복원은 콘솔 세션 소유다.
   코딩 세션은 코드·테스트·마이그레이션 초안·코드 설명 문서를 소유한다.
3. 서버가 먼저다. 새 컬럼·RPC·proxy 좌석을 운영에 적용·배포하고 확인한 뒤에 클라이언트를 활성화한다.
4. 현재 보안 브랜치는 모두 **LOCAL ONLY**이며 remote head가 없다. 임의 push하지 않는다.
5. MFDS·EXIM 공개 키는 노출·회전 필요 상태지만 **실제 값을 문서, 채팅, 로그, 커밋에 절대 쓰지 않는다.**
   프록시 컷오버와 검증이 끝난 뒤, 별도 명시 승인으로 public variable 제거와 두 키 회전을 한다.
6. 실제 사용자 데이터·계정·DB·파일 삭제를 테스트하지 않는다. 이번 세션까지 실제 삭제는 0건이다.
7. AI 기반 감사는 전문 보안 감사·침투테스트를 대체하지 않는다. 결제·개인정보 영역은 전문가 검토 대상으로 남긴다.

## 2. 손대지 말아야 할 트리와 로컬 상태

| 경로 | 상태 | 규칙 |
|---|---|---|
| E:\2ndB\.worktrees\2ndB\TTL-Work | 공유 dirty tree. 기본 status 772 changes, untracked 전체 확장 시 1,360 | **수정·스테이징·정리·reset·checkout·clean 금지. 권위 있는 코드 원본으로도 보지 말 것** |
| E:\2ndB | local main HEAD 177a5962, origin/main보다 1 commit 뒤, 사용자 미추적 avatar PNG 8개 | pull/reset/clean 금지. 8개 파일 보존 |
| E:\2ndB\.worktrees\security-handoff-260906 | 이 인수인계 전용 branch | 읽기 기준. 기능 통합 작업을 섞지 말 것 |
| 모든 security-* worktree | 로컬 커밋 보존소 | 삭제·재생성 금지. 먼저 clean/HEAD 확인 |
| E:\2ndB\.worktrees\.npm-security-landing-260906 | npm 백업 | 삭제 금지 |
| WSL /root/.claude/wiki/Simon-LLM-Wiki | 미완 clone 잔여 | 삭제 승인 없음 |
| C:\Users\202502\AppData\Local\Temp\codex-peer-rate-f3b424016fc8409ea7202cae4fc195b4 | 임시 PostgreSQL 잔여 | 삭제 승인 없음 |

worktree를 지울 일이 생겨도 지금은 승인받지 않았다. 이 저장소는 node_modules junction을 따라 공유 설치본까지
삭제한 사고 이력이 있으므로, 승인 후에도 junction을 먼저 끊고 절대 force remove부터 하지 않는다.

## 3. 외부·릴리스 상태

- 최신 확인 origin/main:
  9f852ff73bd8b0ba8cc9b17819f78d144662df8f
- PR #1642:
  - DRAFT, MERGEABLE
  - head 656edb8d2ce855fb0d39ccfbbddc1b650fd09604
  - base 9f852ff73bd8b0ba8cc9b17819f78d144662df8f
  - 표시된 verify, lint, SQL, web-export-smoke 4개 성공
  - #1607 dependency patch + #1505 fallback 통합
  - migration 0147과 0165를 모두 포함
  - security-* 변경은 이번 릴리스에서 명시적으로 제외
- 코디네이터 최신 진술:
  - 운영 readonly 조회에서 0147의 client_revision 컬럼이 없었음
  - 사용자에게 0147+0165 운영 적용 승인을 물었으나 아직 답 없음
  - 운영 DB write 0
  - Claude 시작 시 이 외부 상태는 변할 수 있으므로 read-only로 재검증
- consent 6은 09-04 최신 계약을 09-02로 되돌리는 계약 충돌 때문에 보류.
  0166~0168은 HOLD 예약일 뿐 실제 migration 파일이 아니다.
- Output/vibe-release-260906/active-local-migrations.json은 18:38 기준이라 0171~0181을 반영하지 않은 stale 증거다.
  번호 판단에 단독 사용하지 않는다.
- 현재 서버 활성화 계획 또는 동시 0147 적용 증거는 없다.
- Orca terminal:
  - term_e9ecf6f7-00bb-4509-977f-eca25c2d9ad3는 연결·쓰기 가능했고 “마이그레이션 안드로이드 테스트” 제목의
    가장 가까운 ops 후보지만 Supabase DB 소유자임이 검증되지 않았다.
  - idle term_302555c5...를 포함해 어떤 Orca terminal에도 자동으로 명령·SQL·메시지를 보내지 않는다.
  - 활성 서버 배포는 계속 콘솔 소유다.
- 기존 코디네이터 회신:
  E:\2ndB\.worktrees\2ndB\TTL-Work\Output\vibe-release-260906\session-owner-a.md
  이 파일은 ignored/untracked이며 값·시크릿을 포함하지 않도록 유지한다.

## 4. 네 개의 현재 권위 있는 로컬 통합 축

모두 clean임을 마지막으로 확인했다. 새 세션에서 다시 git status와 log를 read-only 확인하라.

| 영역 | worktree | branch | 순서 보존 커밋 |
|---|---|---|---|
| 공개 데이터 proxy·quota·키 경계·문서 | E:\2ndB\.worktrees\security-integration-260906 | fix/security-integration-260906 | 1aeca012 → 4b80778b → baeaafd7 → 8de490ee → 6a00b865 → 2b23f158 → 009b0c39 |
| Native encrypted storage | E:\2ndB\.worktrees\security-native-storage-integration-260906 | fix/security-native-storage-integration-260906 | bee94d82 → b0e81d28 → 3f05defc |
| DB hardening 후보 | E:\2ndB\.worktrees\security-db-integration-260906 | fix/security-db-integration-260906 | ae7d71e9 → 58d1399b |
| recorder/image cache ownership | E:\2ndB\.worktrees\security-recorder-temp-disposal-260906 | fix/security-recorder-temp-disposal-260906 | 8a4dc3bb → 8f12c625 → 6e44995c → 2ed2bad4 → 2a873ab3 → f625f7b5 → 30c20f1f |

공개 데이터 통합 축은 #1642 head를 기반으로 한다. 다른 세 축은 아직 공개 데이터 최종 HEAD에 합쳐지지 않았다.
전체 integration branch 하나가 완성된 상태로 오해하지 않는다.

### 공개 데이터 통합 축이 닫은 것

- fail-closed server boundary와 finance/nutrition client proxy 전환
- public-data quota migration 0171과 static SQL tests/dry-run workflow
- EXIM/MFDS client-side key 소비·빌드 주입 제거, server key만 유지
- 요청 body 4KB streaming limit, strict JSON content type/length, fatal UTF-8, duplicate key/depth/integer/
  surrogate/providerCode 검증
- Google API key의 client build 소비·주입 제거, server GOOGLE_API_KEY와 Edge Function 경로 유지
- 활성 문서 네 개에서 공개 키 등록 안내 제거
- 최종 009b0c39: exact 4 docs, focused 7 suites / 70 tests, lint/typecheck/HTML/diff/secret 검사 통과

## 5. 완료된 격리 브랜치·커밋 원장

아래는 **로컬 완료 후보 원장**이지 배포 원장이 아니다. “완료”는 해당 작은 배치가 커밋됐다는 뜻뿐이다.
같은 목적의 옛 커밋과 final 커밋이 있으면 final만 이식한다.

| 영역 | branch | 커밋 / 주의 |
|---|---|---|
| Paddle binding | fix/security-paddle-binding-260906 | 20739aaf → 1d9ff2ac → dc7ba553 → fbb7485f |
| Paddle auth verify | fix/security-paddle-auth-verification-260906 | a3738dea |
| public data standalone | fix/security-public-data-260906 | 1a139e41 → 0cf720ee → 7e2d987c → 572f2038 → 5a7f9efb |
| LLM purpose | fix/security-llm-purpose-260906 | 54a29da3 → af320a4c → 16a97b9e2610cfa204376fdcb8680fdcca0123ce → 36e8e6e8 |
| DB/export guard | fix/security-db-guard-260906 | 905d49c4, old base라 whole cherry-pick 금지 |
| reward SSV | fix/security-reward-ssv-260906 | 1e871811 |
| Naver+PKCE final | fix/security-auth-naver-combined-260906 | 1ddbff4c, 96832542와 ccd2211f를 대체 |
| Edge CI | fix/security-ci-hardening-260906 | 83f9d84f |
| dependencies | fix/security-dependencies-260906 | 56677960 |
| account deletion | fix/security-account-delete-260906 | 0565f4c0 |
| web CSP | fix/security-web-csp-260906 | 9667aa01 |
| external links / HTTPS | fix/security-external-links-260906 | e10663bf → b3475c34 |
| landing supply chain | fix/security-landing-supply-chain-260906 | 38dd8127 |
| Actions pinning A | fix/security-actions-pinning-a-260906 | fd448bb3 |
| Actions pinning B | fix/security-actions-pinning-b-260906 | 030bd913 |
| proto supply chain | fix/security-proto-supply-chain-260906 | 86fca31a |
| template trigger | fix/security-template-trigger-260906 | 3a476dc3 |
| RSS proxy | fix/security-rss-proxy-260906 | 1ccf8e03, migration 0169 provisional |
| IDEN render | fix/security-iden-render-260906 | 751f7f76 |
| Claude hook | fix/security-claude-session-hook-260906 | 53866ea2; accidental hook run은 중단됨 |
| bounded local read | fix/security-bounded-file-read-260906 | 8a4dc3bb, recorder chain에도 포함 |
| proto message origin | fix/security-proto-message-origin-260906 | 69d5de8a |
| peer responder quota | fix/security-peer-responder-quota-260906 | 8aec9043, migration 0170 provisional |
| background CSP A | fix/security-bg-concepts-csp-a-260906 | 024ab5e1 |
| background CSP B | fix/security-bg-concepts-csp-b-260906 | bbb3a74e |
| public Google key | fix/security-public-google-key-260906 | 68b59091, integration의 2b23f158로 이식됨 |
| encrypted storage core | fix/security-native-storage-core-260906 | add1a3a3 |
| native auth storage | fix/security-native-auth-storage-260906 | 4f79476b |
| notification boundary | fix/security-notification-boundary-260906 | 7356d1cf |
| owned temp core | fix/security-owned-temp-core-260906 | d9c2d523; recorder chain의 6e44995c가 동등 통합본 |
| native capture storage | fix/security-native-capture-storage-260906 | f1dc41e1 |
| import picker disposal | fix/security-import-temp-disposal-260906 | 1f86935a |
| import history | fix/security-native-import-history-260906 | b1e6ba28, full verify 통과 |
| GitHub handle | fix/security-native-github-handle-260906 | f2ae2730, full verify 통과 |
| capture picker disposal | fix/security-capture-temp-disposal-260906 | 2ed2bad4, recorder chain에도 포함 |
| GitHub caller resilience | fix/security-native-github-caller-260906 | 6321bed7 |
| native integration | fix/security-native-storage-integration-260906 | bee94d82 → b0e81d28 → 3f05defc |
| recorder integration | fix/security-recorder-temp-disposal-260906 | 8a4dc3bb → 8f12c625 → 6e44995c → 2ed2bad4 → 2a873ab3 → f625f7b5 → 30c20f1f |
| DB integration | fix/security-db-integration-260906 | ae7d71e9 → 58d1399b |
| public-data integration | fix/security-integration-260906 | 1aeca012 → 4b80778b → baeaafd7 → 8de490ee → 6a00b865 → 2b23f158 → 009b0c39 |

old fix/security-naver-oauth-260906의 96832542와 fix/security-auth-pkce-260906의 ccd2211f는
combined 1ddbff4c가 대체한다. old DB/export 905d49c4도 최신 base에 선택 포팅해야 하며 whole cherry-pick하지 않는다.

## 6. DB migration 상태와 다음 매핑

### 이미 로컬 통합된 provisional 후보

| 번호 | 목적 | 통합 commit |
|---:|---|---|
| 0171 | public data quota | baeaafd7 |
| 0172 | reward authorization hardening | ae7d71e9 |
| 0173 | effective LLM consent | ae7d71e9 |
| 0174 | reasoning proxy reservation claim | ae7d71e9 |
| 0175 | account export rate limit | ae7d71e9 |
| 0176 | LLM global capacity guard | ae7d71e9 |
| 0177 | reward SSV tickets final | 58d1399b |
| 0178 | records client request id | 58d1399b |
| 0179 | audit outbox idempotency | 58d1399b |
| 0180 | LLM capacity retention | 58d1399b |
| 0181 | client audit ingest | 58d1399b |

0172~0176은 ae7d71e9, 0177~0181은 58d1399b에서 정확히 5 SQL 파일씩이며 worktree는 clean이다.
static/ACL/constraints/migration-readiness/secret/diff 검사가 통과했다. psql, Docker, 운영 DB 적용, push는 0건이다.

### 다음 provisional 매핑

| 번호 | 목적 | 권위 소스 |
|---:|---|---|
| 0182 | peer response atomicity | f363af94 final |
| 0183 | Naver rate limit | 1ddbff4c combined final, f363의 옛 Naver 사용 금지 |
| 0184 | billing self-service | dc7ba553 final |
| 0185 | LLM purpose quota | f363af94 final |
| 0186 | account deletion | 0565f4c0 |
| 0187 | knowledge HTTPS | e10663bf |

0169 RSS와 0170 peer-rate는 독립 로컬 후보다. 0171은 public quota다.
0182 이후 번호는 현재 로컬 스캔에서 비었지만 **새 파일을 쓰기 직전과 push 직전에**
origin/main, 모든 open PR, 모든 remote/local branch를 다시 스캔한다. 충돌하면 번호를 재배정하고
파일명·헤더·내부 참조·테스트를 함께 바꾼다. 어떤 production DB apply도 코딩 세션이 하지 않는다.

예전 source chain 참고:
- 4e756a26: 옛 0148~0152 import
- 25c5d3df: 옛 0148, 0151, 0152 hardening
- 45d28ae4 + c32237dc: 옛 0153~0157 import+final hardening
- e3e3f9d0 + f363af94: 옛 0158, 0160, 0162 import+final hardening
- 49ded0a9: reward SSV ticket final
최종 통합 branch의 renumbered 파일을 우선하며 옛 번호를 그대로 되살리지 않는다.

## 7. Native encrypted storage 다음 정확한 작업

현재 clean HEAD는 3f05defc다.

- bee94d82: encrypted native storage core + expo-secure-store package/app plugin 반영
- b0e81d28: React Native Supabase auth session adapter와 storage recovery core
- 3f05defc: recovery proof/pending keys까지 native에서 암호화
- 공유 node_modules에는 expo-secure-store가 설치되지 않아 실제 native runtime 검증은 아직 불가능하다.
  require는 lazy이고 테스트 virtual mock만 통과했다. npm install/ci를 현재 공유 설치본에 실행하지 않는다.

다음 AuthContext batch는 아직 clean-not-started다. 다음 계약을 지킨다.

1. recoveryReady, proof, pending, sessionUnavailable 상태를 보존한다.
2. getSession과 recovery marker read 양쪽의 **정확한 encrypted-storage 오류만** 분류한다.
3. unreadable old client에는 signOut을 절대 호출하지 않는다.
4. storageRecoveryRequired를 별도 상태로 노출하고 user/profile/isMinor/age를 null로 두되
   noteResolvedOwner(null)은 호출하지 않는다.
5. 사용자가 정확한 데이터 손실 동의를 2단계로 완료하면 storage recover → Supabase client reset →
   새 epoch/resubscribe/getSession 순서로 복구한다.
6. encrypted storage recovery UI는 recoveryReady signed-out/product gate보다 먼저 보여야 한다.
7. 테스트를 먼저 쓴다. 추천 첫 batch는 AuthContext.tsx + storage-recovery test +
   auth-bootstrap integration test 등 3~4파일이다.
8. UI 로케일은 en/ko/es/id/pt auth.json 다섯 파일을 별도 batch로 맞춘 뒤,
   component/layout/test를 최대 3파일로 만든다.
9. 데이터 손실 동의 없는 자동 삭제·초기화는 금지한다.

## 8. recorder/capture 수명주기 계약

권위 있는 순서:
8a4dc3bb → 8f12c625 → 6e44995c → 2ed2bad4 → 2a873ab3 → f625f7b5 → 30c20f1f

최종 상태:
- 앱 cache에 소유권이 확인된 파일만 read/transmit/delete한다.
- recorder는 3MB, MIME, idempotent cleanup, cancel/back/replacement/mode/unmount 계약을 가진다.
- image는 rejected downscale intermediate, stale/replacement/reset/mode/success/unmount를 정리한다.
- retryable OCR일 때 preview를 유지한다.
- provider/original/content/blob URI를 raw delete fallback으로 지우지 않는다.
- 로그는 phase-only이며 raw URI나 content를 남기지 않는다.
- focused 검사 53/53 + 30/30, full verify 596 suites / 6,540 tests, cycles 0.
- Expo ImagePicker/recorder 실기기 검증은 남았다. getInfo→delete TOCTOU는 원자화할 수 없어
  재검증 실패 시 안전하게 leak하도록 했다. 실제 파일 삭제 테스트는 하지 않았다.

## 9. 남은 두 큰 clean-port 작업

### Audit outbox

dirty TTL 구현은 권위 있는 완성본이 아니다. 새 clean branch에서 다음 계약을 독립적으로 구현한다.

- raw body 길이 선검증
- native encrypted storage
- WAL primary/recovery
- stable UUID와 idempotent RPC
- critical event는 memory-only ack 금지
- owner-scoped purge
- credential·raw content 없는 sanitized logs
- migration 0179 contract와 함께 정적/통합 테스트
- 기존 dirty 파일을 통째 cherry-pick하지 않고 요구사항별로 새 포팅

### Account local purge

dirty TTL 구현의 알려진 오류를 그대로 옮기지 않는다.

- import history key는 import.history:<owner>가 정본
- GitHub native state는 plain이 아니라 encrypted storage
- native retry 경로는 localStorage polyfill을 실제 native 저장소로 오인하지 않음
- untracked quick-draft를 임의 삭제 범위에 넣지 않음
- startup purge는 auth bootstrap 전에 수행
- local signOut/auth token retry는 기존 Supabase contract와 일치
- 서버 account deletion 0186과 local purge를 분리해 테스트
- 실제 계정·데이터 삭제 없이 mock으로 검증

## 10. package/lock 충돌

#1642 package/lock:
- query-string override가 decode-uri-component 0.5.0을 강제
- Metro 0.84.4

security dependency 56677960:
- community-cli-plugin 경로의 Metro/metro-config 0.84.5
- 옛 base라 decode override가 없음

native encrypted storage:
- expo-secure-store 약 56.0.4 dependency
- app plugin과 lock entries 필요

최종 수동 통합은 **decode 0.5.0 override + Metro/metro-config 0.84.5 override +
expo-secure-store package/app plugin/lock**을 모두 보존해야 한다. 어느 한 lockfile을 통째 덮어쓰지 않는다.
fast-xml-parser 5.7.0은 동일하다.

현재 E:\2ndB\node_modules를 가리키는 junction은 decode 0.2.2라서 통합 full verify의 유일한 알려진 실패를 만든다.
E:\2ndB\.worktrees\2ndB\vibe-native-prep-260906의 물리 node_modules는 0.5.0이고 해당 test가 통과했다.
공유 node_modules에서 npm install 또는 npm ci를 실행하지 않는다. 검증 환경을 바꿀 필요가 있으면 먼저 사용자와
활성 세션 영향을 확인하고 별도 안전한 설치본을 쓴다.

## 11. GitHub control-plane read-only 감사 결과

외부 상태라 새 세션에서 필요할 때 read-only 재확인하되, 지금까지 설정 변경은 0건이다.

- public repository
- environment: Production, github-pages, Preview
- Production은 admins bypass false, required reviewer Simon, prevent_self_review false, main policy
- github-pages와 Preview는 required reviewer가 없어 약함
- Operations / Android-Build environment 없음
- Production environment secrets/vars는 비어 있고 19개 secret이 repo-level
- main branch protection은 strict verify만 요구
- PR review, conversation resolution, signed commit, admin enforcement 없음
- force push와 delete는 off
- Actions all allowed, SHA pinning required false, default workflow permission read
- ruleset 없음

설정 하드닝과 repo secret의 environment 이동은 사용자의 secret 재입력·승인과 solo reviewer deadlock 검토가 필요하다.
코딩 세션이 임의 변경하지 않는다.

## 12. 공개 데이터 proxy 운영 순서

1. integration 직전 migration remote/open PR/local 전체 재스캔
2. Supabase secret은 **이름 존재만** 확인하고 값을 출력하지 않음
3. quota migration 적용
4. proxy를 verify_jwt=true로 deploy
5. 인증 성공·실패·quota·provider 오류 smoke
6. proxy-only client를 release
7. 사용자 명시 승인 뒤 public variables 제거와 MFDS/EXIM 키 회전

이 순서를 바꾸지 않는다. client가 먼저 나가거나 public key를 먼저 지우면 기능이 중단된다.

## 13. 추천 실행 순서

### A. 인수 상태 재검증

~~~powershell
git -C 'E:\2ndB' fetch --quiet origin main
git -C 'E:\2ndB' rev-parse origin/main
git -C 'E:\2ndB' status --short
git -C 'E:\2ndB\.worktrees\security-integration-260906' status --short
git -C 'E:\2ndB\.worktrees\security-integration-260906' log --oneline -8
git -C 'E:\2ndB\.worktrees\security-native-storage-integration-260906' status --short
git -C 'E:\2ndB\.worktrees\security-db-integration-260906' status --short
git -C 'E:\2ndB\.worktrees\security-recorder-temp-disposal-260906' status --short
~~~

불일치가 있으면 수정하지 말고 사용자에게 먼저 보고한다.

### B. 이어서 구현

1. DB batch C를 exact 5 files로 0182~0186 provisional 작성하고 static 검증.
2. 0187 knowledge HTTPS를 별도 작은 batch로 작성.
3. Native AuthContext RED test → 상태머신 → GREEN.
4. 5 locale consent UI batch와 component/layout batch.
5. recorder chain, import picker/history, GitHub handle/caller, notification, Paddle, LLM, workflow,
   CSP/supply-chain을 #1642 기반 clean integration 축으로 순서대로 이식.
6. audit outbox와 account local purge를 clean하게 새 구현.
7. package/lock 수동 3-way 통합.
8. 정상 dependency 설치본에서 full npm run verify, SQL dry-run, Android/iOS 실기기 QA.
9. 사용자에게 diff, 테스트, 남은 리스크를 제시하고 **push/PR 여부를 다시 묻는다.**
10. 승인받은 경우만 push/PR. 운영 적용은 콘솔 소유자에게 exact SQL, preflight, postflight를 인계한다.
11. proxy 배포와 smoke, native/web release, key rotation까지 끝나기 전 “보안 완료”라고 말하지 않는다.

각 cherry-pick 전 source commit의 파일 수와 현재 target diff를 확인한다. 충돌 해결에서 #1642 release semantics,
public-data changes, package overrides를 보존한다. 여러 source commit을 한 에이전트가 무차별 cherry-pick하지 않는다.

## 14. 현재 검증 원장

- #1642: 코디네이터 보고 full verify 594 suites / 6,448 tests; 표시된 4 CI success
- public-data strict input: focused 32/32; lint/typecheck
- integration docs final: focused 7 suites / 70 tests; lint/typecheck/HTML/diff/secret
- recorder final: full verify 596 suites / 6,540 tests; cycles 0
- native import history와 GitHub handle: 각 full verify 통과
- native encrypted integration: focused test/lint/typecheck, full은 공유 decode mismatch 단 1건
- DB batches: static/ACL/constraints/migration-readiness/secret/diff 통과; psql/운영 apply 미실행
- 전체 통합 branch 하나에 대한 정상 dependency full verify, Android/iOS 실기기 QA, 운영 smoke는 **아직 없음**

## 15. 종료·보고 기준

다음 조건이 모두 충족되기 전 보안 작업 완료를 선언하지 않는다.

- 모든 선택된 보안 커밋이 최신 release base에 의도대로 통합
- full npm run verify 전체 green, runtime require cycles 0
- migration collision 재스캔과 SQL 검증 완료
- 사용자 승인 뒤 PR/CI green 및 명시적 acceptance
- 콘솔 소유자가 DB migration과 proxy를 순서대로 적용·배포하고 postflight 통과
- web/Android/iOS 인증·실패·데이터 수명주기 smoke 통과
- public key 제거·회전 완료 및 값 비노출 증거
- 결제·개인정보의 남은 전문가 검토 또는 명시적 위험 수용 기록

사용자에게 보고할 때는 “로컬 배치 완료”, “통합 완료”, “CI 완료”, “운영 적용 완료”를 구분한다.
현재 단계는 **로컬 하드닝 후보 다수 완료, 통합·운영 미완료**다.
