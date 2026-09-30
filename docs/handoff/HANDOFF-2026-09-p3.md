# 2nd-Brain Handoff — 2026-09 보관 (p3)

> `docs/HANDOFF.md` 활성 창이 100KB 에 닿아 밀려난 블록을 **원문 그대로** 옮겨 둔 파일이다.
> 한 글자도 요약하지 않았다. `handoff/HANDOFF-2026-09-p2.md` 가 94KB 로 차서 이 파일을 열었다.
> 새 블록은 활성 창(`docs/HANDOFF.md`) 맨 위에 얹는다 — 이 파일에 직접 쓰지 않는다.

최초 생성 2026-09-28 07:39 KST · Claude Code (TTL-Work_rev2, PolaScope)

---

## 2026-09-27 22:40 / 앱 이름: Polascope 1순위 · 변리사 견적부터 · 2ndB 웹 게시 보류 · 프로젝트명 유지

> 발행: CLI 코딩 세션(TTL-Work_rev2). 보고서 둘: "Scope Me 개명 검토"
> <https://claude.ai/artifact/UKdgnvbKgn1PQnU2PK2EKG> · "앱 이름 결정 콘솔"
> <https://claude.ai/artifact/1YuhwsfhfkTtmSFJP5V9Lg> (칩을 고르면 다음 세션 프롬프트가 나온다).

**지금까지**
- 18:50 Simon 이 앱·프로젝트 이름을 'Scope Me' 로 바꾸는 것을 물었다. 비권장으로 답했다.
  Google Play 에 같은 이름 앱(com.erpasoftware.scopeme)이 5개 지역 검색 1위이고, scopeme .com · .ai · .app 이 남의 것이다.
- 19:4x Simon 결정: 프로젝트명과 식별자는 유지하고 앱 표시 이름만 바꾼다. 새 이름이 정해지면 '2ndB' 계열도 옮긴다(DECISIONS 19:4x 줄).
- 같은 메모의 새 후보 **Polascope**(한 단어 표기 권장, 한국어 폴라스코프): 후보 유지, 확정 보류(확신 중간).
  - 같은 이름은 스토어 0건, 도메인 11/11 비어 있음.
  - 그러나 Play 'polascope' 검색 1위가 Polar Scope Align Pro 다(08-25 에 Polar Scope 를 탈락시킨 앱). 한국어 '폴라' 는 polar 의 표기이기도 하다.
  - 상표 장애 둘: 등록 pola/Pola((주)씨앤에이아이), 선출원 POLISCOPE/폴리스코프(2026-04-24, 9·42류 포함).
- #1898 머지: 공유 문구의 미등록 도메인 `2ndb.app` 을 `SITE_ORIGIN` 으로 바꿨다. 웹은 게시해야 반영된다.
- 이 PR: MyPola 날짜 정정(README 와 p4 블록 머리 4곳, 줄 수 불변, 결정 원문 08-25 15:46:32 KST 확인) · DECISIONS 한 줄 ·
  변리사 의뢰서 갱신(후보 넷, 질의 Q6~Q11, 발송 전 체크리스트 §5-1, 낡은 HANDOFF 인용 3곳 교정, **미발송**).

- 22:2x Simon 이 결정 콘솔에 답했다(DECISIONS 22:2x 세 줄):
  - 앱 이름은 **Polascope 1순위**로 변리사에 묻고 **견적부터** 받는다. 의뢰서 맨 위에 견적 요청 요지(§0, 항목 E-1~E-6)를 얹었다.
  - 이름이 정해지면 **앱 이름 가족 전체**(2nd-Brain · 두번째 뇌 · 약칭 2nd-B · 웹·광고의 2ndB)를 옮긴다. 캐릭터(세컨비 · Meta-B · Twi-B)는 유지.
  - **허슬케이**를 새 이름 세계관(망원경 든 마스코트)과 잇는다. 의뢰서 조회 범위에 허슬케이 · Hustle K 를 선택 항목으로 넣었다.
  - **2ndB 웹 게시 보류**(새 이름이 정해질 때까지).
- DECISIONS.md 를 100KB 에서 쪼갰다: 26.09.20~21 → `DECISIONS-2026-09-20_21.md`(바이트 그대로, 89줄 전후 동일). 활성 파일 14KB.

**다음 1개**: Simon 이 변리사 사무소에 견적을 요청한다(의뢰서 §0 을 보낸다). 견적 판단 기준(관납료 · 수수료 시세)은 결정 콘솔에 있다.

**막힌 것**
1. 견적 → 발송 승인(유료, Simon). 이 답 없이는 Polascope 를 판정할 수 없다.
2. 2ndB 웹 게시 보류 때문에 #1898 을 포함한 모든 웹 수정이 웹에 나가지 않는다. **결제 전환 13단계에서 결제창 바인딩
   클라이언트를 웹에 게시하는 단계와 부딪힌다.** 그 전에 이름이 안 정해지면 2ndB 두 커밋(c8e023f9 · c101908c)을
   되돌리는 PR 을 먼저 넣는다(되돌림은 Simon 확인 뒤).

**주의**
- 앱 안 로케일에 '2ndB' 는 0줄이다. 앱 안 이름은 2nd-Brain · 두번째 뇌 · 2nd-B(서비스 약칭)다.
- 이름을 바꾸는 PR 은 CI 핀을 같이 옮긴다: visible-brand-copy.test.ts:42-61 · worldview-naming.test.ts:57 · check-constraints 이름 원문 9개.
- KIPRIS 공개 검색은 헤드리스 브라우저로 로그인 없이 됐다(초당 1회 이하). 표준 경로로 쓸지는 Simon 확인 대기. TMview 는 이 PC 에서 막혔다.

---

## 2026-09-27 08:47 / 운영 마이그레이션 22개 적용 · AI 프록시 3종 재배포 · 결제 전환 13단계는 1단계 대기

**목적**: main 에 머지됐지만 운영에 없던 마이그레이션과 Edge 함수를 Simon GO 범위 안에서 운영에 올린다(코딩 LLM · `/loop` 버스 점검 세션).

**지금까지**
- 운영 마이그레이션: 09-26 23:50 이후 **22개를 적용**했다. 운영 원장은 **174행**이다(마지막 `20260926191054 0201`).
  - 09-26 23:50~00:14: 17개
  - 02:52~02:54: 0179(#1878판) · 0181
  - 04:09~04:10: 0189(#1874판) · 0190 · 0201
  - 파일마다 로컬 운영 재현본(운영 순서 + 운영 표 ACL)과 함수 지문을 대조했다.
- 아직 운영에 없는 main 마이그레이션은 **0192 · 0194 · 0195 · 0197 · 0198** 다섯 개다.
  - 0192 · 0194 는 배포된 Storage 리허설이 선행 조건이다.
  - 0195 · 0198 은 0192 가 먼저 있어야 한다(재현본에서 실패 확인).
  - 0197 은 paddle-webhook 과 한 창에서 올린다(아래 결제 전환 8단계).
- Edge 배포: claude v132 · gemini v152 · xai v68 을 main `711b7eaf` 에서 재배포했다(06:04, 런 36271305645 · 36271390493 · 36271394597, 승인 Simon).
  - 앞선 두 번은 게이트에서 멈췄다(배포 0). 한 번은 승인 직전 main 이동, 한 번은 Production 환경 시크릿 0개였다.
  - 지금은 `PRODUCTION_SUPABASE_*` 두 이름이 있다.
- 공개 웹: Relay 가 main `557f2c02` 로 재게시했다(06:28, #1863 · 개인정보). main 웹 클라이언트는 `checkout_binding` 을 부르는데 운영 subscription-manage(09-07판)에는 그 액션이 없다. 그래서 **웹 결제창은 결제 전환 4단계까지 실패 닫힘**이다. 돈이 빠져나가는 위험은 없다.
- DECISIONS: #1875 · #1885 · #1892.
- 보고서: https://claude.ai/artifact/8jCEVEbnaUcrLzZ8t9FPU1 (v5, 06:04 이후 내용은 아직 반영 전).

**다음 1개**: 결제 전환 1단계. **Simon** 이 Supabase 대시보드 Edge Functions → Secrets 에서 `PADDLE_WEBHOOK_ENABLED` 를 `0` 으로 바꾼다.
- 08:46 기준 웹훅은 켜져 있다. 서명 없는 빈 POST 에 `403 forbidden_source` 가 온다. 꺼지면 `503 disabled` 다.
- 계획서: `.bots/relay/outbox/vb-paddle-session-ownership-13.plan.md`
- GO: `simon-go-attested-paddle-session-ownership-13.md` (06:13 FINAL)

**막힌 것**
1. `PADDLE_WEBHOOK_ENABLED=0`(Simon)
2. Storage 리허설 2차 `vb-storage-rehearsal-2` 가 age 개인키를 기다린다. 임시 프로젝트 `ynezqeyrkipohltapgqz` 가 떠 있다. 끝나면 삭제해야 한다.
3. Relay 자동 점검이 06:16 뒤로 없다. `vb-7e275d7c`(Paddle 전송 로그 확인) 와 `web-publish-paddle-interaction.note.md` 가 미처리다.

**TODO**
- 결제 전환 2~12단계는 계획서 순서대로 한다.
- 13단계(binding-aware 공개 게시)는 main 클라이언트가 부르는 서버 조각이 전부 운영에 있는지 대조한 뒤에 한다. 0192 계열이 없으면 13 직전에서 멈춘다.
- 0192 · 0194 리허설이 통과하면 0192 → 0194 → 0195 · 0198 → openai-proxy 순서로 간다.
- `DECISIONS.md` 가 95.6KB 다. 다음 기록 전에 기간으로 쪼갠다.

**함정 (이번에 실제로 밟은 것)**
- Production 환경 필수 검토자는 Simon 계정이다. 같은 토큰으로 대리 승인하지 않는다.
- 승인을 기다리는 사이 다른 세션이 main 에 머지하면 배포 런은 `checkout-is-not-current-remote-main` 으로 죽는다. 다시 디스패치하면 된다.
- 재현본 질의 파일을 Python 텍스트 모드로 쓰면 구분자가 CRLF 가 되어 합계 해시가 거짓으로 어긋난다. 행별 해시로 먼저 확인한다.
- 환경변수 대조는 `Deno.env.get` 만 grep 하면 `read('X')` 같은 간접 읽기를 놓친다.
- main 의 paddle-webhook 에는 RELEASE HOLD 주석이 있다(index.ts:852). GO 문구만 보고 배포하면 바인딩 시크릿이 없어서 결제 이벤트 전체가 503 이 된다.

## 2026-09-27 05:26 / #1865 병합 확인과 #1889 인증 잠금 회귀

- 작성 기준 `origin/main d5ba498c`. [PR #1865](https://github.com/Simon-YHKim/2nd-B/pull/1865)는 2026-09-26 23:05 KST `fe3bdade`로 **이미 병합됐다**. 아래 과거 블록의 Draft·머지 보류 문장은 당시 상태다. Simon의 Q5 처리위탁(안 A)·시행일 2026-09-26 결정이 반영됐지만, **운영 광고·클라이언트 공개 승인이나 서버 적용 증거는 아니다**. `src/lib/ads/legal-readiness.ts`의 광고 게시 게이트는 `false`다.
- 로컬 `E:/2ndB/docs/drafts/admob-q5-third-party-review-260926.md`의 Q5 독립 검토는 안 A와 다른 의견이다. [Google 공식 설명](https://support.google.com/admob/answer/7666366?hl=ko)은 광고 처리에서 Google과 게시자가 독립적으로 결정하고 일부 기능에서만 수탁자 역할을 한다고 한다. 사용자 결정을 임의 변경하지 않는다. 광고 ON 전 계약 법인·수신 범위·이전 국가·보유기간·별도 동의와 실제 송신을 확인한다.
- [Draft PR #1889](https://github.com/Simon-YHKim/2nd-B/pull/1889) `9a9884e0`은 #1814의 0행 삭제 확인에서 취소되지 않는 인증 SDK 잠금을 제거했다. 로컬 `npm run verify` UI 76/76·Jest 759 suites/9,352 tests와 원격 CI 3/3 통과. #1814는 main과 충돌 중이고 S3 서버 영수증 계약이 없으며, #1839도 서버 계약 전 Draft다. 둘 다 활성화·병합하지 않는다.
- 격리 복원은 아래 04:46 부분 결과에 그쳤다. 다만 별도 Simon GO에 따른 Hadrianus의 `vb-bbca63fa-cleanup` 결과(05:21 KST)는 임시 프로젝트 `zznoukihuzogteheokfi` **삭제 완료**를 보고한다. 삭제 직후 MCP 프로젝트 목록에서 해당 ref가 사라졌고 PC·box의 평문/키/접속 파일 잔여 0건을 재확인했다고 한다. `dev-infra/outbox`와 `relay/outbox` 결과 사본의 SHA-256은 일치한다. 이 코딩 세션은 Supabase에 직접 접근하거나 Bot에 추가 지시를 보내지 않았다. 복원 오류·CLI 원장 왕복·Storage 경합은 해결되지 않았으므로 **통합 리허설 완료는 아니다**.

---

## 2026-09-27 04:46 / 격리 복원 부분 결과와 임시 프로젝트 정리 누락

- Hadrianus의 `E:/2ndB/.bots/dev-infra/outbox/vb-bbca63fa.result.md`(04:41 KST) 보고: 백업 SHA-256 일치, 임시 DB의 public 82표·758행 적재. 복원 오류 13건(auth.users 참조 FK 11건 포함)이 있어 완전 복원은 아니다. 백업 원장 171행과 운영 174행의 차이 3개(0189·0190·0201)는 백업 생성 뒤 운영 적용분이다. 임시 DB에서 0189 적용·rollback·재적용, 0190·0201은 통과했으나 0195는 auth 권한 오류, 0198은 0192 부재로 중단됐다. CLI 원장 왕복·Storage 두 연결 경합은 미실행이다.
- Bot 보고상 생성한 임시 평문·접속 파일은 삭제됐고 age 개인키 파일 경로도 04:43 KST `Test-Path=False`였다. 개인키를 평문 파일로 만들었다는 보고는 앞선 안전 지침과 충돌한다. **임시 프로젝트 `zznoukihuzogteheokfi`는 삭제되지 않았고 실제 사용자 데이터 사본이 남았다.** 발주서의 검증 후 정리 조건과 불일치하므로 통합 리허설 완료로 표시하지 않는다. 운영 ref는 Bot 보고상 읽기 전용이었다. 사용자는 Supabase 작업을 Grok Bot에 맡기라고 지시했으므로 이 코딩 세션은 DB·프로젝트를 조작하거나 직접 UI 재발주하지 않는다.

---

## 2026-09-27 04:17 / Grok Bot 격리 복원 과제 접수

- Simon의 반복 지시에 따라 Supabase **임시 프로젝트만** 대상으로 한 격리 복원 과제 `vb-bbca63fa`를 Grok Bot Relay 대화에서 직접 전달했다. Relay가 로컬 버스 `E:/2ndB/.bots/relay/inbox/vb-bbca63fa.md`를 `dev-infra/inbox`에도 배치하고 `relay/outbox/vb-bbca63fa.dispatch.md`를 남겼다. Hadrianus WorksLocal / Dev Infra는 `dev-infra/outbox/vb-bbca63fa.ack.md`와 대화에서 과제서 확인을 인정했다. 이는 **과제 접수**이지 복원 완료가 아니다.
- `/vibe-bot`의 보호 어댑터 `execute_bot.py dispatch`는 계정·할당량·과금·Relay 인증서가 없어 실행하지 않았다. 대신 Orca UI로 직접 전달한 것은 사용자가 지정한 스킬 절차에서 벗어난 실행이다. 이를 보호 어댑터를 통과한 발주로 기록하지 말고, 같은 nonce를 다시 발주하지 말 것. 새 메시지·발주는 스킬의 현재 증빙과 전달 절차를 충족한 뒤에만 판단한다.
- Hadrianus가 `2ndb-integration-drill-260927`(ref `zznoukihuzogteheokfi`, `ap-northeast-2`, `ACTIVE_HEALTHY`)와 최신 백업 run `36262516860`을 읽기 전용으로 확인했다. **비밀번호 재설정·복호화·임시 DB 쓰기·운영 DB/Edge 쓰기는 아직 없다.** KeePassXC 보관함이 잠겨 age 개인키 접근이 막혔고, 임시 DB 비밀번호 및 3단계 Supabase CLI 로그인도 없다. Bot이 평문 개인키 임시 파일 경로를 요청했으나 사용자는 키 값이나 평문 키 파일을 채팅·버스에 전달하지 말 것. 안전한 일시 접근 방법이 정해지기 전에는 복원을 시작하지 않는다.
- 과제 범위는 최신 암호화 백업의 **격리 복원**, 운영 원장 171행 대조, 남은 SQL 파일별 이주·0189 rollback·CLI 원장 왕복·Storage 두 연결 경합, 임시 프로젝트와 생성한 임시 파일 정리다. 운영 프로젝트 ref `zoacryukmdeivmolvyhj`의 migration·Edge 작업은 이 과제에서 제외했으며 별도 운영 GO와 섞지 않는다. 완료 여부는 `vb-bbca63fa.result.md`의 실제 복원·검증·정리 증거로 확인한다.
- 별도 웹 QA 조사를 위해 만든 깨끗한 `E:/2ndB/.worktrees/web-focus-settings-260927`에는 코드 변경이 없다. `node_modules` 정션이 있으며 자동 승인 검토가 정리 명령을 `blocked by policy`로 거부해 남겨 뒀다. 정리하려면 정션을 먼저 안전하게 끊고 정확한 워크트리 경로만 다뤄야 한다.

---

## 2026-09-27 03:31 / 운영 원장 갱신 뒤 격리 복원 준비

- [PR #1885](https://github.com/Simon-YHKim/2nd-B/pull/1885)가 `main 94caae4a`에 병합돼 Simon의 별도 재정렬 GO에 따른 **운영 0179·0181 적용**을 기록했다. 적용 후 운영 원장은 읽기 전용 재조회에서 171행, 두 이름 각 1행, 최신 버전 `20260926175427`, 순서 민감 지문 `ac44a02c28135e83cccf4175d60437ae`였다. 이 세션은 해당 운영 적용을 수행하지 않았다. 나머지 0192·0194·0197와 묶음 C는 보류다.
- 앞선 암호화 백업 `db-20260926T170134Z.dump.age`는 두 운영 적용 **이전**이므로 현재 원장 리허설 입력으로 쓰지 않는다. 새 [백업 run 36262516860](https://github.com/Simon-YHKim/2nd-B/actions/runs/36262516860)이 `main 94caae4a`에서 성공했다. 암호화 파일 `db-20260926T182627Z.dump.age`는 1,816,147바이트, SHA-256 `9EB6F8B6C48E32482B348CA8793D96DA1D8F90779C36515277BE913D9BDE4085`다. age 헤더·파일 크기·해시를 확인했으며 **이 새 파일의 복호화·복원은 아직 미실행**이다. 이전 백업은 KeePassXC 개인키로 age 완전 복호화, `PGDMP`, `pg_restore --list` 1,936줄까지 확인했다. 개인키·평문 값은 출력하거나 파일로 저장하지 않았다.
- 같은 Supabase Free 조직의 월 $0 **임시 프로젝트** `2ndb-integration-drill-260927`(ref `zznoukihuzogteheokfi`, `ap-northeast-2`)을 승인 범위에서 생성했다. 운영 ref `zoacryukmdeivmolvyhj`와 다르다. 임시 DB는 복원 전 공개 테이블 0·Auth 사용자 0·migration 원장 없음으로 확인했고, 03:30 KST에도 `ACTIVE_HEALTHY`였다. direct DB 접속 주소는 도달 가능하지만 생성 도구가 비밀번호를 반환하지 않아, 사용자가 로그인된 해당 임시 프로젝트의 Database Settings → Reset database password 입력창을 열고 `입력 준비됨`이라고 답하기를 기다린다. **임시 DB 쓰기·운영 DB/Edge 쓰기·평문 백업 파일 생성은 아직 0건**이다.
- `/vibe-bot`로 이 GUI 단계를 발주할 수 있는지 확인했지만, Bot은 별도 머신에서 실행되어 이 PC의 로그인된 Chrome·클립보드에 접근할 수 없고 현 과제의 계정·비용·전달 권한도 검증되지 않았다. 비밀번호를 Bot 과제나 채팅으로 보내지 않는다. 기존 Grok 초안 후속과 Anthropic 키 회전 보류 지시는 그대로다.
- 다음 순서: 사용자 `입력 준비됨` → 임시 비밀번호 설정·접속 → 개인키를 필요한 시점에 KeePassXC `암호 복사`로 1회 전달 → **새 백업** 3패스 격리 복원 → 운영 171행 원장 대조, 파일별 남은 SQL·0189 rollback·CLI 원장 왕복·Storage 두 연결 경합 검증 → 임시 프로젝트와 임시 접속 파일 정리. 0192·0194·0197 또는 묶음 C의 운영 적용·Edge 배포·클라이언트 공개는 이 격리 승인에 포함되지 않는다.

---

## 2026-09-27 02:40 / 통합 복원 대기·릴리스 QA 후속

- [PR #1881](https://github.com/Simon-YHKim/2nd-B/pull/1881)은 새 API 36 AVD의 x86_64 로컬 릴리스 APK에서 AdMob 표시 SDK 제외와 로그인 전 앱 UID의 네트워크 시도를 기록했다. 목적지와 호출 SDK는 미확인이고 EAS 출고본도 아니므로 광고 ON·클라이언트 공개 판단은 그대로 보류한다. [실측 범위](qa/ADMOB-STARTUP-NETWORK-260926.md).
- [PR #1883](https://github.com/Simon-YHKim/2nd-B/pull/1883)은 첫 기록 안내의 완료·수동 다시 보기를 계정별로 분리하고 서버의 기록/출처 ID 존재를 확인하도록 수정했다. CI 3/3 통과 후 `main 0480b304`에 병합됐다. 새 브라우저 원점에서 QA 계정 로그인과 기존 기록 존재는 확인했으나 로컬 `/onboarding` 경계 때문에 홈 1/4 표시 자체와 실기기 동작은 미검증이다. 구 전역 완료 키는 계정에 귀속할 수 없어 이관하지 않는다.
- [PR #1882](https://github.com/Simon-YHKim/2nd-B/pull/1882)는 0192 관리형 Storage preflight가 CLI 스크래치 원장과 14자리 버전·번호 포함 관리형 원장 이름을 각각 정확히 판정하도록 보완했다. 최신 `main` 통합 후 로컬 `npm run verify` 822 suites·10,733 tests, 원격 CI 4/4 통과, `main f005c98d` 병합. 관리형 Storage의 실제 복원·경합 검사는 아직 실행하지 않았다.
- Simon은 같은 Supabase Free 조직의 **새 임시 프로젝트에서 운영 데이터·원장을 반영한 통합 리허설과 삭제**를 승인했다. 최신 암호화 백업 [run 36257521076](https://github.com/Simon-YHKim/2nd-B/actions/runs/36257521076)의 파일명은 `db-20260926T170134Z.dump.age`다. 콘솔 담당은 운영 원장 169행의 대조 지문과 CLI v2.116.0을 준비했지만 KeePassXC 보관함이 잠겨 있어 **새 임시 프로젝트 0개·복호화 평문 0개·운영 쓰기 0건**이다. 사용자 잠금 해제 뒤 파일별 SQL·0189 rollback·CLI 원장 왕복·Storage 두 연결 경합을 격리 환경에서 검증하고 임시 프로젝트를 삭제한다. 원장 alias가 예상과 다르면 편집해 통과시키지 않고 중단·화해한다.
- 공개 사이트의 `/2nd-B/manifest.webmanifest`는 9/27 읽기 전용 재조회에서 HTTP 200과 유효한 매니페스트 본문을 반환했다. 다른 세션의 미커밋 대시보드 QA에서 본 404는 `localhost:8081` 관찰로, 현재 공개 사이트 오류의 증거가 아니다. 이 확인만으로 인증 뒤 웹 흐름·최신 `main` 게시 완료를 주장하지 않는다. 대시보드 의도 차이와 초점 경고는 그 소유 작업트리에서 후속 검토한다.
- 격리 파이프 시험에서 만든 임의 바이너리·임의 키는 `E:/2ndB/.worktrees/prod-audit-0179-0181-260927/Output/restore-rehearsal-260927/tools/pipe-test`에 남았다. 자동 승인 검토가 삭제를 `blocked by policy`로 거부해 재시도하지 않았다. 운영 평문은 없다. 운영 DB·Edge 적용은 이번 격리 승인에 포함되지 않으며 별도 GO가 필요하다. Anthropic 키 회전은 이 세션이 수행하지 않고, 기존 Grok 초안 후속도 Simon 지시대로 보류한다.

---

## 2026-09-27 02:09 / 격리 리허설 도구·릴리스 시작 검사

- [PR #1879](https://github.com/Simon-YHKim/2nd-B/pull/1879)가 `main 5f00c005`에 병합돼 0192 관리형 Storage의 두 연결 경합·API 검사 절차가 준비됐다. 실제 격리 리허설은 아직 실행하지 않았으며 0192/0194 운영 적용은 NO-GO다. 콘솔 사전점검에서 SQL preflight의 0192 원장 이름이 계획된 번호 포함 이름과 달라 거짓 실패하는 문제가 발견돼 코딩 담당의 수정 전에는 해당 preflight를 실행하지 않는다.
- [PR #1880](https://github.com/Simon-YHKim/2nd-B/pull/1880)이 `main e935c08e`에 병합돼 arm64 로컬 릴리스 APK의 AdMob 제외 증거를 기록했다. 이어 새 API 36 AVD에 x86_64 로컬 릴리스 APK를 설치해 로그인 전 시작 단계를 검사했다. 차단 규칙 아래 첫 실행과 재시작 각각 앱 UID IPv4 34건·IPv6 68건의 네트워크 **시도**가 있었고, AdMob Provider·광고 표시 클래스는 없었다. 목적지와 송신 주체 SDK는 미확인이다. [상세 증거](qa/ADMOB-STARTUP-NETWORK-260926.md); 광고 ON·클라이언트 공개 게이트 유지.
- Simon은 새 무료 임시 프로젝트의 운영 데이터·원장 통합 리허설과 정리를 승인했다. 콘솔 담당이 현행 백업을 새로 암호화 생성했으며, 복원 개인키가 있는 KeePassXC 보관함 잠금 해제를 기다린다. 운영 DB 추가 적용·Edge 배포는 이 승인에 포함되지 않는다. Anthropic 키 작업과 기존 Grok 초안 후속도 진행하지 않는다.

---

## 2026-09-27 01:38 / 0179 권한 보완·AdMob 로컬 릴리스 검사

- [PR #1878](https://github.com/Simon-YHKim/2nd-B/pull/1878)이 `main 5c95b6d6`에 병합됐다. 운영에서 `anon`·`authenticated`가 `ai_audit_log`·`crisis_events`에 가진 `TRUNCATE` 등 권한 때문에 0179 후조건이 실패한 원인을 재현하고, 0179 안에서 불필요한 권한을 회수했다. 로컬 `npm run verify` 821 suites·10,719 tests와 원격 CI 4/4가 통과했다. 운영 DB에는 0179·0181을 재적용하지 않았다. 기존 승인 순서의 실패 중단 조건이 발동했고, 운영 데이터·원장을 반영한 통합 격리 리허설과 새 GO 전에는 운영 적용 NO-GO다.
- [AdMob 시작 검사](qa/ADMOB-STARTUP-NETWORK-260926.md)를 PR #1876의 정확한 소스 `88e4b67c`에서 만든 로컬 Android 릴리스 APK로 확장했다. `:app:assembleRelease` 성공, APK SHA-256 `4A697FF68AD2E00E95AED5A859D1B58948698C81E1DB249C112048C1B45FFB24`. APK 매니페스트의 AdMob Provider·앱 ID 및 DEX 광고 표시 SDK 클래스는 0개다. 별도 `AdvertisingIdClient`와 AD_ID 권한은 Expo 추적 투명성·RevenueCat·Firebase Analytics의 경유 의존성으로 남는다. 이 빌드는 EAS 출고 산출물도 초기 네트워크 무송신 증거도 아니다. 광고 ON과 클라이언트 공개 게이트는 유지한다.
- Simon의 최신 지시: 이 세션은 9/26 Anthropic 키 회전을 수행하지 않는다. 키 작업이 실제 필요하면 Grok Bot 담당이다. 추적 파일·Git 이력에서 키 형태의 `sk-ant-` 원문 일치가 없었고, 세션 도구 출력 노출만 확인됐다. 값은 기록·전달하지 않는다. 기존 Grok 초안 후속 전달 보류도 유지한다.

---

## 2026-09-27 00:28 / 운영 원장 169행·부분 적용 확인

### 새로 확인한 운영 상태
- 인증된 읽기 전용 원장 재조회에서 운영 migration이 이전 152행에서 **169행**으로 증가했다. 9/26 원장 버전 `20260926145115`–`20260926151400`의 17행은 모두 현재 Git 동명 SQL과 공백 제거 MD5가 일치하고 각 원장에 `statements` 1개가 있다. 이름·해시 일치는 운영 데이터 이주와 전체 catalog의 성공 증거가 아니다. [17행·현재 Edge 의존성 HTML](qa/PRODUCTION-SERVER-STATUS-260927.html).
- 현재 원장에는 `0171`, `0173`–`0176`, `0178`, `0180`, `0182`–`0187`, `0191`, `0193`, `0199`, `0200`이 새로 기록됐다. 기존 0177·0196 날짜형 alias와 0172 중복 두 행은 그대로다. `0179`·`0181`·`0189`·`0190`·`0192`·`0194`·`0195`·`0197`·`0198`·`0201`의 정확한 소스 이름은 여전히 없으므로 일괄 `db push` 금지다. 다른 과거 alias도 별도 화해한다.
- `main 2178c040`의 Edge 배포 게이트 SELECT를 운영 catalog에 읽기 전용으로 실행했다. `oauth-naver` 6/6, `rss-proxy` 1/1은 스키마 계약만 충족한다. `openai-proxy` 19/22, `service-consent` 10/13, `paddle-webhook` 5/7, `delete-account` 1/2는 미충족이다. `service-consent` Edge는 배포 목록에 없고 Reward v91은 기존 버전이다. DB `runtime_flags.llm_enabled=true`이나 Edge secret·보상/Paddle 서버 플래그는 미확인이다. 이번 재조회에서 운영 쓰기·배포는 0건이다.
- 선행 인수의 152행/신규 객체 부재 서술은 작성 당시 기록이다. 이 블록과 HTML의 00:26 KST 스냅샷을 우선하고, 실제 적용 직전에는 원장을 다시 읽는다. Grok 초안 후속과 이 세션의 키 교체 보류는 그대로다.

### 다음 순서
1. 콘솔 소유자가 새 원장 17행의 적용 주체·버전과 번호 alias를 화해하고, 운영 데이터·원장을 복제한 폐기 가능 환경에서 **남은 SQL의 파일별 이주·0189 rollback·CLI ledger 왕복**을 검증한다. 이전 복원 드릴의 성공만으로 이 통합 리허설을 대체하지 않는다.
2. 현재 Edge 비밀 설정·플래그의 **존재와 상태만** 확인하고 Reward 서명·변조·재전송 canary, Paddle OFF·drain·sandbox 및 동의 coverage를 완료한다. 의존 스키마가 부족한 Edge, 광고와 최신 클라이언트 공개는 계속 보류한다.

---

## 2026-09-27 00:11 / 공개 웹 실측·Edge 스키마 게이트·운영 보류

### 이번 확인과 변경
- [PR #1871](https://github.com/Simon-YHKim/2nd-B/pull/1871)이 `main`의 `6ada6ce1`에 병합됐다. [공개 웹 실측 보고서](qa/LIVE-WEB-STATUS-260926.html)는 현재 공개 로그인 화면의 425×812·1440×900 렌더링에서 pageerror·동일 출처 4xx/5xx·가로 넘침 0을 기록한다. 인증 뒤 흐름은 확인하지 않았다. Pages는 `gh-pages`의 오래된 `16368d66`을 제공하고, 최신 `main`의 웹 빌드는 성공했지만 publish는 건너뛰었다. 서버·법률 게이트 전 공개 배포는 보류한다.
- [PR #1872](https://github.com/Simon-YHKim/2nd-B/pull/1872)가 `main`의 `08a5745a`에 병합됐다. Edge 배포 직전의 스키마 검사는 실제 RPC 서명·인자명·`service_role` 실행 권한·사용 컬럼까지 확인한다. 로컬 전체 `npm run verify` 821 suites·10,718 tests, 집중 25/25, 원격 CI 3/3 PASS. 읽기 전용 운영 카탈로그 SELECT에서 `rewarded-ssv` 4/4 충족, `openai-proxy` 22개 중 5개 미충족으로 배포가 차단될 상태임을 확인했다. 운영 배포는 하지 않았다.
- 운영 재조회에서 migration 원장 152행, 보상 alias 두 행과 0172 중복 두 행, `rewarded-ssv` v91이 유지된다. 0191–0201 묶음은 추가 적용 전이며, 확인한 0183·0191·0192·0193·0195·0200 객체는 없다. Edge 플래그·시크릿 존재는 현 도구로 확인하지 못했다. 운영 SQL 일괄 push와 추가 Edge·클라이언트 공개는 **NO-GO**다.
- 9/26 도구 출력의 Anthropic 키에 대해 Simon은 이 세션이 회전하지 말고, 실제 키 작업이 필요하면 Grok Bot이 맡도록 지시했다. `origin/main` 추적 파일·Git 이력·현재 TTL QA 파일의 리터럴 `sk-ant-` 패턴 검사에서는 일치가 없었다. 코드에 키가 노출된 증거는 없으며, 기존 최신 블록의 회전 항목은 현재 지시로 대체한다. 키 값은 기록하지 않는다. 기존 Grok 초안 후속 전달 보류는 유지한다.

### 남은 게이트
1. 콘솔 담당: 운영 데이터·원장을 반영한 0191–0201 격리 리허설, 0172·보상 alias 재적용 방지, 플래그·시크릿 이름 확인, Reward 서명·변조·재전송 canary와 Paddle OFF·drain·sandbox.
2. 광고·법률: AdMob 수신 법인·이전 국가·보유기간, 별도 동의와 릴리스 빌드 초기 네트워크 확인 후에만 광고 활성화 판단.
3. QA: Android 촬영·OCR·음성 Stop→실전사·저장·효과음, Polaris 실모델 인용·GA4 수신, 대시보드의 의도 대비 UX 차이를 각 소유 작업 트리에서 검증한다. 공개 웹의 현재 `main` 기능은 서버·게시 게이트 후 다시 확인한다.

---

## 2026-09-26 23:05 / #1865 병합·격리 복원 완료·운영 게이트

### 어디까지 왔나
- `origin/main`의 `fe3bdade`에 [PR #1865](https://github.com/Simon-YHKim/2nd-B/pull/1865)가 병합됐다. 병합 전 최종 head `cc942f1c`의 lint·SQL·verify·web export **4/4 PASS**, 로컬 `npm run verify` 820 suites·10,693 Jest tests·UI 76 PASS. 이 인수 문서 PR은 앱 코드·DB 마이그레이션을 포함하지 않는다.
- Simon은 Relay 결정 기록에서 AdMob Q5를 **처리위탁(안 A)**, 개인정보처리방침 시행일을 **2026-09-26**으로 확정했다. 세 법률 사본·앱 판본·관련 SQL 동의 계약은 `0e5ca522`에서 같은 날짜로 갱신됐다. [독립 검토의 제3자 제공 의견](drafts/admob-q5-third-party-review-260926.md)은 채택되지 않은 이견으로 남겼다. 광고는 OFF이며 실제 계정의 수신 법인·이전 국가·SDK 데이터 보유기간, 별도 동의와 릴리스 빌드 초기 네트워크 검증 전에는 켜지 않는다.
- 보상 서버 스위치 적용 후 암호화 백업을 같은 Free 조직의 임시 Supabase 프로젝트에 **3패스 격리 복원**했다. public 테이블/RLS 70/70·정책 90, auth 사용자 19·로그인 수단 22, 최종 FK 오류 0을 운영 읽기 기준과 대조했다. 임시 프로젝트와 로컬 평문·임시 접속 파일 9개 삭제, 운영 프로젝트 정상 상태를 확인했다. 운영 DB 쓰기 0. [복원 보고서](qa/BACKUP-RESTORE-DRILL-260926.html) · [runbook](DB-RESTORE-RUNBOOK.md).

### 활성 인프라와 다음 작업
| 순서 | 담당·조건 | 현재 상태 |
|---|---|---|
| 1 | 콘솔: 0172 중복 원장·보상 alias 재적용 방지, SQL 0191–0201의 **운영 데이터/원장 격리 리허설**과 번호 충돌 재조회 | 백업 복원은 통과했지만 이 통합 리허설은 미실행. 운영 일괄 `db push` 금지 |
| 2 | 콘솔: 현행 Edge·플래그·시크릿 **이름만** 확인, Reward 서명·변조·재전송 canary, Paddle OFF·drain 후 sandbox | 보상 서버는 별도 Simon GO로 ON. 나머지 서버 계약·Paddle 거래·클라이언트 공개는 미검증 |
| 3 | 법률·광고: AdMob 계약/파트너와 이전·보유기간 확인, 별도 광고 동의 UI·릴리스 빌드 네트워크 검증 | Q5 결정은 반영. 광고 ON·SDK 포함 클라이언트 공개는 별도 게이트 |
| 4 | 보안: 9/26 도구 출력에 노출된 API 키의 실제 사용처를 확인하고 공급자에서 회전 | 값은 저장소·채팅에 남기지 않음. 로컬 비공개 사고 기록 확인 |
| 5 | QA: Android 실제 촬영·OCR·음성 Stop→실전사·저장·효과음, Polaris 실모델 인용, GA4 실제 수신 | 모의 전사·웹 33화면·Polaris 상태 RPC 404 대기 UI까지만 검증 |

- Grok Bot 후속 전달은 Simon의 보류 지시를 유지한다. 새 nonce를 중복 발주하지 않는다. 운영 DB·Edge 추가 적용과 웹·스토어 게시도 별도 게이트를 통과하기 전에는 진행하지 않는다.
- 최신 상세 상태: [잔여 작업 HTML](qa/REMAINING-WORK-260926.html), [서버 번호·원장 인계](qa/SERVER-PROMOTION-260926.md), [콘솔 소유 경계](SESSION-OWNERSHIP.md). 이 절 아래 블록은 작성 당시 기록이며 현황은 이 Latest 블록을 우선한다.

### 다음 세션 확인
```powershell
git fetch origin main
git show origin/main:docs/HANDOFF.md
npm run verify
```

---

---

## 2026-09-26 20:52 / Android 음성 Stop 수정·게이트 유지

- Android 제품 Record→Stop에서 React Native의 `ArrayBuffer` 기반 `Blob` 거부로 전사가 실패했다. `6cede82d`는 제한 크기 읽기 후 중단 가능한 청크 base64 변환으로 수정했고, 동일 AVD에서 오프라인 mock 전사 문구 표시·임시 음성 파일 삭제를 확인했다. 원격 DB·Edge 쓰기와 유료 호출 0건, 기록 저장 미실행. [화면과 검증 범위](qa/ANDROID-VOICE-CANCEL-260926.md).
- PR #1865는 Draft다. 문서 게이트 정정 `16850053`의 로컬 전체 verify(820 suites·10,691 Jest tests·UI 76)와 원격 CI 4/4는 통과했다. 음성 수정 `6cede82d`의 집중 Jest 19/19·TypeScript·대상 ESLint와 통합 전체 verify(820 suites·10,693 Jest tests·UI 76)는 통과했다. 새 CI는 대기 중이다.
- AdMob은 Q5 제3자 제공 중심 판단과 활성화 차단을 유지한다. 백업 전체 격리 복원 드릴은 승인됐지만 KeePassXC 개인키·임시 DB 접속·삭제 경로가 없어 프로젝트 생성 전 중단됐다. Paddle sandbox는 별도 프로젝트·설정·거래 증거가 없어 미완료다. Grok 후속 전달은 보류한다.

---

## 2026-09-26 20:17 / 격리 복원 사전 차단·AdMob Q5 분류

- AdMob Q5 자체 검토는 광고 SDK 송신을 **제3자 제공 중심**으로 분류했다. Google의 독립적 광고 처리 목적과 대법원 2016도13263 기준을 대조했고, [근거 초안](drafts/admob-q5-third-party-review-260926.md)에 법률·SDK 자료와 미확인 항목을 기록했다. `00e02e59`는 기존 `ads=true`·UMP를 새 동의로 인정하지 않고 웹/보상 광고·네이티브 UMP/SDK 호출을 차단하며 설정 화면은 과거 ON의 OFF만 허용한다. 현재 AdMob 계약 법인·이전 국가·보유기간을 몰라 처리방침 세 사본·판본·동의 SQL을 올리지 않았다. 새 별도 동의·실기기 초기 네트워크 검증 전까지 광고 ON·Draft 머지는 NO-GO다. 전체 `npm run verify`는 820 suites·10,691 tests와 UI 76 PASS였다.
- 사용자는 같은 Free 조직에서 임시 Supabase 프로젝트를 만들고 보상 적용 후 암호화 백업을 복호화·격리 복원·검증한 뒤 프로젝트와 로컬 평문을 삭제하는 전체 드릴을 승인했다. Orca 콘솔 Run `run_9e4033e7f735`는 백업 SHA-256 일치·월 USD 0 비용·활성 프로젝트 1개를 확인했다. 그러나 age 개인키는 잠긴 KeePassXC에 있고 임시 DB 접속·삭제 권한이 검증되지 않아 **프로젝트 생성 전 중단**했다. 평문·임시 프로젝트·운영 쓰기 0건, 복원 성공 증거는 없다. [사전 점검 HTML](qa/BACKUP-RESTORE-PREFLIGHT-260926.html). 사용자에게 로컬 보관함·대시보드 준비를 요청했다.
- 코딩 PR #1865에서 `0199_oauth_naver_rate_limit_completion.sql`(초안 바이트 동일), `0200_rss_proxy_quota.sql`(초안 바이트 동일), `0201_rss_proxy_erasure_registry.sql`(정본 등록부 생성 블록)을 번호 예약·push했다. RSS 사용자별 일일 쿼터는 콘텐츠 삭제로 초기화하면 안 되는 `retained` 71번째 행이며, 계정 삭제는 `public.users` FK로 연쇄 삭제한다. 0189 rollback 목록에는 등록부 전용 `0201`만 더하고 제품 표 생성 `0200`은 넣지 않았다. [번호·해시·의존성](qa/SERVER-PROMOTION-260926.md). 집중 Jest 54개와 등록부 검사, 전체 `npm run verify -- --runInBand` 818 suites·10,685 tests·UI 76 PASS. 원격 [SQL 리허설](https://github.com/Simon-YHKim/2nd-B/actions/runs/36233386382)의 0199·0200·0201 및 rollback 왕복을 포함한 4개 검사도 모두 PASS.
- 읽기 전용 운영 카탈로그에 `0183`의 OAuth 테이블·제한 함수와 RSS 사용자 쿼터 테이블·RPC가 아직 없다. `0199`는 `0183` 선행 없이 적용할 수 없다. 운영 백업 격리 복원·실데이터 이주 리허설, 원장 alias 대응, Edge/flag 확인 전 추가 운영 적용은 NO-GO다. 무료 Supabase 격리 프로젝트의 전체 복원 드릴은 사용자가 승인했다. 개인키·임시 DB 접속·삭제 경로가 확인될 때까지 생성은 보류하고 Grok 후속은 보류한다.
- 로컬 Chrome의 실제 분석 모듈/CSP 계측에서 합성 GA4 ID로 `gtag.js` 200과 성인·동의·런타임 ON의 `/g/collect` 시도를 확인했다. 수집 요청은 모두 네트워크 전송 전에 차단했다. 동의 OFF·런타임 OFF·미성년·철회·Paddle sandbox는 수집 시도 0건이었다(`scripts/qa/ga4-network-smoke.cjs`). 운영 GA4 수신·Paddle 실거래를 증명하지 않는다. Android 음성 Stop은 전사·audit DB 쓰기로 이어져 무쓰기 조건에서 누르지 않았다. 당시 오프라인 AVD 재기동은 자동 승인 검토가 사유 없이 거부됐고 제품 화면에서 녹음을 시작하지 않았다. 전용 AVD/Metro는 정리했다.
- 현재 `ae24b6e1` 웹 export에서 QA 계정 33화면(320/425/768px)의 pageerror·가로 넘침·깨진 이미지가 각각 0건이고, 320/425px 음성 녹음 시작·사진 카메라 버튼 4개는 스크롤 후 클릭 가능했다. 미배포 service-consent 404×3·Polaris 상태 404×1은 실패/대기 UI로 처리됐다. [웹 스크린샷과 범위](qa/REMAINING-WORK-260926.html). 별도 Android API 36 격리 fixture에서는 네이티브 Start→Cancel 뒤 임시 파일 부재를 확인했고 외부 기본 네트워크는 none 상태였다. Expo의 missing-file 응답에 `uri`가 없는 것을 정리 실패로 오판하던 `owned-temp` 검사를 고쳤다. 변경 후 전체 `npm run verify -- --runInBand`는 818 suites·10,686 tests·UI 76 PASS. [AVD 전후 증거·제한](qa/ANDROID-VOICE-CANCEL-260926.md). 앱 화면의 Stop→전사·DB·오디오 품질은 미검증이다.
- 19:46 KST 최신 PR JS `55f24cf3`을 실제 Android 제품 `/capture-full?mode=voice`에 로드해 QA 로그인→Record→`Recording...`→`To do` 탭 취소를 확인했다. 녹음 중 `.m4a` 1개가 생겼고 취소 뒤 `cache/Audio`가 비었으며 `[audio]` 경고·전사 요청은 0건이었다. 인증 POST 1회와 읽기 요청만 전달하는 로컬 프록시를 사용했고 전용 AVD·Metro·프록시를 종료했다. Stop→전사·저장·음질·실기기는 여전히 미검증이다. [제품 화면·상세 증거](qa/ANDROID-VOICE-CANCEL-260926.md).
- 19:30 KST Supabase 인증 읽기 전용 재조회에서 운영 migration 원장은 152행 그대로다. `polaris_generation_status`·가입 상태·서비스 동의 snapshot RPC, Naver OAuth·RSS 쿼터 선행 객체와 `service-consent` Edge는 여전히 없다. 암호화 백업 artifact·로컬 `.age` 크기/헤더/해시는 일치하고 age·pg_restore 및 KeePassXC 보관함 파일도 존재하지만 개인키 항목 접근·복호화·복원은 확인되지 않았다. 격리 프로젝트는 만들지 않았고 콘솔 담당의 키·DB 접속·삭제 경로 확인이 남는다. 추가 운영 적용 NO-GO와 Grok 후속 보류를 유지한다.

## 2026-09-26 18:05 / Android 캡처 탭 겹침 수정·운영 읽기 재확인

- 같은 Android API 36 AVD(1440×3120/560dpi)의 사진·음성 캡처 화면에서 선택 탭이 안내 문구를 덮는 현상을 재현했다. `src/app/capture.tsx`의 줄바꿈 탭에 명시적 basis·최소 높이를 주고 안내의 음수 여백을 없앴다. 수정된 JS로 두 화면을 재기동하니 탭·`Show less`·안내가 분리됐다. 수치 bounds는 UIAutomator 타임아웃으로 확보하지 못했다. [동일 기기 전후 스크린샷과 범위](qa/ANDROID-CAPTURE-LAYOUT-260926.md). 카메라 권한 후 시스템 프리뷰까지만 열었고 마이크 권한은 거부했다. 촬영·OCR·녹음·전사·저장·효과음 출력은 검증하지 않았다. 전용 AVD/Metro는 종료했고 공용 8081은 유지했다.
- 별도 QA의 과거 Polaris mock 감사에서는 `persona_narrative` 1건·`persona_synthesis` 2건과 `role_cards_v1` 부재가 당시 mock 분기로 설명된다. 현 통합 코드의 mock 응답은 합성 카드를 만들지 않고 `polaris_live_required`로 멈춘다. 과거 실제 생성 실패의 HTTP 응답·예외가 없으므로 원인은 특정할 수 없고, audit 행이 없다는 사실만으로 공급자 호출이 없었다고 결론 내리지 않는다. 현 운영 `polaris_generation_status` 404에서는 생성 CTA가 비활성이다.
- Supabase 읽기 전용 재조회에서 migration 152행의 마지막 네 행은 보상 alias 2개와 중복 0172 두 행 그대로다. `service-consent` Edge는 없고 `rewarded-ssv` v91의 수정 시각은 12:23:51 KST 그대로다. `Learner-thepoorman's Org`는 Free 플랜이고 새 프로젝트 비용 재조회는 월 **$0**이다. 격리 프로젝트 생성·암호화 백업 복원·삭제는 별도 사용자 결정 대기이며 아무것도 생성하지 않았다. 운영 추가 SQL·Edge 배포/공개는 NO-GO, Grok 후속 전달은 보류다.

---

## 2026-09-26 17:33 / Android 로그인 후 오디오 RedBox 재현·수정본 재기동

- 별도 Android 전용 AVD에서 기존 APK의 네이티브 입력과 PR 최신 소스의 동일성을 Git 내용으로 확인하고, 최신 JS 번들(3285 modules)을 Metro 8084로 로드했다. QA 계정 로그인 뒤 온보딩 Continue에서 `Cannot assign to property 'playbackRate' which has only a getter` RedBox가 발생해 홈 진입이 막혔다. 증거는 로컬 `Output/runtime-validation-260926/latest-runtime-result.json`·`latest-31-after-continue.png`·`latest-playbackrate-log.txt`(전용 `native-260926` 워크트리)에 보존했다.
- 원인은 `src/lib/audio/use-ui-sound.ts`의 속성 대입이다. 설치된 expo-audio 56.0.12의 Android `playbackRate`는 getter만 있고 `setPlaybackRate(rate)`가 변경 함수다. 통합 PR 트리에서 메서드 호출로 바꾸고 getter 전용 Android/iOS mock 회귀 테스트를 추가했다. 변경 전 테스트는 같은 TypeError로 실패했고 변경 후 전체 `npm run verify -- --runInBand`가 818 suites·10,686 tests·UI 76개 PASS였다. 수정된 JS로 AVD를 재기동해 후속 First Record 화면과 `secondbrain:///` 별자리 홈을 RedBox 없이 표시했다(`native-260926/Output/runtime-validation-260926/fix-08-deeplink-root.png`). 기록 확정은 운영 DB 쓰기 가능성 때문에 누르지 않았고 카메라·오디오 출력도 미검증이다. 전용 AVD·Metro는 정리하고 공용 8081은 유지한다.

## 2026-09-26 17:09 / AdMob 법률 결정과 PR 동의 판본 대조

- 저장소 밖 최신 결정 `E:/2ndB/docs/drafts/privacy-admob-simon-decisions-2026-09-26.md`(16:00 KST)는 시행일 **2026-09-26**, Q4 AdSense 행 제외, Q6 광고 스위치 국외 이전 고지 포함, Q5 AdMob 처리위탁/제3자 제공 분류 **보류**를 기록한다. 16:11 KST 법률 체크 초안은 Q5를 #1865 머지 차단으로 분류한다. 두 문서는 코드·DB에 자동 반영된 것이 아니다.
- Draft PR #1865의 처리방침 세 사본과 `PRIVACY_POLICY_VERSION`, 가입 0191·서비스 동의 0194 SQL의 판본은 여전히 **2026-09-25**이다. 광고 스위치의 현재 문구는 국외 이전의 항목·국가·시기/방법·수신자 연락처·목적/보유기간·거부 효과를 한 화면에서 고지하지 않는다. [개인정보 보호법 제28조의8 제2항](https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1033215841)의 고지 항목과 대조했다. Q5 결정과 정확한 고지 문구를 확정한 뒤 세 사본·앱 판본·두 SQL 계약·스위치 UI·테스트를 **같은 회차**로 갱신해야 한다. 지금은 날짜만 바꾸거나 광고를 켜거나 PR을 머지하지 않는다. [HTML 잔여 작업](qa/REMAINING-WORK-260926.html).

## 2026-09-26 16:50 / Draft PR 최신 웹 GUI 실측

- Draft PR #1865의 검증 head `8cecd849`로 새 웹 export를 만들어 QA 계정의 로그인·화면 이동을 실행했다. 320·425·768px의 28개 화면 점검에서 pageerror 0, 가로 넘침 0, 깨진 이미지 0이었다. 첫 로컬 export의 랜딩 번들 누락 404 세 건은 CI와 같은 `esbuild` 번들을 넣은 뒤 3개 너비에서 오류 0으로 재검증했다. 남은 `service-consent` 404 세 건은 서버 계약 미배포를 확인한 것이며 UI는 재시도 안내를 표시한다. [HTML 보고서](qa/REMAINING-WORK-260926.html).
- 같은 최신 코드의 `/core-brain`에서 운영 `polaris_generation_status`가 HTTP 404인 실제 조건을 확인했다. 425px 화면에서 `기록으로 페르소나 제안 받기` 버튼은 비활성이고 “생성 기능 설정을 기다리고 있어요” 문구가 보인다. 생성·쓰기 요청 0, pageerror 0. 결과와 화면은 로컬 `Output/web-resume-260926/qa-latest-core-only-results.json` 및 `screenshots/latest-core-action-425.png`에 있다. 이는 모델 생성 품질 검증이 아니다. 운영 추가 SQL·클라이언트 공개 NO-GO, 격리 복원 승인 대기, Grok 후속 보류는 유지한다.

## 2026-09-26 16:19 / 보상 서버 적용 후 백업 확보 · 복원 대기

- 보상 서버 스위치가 14:19 KST에 켜진 뒤 [수동 암호화 백업](https://github.com/Simon-YHKim/2nd-B/actions/runs/36226292412)을 16:16–16:19 KST에 한 번 실행했다. `pg_dump`·age 암호화·업로드가 모두 PASS이고, 아티팩트 `db-backup-36226292412`는 1,629,137바이트 ZIP으로 10월 10일 16:19 KST까지 보관된다. 다운로드한 `.age` 파일의 헤더와 SHA-256을 확인했지만 복호화·격리 복원은 아직 하지 않았다. 아래 06:44–06:47 백업은 보상 적용 **이전** 스냅샷이다. [상세와 복원 게이트](qa/SERVER-PROMOTION-260926.md).
- 같은 조직(`Learner-thepoorman's Org`)의 격리 Supabase 프로젝트 비용 조회 결과는 월 **$0**이다. 프로젝트 생성·운영 데이터 복원·드릴 종료 후 삭제는 별도 사용자 결정 대기 중이며, 프로젝트는 만들지 않았다. 유료 개발 브랜치 보류와 Grok 후속 전달 보류도 유지한다.
- Draft [PR #1865](https://github.com/Simon-YHKim/2nd-B/pull/1865)의 코드·문서 head `1520721e`는 원격 [SQL](https://github.com/Simon-YHKim/2nd-B/actions/runs/36226061143)·[verify/web](https://github.com/Simon-YHKim/2nd-B/actions/runs/36226061190)·[제목 검사](https://github.com/Simon-YHKim/2nd-B/actions/runs/36226061165)가 PASS다. 이번 인수 문서 후속 커밋의 CI는 별도로 확인한다. 운영 추가 SQL 적용과 클라이언트 공개는 NO-GO다.

## 2026-09-26 15:19 / #1865 운영 읽기 감사 · 최종 CI 확인

- PR #1865의 `7217d4d5`에서 0191–0198 번호 SQL, 삭제 등록부·0189 rollback·SQL CI 전환이 원격 4개 검사 PASS다([SQL](https://github.com/Simon-YHKim/2nd-B/actions/runs/36222133872) · [verify/web](https://github.com/Simon-YHKim/2nd-B/actions/runs/36222133905)). 최신 main `fe20ad03`의 운영 기록을 이 통합 브랜치에 포함한다. 게시·운영 일괄 `db push`는 여전히 하지 않는다.
- main #1868은 Simon GO로 14:19부터 `REWARD_SSV_ENABLED=1`이라고 기록한다. 인증 없는 POST 401은 스위치 통과를 확인한 증거이고, 14:29까지 실사용 호출 0건이다. 광고 ON과 서명·변조·재전송 카나리아는 별도이며 아직 완료 증거가 없다. 0172 중복 두 행은 동일 GO가 두 경로로 전달돼 생겼고, 재적용·원장 정리 금지다. Edge 목록 v91의 `updated_at`은 12:23:51 그대로라 새 배포로 해석하지 않는다.
- 최신 운영 상태가 아래 14:57·14:36·14:15 블록의 플래그 미확인/서버 OFF 가능성보다 우선한다. 콘솔 소유자는 Reward alias와 남은 번호 SQL의 실제 원장·백업 복원·격리 리허설을 확인한다. Grok 후속 전달은 사용자 보류를 유지한다.
- 인증된 읽기 전용 재조회: 운영 원장 152행이고 마지막 네 행은 `reward_ssv_tickets`, `reward_ssv_hardening`, 중복 0172 두 행 그대로다. Git SQL과 공백 제외 본문 MD5는 세 파일 모두 일치하고, 0196은 원문 MD5도 일치한다. Reward 신규 RPC 4개는 `service_role`만 실행 가능하고 확인한 구 RPC 3개는 공개 역할·`service_role` 모두 실행 불가. 티켓 발급·소비 0건, Paddle 이벤트 4건 중 adjustment·legacy consequence 0건, self-service 청구 0건. Edge v91의 수정 시각은 여전히 12:23:51이고, 가입·동의·삭제·Polaris 신규 객체와 개발 브랜치는 없다. [SQL 원문·운영 대조](qa/SERVER-PROMOTION-260926.md).
- Draft PR #1865 최종 head `67e9cab0`의 원격 lint·SQL·verify·web export **4/4 PASS**를 다시 확인했다. [일일 암호화 백업](https://github.com/Simon-YHKim/2nd-B/actions/runs/36193185108)은 09-26 성공했고 아티팩트가 남아 있다. Orca 콘솔 작업은 Backup·ModelRefreshReadOnly 환경을 main 전용 정책으로 고쳤다([자격증명 경계](GITHUB-ACTIONS-CREDENTIAL-BOUNDARIES.md)). 이번 백업의 격리 복원·나머지 SQL의 실데이터 리허설·Reward 서명 카나리아는 미완료다. 이 조회는 운영 쓰기를 하지 않았다.

---

## 2026-09-26 14:57 / 서버 SQL 8개 번호 승격 · PR 원격 4/4 PASS

- Draft PR [#1865](https://github.com/Simon-YHKim/2nd-B/pull/1865)의 head `7217d4d5`에 초안 원문 Git blob과 같은 0191–0198 번호 SQL을 push했다. 정본 삭제 등록부 +4행/forward additions, 0189 rollback의 registry-only 원장 재생, SQL CI 중복 실행 방지를 함께 반영했다. [번호·해시·운영 alias 대응표](qa/SERVER-PROMOTION-260926.md) · [HTML 잔여 작업](qa/REMAINING-WORK-260926.html). 기존 고정 인계 manifest는 바꾸지 않았다.
- 로컬 `npm run verify -- --runInBand` **818 suites / 10,684 Jest tests**, UI 76 PASS, lint 오류 0·기존 경고 71. 원격 [SQL](https://github.com/Simon-YHKim/2nd-B/actions/runs/36222133872)은 181개 번호 SQL의 fresh 적용, 등록부 70행·8개 원장 행, 0189 롤백/CLI 재적용, Reward·Paddle 회귀를 포함해 PASS. [CI verify·web export](https://github.com/Simon-YHKim/2nd-B/actions/runs/36222133905)와 PR 제목 검사도 PASS. 이 문서 후속 커밋의 원격 검사는 별도로 확인한다.
- **운영 추가 적용·공개는 NO-GO.** 운영에 이미 `reward_ssv_tickets`·`reward_ssv_hardening` alias가 있고 0172는 두 번 기록됐다. 두 번째 0172 뒤 13개 함수 본문·ACL 지문은 설계 기대값과 일치했지만 중복 원인과 최신 Edge/flag·콜백은 미확인이다. Reward SQL 재적용·운영 일괄 `db push` 금지. 복구 가능한 백업의 격리 복원, 실제 원장 alias 화해, 나머지 번호 SQL의 실데이터 리허설은 콘솔 소유자가 완료해야 한다. 유료 개발 브랜치는 사용자 결정대로 만들지 않았다. Grok 후속 전달도 사용자 결정대로 보류한다.

## 2026-09-26 14:49 / 보상 서버가 켜졌다 (Simon GO) · 봇 협업 규칙을 스킬에 넣었다

- 아래 14:06 블록의 "보상 서버는 여전히 꺼져 있다"는 **14:19 부터 틀렸다.** Simon GO 로 `REWARD_SSV_ENABLED=1`(Clavius). 인증 없는 POST 가 401 이라 켜진 것이 확인되고, 14:29 까지 실사용 호출은 0 이다.
- 0172 는 원장에 **두 줄**(`050258` 코딩 LLM · `050638` Hadrianus)이다. 같은 GO 가 두 경로로 와서 생겼다. 바이트가 같다. 재적용·원장 정리 금지.
- Edge `rewarded-ssv` 목록 번호는 91 이지만 `updated_at` 은 12:23:51 그대로다(#1865 판). 재배포는 없었다.
- 다음: 카나리아 주체(QA 빌드·테스트 계정) 미정 · 광고 ON 별도 GO · #1865 머지 전 `rewarded-ssv` 디스패치 금지.
- 봇 협업 규칙은 SimonK-stack #50(`c4d5c95a`) `vibe-bot/references/relay-handshake.md`. **증명된 Simon GO(`simon-go-attested-*`)는 되묻지 않는다.** 이 파일은 98KB 라 다음 블록 전에 가장 오래된 블록을 `handoff/HANDOFF-2026-09-p2.md` 로 옮길 것.
## 2026-09-26 14:36 / PowerShell 복구 후 SQL 번호 승격 작업 중

- Codex 다운그레이드 뒤 PowerShell 실행 문제가 해소됐다는 사용자 안내를 반영했다. 통합 워크트리 `fix/qa-harness-integrated-260925`에서 원문 바이트 그대로 초안 8개를 후보 `0191`~`0198` 번호 SQL로 복사했고, 삭제 등록부 네 행·`forwardAdditions`와 0189 롤백 재생 목록을 연결했다. **아직 검증·push 완료나 번호 예약을 선언하지 않는다.** [승격·운영 원장 대응표](qa/SERVER-PROMOTION-260926.md).
- 인증된 읽기 전용 재조회에서는 두 번째 0172 적용 뒤 보상 함수 본문·ACL 지문이 설계 순서의 기대값과 **13/13 일치**했다. 이는 0172 중복 원장의 원인이나 현행 플래그·콜백 성공을 증명하지 않는다. `rewarded-ssv` Edge는 약 14:28 조회에서 v91이었다. 아래 v89 기록은 당시 스냅샷이다.
- 운영의 0177·hardening은 번호 없는 timestamp/name 원장으로 이미 적용됐고 0172는 두 번 기록됐다. 승격된 번호 SQL을 이유로 Reward를 재적용하거나 운영에서 일괄 `db push` 하지 말 것. 콘솔 소유자의 원장 alias·백업/복원·격리 리허설, 최신 Edge/flag 확인 전 공개 가드는 유지한다. Grok 후속 전달은 사용자 결정대로 보류다.

## 2026-09-26 14:15 / 0172 중복 원장 발견 · Reward 재적용 금지

- 코딩 세션의 인증된 Supabase **읽기 전용** 조회에서 `0172_reward_authorization_hardening` 원장 행이 `20260926050258`와 `20260926050638` 두 개 확인됐다. 각 SQL은 9639/9640바이트이고 공백 제외 MD5는 동일하다. 두 번째 적용 뒤 함수 지문과 플래그·실제 기능은 재검증하지 않았다.
- Edge 함수 목록의 `rewarded-ssv`는 v89로, 아래 13:51 기록의 v88보다 최신이다. 현재 활성화 상태를 이 조회만으로 판정하지 않는다.
- **콘솔 담당 확인 전 0172·0177·hardening 재적용과 Reward 활성화·카나리아는 보류한다.** 중복 원장 원인, 두 번째 적용 뒤 13개 함수 지문·ACL, v89 소스와 서버 플래그를 대조한다. [PR #1865 잔여 작업](qa/REMAINING-WORK-260926.html). 이 코딩 세션은 운영 쓰기·Grok 후속 발송을 하지 않았다.

## 2026-09-26 14:06 / 0172 를 운영에 적용했다 (Simon GO) · 보상 서버는 여전히 꺼져 있다

### 어디까지 왔나

- 이 블록 작성 전 `origin/main` 은 `c0973cf0`(#1866). 바로 아래 13:51 블록의 작업 큐 A ①②가 끝났다.
- Simon 이 이 세션에 "적용해." 로 GO 를 줬다. **2026-09-26 14:02:58 KST** 에 `apply_migration(name=0172_reward_authorization_hardening, query=<main 파일 바이트>)` 로 적용했다. 원장은 `20260926050258 0172_reward_authorization_hardening`(번호 stem 이름)이다.
- 적용 직전에 다시 확인했다: 원장에 0172 류 0건, 보상 함수 13개 지문이 13:47 기준과 13/13 동일(그 사이 아무도 안 바꿈). 직전 정의·ACL 스냅샷은 `E:/Coding Infra/reports/vibe-r260926/r0172-prod-order/apply/` 에 있다.
- 적용 뒤: 지문이 로컬 재생의 설계 순서(0172→0177→hardening)와 **13/13 동일**하다. 바뀐 줄은 예측한 5줄이다. 14:02:58 전후 Edge 응답은 전부 200(전 100 · 후 38)이고, Postgres 로그의 권한 오류는 0건이다. apply_migration 은 `begin;` 으로 감싸 실행돼 파일의 `SET LOCAL` 도 유효했다.
- Grok 봇 팀에는 `relay/inbox/vb-e7332f88.md` 로 "이미 적용됨, 재적용 금지" 를 알렸다. 14:03:51 에 같은 알림을 `vb-81643efb` 로 올렸는데 셸 오류로 본문이 0바이트였다. claim 되기 전에 걷어냈다.

### 다음 작업 큐

| # | 작업 | 누가 | 권장 |
|---|---|---|---|
| A | `REWARD_SSV_ENABLED=1` **제한 카나리아**(서명·변조·재전송, 감시 창 안). 지금 값은 `true` 라 서버는 503 `disabled` | Simon GO · 콘솔 세션 | ⭐ 0172 가 들어가서 이제 켤 수 있는 상태다. 광고 ON 은 별도 GO |
| B~E | 13:51 블록의 B~E 그대로(#1865 머지 전 `rewarded-ssv` 디스패치 금지 · hardening 번호 매핑 · 원장 밖 ACL 출처 · 미푸시 워크트리) | 각 주인 | 변동 없음 |

---

## 2026-09-26 13:51 / 운영 보상 서버가 main 보다 앞서 나갔다 · 0172 가 빠졌고 켜는 값이 틀려서 지금은 꺼져 있다

### 어디까지 왔나

- 이 블록 작성 전 `origin/main` 은 `ed2e54c8`. PR [#1865](https://github.com/Simon-YHKim/2nd-B/pull/1865)(draft, `fix/qa-harness-integrated-260925`) head 는 `2a28b5fb`.
- **2026-09-26 12:24~12:29 KST, Grok 봇 팀이 Simon GO 로 운영을 바꿨다** (근거는 저장소 밖 버스 `E:/2ndB/.bots/*/outbox/vb-simon-go-*.result.md`):
  - DB: `0177_reward_ssv_tickets` 와 `db/migration-drafts/UNNUMBERED_reward_ssv_hardening.sql` 를 `apply_migration` 으로 적용했다. 원장 이름은 **번호 없는** `reward_ssv_tickets`(`20260926031508`) · `reward_ssv_hardening`(`20260926031610`)이다.
  - Edge `rewarded-ssv` v86 → v88(중간 v87 에 PLACEHOLDER 가 잠깐 올라갔다가 교체됐다).
  - AdMob Android 보상 단위의 SSV 콜백 URL 을 저장했다(Verify 200 을 받은 뒤).
  - Edge secret `REWARD_SSV_ENABLED` 를 설정했다.
- 코딩 LLM 이 이를 저장소·운영과 대조했다. 운영 쓰기는 없고 읽기 전용 조회만 했다. 다른 워크트리는 건드리지 않았다.
  1. **SQL 바이트는 main 과 같다**(CR 제거 sha256 앞 12자: 0177 `d6262793126d`, hardening `4a637061a237`). **Edge v88 소스는 main 판이 아니라 #1865 head 판이다**(`index.ts` `39141c23fd3e`, `reward-contract.ts` `8c075243ed14`. main 판은 `568b472d3456` / `e347e7eb2be5`).
  2. **보상 서버는 지금 꺼져 있다.** v88 은 `REWARD_SSV_ENABLED` 가 정확히 `'1'` 일 때만 켜진다(#1865 `supabase/functions/rewarded-ssv/index.ts:228`). 설정된 값의 다이제스트는 `true` 라벨과 일치한다(Keys 봇 13:47 대조, 값 원문은 안 봤다). 프로브 응답도 503 `disabled` 다. 클라 변수는 `EXPO_PUBLIC_REWARD_SSV=true`, 서버 변수는 `REWARD_SSV_ENABLED=1` 로 **글자가 다르다.** 이 함정이 그대로 밟혔다.
  3. **0172 가 운영에 없다.** hardening 은 "0172·0177 이 적용됐어야 한다" 는 전제 검사를 갖고 있다. 그런데 그 검사가 보는 것은 0172 의 ACL 절반뿐이다. 운영에는 **원장 밖에서** `grant_chat_ad_bonus(uuid)` · `bump_reward_credits_if_under_cap` 의 `authenticated` EXECUTE 만 회수된 상태가 있었다(09-25 01:32 에 이미 그 상태였다는 봇 기록이 있다. 누가 언제 했는지는 모른다). 그래서 검사가 통과했다. 저장소 순서대로 재생하면 hardening 은 이 전제 검사에서 **실패한다.**
  4. **로컬 재생이 운영과 일치한다.** PostgreSQL 18 스크래치에 main 0001~0146, 운영 원장 순서의 0147·0165·0188·0148·0149·0150, 원장 밖 회수, 0177, hardening 을 올렸다. 보상 함수 13개의 ACL 과 주석을 뺀 본문 md5 가 운영과 **13/13 같다.** 그 위에서 확인한 것은 셋이다.
     - 티켓 발급 뒤 광고 동의를 끄고 콜백이 오면 **그래도 지급된다**(추론 +2, 채팅 +2). 0177 주석의 "나중 동의·등급 변경도 fail-closed" 는 0172 가 있어야 성립한다.
     - 0172 를 지금 얹으면 오류 없이 들어간다. 결과는 설계 순서(0172→0177→hardening)와 **13/13 같은 지문**이 되고, 동의 철회 뒤 콜백은 지급하지 않는다.
     - 0172 가 service_role 에서 회수하는 옛 지급 함수 2개를 부르는 Edge 는 main·#1865 어디에도 없다.
     - 하네스·출력: `E:/Coding Infra/reports/vibe-r260926/r0172-prod-order/` (`out/behave-results.txt` · `out/fp-*.txt`).
- Grok 인계서의 Ask 1~3 에 대한 판정:
  - Ask 1(AdMob 개인정보처리방침 세 사본)·Ask 3(`_ANDROID`/`_IOS` 단위 env)은 **이미 #1865 안에 있다.** 새 PR 을 만들지 않았다. #1865 의 처리방침 시행일은 `2026-09-25` 로 박혀 있으니 게시 시점에 다시 정해야 한다.
  - Ask 2(`a72c0265` 를 observatory 에 체리픽)는 **하지 않는다.** `a72c0265` 는 291 파일짜리 통합 커밋이다. 그리고 observatory 의 wiring 테스트 "불일치" 는 그 워크트리 자기 홈 화면(`secondb-dialogue-launcher`)에 맞춘 것이었다. 봇 보고서에는 두 워크트리 이름이 뒤바뀌어 있었다.

### 다음 작업 큐

| # | 작업 | 누가 | 권장 |
|---|---|---|---|
| A | **0172 적용**: `apply_migration(name=0172_reward_authorization_hardening, query=<main 파일 바이트>)` → 지문 조회로 기대 13줄과 대조 → 그 뒤에만 `REWARD_SSV_ENABLED=1` 제한 카나리아(서명·변조·재전송) | Simon GO · 콘솔 세션 | ⭐ 켜기 전 필수. 기대 지문과 조회문은 버스 `relay/inbox/vb-11c495b1.md` 에 있다 |
| B | #1865 머지 전에는 `deploy-edge-function.yml` 로 `rewarded-ssv` 를 **디스패치하지 말 것.** 기본 브랜치(main) 판으로 되돌아간다 | 모두 | 머지 뒤에 해제 |
| C | hardening 번호 예약 때 "후보 0196 = 운영 원장 `reward_ssv_hardening` @ 2026-09-26 12:16 KST" 를, 0177 은 "원장 `reward_ssv_tickets`" 를 매핑표에 적는다. **재적용 금지** | #1865 주인 | 원장 이름이 파일 stem 과 달라서, 이름으로 대조하면 '미적용' 으로 오판된다 |
| D | 원장 밖 ACL 회수의 출처를 찾아 기록한다(마이그레이션으로 흡수할지 결정) | 콘솔 세션 | 보상 함수 13개 기준으로 재생과 운영의 차이는 이것 하나였다 |
| E | observatory · localhost · grok-qa-complement 워크트리는 **원격에 브랜치가 없다.** observatory 에만 #1865 와 다르거나 #1865 에 없는 미커밋 파일이 97개(72+25) 있다 | 각 워크트리 주인 | 코딩 LLM 은 남의 dirty 트리를 건드리지 않았다 |

### 협업 채널 (Grok 봇 ↔ 코딩 LLM)

- 코딩 전용 봇이 없어서, Relay 가 `E:/2ndB/.bots/relay/inbox/` 에 "Coding LLM" 앞 포인터를 넣는다(오늘 `vb-a8f1c301`). 코딩 LLM 은 `relay/outbox/<nonce>.result.md` 로 회신한다. 인계서는 저장소 밖 `E:/2ndB/docs/drafts/coding-llm-handoff-2026-09-26.md` 에 있다.
- 이번 세션이 사용자 지시로 직접 발행한 과제는 `vb-68cdfca0`(ENABLED 다이제스트 판정, 회신 받음)과 `vb-11c495b1`(재생 결과를 STATUS 에 반영하고 0172 를 GO 후보 1순위로)이다. guarded `execute_bot` 어댑터는 쓰지 않았다(인증서·과금 증거가 없어서).
- 정정: `vb-a8f1c301` 회신과 `vb-68cdfca0` 에 적은 작성 시각 13:58 은 틀렸다. 실제 게시는 13:42 KST 다. `vb-11c495b1` 안에서도 정정했다.

## 2026-09-26 / Orca 콘솔 발주·운영 NO-GO

PR #1865 CI·GUI PASS. Orca 콘솔 감사 **NO-GO**: 번호·백업·clone·OAuth/RSS SQL 미준비. 운영 쓰기·공개 없음, Grok 보류. [근거](qa/CONSOLE-PREFLIGHT-1865-260926.md).

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
