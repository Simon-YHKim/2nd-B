# 2nd-Brain Handoff — 2026-09 보관 (p3)

> `docs/HANDOFF.md` 활성 창이 100KB 에 닿아 밀려난 블록을 **원문 그대로** 옮겨 둔 파일이다.
> 한 글자도 요약하지 않았다. `handoff/HANDOFF-2026-09-p2.md` 가 94KB 로 차서 이 파일을 열었다.
> 새 블록은 활성 창(`docs/HANDOFF.md`) 맨 위에 얹는다 — 이 파일에 직접 쓰지 않는다.

최초 생성 2026-09-28 07:39 KST · Claude Code (TTL-Work_rev2, PolaScope)

---

## 2026-09-25 / 동의 철회·후속 GUI 통합 완료 · 서버 승인 기록

- 2026-09-25 23:51:32 KST. 같은 통합 브랜치에서 후속 GUI 46개 파일을 SHA-256 snapshot과
  3-way로 통합했다. 원본 Observatory 및 첫 기록 안내 수정은 보존했다.
- 별도 8082 브라우저에서 320/425/768px 조작·촬영·취소·단일 이동·모션 줄이기 통과.
  페이지 예외 0, LLM 요청 0. 검사 후 자체 서버만 종료했고 기존 8081은 유지했다.
- 네 proxy의 서비스 동의를 호출 전후 같은 영수증·변경 번호로 검사한다. SQL은
  OFF→ON, 서버 작성 거절 영수증, Polaris 정산·환급·삭제 경합을 처리한다.
  실제 제공자 비용·감사 행은 보존한다. 기존 DB→HTTP 전달 사이의 경계는 남는다.
- 전체 **810 suites / 10,414 tests PASS**, 린트 오류 0·경고 71, 웹 **127문서 PASS**,
  Android Hermes export 및 로컬 Edge 타입 검사 PASS. 실제 PostgreSQL 동시성 회귀 통과.
  최초 전체 검사의 문서 인용 1건 실패를 고쳤고 실패 로그와 최종 로그를 모두 보존했다.
  후속 원격 CI에서 웹 전용 CSS 타입 오류를 발견해 명시적 web/native 교차 타입으로 수정했다.
  4e90bc81의 SQL CI는 통과했으며 새 head의 CI 결과는 PR에서 별도로 확인한다.
- **서버 선행 적용 승인 받음.** Grok 후속 보류는 유지한다. 콘솔 역할이 Grok 작업을
  가리킴을 설명했다. 새 번호 예약·Bot 전달·운영 DB 변경·Edge 배포는 아직 없다.
  재동의·철회 writer/UI와 활성 계정 coverage 등 verified-consent 활성화 조건도 남는다.
- [PR #1865](https://github.com/Simon-YHKim/2nd-B/pull/1865)는 Draft 유지.
  [통합 보고서](qa/qa-harness-integrated-260925.html) ·
  [후속 검증](qa/COMPLEMENT-EXECUTION-260925.md) ·
  [고정 소스 서버 인계 패키지](qa/SERVER-FIRST-1865-260925.md).
  인계 패키지의 21641bda와 새 동의 후속 코드를 혼합 배포하지 않는다.

---

## 2026-09-25 / GUI·AI 하네스 통합 검증 · 서버 선행 대기

- 22:56:34 KST, 기준 `ed2e54c8`. 검토 브랜치 `fix/qa-harness-integrated-260925`,
  워크트리 `E:/2ndB/.worktrees/qa-harness-integrated-260925`. Observatory 원본과 보완
  작업트리를 SHA-256 snapshot으로 보존한 뒤 통합했다. 원래 작업트리는 유지한다.
- `npm run verify`: **806 suites / 10,324 tests PASS**, UI 계약 76개, cycle 0.
  lint는 오류 0·경고 71개다. `verify:web` **127개 문서 PASS**, Edge 공통 코드 타입 PASS.
  첫 전체 실행에서 낡은 AST 테스트 호스트 11건이 실패했으며 새 lease/session 연결로
  고친 뒤 전체 재실행이 통과했다. 실패 로그도 보존했다.
- 실제 기존 8081 GUI 5개 화면 HTTP 200·오류 0·425px 넘침 0. QA 서버는 Brain,
  역할 카드 승인 1·제안 2개였다. 합성 QA 기록 1건을 실제 저장해 완료 안내를 확인했다.
  추가 LLM 호출은 없다. 홈 재접속 안내 숨김은 온보딩 redirect로 별도 미검증이다.
- 담은 대화 본문 누락, 자동 저장 철회·소급 저장, Polaris 승인 덮어쓰기·근거 불일치·
  원본 삭제 경합을 수정했다. Paddle 환경/DB/가격/계정/CSP, GA4 동의·성공 시점,
  광고 SSV·플랫폼 단위, 처리방침/email-v4 가입 계약을 통합했다. 로컬 실제 SQL 통과.
- [Draft PR #1865](https://github.com/Simon-YHKim/2nd-B/pull/1865)에 커밋·push했다.
  서버 선행 조건 때문에 Draft를 유지하며 병합·운영 배포는 실행하지 않았다.
- **운영 적용 전이다.** 신규 가입 status RPC는 현재 서버에 없어 게시가 차단된다.
  Polaris와 가입 SQL은 미번호 draft다. DB·Edge·기능 활성화는 콘솔 소유이며,
  [서버 선행 순서](SESSION-OWNERSHIP.md)를 마치기 전 병합하지 않는다.
  실제 Paddle sandbox 결제·갱신·환불, 일반 사용자 생성·실모델 인용·GA4 수신·
  실기기 확인이 남았다. 서비스 동의 v2 호출 중 철회 재검증도 활성화 조건이다.
- Grok 후속 `vb-243be209`는 사용자 지시로 **나중에** 처리한다. 재전송·대기하지 않는다.
  [통합 보고서](qa/qa-harness-integrated-260925.html) ·
  [검증 기록](qa/COMPLEMENT-EXECUTION-260925.md) ·
  [Paddle runbook](PADDLE-SANDBOX-RUNBOOK.md). 로그는 통합 트리 `Output/`에 있다.

---

## 2026-09-25 / Grok 회신 반영 · 실제 GUI 코치마크 수정

- 20:17 KST 후속 점검. `origin/main`은 여전히 `ed2e54c8`. 광고·한도 보완 작업트리는
  `grok-qa-complement-260925`이며 기존 774 suites / 9,971 tests 및 웹 126문서 통과는
  아래 새벽 코드 범위의 검증이다. 이번 GUI 수정은 다른 미커밋 기능 위에 적용했다.
- Grok Relay `vb-2e14b97d`의 01:27 회신을 수신·nonce 대조했다. 네 코드 경로 검토에서
  결함을 보고하지 않았지만 테스트 재실행·콘솔 스크린샷은 없다. 01:24 운영 관측은
  rewarded Edge v86 구 직접 지급 방식, 티켓 테이블·발급 RPC 없음이었다. 현재 상태로
  단정하지 않는다. `SESSION-OWNERSHIP.md`에 0172 → 0177 → 번호 예약한 hardening,
  네 RPC와 ACL 및 구 콜백 drain을 명시했다. 관련 migration 계약 검사 10개 통과.
- 다른 GPT QA는 16:41 갱신됐다. 승인된 계정 초기화·서버 Brain, 입력 기록 9건,
  참고 기록 8건, 모의 생성과 실제 생성 실패를 구분해 보고한다. 그 기능은
  `localhost-260921-287e56f1`의 미커밋 GUI다. 18:16 이후 현재 8081은
  `observatory-260925`로 교체됐다. 두 브랜치의 페르소나·quota 구현을 혼동하지 않는다.
- 코치마크는 입력 단계에서 실제 저장 버튼을 누르면 완료가 빠졌고, 저장 대기 중
  건너뛰면 완료 후 다시 나타났다. 실제 저장 성공을 기준으로 처리하고 최신 상태를 읽게
  수정했다. QA 당시 localhost 및 동일 소스였던 현재 observatory에 작은 패치만 적용했다.
  각 작업트리 관련 5 suites / 22 tests·타입 검사·변경 파일 lint 통과.
  새 원점의 재등장은 localStorage 범위이며 계정 동기화를 추가한 것은 아니다.
- localhost의 역할 카드 생성에 read/build/synthesize/persist 단계와 허용 분류·HTTP 상태만
  남기는 진단을 추가했다. 기존 번역 UI를 유지하고 원문·토큰·cause를 로그/오류에 보유하지 않는다.
  21개 테스트·타입 검사 통과. 기존 lint 경고 1건은 보존. 실제 live 실패 원인은 미확정이며
  관측 개선을 생성 성공으로 보고하지 않는다. observatory의 별도 역할 카드 구현은 변경하지 않았다.
- GUI 기존 변경의 원본 바이트·SHA256은 `Output/grok-qa-260925/coachmark-before`,
  `persona-before`, `observatory-coachmark-before`에 있다. 이번 변경만 담은
  [코치마크 패치](qa/patches/first-record-coach-260925.patch),
  [페르소나 진단 패치](qa/patches/persona-diagnostics-260925.patch)와
  [상세 결과](qa/grok-qa-complement-260925.html)를 참고한다. 기존 QA 원본·DB·프로세스는
  변경하지 않았다. 현재 변경은 미커밋이며 push·병합·운영 배포를 실행하지 않았다.
- 신규 후속 과제 `vb-243be209`는 20:14 Relay 수신함에 게시했다. 기존 회신을 재전송한
  것이 아니다. 운영 persona 목적 계약·실패 상태 및 AdMob 미확인 항목을 읽기 전용으로 요청했다.
  `E:/2ndB/.bots/relay/outbox/vb-243be209.result.md`의 정확한 nonce를 대조해 이어간다.

---

## 2026-09-25 / Grok 초안 대조 · 광고 SSV 및 AI 한도 안내 보완

- 작성 2026-09-25 01:06:50 KST. 기준 `origin/main` `ed2e54c8`. 전용 워크트리
  `E:/2ndB/.worktrees/grok-qa-complement-260925`, 브랜치 `fix/grok-qa-complement-260925`.
  현재 변경은 로컬 미커밋이며 push·PR·병합·운영 배포는 실행하지 않았다.
- Grok의 `E:/2ndB/docs/drafts` 초안 3개를 대조했다. 플랫폼별 광고 ID 선택, 숫자형
  SSV 콜백 정규화, 실제 광고 단위와 티켓 결속을 수정했다. 콘솔 확인용 무주체 요청은
  서명을 검증하고 보상·DB 접근 없이 응답한다. isolate당 60초 4건·동시 1건 제한.
- 실제 free 서버 한도가 거절하는데 클라이언트 Brain 250회 소진이라고 알리는 문제를
  재현·수정했다. 서버 cap이 미제공이면 `limit:null` 및 계정 한도 안내를 반환한다.
  5개 언어 번역과 변경된 코드 위치를 인용하는 DPIA 문서·검사도 갱신했다.
- 최종 `npm run verify` 종료코드 0: 774 suites / 9,971 tests, UI 계약 76개,
  require cycle 0. `npm run verify:web`: 126개 문서 PASS. Edge 별도 타입 검사 PASS.
  첫 실행의 DB 셸 테스트 일시 실패 1건은 단독 및 최종 전체 재실행에서 통과했으며 원인은 미확정.
- 공개 웹은 새 Chrome에서 HTTP 200·로그인 화면·pageerror 0건. 로그인 후 동작 및 서빙
  소스 SHA 검증을 뜻하지 않는다. 다른 GPT QA 문서는 미입력·AI 미호출 상태였고
  `127.0.0.1:8081`은 이번 조회에서 연결 거부였다. 기존 QA 파일·계정 데이터를 변경하지 않았다.
- Paddle sandbox는 요청 query만 나누면 운영 DB를 갱신하므로 그대로 구현하지 않았다.
  GA4는 동의 로딩과 auth 성공 지점·PII 허용 필드·중복 계약이 필요하다. 처리방침은
  본문과 판본·signup revision·서버 허용 튜플을 한 단위로 진행해야 한다.
- Grok 과제 nonce `vb-2e14b97d`는 사용자의 준비 완료 확인 및 전달 지시에 따라
  2026-09-25 01:17:26 KST `E:/2ndB/.bots/relay/inbox/`에 게시했다. 코드 검토 워크트리와
  QA 원본 경로를 포함했다. 수신 확인·결과 회신은 아직 없으며 중복 발송하지 않는다.
  기존 planner `NO_ELIGIBLE_ROUTE` 기록은 보존했고 guarded adapter 실행·계정/요금 검증으로
  기록하지 않았다. 전달 근거와 파일 해시는 `Output/grok-qa-260925/bot-delivery-receipt.json`.
  회신 경로는 `E:/2ndB/.bots/relay/outbox/vb-2e14b97d.result.md`.
  같은 벤더 리뷰는 받았지만 다른 벤더 리뷰는 회신 대기다.
- [보완 보고서와 QA 판정표](qa/grok-qa-complement-260925.html).
  검사 로그·경로 판정·화면은 `Output/grok-qa-260925/`(gitignored)에 있다.
  운영 담당은 [SSV 전환 절차](SESSION-OWNERSHIP.md)의 티켓 drain·서버 선행·canary를 따른다.
  다음 실제 AI QA는 원문→위키→인용, 동의 철회, 승인 전 미확정, 안전 차단, 목적별 호출
  수와 실제 서버 등급을 각각 증명해야 한다. UI 8동작을 AI 8호출로 세지 않는다.

---

## 2026-09-25 / 0.9.0 후속 PR 세 건 병합 · 빌드 검증 · Orca 인수 종료

### 어디까지 왔나

- 이 인수 블록 작성 전 `origin/main`은 `00ebbcd2dd3da0e3c1c35b5c3e4806829c161a9a`.
- 지난 작업에서 [#1853](https://github.com/Simon-YHKim/2nd-B/pull/1853) DB 0189 rollback과 0190 ledger 동기화(`41ca441a`), [#1862](https://github.com/Simon-YHKim/2nd-B/pull/1862) 지역 판독 불가 가입 복구(`9299919d`), [#1861](https://github.com/Simon-YHKim/2nd-B/pull/1861) 릴리스 산출물의 소스 커밋 결속(`00ebbcd2`)을 순서대로 squash merge했다. 그 전 [#1859](https://github.com/Simon-YHKim/2nd-B/pull/1859)는 병렬 Jest의 em dash probe 경합을 닫았다.
- 최종 PR #1861의 `lint`·`verify`·`web-export-smoke`가 통과했다. 2026-09-25 이 인수 문서 워크트리에서도 `npm run verify` 종료코드 0(773 suites / 9,934 tests, UI 계약 76개, 런타임 require cycle 0)을 확인했다. 최종 main의 [웹 빌드](https://github.com/Simon-YHKim/2nd-B/actions/runs/35749867119), [Android 진단 APK](https://github.com/Simon-YHKim/2nd-B/actions/runs/35749867073)(ABI 검사·업로드 포함), [EAS Update gate](https://github.com/Simon-YHKim/2nd-B/actions/runs/35749867081)가 모두 통과했다.
- 웹 워크플로의 Pages `deploy` job과 EAS `update` job은 건너뛰었다. 운영 Pages 게시, EAS 업데이트 발행, GitHub Release·태그 생성은 실행하지 않았다. `app.json`은 #1857에서 0.9.0으로 컷됐지만, 2026-09-25 조회한 최신 정식 GitHub Release는 여전히 v0.8.0이다.
- Orca `run_e3a3e38558ab`: 2026-09-25 재조회에서 143/143 작업 `completed`, 열린 결정 게이트 0. 재할당 뒤 남은 중복 상태 7건에는 대체 작업·병합 SHA 근거를 기록했다.
- 원래 워크트리 `E:/2ndB/.worktrees/2ndB/TTL-Work_rev2`의 `scripts/capture-screens.mjs` 미커밋 변경 1건은 기존 사용자 작업으로 보존했다. 이 인수 문서는 별도 `handoff/20260925-0024` 워크트리에서 작성한다.

### 활성 인프라와 경계

- 웹 배포 대상은 GitHub Pages `https://simon-yhkim.github.io/2nd-B/`이다. 2026-09-25 조회 시 마지막 성공한 수동 게시 워크플로는 [run 34162560585](https://github.com/Simon-YHKim/2nd-B/actions/runs/34162560585)(2026-09-08 KST)였다. 이 조회는 실제 서빙 번들의 소스 SHA를 증명하지 않으므로, 게시 결정을 할 때 워크플로 입력과 서빙 번들을 다시 대조한다.
- 저장소 GitHub Secrets 이름 목록에 `RELEASE_APP_CLIENT_ID`·`RELEASE_APP_PRIVATE_KEY`가 없고, 저장소 ruleset 목록도 비어 있었다(2026-09-25 읽기 전용 조회). 릴리스 워크플로는 이 자격증명이 없으면 닫힌다. 값은 인수 문서에 기록하지 않는다.
- Supabase 대상 식별자는 기존 문서와 공개 설정의 `zoacryukmdeivmolvyhj`다. 이번 세션에서 운영 마이그레이션 적용 상태나 백업 복원 상태는 재검증하지 않았다. `docs/SESSION-OWNERSHIP.md`에 따라 운영 DB·Edge·시크릿은 콘솔 세션이 소유한다.
- 원격 기능 브랜치와 워크트리는 삭제하지 않았다. 열린 PR은 2026-09-25 조회 기준 draft [#1814](https://github.com/Simon-YHKim/2nd-B/pull/1814), [#1839](https://github.com/Simon-YHKim/2nd-B/pull/1839) 두 건이다.

### 다음 작업 큐

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | 0.9.0 실제 배포 전 웹의 지역 판독 불가 가입 흐름과 Android 진단 APK를 대화형으로 QA하고, 게시 소스 SHA를 확인 | medium | ⭐ 빌드 통과와 실제 사용자 흐름 검증 사이의 빈칸을 먼저 닫는다 |
| B | 릴리스용 GitHub App 자격증명·태그 ruleset을 준비하고, 수동 Pages 게시·GitHub Release·새 네이티브 전달의 범위와 승인 시점을 결정 | medium | 프로덕션 변경은 별도 실행 단계다. #1861의 릴리스 게이트와 #1857의 0.9.0 컷을 출발점으로 삼는다 |
| C | 국가별 서버 연령 하한(현재 서버 공통 14)과 약관·동의 판본을 설계·검증 | large | 클라이언트의 63개국 표만으로 직접 API 경로를 강제하지 못한다. 약관 본문·판본·signup revision·서버 허용 튜플은 한 단위로 다룬다 |
| D | draft #1814·#1839의 서버 조정 의존성과 운영 DB 0189/0190 적용 순서, 백업 복원 훈련 상태를 각각 소유 트랙에서 재확인 | medium | 오래된 HANDOFF의 적용 상태를 현재 운영 사실로 간주하지 않는다 |

### 적용 중인 정책

1. `main` 직접 push 금지. `E:/2ndB/.worktrees/` 안의 전용 워크트리에서 작업하고 PR로 병합한다. 다른 워크트리의 미커밋 변경과 `node_modules` 정션을 보존한다.
2. 운영 DB·Edge·시크릿은 콘솔 세션 소유다. 서버 계약을 확인하고 클라이언트를 활성화한다. 운영 게시·릴리스·유료 빌드·브랜치 삭제는 해당 범위의 명시적 위임을 확인한다.
3. PR 병합과 운영 게시를 같은 상태로 적지 않는다. 웹은 `main` push에서 빌드하고 수동 게시한다. CI는 `npm run verify`를 그대로 호출한다.
4. 인수 이력은 요약·삭제하지 않는다. `docs/HANDOFF.md`의 최신 블록 하나만 `Latest`를 붙이고 100KB를 넘으면 `docs/handoff/`에 원문 그대로 굴린다.

### 핵심 파일과 검증

```text
CLAUDE.md                                프로젝트 규칙 정본
docs/HANDOFF.md                          활성 인수 창
docs/SESSION-OWNERSHIP.md                운영·코딩 세션 경계
docs/CONSTRAINTS.md                      가입 하한 등 하드 제약
src/lib/auth/consent-age.ts              국가별 가입 하한 판정
.github/workflows/github-release.yml    릴리스 산출물 provenance 게이트
.github/workflows/web-deploy.yml        웹 빌드·수동 게시 게이트
```

앱 변경 검증은 `npm run verify`. 이번 인수 문서만 바꾸는 작업에서는 링크·`Latest` 유일성·100KB 상한·`git diff --check`와 새 PR의 CI를 확인한다.

### 다음 세션 시작하는 법

```bash
git fetch origin main
git show origin/main:docs/HANDOFF.md
```

현재 브랜치가 미커밋 상태일 수 있으므로 읽기 위해 `git pull`로 그 브랜치를 바꾸지 않는다. 위 A부터 시작하되 실제 운영·GitHub 상태를 다시 읽는다.
