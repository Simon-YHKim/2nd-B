# 2nd-Brain Handoff

> 가장 최신 섹션이 맨 위. 2026-06-16 이전 sprint 핸드오프는 [handoff/ARCHIVE-2026-05-25_to_2026-06-16.md](handoff/ARCHIVE-2026-05-25_to_2026-06-16.md) 로 아카이브됨(2026-07-03).
> Live: <https://simon-yhkim.github.io/2nd-B/>

## 이 로그는 기간으로 쪼개져 있다

단일 파일 100KB 상한(Simon 지침 §2 · §0-1)을 지키려고 **요약이 아니라 기간으로**
나눴다. 이 파일은 **활성 창**이고, 밀려난 블록은 아래 파일에 원문 그대로 있다.
한 글자도 요약하지 않았다.

| 덮는 기간 | 파일 | 블록 | 크기 |
|---|---|---|---|
| 2026-09-08 ~ 2026-09-13 | [handoff/HANDOFF-2026-09-p2.md](handoff/HANDOFF-2026-09-p2.md) | 3 | 16KB |
| 2026-09-01 ~ 2026-09-08 (+09-13 인계 1) | [handoff/HANDOFF-2026-09.md](handoff/HANDOFF-2026-09.md) | 18 | 92KB |
| 2026-08-25 ~ 2026-08-30 | [handoff/HANDOFF-2026-08-p4.md](handoff/HANDOFF-2026-08-p4.md) | 11 | 89KB |
| 2026-08-23 ~ 2026-08-25 | [handoff/HANDOFF-2026-08-p3.md](handoff/HANDOFF-2026-08-p3.md) | 21 | 85KB |
| 2026-08-20 ~ 2026-08-23 | [handoff/HANDOFF-2026-08-p2.md](handoff/HANDOFF-2026-08-p2.md) | 14 | 82KB |
| 2026-08-18 ~ 2026-08-20 | [handoff/HANDOFF-2026-08-p1.md](handoff/HANDOFF-2026-08-p1.md) | 7 | 46KB |
| 2026-07-03 ~ 2026-07-31 | [handoff/HANDOFF-2026-07-p3.md](handoff/HANDOFF-2026-07-p3.md) | 15 | 89KB |
| 2026-07-03 ~ 2026-07-11 | [handoff/HANDOFF-2026-07-p2.md](handoff/HANDOFF-2026-07-p2.md) | 16 | 88KB |
| 2026-07-01 ~ 2026-07-02 | [handoff/HANDOFF-2026-07-p1.md](handoff/HANDOFF-2026-07-p1.md) | 11 | 45KB |
| 2026-06-19 ~ 2026-06-27 | [handoff/HANDOFF-2026-06.md](handoff/HANDOFF-2026-06.md) | 20 | 86KB |
| ~2026-06-16 | [handoff/ARCHIVE-2026-05-25_to_2026-06-16.md](handoff/ARCHIVE-2026-05-25_to_2026-06-16.md) | - | - |

**새 블록은 이 파일 맨 위에 얹는다.** 이 파일이 100KB 에 닿으면 가장 오래된
블록부터 그 달의 보관 파일(부분이 있으면 번호가 가장 큰 것) 맨 위로 옮긴다.
**⚠ `HANDOFF-2026-09.md`(p1)는 92KB 로 찼다 — 09 월 블록은 `-p2` 로 간다.**
절차는 `/simon-handoff` 가 갖는다. **요약은 어느 단계에서도 하지 않는다.**

## Latest — 2026-09-26 / 잔여 검증·운영 인계

[잔여 작업·운영 감사](qa/REMAINING-WORK-260926.html). PR #1865 CI·첫 기록 브라우저 PASS. 운영 계약 미적용·전체 DB 리허설 미실행·Android 앱 실행 미검증. Grok 보류.

## 2026-09-26 / 관측소 녹음 오디오

- 녹음 효과음·로드 대기·중단·셔터 사전 준비를 통합했다.
- [검증과 재현](qa/AUDIO-INTEGRATION-260926.md). 운영 미적용·Grok 보류.

## 2026-09-26 / 삭제 등록부 후속 승격 보완

- 새 표 4개의 분류와 registry-only 초안, 역사 0189를 보존하는 G7을 추가했다.
- 실제 SQL 및 70표 정적 승격 검증 통과. 전체 catalog·CLI 왕복은 실제 승격 후 확인한다.
- [승격 절차](qa/ERASURE-FORWARD-260926.md). 서버 승인 유지·Grok 보류·운영 미적용.

## 2026-09-26 / 재동의·철회 화면과 서버 계약 구현

- 같은 PR #1865에 서비스 동의 writer/status/coverage, `/service-consent` 화면,
  collect/enforce 및 동의 오류의 provider 재시도 차단을 구현했다.
- 실제 SQL, Edge handler, 계정 전환·CAS·선택 동의 보존 회귀와 320/425/768px
  브라우저 검증을 수행했다. 브라우저 동의 응답은 fixture이며 운영 저장은 아니다.
- [최신 보고서](qa/service-consent-260926.html) · [계약과 적용 순서](qa/SERVICE-CONSENT-260926.md).
  전체 814 suites / 10,606 tests와 웹 128문서 PASS. 원격 CI는 PR의 해당 head에서 확인한다.
- 서버 승인 유지·Grok 보류·운영 미적용. 기존 21641bda 패키지와 혼합하지 않는다.
  운영 coverage·canary·Paddle/모델/GA4/실기기 검증은 남는다.

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

---

## 2026-09-21 새벽 / 게이트 둘이 같은 결함을 각자 찾았고, 세 번째 라운드에서 규칙의 유통기한이 발동했다 · 0.9.0 을 컷했다

**최종 갱신 2026-09-21 03:40 KST · Claude Code `673dc58f` · 워크트리 `E:/2ndB/.worktrees/qa-integration-260920`**

### 지금까지

**#1855(나라별 가입 연령)를 머지했다 — `225cf7eb`.** 자기동의 연령이 3덩어리(KR 14 / US 13 / EU 16)에서
**63개국 표**로 바뀌었고, 나라를 못 놓으면 **18**(예전 KR 14 아님)이다. 표는 **생성물**이다 — 첫 줄이
`// 생성물 — 손으로 고치지 말 것` 이고 원본 `age-table.json` 의 sha256 과 생성 스크립트 경로가 머리에
박혀 있다(§0-2). 화면 문구도 이제 **그 사람에게 실제 적용된 나이**를 말한다.

**#1857 = 0.9.0 컷.** `8f7743c4`. v0.8.0 이후 **172개**(머지 커밋 제외) 중 **69개(40%)** 가
보안 · 법무 · 인증 · 가드다(법무 28 · 보안 18 · 가드 12 · 인증 11). 바꾼 파일은 둘 —
`app.json` version 한 줄과 `CHANGELOG.md`. `versionCode`·`buildNumber` 는 건드리지 않았다
(`eas.json` `appVersionSource: remote` → EAS 소유).

**로컬호스트를 그 main 으로 갱신했다** — <http://127.0.0.1:8765/2nd-B/> · `expo export --clear` rc=0 ·
347파일 · root/legal 200 · 공유 카드 메타 확인.

### 이번 구간에서 배운 것 — 게이트 둘이 **각자** 같은 결함을 찾았다

r56 재게이트에서 생성물 게이트의 **F-01** 과 비즈로직 게이트의 **R56-BIZ-01** 이 같은 것이었다:
**약관 본문을 바꾸면서 판본을 그대로 뒀다.** 제4조 ② 를 국가별 하한으로 고쳤는데 시행일 · 최종
개정일 · `TERMS_VERSION = "2026-08-16"` 이 그대로라, **내용이 다른 두 약관이 한 판본으로 식별된다.**

판본을 올리려면 signup revision + 서버 허용 튜플(`0150` `email-v3`)이 함께 움직여야 한다 —
마이그레이션이고, 이번 라운드는 금지였다. 그래서 **본문 변경을 되돌렸다.** 선택지는 둘뿐이었다:
틀린 본문을 판본과 함께 유지하거나, 맞는 본문을 판본 없이 출하하거나. **앞을 골랐다** — 이 앱은
어느 스토어에도 출시된 적이 없어 지금 약관에 동의하는 사람이 사실상 없고, **원장의 식별
가능성은 한 번 깨지면 되돌릴 수 없다.**

⚠ **게이트가 내 전제 하나를 정정했다.** 나는 `consent.json` 의 연령 밴드 문구를 미룬 이유로
*"`CONSENT_VERSION` 을 건드리면 기존 가입자 재고지가 걸린다"* 를 들었다. **코드와 다르다** —
`src/lib/supabase/consent.ts:55-58,84-85` 가 재동의 흐름이 없음을 명시한다. 미루는 판단 자체는
유지하지만(서버 계약 튜플 때문) **이유가 달랐다.**

함께 닫은 것 셋:

- **접근성 검사가 실제 바인딩을 안 봤다.** 게이트가 변이로 증명했다 — `BirthDateField.tsx:57` 의
  hint 를 `passwordHint` 로 바꿔도 10/10 초록이었다. 렌더러가 이 저장소에 없으므로
  (`auth-bootstrap-settlement.test.ts:13-14`) **한 `it` 안에 두 쪽을 묶었다**: JSX 속성을 AST 로
  읽어 키를 확인하고, 그 키를 실제 `initI18n()` 으로 TH 에서 그려 20 을 확인한다. **파일 해시로
  봉인하지 않았다** — 해시는 무관한 편집에도 울고, 정상 갱신 뒤 틀린 바인딩을 다시 놓친다.
- **DPIA `:598` 에 새 법적 결론이 섞였다** — *"무료 가입은 CCC s.22-24 독립행위로 볼 여지가 있다"*.
  사실 정정 범위를 넘는다. 빼고 `[COUNSEL TO CONFIRM]` 질문으로 옮겼다.
- **US 행이 없어 표값 13 → 실효 14 경계가 안 걸렸다.** 변이로 확인: `Expected: 14, Received: 13`.

⚠ **발주 때 적은 "실효 8파일" 주장은 철회한다.** 게이트가 실측으로 반박했다 — 재수정만 21파일이었다.

### #1853 — 세 번째 라운드에서 유통기한이 발동했다

r55 발주 때 *"또 새 계열 medium 이 나오면 규칙을 걷어내고 DB 검사만 남기는 쪽이 맞는지 판정에
포함하라"* 를 걸어 뒀다. **나왔고, 게이트 둘이 각자 판정을 내 같은 방향으로 수렴했다.**

- 생성물: *"정적 규칙 전체를 걷어내는 것은 권하지 않는다. 다만 **'10자 reason 이 c_names 를
  쓰레기통이 되지 않게 막는다'는 장치는 직접 반증됐다.** 주석은 설명이지 증거가 아니다."*
- 비즈로직: *"일반화된 정적 의존 추론과 수동 예외 판정 규칙은 철회하고 DB 왕복 중심으로 축소하라.
  기존 0189/0190 인가 · 영수증 · seed parity 검사까지 없애라는 뜻은 아니다."*

신규 medium 2 는 **둘 다 "양쪽 게이트가 함께 초록"** 계열이다:

1. **무관한 migration 을 `c_names` 에 넣고 재적용하면 다른 표의 값이 1→2 가 되어도 fingerprint 가
   같다.** 게다가 테스트가 **그 허용을 못 박고 있다** — `:770-803` 이 `CREATE TABLE public.notes` 만
   하는 파일과 `a sentence that reads like a reason` 을 만든 뒤 **거부 목록이 `[]` 임을 기대한다.**
2. **소유 시퀀스의 `RESTART WITH` 상태(`last_value`/`is_called`)와 ACL 이 fingerprint 밖이다.**
   평문 `GRANT` 만으로 정적 검사도 통과하고, 왕복 뒤 `USAGE` 가 사라져도 fingerprint 는 같다.
   이 반례는 helper 를 안 쓰므로 워크플로 `:383` 의 *"남은 구멍은 이전 helper + 다른 catalog 조합"*
   이라는 설명도 좁다.

**R57 을 발주했다**(fable @max — claude weekly 93% 로 1순위 강등). 성격은 기능 추가가 아니라
**주장 축소**다: 줄인 뒤에도 남는 구멍은 구멍이라고 적게 했다.

### 함정 하나 — 병렬 jest 는 우리 저장소에서 간헐 빨강이다

`npm run verify` 가 두 번 연속 빨강이었고 **매번 다른 스위트**였다. 원인은 변경이 아니라
`scripts/__tests__/check-no-emdash.test.ts:24` 가 `src/lib/emdash-guard-probe.generated.ts` 를
만들었다 지우는 동안, `src/**` 를 훑는 다른 스위트가 그 파일을 집어 `ENOENT` 로 죽는 것이다
(`canon-icon-crash.test.ts:202` · `lenses/__tests__/migration-readiness.test.ts`). `--runInBand` 는
**767 suites / 9,838 tests 전부 초록.**

⚠ `src/lib/persona/__tests__/one-seven.test.ts:68` 이 **같은 함정을 이미 이름으로 제외하고 있다** —
저장소가 한 번 맞고 **한 자리만** 고친 것이다. 계열 수정(`src/**` 열거자가 `*.generated.ts` 를
건너뛰게)은 별도 PR 로 남긴다.

### 다음 1개

**EAS 빌드 셋이 끝나면 `github-release.yml` 을 `profile=paired` 로 디스패치해 APK · AAB · IPA 를
0.9.0 Release 에 단다.** 빌드: APK `35529329922` · AAB `35529336717` · IPA `35529343237`.

### 막힌 것

- **약관 판본 라운드** — 약관 본문의 연령 자격 서술은 아직 옛 문장이다. 새 판본 + signup revision +
  서버 허용 튜플 마이그레이션이 **한 단위로** 움직여야 한다. `locales/*/consent.json:29,37` 도 같은 묶음.
- ~~**거주국 자기신고 UI**~~ — **이 브랜치에서 구현.** 기기 지역이 읽히지 않을 때만 이메일 가입과
  OAuth 프로필 완료에서 선택을 요구하고, 고른 표 행을 적용하며 "목록에 없음"은 18로 닫는다.
  읽힌 지역은 자기신고로 덮어쓰지 않는다. 선택은 거주 증명이 아니고 저장하지 않으며 서버 14 하한은 남는다.
- **DB 백업 복구 훈련** — 백업은 09-20 22:39 부터 다시 성공한다(1.6MB). 받아서 복원해 본 적은 없다.
  ⚠ 이전 실패의 원인은 **비밀값 부재가 아니라 풀러 5432 연결 실패**였다 — 내가 "비밀값 0개"라고
  보고한 것은 틀렸다.
- 나머지는 `STATE.md` 의 '막힌 것' 네 절.

### ⚠ 다음 세션에게 — HANDOFF 굴리기

이 블록을 얹으니 96.5KB 였다. `handoff/HANDOFF-2026-09.md`(p1)가 **이미 92KB** 라 더 못 받아서,
**`handoff/HANDOFF-2026-09-p2.md` 를 새로 열고** 가장 오래된 블록 셋(09-13 게시 조기 중단 ·
09-13 Owner B · 09-08 Fabric 백지)을 **원문 그대로** 옮겼다 — 활성 창은 **80.8KB**, 블록 수는
17 = 14 + 3 으로 보존된다(요약 0). 다음에 100KB 에 닿으면 **p2 로** 옮기고, p2 도 차면 p3 을 연다.

## 2026-09-20 밤 / 게이트가 찾은 것을 닫았고, 우리 검사가 무엇을 증명한 적 없는지 알아냈다

### 결론

R48 게이트가 낸 발견을 r49 가 닫았고, r49 게이트 둘이 통과시켰다. 머지 넷:
`c0b6e0b6`(기록 정정) · `48e1e9f1`(#1851 · `0190`) · `3b787951`(#1849) · #1852(기록).

**이 밤의 값어치는 수정이 아니라 발견이다.** #1847 은 `erase_my_data` 를 "잠근 채
배송한다"고 적었는데 **사실이 아니었고**, 그걸 지킨다던 회귀 단언은 **CI 에서 공허하게
초록**이었다. 두 가지를 한 번에 고쳤다.

### 무엇이 틀렸나 — 실측

`REVOKE EXECUTE ... FROM PUBLIC, anon` 은 **`authenticated` 를 막지 못한다.** Supabase 의
default privileges 가 새 함수마다 세 역할에 **이름으로** EXECUTE 를 주기 때문이다
(`scripts/check-definer-grants.ts:3-8` 이 **이미 그렇게 적고 있었다** — 몰랐던 게 아니라
규칙 B 가 `anon` 만 강제하고 있었다).

운영 읽기 전용 대조(2026-09-20 20:0x KST · `zoacryukmdeivmolvyhj`):

| 확인 | 값 |
|---|---|
| public 함수 중 `proacl` 에 `authenticated=X` 가 명시된 것 | **242 / 291** |
| `FROM anon` 만 REVOKE 한 함수 6개의 authenticated EXECUTE | **6/6 = true** |
| 운영에 적용된 `0189` | **0건**(함수도 없음) |

살아 있는 구멍이었던 적은 없다 — 0189 가 운영에 올라간 적이 없다.

### 검사가 공허했던 이유, 그리고 고친 방법

r46 이 넣은 `has_function_privilege('authenticated', …) = false` 는 CI scratch DB 에서
**REVOKE 가 없어도 false** 였다. 부트스트랩이 role 만 만들고 위 default privileges 를
깔지 않았기 때문이다. **바닥이 없으면 단언이 아무것도 증명하지 않는다.**

`#1851` 이 세 겹으로 닫았다:

1. `.github/workflows/supabase-dry-run.yml` Seed 끝(첫 마이그레이션 **전**)에
   `ALTER DEFAULT PRIVILEGES … GRANT EXECUTE ON FUNCTIONS TO anon, authenticated`.
2. 회귀 블록 (L)이 프로브 함수의 `aclexplode(proacl)` 로 **바닥의 실재를 먼저 증명**한
   뒤에만 결론을 낸다. 바닥이 없으면 초록이 아니라 **빨강**이다.
3. `0190` 이 `FROM PUBLIC, anon, authenticated` 를 걷고, **적용 시점에 스스로 끝 상태를
   확인하는 `DO` 블록**을 둔다(클라이언트 역할이 하나라도 남으면 마이그레이션이 멈춘다).

변이 8변종을 임시 PostgreSQL 18.3 에서 돌린 출력 전문이
`E:/Coding Infra/reports/vibe-r260920/r49-lock-erase-authenticated/result.md` 에 있다.
핵심 한 줄: **바닥 OFF + REVOKE 제거 → 초록이고 `SHIPS LOCKED` 를 인쇄한다(= main 의 그때 상태).**

⚠ `service_role` 은 **일부러 안 걷었다.** 주장은 "아무에게도 없다"가 아니라
**"클라이언트 역할(PUBLIC·anon·authenticated)에게 없다"** 이다. 이 문장을 넓혀 인용하지 말 것.

### #1849 — F-01 은 라이브 유출이 아니다. 그렇게 적지 말 것

게이트 둘이 **정반대로 판정했고 둘 다 부분적으로 옳았다.** 생성물은 위키 화면
**본체 로직**을 봤고(본체만 떼어 A→B 를 먹이면 `listedPages=['a-out','b-in']` 로 재현),
비즈로직은 **배송된 트리**를 봤다(`_layout.tsx` 의 `AccountScope` 가 계정 epoch 마다
전 제품 화면을 리마운트해 그 상태가 B 에게 읽히기 전에 폐기된다).

본체를 고쳤고, **"오늘의 라이브 유출을 막았다"고는 적지 않는다.** 비즈로직 게이트도
같은 판정을 명시했다. 다만 그 껍데기 방어는 **강제되지 않는다** —
`<Stack.Screen layout={…}>`·`<Stack.Group>` 로 우회해도 `account-scope.test.ts` 는
네비게이터 문자열만 봐서 울지 않는다(A-EX-01).

발주는 `linkedPage` 한 행만 울타리였는데 워커가 범위를 넓혔다: 같은 화면의
`pages`/`edges` 가 계정이 바뀌어도 초기화되지 않고 네트워크가 답할 때까지 **이전 계정의
200행 전체**를 그리고 있었다. 한 행만 막고 "계정 울타리"라고 적으면 다음 세션이 믿는다.

### 다음 사람이 반드시 알아야 할 것 — 적용 순서

**두 medium 이 열려 있다. 코드가 아니라 적용 절차 문제다.**

- **B-EX-01**: `rollback/0189_down.sql:118-133` 이 ledger 에서 `erasure_registry` **한 행만**
  지운다. 되돌린 뒤 `db push` 하면 0189 만 재적용되고 0190 은 "이미 적용됨"으로 건너뛰어
  **함수가 열린 채 되살아난다.** 게이트 둘이 각각 재현했다.
- **B-EX-02**: **"0189 와 0190 을 함께 넘기면 된다"는 충분하지 않다.** Supabase CLI 2.116.0 은
  파일마다 각각 트랜잭션을 돌리고 바깥 트랜잭션이 없다. 중간 상태에서
  `erase_my_data('content') → status=ok` 가 실행으로 확인됐다.
  대응책 후보: ① 두 파일을 **한 psql 세션의 한 트랜잭션**으로 수동 적용 ② 적용 직전
  `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS` 로 바닥을 잠시 걷었다 복원.
  생성물 게이트는 **0189:403 에도 authenticated 를 추가**하는 세 번째 안을 냈는데,
  그건 머지된 마이그레이션 수정이라 **Simon 확인 없이 하지 않는다.**

지금 당장의 위험은 낮다 — 운영에 0189·0190 둘 다 미적용이고
**`erase_my_data` 를 부르는 클라이언트 코드가 `src/`·`supabase/` 에 0건**이다.

### 기록 결함 하나를 고쳤다

`DECISIONS.md` 의 `26.09.21` 다섯 줄은 **오기**였다. 그 줄들이 든 커밋 `9d2f1b8b` 의
author 시각은 **2026-09-20 19:26 KST** 이고, #1847 머지(`623cb0a9`)는 **09-20 19:20** 이다.
쓸 때 시계가 약 **+6시간 40분** 앞섰다. append-only 라 원문은 두고 정정 줄을 덧붙였고,
`STATE.md` 와 이 파일의 헤더는 고쳤다.
**잡는 법: 의심되는 줄이 든 커밋의 author 시각과 대조한다.**
시각은 `powershell -NoProfile -Command "(Get-Date).ToString('yyyy-MM-dd HH:mm:ss')"` 로만 잰다.

### Orca 함정 하나

codex 게이트 둘이 **프롬프트를 입력창에 쥔 채** 안 떴다. 겉으로는 세 증상으로 보였다
(`ok=True` + `nudge: 터미널 핸들 없음` / `cli_failed rc=1` / `task_not_startable … blocked`).
**원인은 하나**고, `/vibe` 의 자동 nudge 가 `worker-list` 에서만 핸들을 찾다가 그 목록이
비어 조용히 건너뛴 것이다. `orca terminal list` 에서 **제목이 워크트리 이름뿐이고
상태줄에 레인·effort 가 찍힌** 터미널을 찾아 `terminal send --enter` 하나로 둘 다 시작했다.

### 다음 1개

**법역 결정(Simon 대기)** — 나라를 모를 때의 가입 하한. 스토어 연령 등급 · 데이터 안전
양식 · 약관 · DPIA 가 전부 이 값을 인용하므로 그 넷이 이 답을 기다린다.
결정 시트는 Simon 에게 전달됐다(선택 4건).

그다음이 **r50 묶음 다섯**: B-EX-01 대응책 · `ANDROID_QA_GUIDELINES.md:38-39` 재정정(이 문서는
연속 두 번 틀렸다) · `AccountScope` 우회 가드 · `DeepSpaceDesignScreens.tsx:219` 의
`useWikiGraphData` 사본 울타리 · `storage-recovery.ts:12` 법무 인용 오기
(실제 인용 대상은 `AuthContext.tsx:53·153` 이다 — 그 주석을 믿고 AuthContext 를 편집하면
법무 인용이 조용히 밀린다).

### 보고서

- `E:/Coding Infra/reports/vibe-r260920/r49-*/` — 워커 2 · 게이트 2
- `r48-jurisdiction/findings.md` — 법역 조사 371줄(11개 시장 + EU 31개국 1차 원문)
- 법역 결정 시트 HTML — Simon 전달본(99.7KB · 외부 참조 0)

## 2026-09-20 저녁(정정: 원래 '09-21 새벽' 으로 적혀 있었다 — 쓸 때 시계가 +6h40m 앞섬) / 삭제를 서버가 소유하게 만든 PR 을 8회차 게이트 끝에 머지했다 · 출시는 `global` 로 간다

### 결론

- **main = `623cb0a9`. PR #1847 머지** — Simon 확정 결정 1·4(삭제 · 복구를 서버가 조정 · 전체 삭제는 서버 정책으로)의 1단계다. 삭제 등록부 **66행**(client_erasable 26 / retained 27 / account_delete_only 13) · `erase_my_data` RPC · 공개 영수증 계약 · **CI 실DB 회귀**(26표 전수 · 무조건 DELETE 탐침 · 양방향 sweep · 질문 단위 하위트랜잭션) · 정적 가드 G1~G10.
- ⚠ **RPC 는 권한 0 으로 배송된다(SHIPS LOCKED).** `GRANT EXECUTE ... TO authenticated` 가 없다. 이유는 8차 게이트가 찾은 것 — 26표를 **순차로** 지우는 동안 같은 사용자의 다른 세션이 **이미 지나간 표**에 넣은 행이 살아남아 `status=ok` 영수증이 거짓이 된다. 서버 울타리 · 세대(설계서 S3-C · S3-D)가 들어온 뒤에 연다. 그 조건은 `0189` 5절에 적혀 있다.
- **게이트를 8회차까지 돌렸고, 두 레인이 스스로 닫았다.** 추이: H1 M4 → M4 L2 → 인가 PASS + M2 → H1 M2 + M3 L1 → H1 M1 L1 + M1 L1 → H1 M1 + M2 → H1 M2 + M1 → **M2 + M2**. 런타임(`erase_my_data` · 분류 · 보존 · 쿼터)은 **여덟 번 연속 새 결함 0**이고, 발견은 전부 **이 PR 이 도입한 안전망**에서 나왔다. 4차에서 코디네이터가 패치를 멈추고 **판정 권한을 정적 가드에서 카탈로그 · 역할 관측으로 옮겼다**(설계 변경). 그 뒤 발견은 관측의 정확도 문제로 바뀌었다.
- **Simon 판단 ①**(주장을 줄이고 머지): 가드 머리에 **증명하는 것 / 증명하지 않는 것 / 알려진 사각 전량 / "THIS LIST IS NOT COMPLETE" / 초록을 삭제 인가 PASS 로 인용 금지**를 적었다. 게이트도 같은 틀을 제시했다 — "머지는 '현재 런타임 회귀 없음과 추가된 제한적 검사'를 받아들이는 결정일 수 있다. 그것을 '삭제 인가를 일반적으로 증명한 PASS' 로 기록해서는 안 된다."
- **이월 Q-S1 이 닫혔다 — 출시는 `global`**(Simon). 그로써 두 가지가 잠재에서 실재로 바뀐다: ① `jurisdictionForCountry` 가 **KR · US · EEA+UK 만** 매핑하고 미인식 폴백이 `DEFAULT`(16)가 아니라 **KR(14)** 이라, 일본 · 브라질 · 인도 등의 14세가 한국 기준으로 자기동의한다 ② `src/lib/billing/` 에 **미성년 게이트가 0건**이다.
- **출시 차단 실측 41행**(막음 7 · 불명 17 · 안막음 17). global 기준 필수는 **DPIA 완성 · 서명**과 **법역 신호 보정**, 그리고 **운영 백업 복구**다. 나머지 넷은 그 기능을 켤 때 조건. ⚠ 낡은 진단 셋이 반증됐다 — "법역 판정이 항상 KR"(아님) · "0179 필수 의존"(아님) · "스토어 자료 전무"(아님).

### 지금 도는 것

`r48-fix-live-bugs`(main 버그 넷 · TDD) · `r48-jurisdiction`(나라별 연령 1차 출처) · Grok Bot 콘솔 과제서 2장 대기(Play Console `vb-a53e2ef2` · App Store Connect `vb-dbaec979`).

### 다음 세션이 먼저 읽을 것

`STATE.md`(네 절) · 이 블록 · `DECISIONS.md` 26.09.20 08:45 ~ 26.09.21 02:05 줄. 보고서: <https://claude.ai/artifact/G31qLaEceXPHeNZuvDczhV>(PR #1847 결정) · <https://claude.ai/artifact/YYEwq9tfHN6W7qyyWdpTQz>(Simon 카드 3장).

---

## 2026-09-20 06:0x / QA 산출물을 지금 main(`585aac5f`)으로 맞춤

### 결론

- **QA 웹 · QA APK 가 `c91ebcbb` 에 멈춰 있었다.** 그 뒤 #1841(`2dce7ead`)과 기록 PR #1843(`585aac5f`)이 들어갔으므로, 그대로 QA 하면 **#1841 이전 동작**(가져오기 철회가 다른 가져오기의 원본까지 삭제)을 보게 된다. 둘 다 지금 main 으로 다시 만들었다.
- **웹** — 워크트리 `qa-integration-260920` fast-forward(변경 0) → `expo export --clear`(347 파일 · 40MB) → `http://127.0.0.1:8765/2nd-B/` 재기동(`entry-a8d8d24d`) → headless Chrome 으로 **로그인 화면 렌더 · 콘솔 오류 0**.
- **APK** — `qa-apk-260920` fast-forward → **네이티브 파일 무변경 확인**(`app.json` · `package.json` · `android/` · `patches/` 0건)이라 `--skip-prebuild` → gradle 134초 → 66.6MB · arm64-v8a · 번들 10.9MB(새 로케일 키 확인). **서명 `6053a4c7…` · versionCode 40 = 앞 QA 앱과 같음**(apksigner · aapt2) → 데이터 유지 덮어 설치.
- **공개** — 사전 릴리스 [`qa-260920-585aac5f`](https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260920-585aac5f) · 앞 빌드 `qa-260920-c91ebcbb` 본문 맨 위에 대체 안내. **이번 커밋 자체의 에뮬레이터 확인은 하지 않았다**(네이티브 무변경 · `c423ba88` 확인으로 대신) — 릴리스 본문에도 그렇게 적었다.
- 바뀐 것은 QA 산출물뿐이다. **결정 대기 상태는 그대로** — 아래 블록이 그 판이다.

## 2026-09-20 새벽 / 게이트 통과 PR 17개 머지 · 남은 draft 둘(#1814 · #1839)은 서버 조정 결정 대기

### 결론

- **main = `2dce7ead`. 09-19 20:16 ~ 09-20 05:41 에 17개 머지** — 전부 보안 게이트 두 레인(daybreak 생성물 · astra 인가, critical · high · medium 0) 뒤: #1819 · #1810 · **#1833**(Android 두 번째 실행 Loading 멈춤) · #1828 · #1831 · #1826 · #1825 · #1827 · #1829 · #1830 · #1836 · **#1835**(이중 실패 출구 · Simon 확정 ① N=3) · #1837 · #1838 · **#1840** · **#1842**(복구 세션 승격 울타리 두 겹) · **#1841**(가져오기 허브 중복 id 철회가 다른 행을 지우던 것 — #1839 보다 먼저).
- **main 네이티브 확인** — x86_64 `c423ba88` 에뮬레이터: 실행 1 + 강제 종료 재실행 3 = Loading 없음 · 세션 유지 · FATAL 0 · 인증 경고 0(03:33). 캡처 `E:/Coding Infra/reports/qa-260919/main-c423ba88-launch*.png`.
- **남은 draft 둘 — 둘 다 클라이언트 수정 라운드를 멈췄다** — #1839(설정 삭제가 원문까지 · 2차에서 멈춤 — 1차 5건 닫자 2차 새 6건) · #1814(자동 저장 되돌리기 · 8차에서 멈춤 — **8차 수정이 회귀를 만들었다**: 10초 상한이 SDK 잠금을 못 풀어 로그인 · 로그아웃이 멈출 수 있음. 다시 이어가면 이것부터 되돌린다). 클라이언트 표식으로 여러 경로를 조율하는 구조의 한계.
- **Simon 보고서(결정 7건 + 이월 Q-S1)**: <https://claude.ai/artifact/H7KGVqSjXj27NxEVdhQXWs>. 핵심은 결정 1번 — 삭제 · 복구를 서버에서 조정(S3) · 추천 ①(02:53 에 ②에서 바꿈).

### 막힌 것

| 무엇 | 왜 | 풀리는 조건 |
|---|---|---|
| #1814 · #1839 머지 | 마지막 틈(행 없는 원문 · 늦은 재업로드 · M2)은 서버 조정 없이 못 닫음 | Simon 결정 1번 |
| **DB 백업** | `Backup` 환경 비밀값 2개 빈 값 — 09-13 부터 실패 | **Simon — 09-26 쯤 복원본 0** |
| grok 레인 | 402 잔액 + 로그인 만료 | Simon — `grok` 로그인 · xAI 잔액 |
| 출시 법역 Q-S1 | 제품 · 법무 결정(기본값 불가) | Simon |

### 다음 단일 작업

**Simon 의 결정 1번 답을 받는다**(보고서 결정 탭) — ① 서버 조정이면 #1814 · #1839 를 서버 트랜잭션 위에서 다시 설계, ② ③ 이면 클라이언트로 이어 간다(#1814 는 회귀부터). G14 결정 시트: `E:/Coding Infra/reports/vibe-r260919/decision-sheet-run_e3a3e38558ab.html`. 폰 QA 빌드 `qa-260920-c91ebcbb` 공개됨(#1841 전 main · #1814 없음).

### 이번 밤에 새로 밟은 것

- **astra 가 인증 검증에서 codex 사이버 출력 필터에 조용히 막힌다**(r27 · 39분 · worker_done 없음). 터미널을 읽어 확인하고 fable 로 옮겼다.
- **"멱등이라 범위 밖"을 믿지 말 것** — #1814 7차에서 cold 겹친 삭제가 새 원문을 지우는 것으로 반증.
- **정션 워크트리에서 `npm ci`(`qa_apk_build.py --reinstall`) 금지** — 공용 설치를 지운다. 워크트리를 지우기 전에 STATE 의 '남긴 것' 대조.
- 감시 스크립트는 다시 걸기 전에 살아 있는 것을 센다(두 개가 겹쳐 돈 적 있음).
- 쌓인 PR 이 아래 PR squash 뒤 DIRTY 면: 임시 워크트리에서 main 병합 → 충돌 파일은 main 판 → 자기 커밋 diff 재적용 → 순 diff 동일 확인 → force 없이 push.

## 2026-09-19 오전 / main 의 Android 빌드가 두 번째 실행부터 멈추던 결함을 고쳤다(#1833) — 머지는 오늘 밤 게이트 뒤

### 결론

- **#1807(09-13 보안 통합) 이후 main 의 모든 Android 빌드는 두 번째 실행부터 "Loading" 에서 영원히 멈춘다.** 첫 실행은 문제없이 열려서 부팅 확인으로는 안 보였다(09-18 공개 QA 빌드도 해당). 원인: `src/lib/storage/encrypted-native-storage.ts:905` 가 expo-crypto `AESSealedData.fromCombined` 에 base64 **문자열**을 넘긴다 — Android 는 바이트 전용(upstream `AesCryptoModule.kt:80`), iOS 는 문자열도 받는다(`AesCryptoModule.swift:78`). 복호화 실패 → fail-closed → 로컬 로그아웃도 같은 저장소라 실패 → `if (!closed) return` 으로 #1815 로더가 안 풀린다. 테스트 mock 이 "문자열이어야 한다"를 강제해 CI 는 초록이었다. iOS · 설치본 v0.8.0 · 웹은 무관.
- **수정은 draft PR [#1833](https://github.com/Simon-YHKim/2nd-B/pull/1833)** (`5931f140` · 2파일 · verify rc=0 · CI 초록): 봉인 값을 바이트로 풀어 넘긴다. 에뮬레이터 실측: 수정 전 100% 재현(재부팅 불필요 — force-stop 뒤 재실행만으로) → 수정 뒤 재실행 · 재부팅 정상 · **깨진 기기에 덮어 설치하면 데이터 삭제 없이 복구**.
- **공개 QA 빌드 [`qa-260919-640db5bd`](https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260919-640db5bd)** = main `a690b742` + 머지 대기 PR 11개(#1833 포함) · 테스트 키 · versionCode 40(v0.8.0 은 51 이라 그 위에 덮어 설치 안 됨). 09-18 QA 릴리스 안내문은 새 릴리스를 가리킨다.
- **남은 구조 구멍** — 저장소 읽기와 로컬 로그아웃이 **둘 다** 실패하면 여전히 출구가 없다(암호문 손상 · 키스토어 장애). Simon 이 결정 시트에서 고르지 않은 채 "남은 작업 모두 진행해"(09-19 11:2x)라 해서, 코디네이터가 추천안 ① A″(연속 3회 콜드 스타트 이중 실패 뒤에만 기존 복구 동의 화면)로 **draft 구현을 발주**했다(r14 · `claude/fix-auth-boot-exit-260919`). **머지는 Simon 확인 뒤.**

### 머지 대기 draft PR — 전부 보안 게이트 두 레인 대기

#1819 네이티브 부팅 · #1810 홈 별 이름 · #1814 자동 저장 재설계 · #1825 U5+U6 · #1826 U2+U3 · #1827 U4 · #1828 U1 · #1829 U7 · #1830 U8(#1829 위) · #1831 N1(#1828 위) · **#1833 Android 복호화** · r14 출구(Simon 확인 필요).
머지 전 확인 3건은 끝났다(#1825 · #1827 · #1829 코멘트): `secrets list -o json` 값 = 평문 SHA-256 · 운영 `PADDLE_API_BASE` 미설정 → 기본값 · Paddle 응답 `application/json`. 웹훅 요청의 Content-Type 은 간접 근거만(샌드박스 1회 — Simon).
⚠ **main 은 strict 보호**(필수 체크 `verify` + 최신 브랜치만 머지). BEHIND 인 PR 에 `gh pr merge --squash` 는 **머지되지 않고** 안내만 낸다 — `--auto` 를 쓰고 `state=MERGED` 를 확인한 뒤 다음으로 간다.

### 막힌 것

| 무엇 | 왜 | 풀리는 조건 |
|---|---|---|
| 보안 게이트 두 레인 · 머지 | codex 주간 99% | **09-19 19:47 KST 리셋** — 이 세션에 19:53 자기 예약(세션이 죽었으면 다음 세션이 손으로) |
| **DB 백업** | `Backup` 환경 비밀값 2개(`BACKUP_PGDUMP_DATABASE_URL` · `BACKUP_PGDUMP_AGE_PUBLIC_KEY`) 빈 값 — 09-13 부터 매일 실패 · 마지막 성공 09-12 · 보존 14일 | **Simon — 09-26 쯤 복원본 0** |
| r14 출구 머지 | 결정 시트 1번 미응답 | Simon 확인 |
| JWT 서버 조치(D3) · Paddle 샌드박스 · 출시 법역 Q-S1 · Grok 계정 · gstack 업그레이드 시점 | 사람 몫 | Simon |

### 다음 단일 작업 (19:47 KST 뒤)

1. `orca account list --json` 으로 codex 리셋 확인 → `python ~/.claude/skills/vibe/scripts/check_tooling.py`(codex 0.155.1 이 09-19 11:2x 기준 최신).
2. 게이트 두 레인(daybreak @xhigh 생성물 · astra @xhigh 인가)을 **#1833 부터** 돌린다. 코딩 레인이 claude 라 G1 충족.
3. 통과분 머지(쌓인 순서 #1828→#1831 · #1829→#1830). #1819 머지 전에는 main 에 `[ota]`/`[release]` 커밋 · Android 릴리스 금지.
4. 머지 뒤 main push 진단 APK 로 **설치 → 실행 → force-stop → 재실행**까지 본다(첫 실행만 보면 이번 결함을 못 잡는다).

### 로컬 QA 환경 (09-19 11:26 KST)

- 웹: <http://127.0.0.1:8765/2nd-B/> — 워크트리 `qa-integration-260918` 의 `dist/`(브랜치 `qa/integration-260919` = `640db5bd`) · 서버 `qa_static_server.js`(재부팅하면 꺼진다).
- 에뮬레이터: Orca 의 `2ndB_Codex_API36_260727`(emulator-5554)에는 **v0.8.0** · `Pixel_9_Pro_XL` 에는 **QA 빌드 `640db5bd`**. Orca 1.4.200 은 에뮬레이터에 GPU 옵션을 안 넘겨 AVD 설정으로 우회 중(`E:/Coding Infra/tools/avd-guard/` · 시작프로그램 감시자).
- 로컬 APK 빌드: `python "E:/Coding Infra/tools/qa_apk_build.py" --wt <워크트리> --abi x86_64|arm64-v8a --tag <이름> [--skip-prebuild]`.

### 증거

- 보고서: <https://claude.ai/artifact/8qYXcdSTkMYNzUaN5ZXfbh>(Android 멈춤 · 결정 2건) · `E:/Coding Infra/reports/vibe-r260919/r13-boot-hang/result.md` · QA 캡처 `E:/Coding Infra/reports/qa-260919/`.
- 결정 원장: `DECISIONS.md` 26.09.17 ~ 26.09.19 줄(09-13 ~ 09-16 은 `DECISIONS-2026-09-*.md` 보관) · 현황 `STATE.md`.
- 메모리: `reference_2ndb_android_relaunch_check` · `reference_2ndb_android_qc` · `feedback_2ndb_automerge`.

```text
2nd-Brain 09-19 게이트 라운드를 이어받아라.

1. E:/2ndB 의 git common dir 이 E:/2ndB/.git 인지 확인하고 CLAUDE.md · docs/HANDOFF.md Latest · DECISIONS.md 26.09.19 줄 · STATE.md 를 먼저 읽어라.
2. codex 주간 쿼터(usedPercent + resetsAt)가 풀렸는지 확인하라. 안 풀렸으면 게이트를 띄우지 마라.
3. /vibe 로 게이트 두 레인을 #1833 부터 draft PR 들에 돌려라. critical/high 0 · CI 초록이면 --auto squash 머지 뒤 state=MERGED 를 확인하라.
4. r14 출구 PR 은 Simon 확인 없이 머지하지 마라.
5. 머지 뒤 main 진단 APK 로 설치 → 실행 → force-stop → 재실행을 확인하고 DECISIONS 에 적어라.
6. DB 백업 비밀값 · JWT 서버 조치 · 운영 쓰기는 Simon/보안 담당 몫이다 — 대신 실행하지 마라.
```

---

## 2026-09-14 오후 / 안드로이드 두 결함의 원인을 좁혔고 수정은 draft PR #1819 — 게이트는 codex 리셋 뒤

### 결론

- **main 안드로이드 설치본은 켜자마자 멈춘다**(main 진단 APK `dbe4c1ab` 4/4 · `18ef7f43` 1/1, "Cannot read property 'add' of undefined"). 원인은 `e1fec159`(09-08)가 웹 탭 제목용 vendored `Helmet` 을 플랫폼 구분 없이 그린 것(`src/app/_layout.tsx`). **사용자 영향 0**: 최신 Release v0.8.0 = 09-07, 09-08 이후 OTA 발행 0회. ⚠ **수정이 main 에 들어가기 전에는 `[ota]`/`[release]` 커밋 · main 안드로이드 릴리스 금지.**
- **온보딩 Continue 뒤 백지(T1a 항목 1)** 는 v0.8.0 에서 재현되는 네이티브 결함이다. 기전(H1′): `PixelPressable` 누름/뗌 때 layout-only 래퍼의 평탄화가 바뀌어 자식이 재부모화되고, 그 커밋이 같은 제스처의 화면 제거(`router.replace`)와 한 마운트 배치로 병합되면 react-native-screens 제거 전환 때문에 `addViewAt … already has a parent` → RN 호스트 파괴. 실측: 탭 2/3 · 누른 채 떼기 3/3 · **키보드 ENTER 0/3** · 애니메이터 0 에서 2/3 · Ready 직후 탭 2/2.
- **수정은 draft PR [#1819](https://github.com/Simon-YHKim/2nd-B/pull/1819)** (HEAD `f7dcf30c`, 커밋 4 · verify rc=0 752 스위트 / 9,049 테스트 · CI 초록 · **머지 안 함**): Helmet 웹 전용 · `PixelPressable` 래퍼 `collapsable={false}` · 같은 누름 래퍼 5곳(설정 로그아웃 · 전체 삭제 경로 포함) · 저장소 전체 AST 재발 가드.
- **로그인 직후 `JWT issued at future`**(에뮬 로그인 24회 중 6): 시계 차가 아니라 PostgREST 시각 캐시로 보인다(Supabase 사건 `6q5902p2xd9f`, v14.18 리전별 적용 중 · 우리 프로젝트 해당은 추정). v0.8.0 · 09-07 웹은 재시도가 없어 로더에 멈출 수 있다. main #1811 재시도는 아직 어디에도 안 나갔다.

### 막힌 것

| 무엇 | 왜 | 풀리는 조건 |
|---|---|---|
| PR #1819 보안 게이트 둘 · 머지 | 게이트 두 레인(daybreak · astra)이 codex 주간 87% — /vibe G5 85% 금지선 | **토 19:47 KST 리셋** 또는 Simon 이 결정 시트 D2 ② 확정 |
| #1814 · #1810 · 후속 넷 | 같은 게이트 막힘 + Simon 결정(Q-260914-03 · Q-260914-02 · Q-260914-01 정정) | 리셋 + 결정 |
| JWT 서버 조치 | 운영 확인 · 지원 요청 · 재시작은 사람 몫 | 보안 담당/Simon — 결정 시트 D3 |
| main 웹 게시 | Simon 결정 D1(보안 담당 확인 뒤) | 결정 |

결정 시트(15판): <https://claude.ai/code/artifact/6d5c0c58-e6cd-46b7-b1e6-84233a1bd04f>

### 다음 단일 작업 (리셋 뒤)

1. `orca account list --json` 으로 codex `weekly.usedPercent` 와 `updatedAt` 을 **함께** 확인(낡은 값은 미확인 취급).
2. PR #1819 에 생성물 게이트(`gpt-daybreak-blue-latest` @xhigh) · 인가 게이트(`gpt-6-astra` @xhigh)를 띄운다 — 코딩 워커가 claude 라 G1 충족. codex 워커는 기동 뒤 입력창에 프롬프트가 걸려 있을 수 있으니 20초 뒤 Enter + 화면 `Working` 확인.
3. critical/high 0 · CI 초록이면 `gh pr ready` → `gh pr merge --squash --match-head-commit <HEAD>` (BEHIND 면 update-branch 뒤 CI 재대기).
4. 머지 뒤 main push 진단 APK(`android-release.yml` artifact)로 N0 부팅 3 · N1 Continue 탭 ≥3 · N2 누른 채 떼기 ≥3 · N3 Go to constellation ≥2 · N4 재기동 대조 2 · N5 설정 로그아웃. 절차: `E:/Coding Infra/reports/vibe-r260914/r4-t1a-e1/result.md`.

### 증거

- 보고서: `E:/Coding Infra/reports/vibe-r260914/` 의 `r4-t1a-onboarding` · `r4-t1a-addviewat` · `r4-t1a-e1` · `r5-jwt-future` (`result.md`).
- 결정 원장: `DECISIONS.md` 26.09.14 09:11 ~ 14:51 줄 · 현황: `STATE.md`.
- 메모리: `reference_2ndb_android_emu_dead`(누름/뗌 가르는 법 · 진단 APK 부팅 검사) · `reference_supabase_jwt_issued_at_future` · `reference_2ndb_legal_citation_line_drift`.

```text
2nd-Brain 안드로이드 수정 PR #1819 를 이어받아라.

1. E:/2ndB 의 git common dir 이 E:/2ndB/.git 인지 확인하고 CLAUDE.md · docs/HANDOFF.md Latest · DECISIONS.md 26.09.14 줄을 먼저 읽어라.
2. PR #1819 상태(draft · HEAD · CI)와 codex 주간 쿼터(usedPercent + updatedAt)를 재조회하라. 85% 이상이거나 값이 낡았으면 게이트를 띄우지 마라.
3. 게이트 둘(daybreak @xhigh · astra @xhigh)을 /vibe 로 띄우고 critical/high 0 · CI 초록이면 match-head-commit 으로 squash 머지하라.
4. 머지 전에는 main 에 [ota]/[release] 커밋 · 안드로이드 릴리스 금지.
5. 머지 뒤 main 진단 APK 로 N0~N5 를 r4-t1a-e1/result.md 절차대로 재고 결과를 DECISIONS 에 적어라.
6. JWT 서버 조치(결정 시트 D3)와 운영 쓰기는 보안 담당/Simon 몫이다 — 대신 실행하지 마라.
```

---

## 2026-09-14 / 보안 W1–W8 Git 통합 완료 — 운영 활성화는 별도 hold

### 결론

- 코드 PR **[#1807](https://github.com/Simon-YHKim/2nd-B/pull/1807)** 이 merge commit
  `18ef7f43cf735bc65e46da5c11334a9f688b475e`으로 `main`에 들어갔다.
- 중복 PKCE PR **[#1800](https://github.com/Simon-YHKim/2nd-B/pull/1800)** 은 `main`의
  PKCE + OTP-only recovery template/proof 경계를 확인하고 superseded로 닫았다. 브랜치는 보존했다.
- GitHub CI는 `lint` · `verify` · `web-export-smoke` · `sql` **4/4 성공**이다. `sql`은 아래
  번호 없는 draft 7개를 scratch PostgreSQL에서 실제 실행하고 rollback했다.
- 로컬 최종 검증은 `npm run verify` **740 suites / 8,865 tests**, `npm run verify:web`
  **126 static routes**, `npm audit` **취약점 0**이다. 런타임 require cycle도 0이다.
- D1 재고는 **35 branches / 95 occurrences**, evidence gap 0, 추가로 옮길 actionable patch 0이다.
  상세 Wave 기록은 아래 `2026-09-13 — 보안 W1–W8 로컬 통합 인계` 절에 있다.
- 이 결과는 **Git 소스 통합 완료**다. 운영 DB·Edge·Auth·secret·flag·Pages·live unit·canary·
  postflight는 실행하지 않았으므로 현재 상태는 **`productionComplete=false`**다.

### Simon 결정 D1–D5 반영

1. **D1** — 보안 재고를 W1–W8 큰 덩어리 순서로 전수 검토하고 #1807로 통합했다.
2. **D2** — Reward 자가지급 RPC의 운영 revoke는 이전 실행 기록만 있다. 이번 작업에서 재실행하거나
   운영 catalog로 재검증하지 않았다. 중복 실행하지 말고 catalog postflight로만 확인한다.
3. **D3** — `src/lib/supabase/client.ts`의 PKCE와 OTP-only recovery template/proof 경계가 함께 통합됐다.
4. **D4** — 낡은 Edge 함수의 운영 재배포는 미실행이며 광고 런치 전 필수다.
5. **D5** — Codex 전역 업데이트는 사후 승인됐다. 앞으로도 막혔을 때만 수행하고 사후 보고한다.

### 운영에 아직 적용되지 않은 DB draft 7개

1. `UNNUMBERED_account_deletion_completion_fence.sql`
2. `UNNUMBERED_effective_llm_consent_current_contract.sql`
3. `UNNUMBERED_oauth_naver_rate_limit_completion.sql`
4. `UNNUMBERED_paddle_refund_consequence_integrity.sql`
5. `UNNUMBERED_peer_response_rate_limit.sql`
6. `UNNUMBERED_reward_ssv_hardening.sql`
7. `UNNUMBERED_rss_proxy_quota.sql`

임의 번호를 붙이지 않는다. 모든 remote ref의 migration 번호를 다시 스캔하고 `max+1`을 예약한 뒤
reservation branch를 즉시 push한다. 각 draft는 behavior fixture와 rollout gate를 통과한 뒤에만
승격한다. 서버 활성화와 운영 쓰기는 계속 console owner 소유다.

### 다음 작업 큐

| # | 작업 | 판정 |
|---|---|---|
| A | remote migration 전수 스캔과 번호 예약 | **다음 단일 안전 작업** |
| B | Consent/Naver/RSS behavior fixture, Storage 2-connection race, Paddle 단일 `ON_ERROR_STOP` transaction, Deno-native check | 운영 전 필수 |
| C | console owner preflight → DB/Edge/Auth 순차 적용 | 별도 승인·중단 조건 준수 |
| D | Android/iOS live-unit QA → 제한 canary → postflight | 끝날 때까지 `productionComplete=false` |

### 증거와 새 세션 시작점

- 완료 보고서: `E:/2ndB/Output/260914_2ndB_security_pr_merge_handoff.html`
- 복사용 프롬프트: `E:/2ndB/Output/260914_2ndB_security_new_session_prompt.txt`
- Git 정본: 이 `docs/HANDOFF.md`

```text
2nd-Brain 보안 W1–W8 인계를 이어받아라.

1. E:/2ndB의 git common dir가 E:/2ndB/.git인지 확인하고 현재 checkout의 CLAUDE.md,
   session-start 정본, 최신 origin/main의 docs/HANDOFF.md Latest를 먼저 읽어라.
2. 최신 origin/main에서 E:/2ndB/.worktrees 아래 깨끗한 격리 worktree를 만들어라.
   정본 main이나 다른 세션 worktree를 편집하지 마라.
3. #1807의 merged 상태·merge SHA·CI 4개 성공과 main key files를 재조회하라.
4. #1800은 중복 PKCE PR이다. PKCE와 OTP-only recovery 경계 및 superseded closed 상태를 확인하라.
5. 7개 UNNUMBERED draft에 번호를 추측하지 마라. 모든 remote migration 번호를 재스캔하고
   max+1 reservation branch를 즉시 push하라.
6. 운영 DB·Edge·Auth·secret·flag·Pages·canary·live-unit은 console owner와 별도 승인 영역이다.
7. Reward RPC revoke는 기존 실행 기록만 있다. 재실행하지 말고 catalog postflight로 확인하라.
8. behavior fixture, Storage race, Paddle transaction, Deno-native check를 rollout gate로 완료하라.
9. DB/Edge/Auth/Android/iOS/canary/postflight 전에는 productionComplete=false이며
   “보안 완료”라고 보고하지 마라.
10. Git의 docs/HANDOFF.md가 정본이고 Output 보고서와 local state JSON은 보조 증거다.
11. 첫 응답에 현재 main SHA, merged PR, CI 4개 상태, console hold, 다음 단일 안전 작업을 보고하라.
```

---

## 2026-09-13 / 디스크 정리 끝(17곳 · 21.9 GB) — 재부팅 뒤 에뮬레이터 화면 검증

**재부팅 직후 새 세션이 이 블록 하나로 이어받게 썼다.** Simon 이 정리 뒤 컴퓨터를 한 번 껐다 켠다 — 떠 있던 claude · codex · 에뮬레이터는 전부 내려간다.

### 어디까지 왔나

- main HEAD: `586abb25` (이 블록을 담은 PR 머지 전 기준)
- 이번 세션: 디스크 정리 1·2차 끝. PR 은 이 인계 하나(브랜치 `claude/disk-cleanup-260913`)
- 📊 보고서: <https://claude.ai/code/artifact/db1d3e47-8280-426f-95d3-1cf67f2baf97> (요약 · 상세 · 결정 · 할 일 · 히스토리)
- 디스크(18:58 KST): **C: 24.8 → 28.6 GB · E: 22.4 → 35.5 GB 여유.** 지운 파일 크기 21.85 GiB
- 공용 `E:/2ndB/node_modules`: **747 → 747**(대상마다 정션 해제 뒤 · 삭제 뒤 두 번 셈) · `expo/package.json` 있음
- `STATE.md` 소유자: 이 세션(ttl-work-rev2-1c). ttl-work-9a 가 19:2x 에 넘겼다 — Simon 지명이 아니라 두 세션 합의(A7 은 여전히 Simon 몫)

### 무엇을 지웠나 — Simon 이 목록을 두 번 보고 승인

| 차수 | 대상 | 크기 |
|---|---|---|
| 1차 18:14~18:20 | 워크트리 12(pixelclay-260905 · runbook-1749 · capture-diag-260908 · 작은 것 9) + 미등록 클론 `portable-handoff-clone-260830-235814` | 7.7 GiB |
| 2차 18:50~18:57 | Orca Design(C:) · vibe-native-prep-260906 · vibe-clay-integration-260906(Orca 터미널 8개 닫고) · `E:/2ndB/android` 캐시 8폴더(07-04 이전) | 14.2 GiB |

로컬 브랜치는 하나도 안 지웠다. android 는 `app/build/outputs`(APK) · `src` · gradle 설정 · `debug.keystore` 를 남겼다.

### 구제본 — 지우지 말 것 (전부 저장소 밖)

```
E:/Coding Infra/_rescue/worktrees-260913-1807/     1차 · RESCUE_OK 13 · deleted.json · README
E:/Coding Infra/_rescue/worktrees-260913-1825-r2/  2차 · Design 미도달 커밋 9개 번들(verify 통과) · Output 421MB · 세션 ID 4
E:/Coding Infra/_rescue/skills-260913-1753/        ~/.claude/skills 의 vibe · simon-handoff 복사본 (git 에 없다)
E:/Coding Infra/_rescue/tools/cleanup-260913/      survey_v2 · rescue · delete 스크립트 + 조사 원본 JSON
```

⚠ `pixelclay-260905/ignored.tar` 안의 `.env` 는 시크릿이다. ⚠ `tar -tf` 는 경로 공백 때문에 셸에서 0건을 낸다 — python `tarfile` 로 볼 것.
지운 워크트리의 에이전트 세션은 다른 폴더에서 다시 열 수 있다: claude `4c781d42` · `5815969b` / codex `01a07681` · `01a07682` (전체 ID 는 2차 README).

### 손대지 않은 것과 이유

| 무엇 | 크기 | 이유 |
|---|---|---|
| security-* 104곳 | 16.8 GiB | 보안담당 소유. **이 기계에만 있는 커밋 162개**(37곳 합집합, 18:1x). 인계의 114 는 15:42 값 |
| TTL-Work | 15.2 GiB | claude 8 · codex 5 가동, 미커밋 771(구제본 있음) |
| `.npm-security-landing-260906` | 1.04 GiB | 등록 안 된 npm 사본. Simon 이 이번에 고르지 않음 |
| session-start-260906 | 0.15 GiB | `docs/session-start/setup.md` 가 이름으로 지목한 공유 자료 편집 워크트리 |
| prod-workflow-ref-gates-260913 | 0.15 GiB | codex 완료 작업, origin 에 없는 커밋 2 |
| handoff-split-260913 · legacy-archive-integrity-260913 | 0.3 GiB | 6시간 안 활동. handoff-split 은 ttl-work-9a 가 "clean · main 과 0줄 차이"라 알렸다 → 다음 라운드 후보 |

⚠ 선점 기록 `RELEASE-INTEGRATE-260906`(active, 주인 ttl-work-a1)은 **오늘 지운 vibe-native-prep-260906 을 가리킨다.** 남의 기록이라 고치지 않았다 — 그 워크트리를 찾지 말 것.
워크트리 수가 121(17:05) → 117(19:2x) 로 4개만 준 것은 모순이 아니다. 같은 구간에 `*-260913` 워크트리가 45 → 55 로 10개 늘었다(보안 세션). 등록됐는데 경로가 없는 워크트리는 0건이다.

### 인계 수치 정정 셋 (다음 세션이 헛수고하지 않도록)

- "위험 40곳 · 53.9GB" → **44곳 · 39.9GB.** 조사 도구가 E:/2ndB 를 잴 때 `.worktrees/*` 를 한 번 더 셌다
- 조사 도구의 `git status` 가 index.lock 을 잡았다. 두 버그 모두 ttl-work-9a 가 19:2x 에 `_rescue/tools/survey_worktrees.py` 에서 고쳤다(`.worktrees` 제외 · `--no-optional-locks`). ignored 파일 크기는 `survey_v2.py` 만 센다
- 보안 미푸시 114 → **162**(합집합, 18:1x). 계속 는다 — 인용할 때 잰 시각을 붙일 것

### 다음 작업 큐

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **안드로이드 에뮬레이터 화면 검증** — 재부팅이 5일째 굳어 있던 에뮬을 풀었다 | M | ⭐ 볼 화면 6곳과 근거는 바로 아래 "새 워크트리로 넘긴다" 블록의 표. x86_64 에뮬은 `preview-emulator` 프로필로 빌드 |
| B | 보안담당에게 커밋 162개 push 요청 | S | Simon → 보안담당. 보안 워크트리 정리의 선행(보고서 Q-260913-02) |
| C | `/vibe` · `/simon-handoff` 를 SimonK-stack 에 커밋 | S | Simon 승인 필요(Q-260913-03). 지금은 복사본뿐 |
| D | TTL-Work 미커밋 771건 처분 | L | 각 작업 주인. 구제본 `_rescue/ttl-work-260913-1554` |
| E | 남은 정리 후보 — C: Orca codex 세션 기록 중복 7.9GB 등(Q-260906-04 ≈11GB) · handoff-split-260913 | S | Simon 선택 |

### 적용 중인 정책 (영구) — 이번에 더한 것

1. **파일 삭제는 실행 직전 목록을 다시 보여 주고 승인받는다**(DECISIONS D7 조건). 1·2차 모두 그렇게 했다
2. **워크트리 삭제는 폴더 삭제 + `git worktree remove <없는 경로>`.** `orca worktree rm` 은 로컬 브랜치 삭제까지 시도한다(help 원문) · `--force` · `prune` 은 쓰지 않는다. Orca 카드는 스스로 사라진다
3. **사용 중 판정은 같은 부모 안에서 이름 바꾸기로 한다.** `orca terminal close --all` 의 `terminal_stop_live` 는 "남았다"도 "끝났다"도 아니다 — 폴더를 쥔 프로세스를 psutil 로 따로 센다
4. **codex 활동은 rollout 파일 하나로 판정하지 않는다.** 같은 ID 가 여러 날짜 폴더와 `AppData/Roaming/orca/codex-runtime-home` 에 흩어져 있다

앞 블록의 정책 1~7 은 그대로 유효하다.

### 검증

```bash
git -C E:/2ndB worktree list | wc -l                  # 117 전후 (보안 세션이 계속 늘린다)
ls -A E:/2ndB/node_modules | wc -l                    # 747
grep -c '^## Latest' docs/HANDOFF.md                  # 1
cat E:/2ndB/.git/2ndb-session-state/DISK-CLEANUP-260913.json   # status done
```

### 다음 세션 시작하는 법 (재부팅 뒤)

```bash
git -C E:/2ndB fetch origin main
git -C E:/2ndB worktree add .worktrees/<이름>-260914 -b claude/<주제>-260914 origin/main
# node_modules 정션은 PowerShell 스크립트 파일로 New-Item -ItemType Junction 후 reparse 속성 확인 (CLAUDE.md "Worktrees & branches")
cat STATE.md ; head -150 docs/HANDOFF.md ; tail -12 DECISIONS.md
adb devices                                           # 비었으면 에뮬부터 띄운다
```

---
## 2026-09-13 / 새 워크트리로 넘긴다 — 첫 일은 디스크, 그다음은 에뮬레이터 화면 검증

**이 블록 하나로 다른 워크트리에서 처음부터 일할 수 있게 썼다.** 앞 블록을 안 읽어도 된다.

### 어디까지 왔나

- main HEAD: `93849c42`
- 이번 세션 머지: **#1801**(HANDOFF 732KB → 기간 분할) · **#1802**(인수인계·현황·결정 원장 갱신)
- 열린 PR: **#1800**(PKCE) 하나 — CI 3/3 초록, **머지 조건이 코드리뷰가 아니라 에뮬 로그인 5종 확인**이고 그 담당이 없다
- 검사: `npm run verify` CI 초록 · `/vibe` selftest **132 PASS / 0 FAIL**
- 디스크: **C: 24.9GB · E: 23.2GB 남음** (17:05 KST) — 그래서 첫 일이 정리다

### 📊 결정용 보고서 (먼저 읽을 것)

**<https://claude.ai/code/artifact/ad6208ec-285e-4f81-b0ef-da4f69a14060>**

요약/결정 8건/상세/할 일/히스토리 5탭. 코딩 지식 없이도 읽히게 썼다. 다른 세션이
**작업 결정을 내리는 근거**로 쓰라고 Simon 이 지시했다(09-13 17:0x). 메모 사이드바의
`[메모 → 프롬프트 복사]` 가 회신 프롬프트를 조립해 준다.

---

### 첫 작업 — 디스크 정리 (Simon 지시, 09-13 17:0x)

> *"현재 작업중인 codex 세션을 제외하고서는 모두 정리해서 하드의 용량을 정리하는 작업부터 시작하게 하자."*

### 실측 (2026-09-13 17:05 KST · 워크트리 121개)

| 분류 | 개수 | 크기 | 처분 |
|---|---|---|---|
| **dirty>0 또는 unpushed>0** | 40 | 53.9 GB | ⛔ **지우면 사라진다** |
| dirty=0 · unpushed=0 | 81 | 12.8 GB | 후보 — 단 아래 예외 |
| 그중 `security-*` 계열 | 65 | — | ⛔ **소유자가 보안담당이다** |
| **진짜 정리 가능** | **16** | **~2.5 GB** | 아래 목록 |

`node_modules` 는 121개 중 **105개가 이미 정션**이라 잘 관리돼 있다. 실물은 7개뿐이고
그중 6개가 회수 대상(**~6 GB**) — 정본 `E:/2ndB/node_modules` 는 **남겨야 한다**(모두가 이걸 가리킨다).

```
실물 node_modules 7개:
  E:/2ndB                                     ← 정본. 건드리지 말 것
  C:/Users/202502/orca/workspaces/2ndB/Design ← Orca 워크스페이스. 소유자 확인 후
  .worktrees/2ndB/TTL-Work                    ← dirty 771 (구제 완료, 아래 참조)
  .worktrees/2ndB/pixelclay-260905            ← clean
  .worktrees/2ndB/vibe-native-prep-260906     ← clean · 572.8MB 로 최대
  .worktrees/runbook-1749                     ← clean
  .worktrees/security-static-supply-fix2-260913 ← unpush 35 ⛔
```

### ⛔ 지우기 전에 반드시 — 순서를 지킬 것

**2026-09-13 에 TTL-Work 하나에서만 미커밋 771건이 나왔고, 기록은 "남은 워크트리 0"이라
적고 있었다.** 목록 없이 지우면 그게 반복된다.

```
① 조사   python "E:/Coding Infra/_rescue/tools/survey_worktrees.py"   (읽기만 · 121개 전수)
② 구제   dirty>0 또는 unpushed>0 인 것은 먼저 스냅샷 (아래 절차)
③ 삭제   ①②를 통과한 것만
```

**구제 절차** (TTL-Work 에 실제로 쓴 것 — 재사용 가능):

```bash
# 공유 워크트리에서는 git add/commit/checkout/stash/clean 을 쓰지 않는다.
# 통째로 뜨려면: python "E:/Coding Infra/_rescue/tools/rescue_ttlwork.py" (SRC 만 바꾼다)
git -C <worktree> diff HEAD --binary > <dest>/tracked.patch
git -C <worktree> status --porcelain | grep '^?? ' | sed 's/^?? //' \
  | grep -vE '^(Output/|node_modules|dist/|\.expo/)' > /tmp/untracked.txt
tar -C <worktree> -cf <dest>/untracked.tar -T /tmp/untracked.txt
# 전후로 dirty 개수가 같은지 확인한다
```

**삭제 절차** — `git worktree remove --force` 를 **쓰지 않는다**:

```bash
# 정션을 먼저 끊는다. 안 끊으면 정션을 따라가 공용 node_modules 를 지운다(전례 있음)
cmd /c rmdir "E:\2ndB\.worktrees\<name>\node_modules"      # 정션이면 rmdir
git -C E:/2ndB worktree remove .worktrees/<name>            # --force 없이
git -C E:/2ndB worktree prune
```

### 건드리면 안 되는 것 — 실측 근거

| 무엇 | 왜 |
|---|---|
| **`security-*` 워크트리 99개** | 09-13 09:00 에 Simon 이 **보안 담당에게 직접 이관**했다. 브랜치 처분·머지·삭제 금지. **33개에 미푸시 커밋이 있고 최대 101개**다 |
| **지금 작업 중인 것** | 09-13 16:58·16:41·16:28 에 커밋이 찍혔다. 17:05 기준 **최근 6시간 안에 커밋된 워크트리가 36개** — 살아 있다 |
| **codex 세션** | 프로세스 8개 가동 중(CPU 113s·110s·58s·25s). Simon 이 명시적으로 제외하라고 했다 |
| **`E:/2ndB/node_modules`** | 정본. 105개 워크트리가 이걸 가리킨다 |
| **스태시 22개** | 공유다. 내용 미평가 상태로 넘겨져 있다. `git stash drop` 금지 |

### 이미 구제해 둔 것 — 다시 뜨지 말 것

```
E:/Coding Infra/_rescue/ttl-work-260913-1554/
  tracked.patch    3,966,891 B   수정 577파일 (audit-write-outbox 725줄 재작성본 포함)
  untracked.tar  140,789,760 B   951파일 (docs/quality 34 포함)
  README.md · status.txt
기준 HEAD bcd051ae · origin/main ebf7a04a (당시)
```

⚠ `tar -tf` 가 셸에서 **0건**을 낸다(경로에 공백). 빈 아카이브가 **아니다** — python 으로 951파일 확인했다.
⚠ tar 만 보면 절반을 놓친다. **추적 파일 수정분은 patch 쪽**에 있다.
⚠ 저장소 **밖**에 뒀다 — 앞선 백업 둘(`.worktrees/_backup/ttl-work-260907-*`)은 워크트리 안이라
정리하면 **백업까지 같이 사라진다.**

**TTL-Work 는 이제 지워도 되는가?** 구제본은 떴지만 **처분 판단은 안 했다.** 771건 중
무엇이 완성이고 무엇이 폐기인지는 각 작업의 소유자만 안다. **지우기 전에 소유자 확인.**
(단 구제본이 있으므로 잘못 지워도 복구 가능하다 — 그게 이 스냅샷의 목적이다.)

---

### 그다음 — 에뮬레이터로 화면 검증 (Simon 지시)

> *"아이폰, 안드로이드 폰 에뮬레이터를 적극 이용해서 화면 검증까지 할수 있게"*

### 안드로이드 — **된다. 지금 붙어 있다**

```
adb devices        → emulator-5554  device
AVD 6개            2ndB_Codex_API36_260727 · 2ndB_Codex_Debug_API36_260831
                   2ndB_Codex_Release_API36_260902 · 2ndB_Copy_260906
                   2ndB_QA_009 · Pixel_9_Pro_XL
SDK                C:\Users\202502\AppData\Local\Android\Sdk
앱 id              com.simonk.secondbrain
```

⚠ **17:12 KST 에 `adb shell` 이 응답하지 않았다**(120초 초과). `adb devices` 는 `device` 로
보이는데 셸이 안 열린다 = **에뮬이 5일째 떠 있어서 굳었을 가능성**. 첫 명령이 걸리면
에뮬을 재시작하고 시작할 것:

```bash
adb -s emulator-5554 emu kill
emulator -avd Pixel_9_Pro_XL -no-snapshot-load &   # 또는 2ndB_QA_009
adb wait-for-device && adb shell getprop sys.boot_completed   # 1 이 나올 때까지
```

⚠ **arm64 전용 출시 APK 는 x86_64 에뮬에서 안 돈다.** 에뮬용은 `preview-emulator`
프로필로 따로 빌드한다(`eas.json` 에 있다). 이 함정으로 "에뮬 QA 불가"라고 한 달간
잘못 적혀 있었다 — 09-08 에 정정됐다.

### 아이폰 — **이 기계에서는 시뮬레이터가 불가능하다. 솔직히 적는다**

```
uname -s   MINGW64_NT-10.0-26200     (Windows)
xcrun      없음
simctl     없음
```

iOS 시뮬레이터는 **macOS + Xcode 가 있어야만** 돈다. 이 기계에는 없다.
"아이폰 에뮬레이터로 검증하라"는 지시를 그대로 실행할 방법이 없으므로, **대신 쓸 수 있는
셋을 순서대로** 적는다:

| | 방법 | 무엇이 검증되나 | 필요한 것 |
|---|---|---|---|
| ① | **실기 iPhone + Expo dev client** (`npx expo start`, 같은 LAN 에서 QR) | 진짜 iOS 런타임·제스처·안전영역 전부 | Simon 의 iPhone 1대. **가장 빠르다** |
| ② | **EAS Build → TestFlight** | 실제 배포본과 같은 빌드 | Apple 계정 동작. 설정은 이미 있다 — `ascAppId 6792266942` · `appleTeamId 7CP84WS5C6` (`eas.json` submit.production) |
| ③ | **웹을 iPhone 뷰포트로** (Playwright/CDP, 390×844 등) | 레이아웃·잘림·대비만. **iOS 런타임은 아니다** | 없음. 지금 바로 가능 |

⚠ `eas.json` 에 **`ios-simulator` 빌드 프로필이 있다** — 그건 EAS 의 macOS 머신에서
*빌드*는 되지만 **여기서 *실행*은 안 된다.** 프로필이 있다고 "여기서 된다"로 읽지 말 것.

**권고**: ③으로 레이아웃을 먼저 훑고(비용 0), 진짜 판정이 필요한 화면만 ① 또는 ②로 올린다.

### 화면 검증에서 먼저 볼 것 — 근거 있는 후보

| 화면 | 무엇을 볼 것 | 근거 |
|---|---|---|
| 온보딩 Continue 직후 | **백지 + 강제 종료**(3회 중 2회, 자력 복구 없음) | Fabric `addViewAt … View already has a parent` → ReactHost 파괴. 기전 확정·컴포넌트 미확정. 09-08 이후 main 에 관련 커밋 0건 |
| `/account` · `/data` | 프로필 프로브 8초 타임아웃 시 **재시도 없는 스피너** | `account.tsx:43-53` · `data.tsx:149` 에 `onRetry` 0건. 대조군 `dds-audit-screen.tsx:289-296` 에는 있다 |
| `/privacy` | 안심 문구가 **안 보이는 것이 맞는지** 눈으로 | 승인된 5개 언어 문구가 번들에 있는데 `PrivacyLegacy()` 분기라 배포 4곳 전부 안 탄다 |
| 영어 담기 실패 | 안내가 **화면에 없는 버튼 이름**을 부른다 | `en.keepToWiki`="Save to wiki" vs `en.keepFailed`="tap **Keep to wiki**" |
| 홈 별 라벨(영어) | "Thirties and after" 잘림 | `ConstellationHome` 라벨 `numberOfLines={1}` + 폭 80px 고정. 한국어는 안 남 |
| OAuth 로그인 5종 | **#1800 머지의 실제 게이트** | 소셜 5종 통과를 확인해야 PKCE 를 넣는다. 되돌리기가 "PR revert" 가 아니라 설치된 앱의 로그인이다 |

---

### 다음 작업 큐

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **디스크 정리** — 조사 → 구제 → 삭제 (위 순서) | M | ⭐ Simon 이 "첫 일"로 지정. 남은 공간이 23GB 다 |
| B | **에뮬레이터 화면 검증** — 안드로이드부터, iPhone 은 ①③ 경로 | M | ⭐ 위 6개 후보에 근거가 다 붙어 있다 |
| C | 구제본 771건 **처분**(완성/폐기 가르기) | L | 유일본이다. 소유자 확인 필요 |
| D | 배송 홈이 `highlightRecordId` 를 읽게 | M | Simon 이 "받는 쪽부터"로 순서 지정. 되살리기 큐 전체의 선행 |
| E | 적대평가 2회차용 **어려운 probe** 추가 | S | 지금 자는 16/16 이라 레인을 못 가른다 |
| F | 미푸시 보안 커밋 114개 push | S | 보안담당 몫. 완성된 수정이 이 기계 한 대에만 있다 |

### Simon 결정 대기 8건 (나머지를 막는다)

A1 출시 법역(Q-S1 — DPIA A~H + 빌드 8종) · A2 마이그레이션 0171~0187 운영 적용 ·
A3 `community_is_member` 미바인딩(보안담당) · A4 웹 게시 승인(라이브가 **92커밋 뒤**) ·
A5 #1800 PKCE · A6 미확인 보안 브랜치 69갈래 방향 · A7 `STATE.md` 소유자 ·
A8 자살예방법 시행령 관찰자. **상세·선택지는 `STATE.md` 와 위 보고서 "결정 8" 탭.**

### 적용 중인 정책 (영구)

1. **공유 워크트리에서 `git add -A` · 맨 `stash`/`pop` · `checkout` · `restore` · `reset` 금지.**
   경로를 지정한 `add` 만. 남의 미커밋 작업을 끌고 가거나 삼킨다.
2. **`git worktree remove --force` 금지.** 정션을 따라가 공용 `node_modules` 를 지운다.
   정션을 먼저 `cmd /c rmdir` 로 끊는다.
3. **`docs/HANDOFF.md` 는 요약하지 않는다.** 100KB 에 닿으면 기간으로 굴린다
   (`/simon-handoff` Step 2-B). 활성 창 예산 80KB.
4. **`STATE.md` 는 한 세션만 쓴다**(덮어쓰기 파일). 다른 세션은 `DECISIONS.md` 에만 append.
5. **보안 트랙은 보안담당 소유**(09-13 Simon 직접 이관). 브랜치 처분·머지·삭제 금지.
   **피어를 경유한 승인은 승인이 아니다.**
6. **결정은 난 그 턴에 `DECISIONS.md` 에 쓴다**(§0-4). 세션 끝에 몰아 쓰면 그때는 날아가 있다.
7. **결정 시트는 `make_decision_sheet.py` 로만 만든다.** 손으로 조립하면 `decisions_run_*.json`
   이 안 나와 채택률 회수 경로가 통째로 없다(미회수 4건이 전부 이 경우였다).

### 핵심 파일 위치

```
STATE.md                          현황 네 절. 여기부터 읽는다
DECISIONS.md                      결정 원장 (append-only, 25행)
docs/HANDOFF.md                   이 로그의 활성 창
docs/handoff/HANDOFF-2026-*.md    기간 보관본 9개 (전부 100KB 미만)
E:/Coding Infra/_rescue/           워크트리 구제본 ← 지우지 말 것
~/.claude/skills/vibe/             4벤더 파이프라인 (git 밖이다 — 백업 없음)
~/.claude/skills/simon-handoff/    이 스킬 (git 밖이다)
eas.json                           build: preview-emulator / ios-simulator / production
```

⚠ **`~/.claude/skills/` 는 git 밖이다.** 오늘 `/vibe`(+29 검사)와 `/simon-handoff`(266→397줄)를
크게 고쳤는데 **버전 관리가 안 된다.** 백업 경로를 정하는 것이 미결 항목이다.

### 검증

```bash
npm run verify                                          # 저장소 전체
python ~/.claude/skills/vibe/scripts/selftest.py        # 132 PASS / 0 FAIL
python ~/.claude/skills/vibe/scripts/adversarial_eval.py --validate   # 8/8
grep -c '^## Latest' docs/HANDOFF.md                    # 1
find docs/HANDOFF.md docs/handoff -name 'HANDOFF-*.md' -size +100k    # 0건
adb devices                                             # emulator-5554 device
```

### 다음 세션 시작하는 법

```bash
# 1) 새 워크트리에서 (공유 워크트리에 들어가지 말 것)
git -C E:/2ndB worktree add .worktrees/<내이름>-260914 -b claude/<주제>-260914 origin/main
cd E:/2ndB/.worktrees/<내이름>-260914
cmd //c mklink /J node_modules E:\2ndB\node_modules      # 정션. 실물 복사 금지

# 2) 읽기 순서
cat STATE.md ; cat docs/HANDOFF.md ; tail -30 DECISIONS.md
# 결정 근거는 보고서: https://claude.ai/code/artifact/ad6208ec-285e-4f81-b0ef-da4f69a14060

# 3) A 작업(디스크 정리)부터 — 조사 → 구제 → 삭제 순서를 지킬 것
```

---
## 2026-09-13 / 감사 두 번을 돌렸더니, 기록이 "0"이라 적은 자리에 771건이 있었다

### 어디까지 왔나
- main HEAD: `ebf7a04a` (이 블록을 쓰는 시점)
- 이번 세션 머지된 PR: **#1801** docs(handoff): 732KB 로그를 기간 파일로 분할
- 열린 PR: **#1800**(PKCE) 하나 — CI 3/3 초록, 머지 조건이 코드리뷰가 아니라 **에뮬 검증**인데 담당이 없다
- 검사: `/vibe` selftest **132 PASS / 0 FAIL**(103 → 132, 적대평가 검사 29개 추가)

### 무엇을 했나

**① `docs/HANDOFF.md` 가 상한을 7.3배 넘고 있었다 → 기간으로 쪼갰다 (#1801)**

732,210B. 지침 §2 의 단일 파일 상한은 100KB 고, §0-1 이 처분까지 정해뒀다 —
**"요약하지 말고 기간으로 쪼갠다. 압축은 선택지가 아니다."**

§7 의 예시는 반기(`YYYYHn`)지만 2026-07·08·09 가 각각 226·307·110KB 라 반기로 묶으면
한 파일이 640KB 가 된다. **예시를 따르면 그 예시가 지키려는 규칙이 깨진다.** 월을 썼고,
월도 넘치면 부분(`-pN`, p1 이 가장 오래된 쪽)으로 더 쪼갰다. 부분 번호를 오래된 쪽부터
매기는 이유는 굴림 때 기존 파일 이름이 안 밀리게 하려는 것이다.

무손실은 git 오브젝트 수준에서 확인했다 — **137블록 → 137블록 · 소실 0 · 추가 0**,
제목 변경 2건(Latest 강등·승격)뿐. 재정렬도 중복 제거도 안 했다. 이 로그에는 날짜 역순이
아닌 자리가 실제로 있고 그것도 기록이며, **원본부터 완전히 같은 본문이 두 번 있는 블록**이
있어서 무손실 검증은 유일성이 아니라 **개수 보존**으로 해야 했다.

곁가지: `## Latest` 가 **2026-09-06 블록**에 붙어 있었고 그 위에 09-13 블록이 **넷** 있었다.
규약대로 Latest 를 찾는 세션은 일주일 낡은 판을 최신 현황으로 읽었다. 강등 규칙은 스킬에
처음부터 있었다 — **없던 것은 검사였다.** `/simon-handoff` 에 Step 2-C 로 넣었다.

**② `/vibe` 적대평가가 껍데기였다 → 메우고 돌렸다**

지난 라운드에 "만들었다"고 보고한 것의 두 곳이 비어 있었다:
- `--run` 이 "아직 수동 단계다"만 찍고 끝났다 — 실행 코드가 없었다
- `truth_post` 가 **선언만 있고 구현이 없었다** — 세는 문제에 파일 목록이 정답으로 들어가고,
  부재 확인 문제는 `cat-file -e` 의 종료코드 1 이 "정답 생성 실패"로 처리돼 **없는 파일을
  확인하는 문제인데 파일이 없다는 사실이 오류가 됐다.**

지금은 8 probe 전부 기계로 정답이 나오고(`8/8 통과`), 손으로 박아둔 정답 `manual:` 둘은
생성기(`eval/truth/*.py`)로 바꿨다 — 핀은 저장소가 바뀌어도 안 바뀌니 언젠가 반드시 거짓이
되고, 그때 평가가 **조용히 거꾸로 채점한다.**

1회차를 라이브로 돌렸다(`ae_260913_144139`): 8 probe · 24 호출 · 원장 16행 · **16/16 정답** ·
G10 위반 0. ⚠ **이건 좋은 결과가 아니다** — 전 레인이 다 맞혔다는 건 이 자가 레인을 못
가른다는 뜻이다. 사람이 매번 알아채길 기대하지 않게 `--report` 가 직접 말하게 했다.

실행 경로는 **Orca 워커가 아니라 벤더 CLI 직행**이다(`claude -p` · `codex exec` ·
`agy --print` · `grok -p`). 그래서 라우팅 표의 "grok·gemini 는 effort 지정 불가"가 여기에는
해당하지 않는다 — 그건 Orca 가 `--model` 을 거부한다는 뜻이고 CLI 에는 둘 다 있다.
**이 사실로 표를 고치지 말 것. 표는 워커 경로를 적는다.**

프리플라이트에서 벤더 둘이 죽어 있었다: **grok 402(잔액 소진)** · gemini 단독 CLI 는
`IneligibleTierError`(→ `agy` 로만 닿는다). **쿼터 %로는 둘 다 여유 있어 보인다** —
못 쓰는 이유가 쿼터가 아니기 때문이다. 가드 **G12** 로 박았다.

**③ 감사 두 번 — 1차가 빠뜨린 축을 2차가 메웠다**

1차(서브에이전트 24): 세션 8개 + 횡단 6종 → 182건 수집 → 적대 검증 → 마스터 TODO.
완결성 비판이 1차의 구멍을 잡았다 — **세션간 대화 528건(발신 20세션)과 Simon 프롬프트
원장 1,223행을 통째로 안 훑었다.** Simon 이 명시적으로 요구한 축인데 셋 중 '결정'만 봤다.

2차(서브에이전트 12)에서 **소실 임박 6건이 나왔다. 1차에는 하나도 없었다.**

### ⛔ 지금 가장 위험한 것 — 기록이 "0"이라 적은 자리

```
공유 워크트리 TTL-Work:  수정 575 · 미추적 196(132.7MB) · 스태시 22   @09-13 15:54 KST
docs/HANDOFF.md 서술:    "미push 커밋 0, 남은 워크트리 0"
```

그 기록을 믿고 정리하면 사라지는 것 — `audit-write-outbox.ts` **725줄 재작성본**(main 과 다른 판) ·
`purge-local-data.ts`(main 에 부재, 계정 삭제 영수증 경로) · Round21 회귀 310줄 ·
`docs/quality/` 33파일 36MB(품질 회차 195발견의 **유일한 재현 근거**) ·
`SignInStorageRecoveryCard.tsx` · `batches.json`.

**구제 스냅샷을 떴다. 판단 없이 보존만 했다:**

```
E:/Coding Infra/_rescue/ttl-work-260913-1554/
  tracked.patch    3,966,891 B   수정 577파일 (725줄 재작성본은 여기)
  untracked.tar  140,789,760 B   951파일 (docs/quality 34 포함)
  README.md · status.txt
```

`git add`·`commit`·`checkout`·`stash`·`clean` 을 **하나도 쓰지 않았다** — 공유 워크트리라
인덱스를 건드리면 다른 세션의 작업을 갈아탄다. 스냅샷 전후로 `196 / 575` 가 그대로임을 확인했다.

⚠ 저장소 **밖**에 뒀다. 앞선 백업 둘(`.worktrees/_backup/ttl-work-260907-*`)은 워크트리 안에
있어서 워크트리를 정리하면 백업까지 같이 사라진다.
⚠ `tar -tf` 가 셸에서 **0건**을 낸다(경로에 공백). 빈 아카이브가 아니다 — python 으로 확인할 것.

**남은 일은 보존이 아니라 처분이다.** 어느 것이 완성이고 어느 것이 폐기인지는 각 작업의
소유자만 안다. 이 세션은 판단하지 않았다.

### 다음 작업 큐

| # | 작업 | 크기 | 권장 |
|---|---|---|---|
| A | **구제 스냅샷 771건 처분** — 소유자별로 완성/폐기를 가른다 | L | ⭐ 유일본이고 되돌릴 수 없다 |
| B | P1 — 배송 홈이 `highlightRecordId` 를 읽게 | M | Simon 이 "받는 쪽부터"로 순서 지정 |
| C | 적대평가 2회차용 **어려운 probe** 추가 | S | 지금 자는 16/16 이라 아무것도 못 가른다 |
| D | 기록 정정 4건(아래 "기록이 사실과 다른 것") | S | 다음 세션의 헛수고를 막는다 |

### Simon 결정 대기 8건

A1 출시 법역(Q-S1, DPIA A~H + 빌드 8종을 막음) · A2 마이그레이션 0171~0187 운영 적용 ·
A3 `community_is_member` 미바인딩(보안담당) · A4 웹 게시 승인(라이브가 **92커밋 뒤**) ·
A5 PR #1800 PKCE · A6 미확인 보안 브랜치 69갈래 방향 · A7 `STATE.md` 소유자 ·
A8 자살예방법 시행령 관찰자. 상세는 `STATE.md`.

### 기록이 사실과 다른 것 — 다음 세션이 헛수고하지 않도록

- 활성 창이 **0148·0149·0150 을 "적용 대기"** 로 적는다 → 운영 적용 완료(09-07 20:07~20:11 UTC).
- 이 워크트리의 `CLAUDE.md` 는 웹 배포를 **gh-pages** 라 적는다 → main 은 `actions/deploy-pages`(#1657).
  여기서 시작하는 세션이 낡은 쪽을 프로젝트 지침으로 읽는다.
- `docs/WEB-PUBLISH-RUNBOOK.md` 가 게시 재현성을 **"Simon 확인 사항"** 으로 남긴다 → D4 로 닫혔고 #1795 가 고쳤다.
- `docs/handoff/HANDOFF-2026-08-p4.md:1348` 이 `auth.uid()` 없는 함수 **"0건 · 수정 불요"** 라
  적는다 → 같은 문단이 반례를 이름으로 적고 있다(A3).

### 검증
```bash
npm run verify                                   # 저장소
python ~/.claude/skills/vibe/scripts/selftest.py # 132 PASS / 0 FAIL
grep -c '^## Latest' docs/HANDOFF.md             # 1
find docs/HANDOFF.md docs/handoff -name 'HANDOFF-*.md' -size +100k   # 0건
```

### 다음 세션 시작하는 법
```bash
git fetch origin main && git pull origin main
cat STATE.md          # 현황 — 여기부터
cat docs/HANDOFF.md   # 이 블록
tail -30 DECISIONS.md # 오늘 결정 5줄
```

---

## 2026-09-13 / 빌드가 재현되지 않아 게시가 반반이었다 — 고쳤다 (#1795)

> 발행: Claude Code (워크트리 `font-holes-260906`, 기준 main `af5ede12` → `361d8280`).
> 이 세션은 결정 시트 260913 의 Simon 회신 8건을 집행하던 중 워크트리 이관 지시로 닫힌다.

### 무엇을 고쳤나

웹 게시 게이트는 **승인한 digest** 와 **방금 빌드한 digest** 를 대조한다. 그 대조는 빌드가
재현된다는 전제 위에 서 있었는데, 재현되지 않았다. 같은 커밋의 push 빌드를 `gh run rerun`
으로 다시 돌리면 digest 가 달라졌고, 두 산출물(351파일)을 풀어 보니 모든 JS 청크 해시가
달랐다. 39바이트짜리 청크가 원인을 그대로 보여줬다:

```
빌드 A:  __d(function(g,r,i,a,m,e,d){},3496,[]);
빌드 B:  __d(function(g,r,i,a,m,e,d){},2375,[]);
```

Metro 기본 id 팩토리는 **순번 카운터**다 — id 가 "어느 모듈인가"가 아니라 **"언제 닿였는가"**
를 담고, 그래프 순회는 워커 프로세스에 흩어져 돈다.

**배출 순서도 같은 것에 매달려 있었다.** 두 직렬화기가 모듈을 id 로 정렬하는데
(`metro/.../baseJSBundle.js:38`, `@expo/metro-config/.../serializeChunks.js:getSortedModules`)
**id 를 순회 순서로 매긴 다음** 정렬하므로 정렬이 무의미했다. 그래서 id 를 경로에 고정하면
**id 와 순서가 한 번에** 잡힌다 — 정렬이 드디어 순회와 무관한 기준을 갖는다.

`metro-module-id.js` 가 프로젝트 루트 기준 **상대 경로**를 해시한다(31비트, 충돌 시 두 경로를
이름으로 대며 throw). 상대 경로인 이유는 같은 커밋이 CI 러너·정본·워크트리 십여 개에서,
Windows 와 Linux 양쪽에서 빌드되기 때문이다.

### ⚠ 지문 소스 여부는 추측하지 말고 이 값으로 볼 것

```
@expo/fingerprint 0.19.5 · platform android · 소스 190개 (file 119 / dir 66 / contents 5)
루트 소스: .easignore .gitignore android assets/images/*4
           config-plugins/withAndroidAbiFilter.js eas.json google-services.json patches
contents:  expoAutolinkingConfig:android expoConfig package:react-native
           packageJson:scripts rncoreAutolinkingConfig:android
metro.config.js  없음        babel.config.js  없음
```

즉 `metro.config.js` 는 **지문 소스가 아니다.** 런타임 버전이 안 움직이므로 설치된 빌드의
OTA 호환이 깨지지 않는다. 청크 해시는 한 번 전부 바뀌고, 웹 export 는 내용 주소라 흡수한다.

### 낡아 있던 서술 6건 (기억으로 그리면 안 되는 이유)

5일 만에 목록을 다시 재니 여섯이 이미 끝나 있었다.

| 미결이라고 적혀 있던 것 | 실측 |
|---|---|
| 엣지 함수 9개 배포 | **완료** — 09-07 13:07 에 8건 + 이후 2건, 전부 success |
| 항목 4 og:image 절대 주소 | **해결** — 라이브 HTML 에 존재 |
| 동의 스택 6건(#1587~#1593) | **종결** — #1589 머지, 5건 클로즈 |
| 초안 PR 25개(Q-260906-02) | **종결** — 열린 PR 0건 |
| `0188` 운영 적용 필요 | **이미 적용됨** — `raw_clippings_owner_insert`/`update` 에 존재 검사가 붙어 있다 |
| 고아 객체 정리 필요 | **고아 0건** — 버킷 1개 · 객체 3개 · 240B, 전부 실재 사용자 |

`export-delivery.ts`·`export-session.ts` 도 main 에 있다(테스트까지). "어느 ref 에도 없는
유일본" 서술은 낡았다.

### 남긴 것 (다음 워크트리)

`DECISIONS.md` 의 "결정 시트 260913" 절에 Simon 회신 8건과 그중 무엇이 이미 닫혔는지가
전부 있다. 실행 대기는 넷이다.

1. **게시** — D4 가 고쳐졌으니 이제 정적에 덜 의존한다. 머지 후 push 빌드를 `gh run rerun`
   해서 digest 가 같은지 **먼저 확인**할 것. 그게 재현성의 진짜 증명이고, 애초에 결함을 잡은 방법이다.
2. **D3 HANDOFF 기간 분할** — 승인됐다. 단 **여러 세션이 prepend 중이 아닐 때** 할 것.
3. **D7 정리 묶음 6건** — 기본값 승인됨. 파일 삭제 건은 실행 직전 목록 재확인.
4. **D6 en 라운드 착지** — 회귀 2건 제외. 태그 `haeyo-5lang-snapshot`.
5. **D5 MFDS 고객센터 문의** — 로그인 필요. CLI 가 대리하지 않는다(§7). §4 작업 카드 몫.

### ⚠ `STATE.md` 는 덮어쓰기 파일인데 쓰는 세션이 여럿이다

지침 §0-1 이 경고한 그대로다 — 두 번째 쓰기가 첫 번째를 지운다. 지금 소유자는
`runbook-260907` 세션이고, 이 세션은 **건드리지 않았다.** 병렬 세션은 append-only 인
`DECISIONS.md` 에만 쓰는 것이 안전하다.


## 2026-09-13 / 레거시 은퇴가 되살리기로 방향을 바꿨다 — 그리고 Phase 1 이 배송에서 끊겨 있었다

**이 워크트리(`runbook-260907`)는 여기서 닫는다**(Simon 지시). 내 브랜치는 전부 origin 에
있다(미푸시 0). 상태는 `STATE.md`, 결정은 `DECISIONS.md` 가 갖는다 — 여기 중복해 적지 않는다.

### 한 줄

가져온 자료를 읽어 요약과 되새김 질문 넷을 만드는 단계(**Phase 1**)에 **배송 호출부가 0건**
이었다. 코드는 전부 있었고, 검사도 전부 초록이었다.

### 왜 아무도 못 봤나 — 네 겹이 겹쳤다

```
runPhase1 호출부        2곳, 둘 다 죽은 반쪽 안 (src/app/inbox.tsx:452 · src/app/wiki.tsx:318)
배송 megafile          listSources · generateSourcePage · runPhase1 을 import 만 하고 안 씀
eslint no-unused-vars  "warn" 이라 CI 가 안 섬
/import 화면 주석       "imported notes land in the inbox for Phase 1/2 later ($0)"
                       — 그 "나중" 이 오지 않았다
```

**Phase 2(위키 페이지 만들기)는 멀쩡했다** — 기록 상세와 자동 승격에서 부른다. 끊긴 것은
읽는 단계 하나뿐이다. 그래서 "AI 가 내 자료로 아무것도 안 한다"와 "코드는 다 있다"가 동시에
참이었다.

### 고친 것 (#1796)

`/sources` 신설 — 미리보기 펼치기 · 요약과 질문 넷 만들기/보기 · 위키 페이지 만들기.
알림 허브에는 **한 줄 신호**만 얹고 누르면 화면 전환한다(목록을 허브에 넣으면 145줄 허브가
858줄 목록이 된다 — 화면 하나에 메시지 하나 · O-7).

`/wiki?focusSourceId=` 점프는 **일부러 안 넣었다.** 배송 위키는 `focusPageId` 를 읽어서 그
파라미터는 받는 사람이 없다(#1782 이 고아 파라미터 셋 중 하나로 기록). 받는 쪽을 먼저 만든
뒤에 잇는다.

새 검사 `src/lib/wiki/__tests__/phase1-has-a-shipping-caller.test.ts` 가 이 구멍을 지킨다.
쓰다가 **매달린 import 를 일곱 개 더** 찾았다 — 손으로 셋, 검사가 일곱, 한 파일에 열.
**손으로 세면 늘 모자란다.** 변이 검증 7/7(물어야 할 넷은 물고, 자기 산문·로그 문자열·주석
셋은 안 흔들린다).

### 방향이 바뀌었다 — 은퇴 중단, 되살리기 집중 (Simon 결정 Q10)

Q3 에서 `capture`(4,636줄)를 다음 은퇴 묶음으로 골랐는데 **전제가 반증됐다. capture 는
배송된다** — `capture-full.tsx:6,14,18` 이 두 트랙 모두에서 `CaptureLegacy` 를 그리고,
Web Share Target 이 `/capture` 로 들어온다. 이름의 `Legacy` 는 **트랙 이름이지 상태가 아니다**
(`formats.tsx` 에서 한 번, 여기서 또 한 번 걸렸다).

→ **은퇴 후보를 줄 수로 고르지 말 것.** 가장 큰 파일이 가장 살아 있었다.

남은 죽은 핀 37(`wiki` 29 · `inbox` 8)은 은퇴가 아니라 **되살리기로** 해소된다. 배송 화면이
계약을 갖게 되면 검사가 그쪽을 가리킨다.

### 이미 끝나 있던 것 — `/ops`

Q4 가 "인용 갱신 후 은퇴를 이어간다" 였는데 **09-08 에 이미 끝났다.** `src/app/ops.tsx` 는
12줄 래퍼고 레거시 반쪽이 없으며 `legacy/screens/ops.tsx` 로 나갔다. DPIA 인용도 그때
재조준됐다(`dpia-crisis-rail-anchors.test.ts:147`). **다시 파지 말 것.**

### 다음 사람에게 (순서는 `STATE.md` 가 정본)

1. **P1 — 배송 홈이 `highlightRecordId` 를 읽게 한다.** 보내는 곳 둘, 읽는 곳은 아카이브된
   홈뿐이다. Simon 이 "받는 쪽부터" 로 순서를 지정했다.
2. Q11 — `/import` 붙여넣기 상자 + 우리 분류기(Simon "둘 다"). `$0` 주석은 #1796 에서 이미
   정정했다. 붙여넣은 것도 소스가 되니 `/sources` 가 그대로 받는다.
3. P2 `/data` 묶음(Q8 + Q7③) → P3 위키 삭제·검색·지표(Q7 ①②④) → P4 기록 상세 셋(Q6 ①②③).

### ⚠ 이 파일이 708KB 다

9,378줄. 지침의 100KB 상한을 7배 넘겼다. **요약하지 말고 기간으로 쪼갤 것**
(`docs/handoff/HANDOFF-2026H2.md`). 워크트리를 닫는 중에 즉흥으로 할 일이 아니라 손대지
않았다 — 새 워크트리의 첫 작업 후보다.
