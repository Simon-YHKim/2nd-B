# 2nd-Brain Handoff

> 가장 최신 섹션이 맨 위. 2026-06-16 이전 sprint 핸드오프는 [handoff/ARCHIVE-2026-05-25_to_2026-06-16.md](handoff/ARCHIVE-2026-05-25_to_2026-06-16.md) 로 아카이브됨(2026-07-03).
> Live: <https://simon-yhkim.github.io/2nd-B/>

## 이 로그는 기간으로 쪼개져 있다

단일 파일 100KB 상한(Simon 지침 §2 · §0-1)을 지키려고 **요약이 아니라 기간으로**
나눴다. 이 파일은 **활성 창**이고, 밀려난 블록은 아래 파일에 원문 그대로 있다.
한 글자도 요약하지 않았다.

| 덮는 기간 | 파일 | 블록 | 크기 |
|---|---|---|---|
| 2026-09-25 ~ 2026-09-26 | [handoff/HANDOFF-2026-09-p3.md](handoff/HANDOFF-2026-09-p3.md) | 20 | 40KB |
| 2026-09-08 ~ 2026-09-21 | [handoff/HANDOFF-2026-09-p2.md](handoff/HANDOFF-2026-09-p2.md) | 16 | 94KB |
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
**⚠ `HANDOFF-2026-09.md`(p1) 92KB · `-p2` 94KB 로 찼다 — 09 월 블록은 `-p3` 로 간다.**
절차는 `/simon-handoff` 가 갖는다. **요약은 어느 단계에서도 하지 않는다.**

## Latest — 2026-09-30 20:13 / 앱 = localhost 의 기준을 origin/main 으로 — 8081 이 main 을 스스로 따라간다 · APK 게시는 볼 때만

> 발행: CLI 코딩 세션(TTL-Work_rev2, session_011kqZojB5KVspmMgAZ4rZ89). Simon(09-30) 원문:
> "항상 localhost를 수정하면 앱에도 동일하게 적용되게 하고 싶은데, 매번 apk 발행은 너무 헤비 한데?
> 똑같이 apk를 만들수 있게 코드 수정만 해놓으면 안돼?"

- **바뀐 기준.** '같음' 은 이제 origin/main 을 기준으로 한다. 조건은 셋이다.
  - 8081 이 origin/main 과 코드 · 설정 · 의존성(lockfile · patches 내용, 지운 · 고친 옛 패치가 남지 않음)이 같다.
  - 같은 코드 · 같은 설정의 폰용(arm64) CI APK 빌드가 성공했거나 진행 중이다. 끊길 것이 확실한 대기 빌드와 설정 주석을 아직 안 남긴 수동 빌드는 세지 않는다.
  - QA APK 게시(`npm run app:qa-release`)는 폰에서 볼 때만 한다. 같은 설정의 빌드가 없으면 기본 입력으로 새로 빌드한다. 09-29 판의 "머지할 때마다 게시" 는 폐지했다.
- **8081 이 main 을 따라간다.** `npm run localhost` 는 먼저 origin/main 의 스크립트에게 `preflight --ref` 로 묻는다. 체크아웃은 옮기지 않은 채 묻고, 통과해야 옮긴다. 그다음 세션과 분리된 감독자를 숨은 창(WMI)으로 띄운다. 감독자는 60초마다 이렇게 움직인다.
  - 앱 경로가 바뀌면 체크아웃한 뒤 다시 띄운다.
  - 문서만 바뀌면 체크아웃만 옮긴다.
  - 스크립트가 바뀌면 새 스크립트의 preflight 가 통과할 때만 갈아탄다. 새 감독자가 기록을 안 쓰면 띄운 것을 멈추고 옛 커밋 · 옛 서버로 되돌린 뒤, 그 스크립트로는 10분 뒤부터(실패할 때마다 두 배, 상한 4시간) 다시 시도한다. 거부는 10분 기억한다.
  - 설치 불일치 · 해석 못 하는 설정 · 새 스크립트 거부면 보류하고 띄운 커밋을 그대로 둔다. 그 사이 누가 체크아웃을 옮기면 띄운 커밋으로 되돌린다(못 되돌리면 멈춘다).
  - 전용 워크트리에 미커밋 변경이 생기면 8081 을 멈추고, 깨끗해지면 띄운 커밋인지 확인한 뒤 다시 띄운다.
- **`android-release.yml` 세 곳을 고쳤다.**
  - 빌드 경로에 번들 입력 5개를 넣었다: `locales/**` · `public/proto/**` · `design/avatar-style-v2/**` · `tsconfig.json` · `metro-module-id.js`. 지금까지는 문구 · 캐논 · 아바타만 바뀐 머지가 APK 를 다시 안 만들었다. 원래 있던 구멍이다.
  - 첫 게이트 뒤(Setup Node 직후, npm ci 전)에 EXPO_PUBLIC digest 와 ABI 를 run 주석 `app-env-digest` · `app-apk-abi` 로 남긴다. 저장소 Variables 만 바뀐 경우와 에뮬레이터용 x86_64 빌드를 가려내고, 진행 중인 수동 빌드도 1분 안에 폰용인지 알 수 있다. 주석이라 새 액션이 들지 않아 보안 테스트의 액션 수 고정도 그대로다. 뒤 단계가 EXPO_PUBLIC_* 를 바꾸지 않는 것은 테스트가 지킨다.
- **리뷰 세 차례(적대 리뷰 워크플로, 에이전트 합계 16).**
  - 1차(8): 34건 중 27건을 확인했다. 번들 입력이 경로 밖 · Variables 만 바뀐 APK · 머지 전 인수 시 8081 꺼짐 · 점검 전 서버 종료 · 정본 detach 위험 · 판정 불일치 등이다.
  - 2차(4): 23건이 닫힌 것을 확인했고, 새로 20건을 찾았다. 살아 있는 체크아웃을 옮겨 가며 묻기 · x86 빌드 게시 · 게이트 밀림을 실패로 보고 · 패치 시각 판정 · 없는 빌드를 '같음' 으로 판정 등이다.
  - 3차(4): 앞선 지적 20건 중 11건이 닫힌 것을 확인했다. 덜 닫힌 3건과 새로 확인된 8건(모두 낮음, 겹친 2건 제외)을 고쳤고, 반박된 2건(되돌린 기록의 childPid 표시 · NODE_PATH 테스트 공백)도 반영했다. 고친 것: 보류 중 옮겨진 체크아웃을 띄운 커밋으로 되돌리기(못 되돌리면 멈춤) · 넘겨주기 실패 때 띄운 새 감독자를 멈추고 재시도 간격 두기 · 되돌린 기록을 서버를 띄운 뒤에 쓰기 · 거부 기억 10분 · 지운 · 고친 옛 패치가 설치에 남은 것 잡기 · 끊길 대기 빌드와 주석 없는 수동 빌드 · x86 빌드를 '빌드 중' 으로 세지 않기 · qa-release 가 디스패치한 빌드를 SHA 대신 시각으로 찾기 · 09-29 판 감독자 명령줄(--port 없음) 알아보기 · 감독자 없이 남은 Metro 를 포트 주인으로 찾기 · CLAUDE.md 보류 문구.
- **검증.** app-parity 테스트 58개(실제 git 저장소 따라가기 16가지 포함) 통과 · 이번 수정 변이 15종 전부 테스트가 잡음(원본 해시 복원 확인) · 실제 설치 3곳 패치 드리프트 0건 · 워크플로 테스트 112개 통과 · 8081 읽기 전용 대조(옛 감독자 알아봄 · 남은 Metro = 포트 주인) · `npm run verify` 통과(종료코드 0 · 848 suites / 11,011 tests)
- **미검증 1건.** CI 가 남기는 digest 가 로컬 계산(현재 `e90c4cb7…`)과 같은지는 이 PR 머지 뒤 첫 빌드의 주석으로만 확인할 수 있다. 걸린 것은 값이 빈 `EXPO_PUBLIC_SAFETY_VENDOR` 다. 로그의 단계 env 머리에는 빈 값으로 찍혀 있어 러너가 넘기는 것으로 보이지만, process.env 에 실제로 들어가는지는 아직 확인하지 못했다. 다르면 모든 빌드가 '다른 설정' 으로 나와 '다름' 쪽으로 멈춘다(거짓 '같음' 은 아니다).
- **다음 1개.** 이 PR 이 머지되면 아무 워크트리에서나 `npm run localhost` 를 한 번 친다. main 스크립트의 preflight 가 통과한 뒤에야 옛 방식 감독자(`node scripts/app-parity.cjs localhost`, --port 없음 - 이제 감독자로 알아본다)를 멈추고 넘겨받는다. 그다음 `npm run app:parity` 를 친다. 이 PR 의 워크플로 변경으로 도는 첫 빌드의 digest 주석을 로컬 값과 대조한다. 그 뒤로는 머지만 하면 된다.

---

## 2026-09-30 19:20 / 모바일 GUI P0·P1와 동의 모드 진단

- main `f62433a0`: [#1937](https://github.com/Simon-YHKim/2nd-B/pull/1937) 뮤지엄 모바일 43사건 목록·2축 전환, 식단 21칸의 고유 버튼 이름·최소 44px를 병합했다. CI 3종과 로컬 verify 848묶음/10,966테스트 통과. [화면·측정 보고서](qa/gui-260930/report.html)는 375/425px Chrome, 사건 상세·식단 입력창 열림, 페이지 오류 0건을 기록한다. Android 실기기 보조기술은 미검증이다.
- [#1934](https://github.com/Simon-YHKim/2nd-B/pull/1934)·[#1935](https://github.com/Simon-YHKim/2nd-B/pull/1935)의 보호된 읽기 진단은 [run 36691474238](https://github.com/Simon-YHKim/2nd-B/actions/runs/36691474238)에서 `access-forbidden`으로 끝났다. 현재 Production 토큰으로 Supabase Edge secret 목록을 읽을 수 없다. `service-consent`의 정상 status와 잘못된 JSON이 모두 503인 것은 확인됐으나 실제 모드값은 미확인이다. 설정·운영 데이터는 바꾸지 않았다.
- Android 자동 빌드 [36693557705](https://github.com/Simon-YHKim/2nd-B/actions/runs/36693557705) 성공. [QA APK `qa-260930-f62433a0`](https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260930-f62433a0)를 발행했고, 8081 `localhost-main`을 동일 SHA로 재기동했다. `npm run app:parity`는 앱 경로 차이 0·설정/의존성 일치로 **같음**.
- GUI P1 [#1938](https://github.com/Simon-YHKim/2nd-B/pull/1938)은 main `5e52894b`에 병합됐다(CI 3종 통과). 대시보드 첫 행동, 설정 12px 설명, 북극성 44px 페이지 탭, 기록 선택 카드의 직접 열기를 보완했다. 로컬 verify 848묶음/10,966테스트와 [375/425px 화면 검증](qa/gui-p1-260930/report.html)이 통과했다. Android 빌드 [36699151536](https://github.com/Simon-YHKim/2nd-B/actions/runs/36699151536) 성공 후 [QA APK `qa-260930-5e52894b`](https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260930-5e52894b) 발행, 8081 재기동·`app:parity` **같음**(앱 차이 0).
- Play Console에는 영어 이름·설명 게시 준비 2건이 남았다. Data Safety Revision 2의 중단 조건에 따라 양식 저장·게시는 하지 않았다. [#1902](https://github.com/Simon-YHKim/2nd-B/pull/1902)는 10월 5일 동의 계약 Draft다.
- GUI 후속: Android ARM 실기기·TalkBack·글꼴 확대 검증, P2 맥락형 TIP·원문 출처 표시·빈 상태 문구. 이 PC의 x86_64 에뮬레이터는 arm64 전용 QA APK를 로드하지 못해 네이티브 화면 판정에 쓰지 않는다. 원본 QA 보고서는 TTL-Work_rev2의 미커밋 `docs/qa/ui-audit-260930/report.html`에 있으며 건드리지 않았다.
- 다음: ① ARM 실기기 GUI·TalkBack QA ② 콘솔 소유자가 적정 권한으로 동의 모드 분류 후 단계별 canary ③ Play 이름·법률·Data Safety 동시 출시 순서 확정. Grok 후속은 Simon 지시대로 보류.

---

## 2026-09-30 17:5x / 한국어 줄바꿈을 어절 단위로(#1933) · QA APK `qa-260930-4ee03669` · 8081 재기동

> 발행: CLI 코딩 세션(Claude Code, 작업 워크트리 `.worktrees/qa-linebreak`, session_01CYhHkCyCfp3J4x36dz1mdw). Simon 과 localhost QA 를 시작한 첫 건이다.

- **요청.** Simon(localhost QA): 로그인 화면 법무 링크가 "환불 및 청약철회 정 / 책" → "각 언어별 줄바꿈 규칙을 확인하고, 합리적으로 개선하자."
- **측정.** 8081(폰 APK `f17ce1b3` 와 같은 빌드)을 헤드리스 크롬 393px 로 열어 글자 위치로 줄이 바뀐 자리를 분류했다.
  - 로그아웃 9화면: 한국어 단어 중간 끊김 285, 가운뎃점 줄머리 13(ko 11 · en 2).
  - en · es · pt · id: 긴 URL 1건뿐이다(맞는 동작).
  - 로그인 후: 앱 화면 24곳 약 98건(추정), 영어 화면에 보이는 한국어 기록 34건.
- **#1933 머지** `4ee03669`(17:02 KST)
  - 웹: `+html.tsx` 에 `word-break: keep-all`.
  - 앱: `components/ui/PlainText`(keepAllKo = U+2060). `<Text variant>` 와, RN `Text` 를 직접 쓰던 64개 파일이 이것을 거친다.
  - keepAllKo 는 멱등이고 그래핌을 쪼개지 않는다. klreq 7.1.2 가운뎃점 줄머리 금지는 웹 · 앱 공통이다. `plain-text-guard.test.ts` 가 재발을 막는다.
  - 수정 후 전부 0건. verify 848 묶음 / 10,966 테스트 · CI 3종 초록.
- **폰.** QA APK [`qa-260930-4ee03669`](https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260930-4ee03669)(arm64, sha256 `b54665a3…fbf4b9`).
  - 같은 커밋의 x86_64 진단 빌드(런 36687352385)를 `Pixel_9_Pro_XL` 에뮬에 올렸다(`install -r`, 데이터 유지). 한국어 · 글자 1.3배로 로그인 화면과 처리방침을 봤다. 정상 실행이고 띄어쓰기에서만 줄이 바뀐다.
  - 에뮬의 font_scale · 앱 로케일은 원래대로 돌리고 종료했다.
- **8081.** 17:01 에 오류 없이 멈춰 있었다(원인 미상. 이전 로그는 `.git/app-parity/localhost-8081-until-260930-1701.log`). localhost-main 을 `ace0b2e1`(앱 경로 차이 0)로 옮겨 다시 띄웠다. `app:parity` 결과 같음.
  - ⚠ WMI(`Win32_Process Create`)로 띄우면 Expo 가 "Logs for your project will appear below." 직후 스스로 끝났다(stdin 이 닫혀서로 추정). `Start-Process cmd.exe -WindowStyle Hidden` 으로 띄우면 산다.
- **남긴 것.**
  - 뮤지엄 "Backpropagati / on"(영어 단어가 카드보다 김): 하이픈은 웹 · Android 만 가능해서 넣으면 앱과 localhost 가 달라진다. 그대로 두기를 권한다(Simon 판단).
  - 홈 별 이름 `Animated.Text` 4곳은 폭 측정 로직이 따로 있어 적용하지 않았다.
  - 보고서: [qa/LINEBREAK-QA-260930.html](qa/LINEBREAK-QA-260930.html).
- **다음 1개.** Simon 폰에 `qa-260930-4ee03669` 를 설치하고 localhost QA 를 이어 간다.

---

## 2026-09-30 16:14 / Polaris 서버 선행 적용 · 동의 모드 후속 검증

- Simon의 09-27 운영 GO(`simon-go-attested-prod-mig-remaining-edge-redeploy.md`)와 콘솔 claim `PROD-POLARIS-OPENAI-260930`에 따라 운영 `zoacryukmdeivmolvyhj`에 **0195**(`20260930070200`)와 **0198**(`20260930070253`)을 main의 정확한 SQL로 적용했다. 원장 183→185행. Polaris 설정은 `enabled=false`, 생성 행 0이다. 0195의 claim/settle은 service_role 전용이고 기록 삭제 트리거 2개가 활성이다. 0198 등록부는 67→71행이며 기존 67행 지문은 유지됐다.
- 적용 전 [암호화 백업 run 36588721188](https://github.com/Simon-YHKim/2nd-B/actions/runs/36588721188) 성공(artifact `db-backup-36588721188`, SHA-256 `6c7476df…c6e9d`). OpenAI 스키마 가드의 22개 객체가 모두 통과한 뒤 [배포 run 36681787965](https://github.com/Simon-YHKim/2nd-B/actions/runs/36681787965)로 `openai-proxy` v138→v139를 배포했다. JWT 검증이 켜져 있고 배포된 7개 파일이 main과 정확히 같다. QA 인증으로 잘못된 JSON은 400, 빈 본문 객체는 400이었다. 제공자 호출·과금 canary는 실행하지 않았다.
- 작업 중 `runtime_flags.llm_enabled`를 잠시 false로 두고 이전 `updated_at`에 대한 조건부 UPDATE로 true를 복원했다. 최종 운영 상태: flag true, Polaris off, 생성 원장 0, 등록부 71행. Claude/Gemini/xAI 배포본도 현재 main의 동의 공용 코드 및 각 index와 일치한다. Supabase advisor에 이번 변경 관련 CRITICAL은 없다. [상세 검증 기록](qa/POLARIS-OPENAI-ROLLOUT-260930.html)을 참조.
- **남은 게이트:** 서비스 동의 `status`를 배포 후 다시 확인해도 503이고 `LLM_CONSENT_MODE`의 실제 값은 확인되지 않았다. collect/enforce 전환·grant/revoke·철회 경합 canary·Polaris 활성화·운영 전체 계정 삭제 canary는 미실행. Play Console에는 PolaScope 이름·전체 설명 2건이 게시 준비 중이고 데이터 보안 Revision 2 원본 양식은 아직 검증되지 않았다. 폼 저장·제출·게시하지 않았다. `#1902`는 10월 5일 계약 Draft로 유지한다.
- 재개: `git fetch origin main` → `git show origin/main:docs/HANDOFF.md`. 우선 동의 모드의 비밀값을 노출하지 않는 확인 경로와 무과금 canary를 마련한 뒤 collect 검증, 별도 일회용 계정의 삭제 전체 흐름, Play 데이터 보안 원본/활성 빌드 대조 순서로 진행한다.

---

## 2026-09-30 00:1x / 앱 = localhost 적용 완료 — QA APK `qa-260930-f17ce1b3` · 8081 을 main `f17ce1b3` 로 재기동 · TTL-Work_rev2 앞당김

> 발행: CLI 코딩 세션(TTL-Work_rev2, session_011kqZojB5KVspmMgAZ4rZ89). 아래 23:1x 블록(#1928)의 "다음 1개"를 끝냈다.

- **#1928 머지** `f17ce1b3`(2026-09-29 23:42 KST, CI lint · verify · web-export-smoke 초록). 중간에 CI 가 한 번 빨강이었다: DPIA:683 의 `HANDOFF.md:331,486` 줄 번호 인용이 새 블록으로 밀려 빈 줄을 가리켰다. 원문이 있는 닫힌 보관 파일로 옮겨 고쳤다.
- **폰 APK.** android-release 런 36584676465 → [`qa-260930-f17ce1b3`](https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260930-f17ce1b3)(`npm run app:qa-release`, `--latest=false`). `com.simonk.secondbrain` 0.9.0(40) · arm64-v8a · 진단 키 `03bcf8fa…fe89a`(내려받은 파일 sha256 이 SHA256SUMS 와 일치) · sha256 `9a91fde6fb2ab388e27cc78844ab1852e97c86ba91ba87613628924e81a3932a`.
  이전 APK(`qa-260929-2fab54f0`)와 앱 경로 차이는 `package.json` 의 scripts 뿐이라 **앱 기능 차이는 없다.** 규칙상 폰이 최신 QA APK 와 같도록 설치를 권한다. 같은 진단 키라 덮어 설치된다.
- **8081.** localhost-main 을 `f17ce1b3` 로 옮기고, 그 체크아웃의 `npm run localhost` 로 다시 띄웠다(WMI, 2026-09-30 00:09 KST). `npm run app:parity` 결과: **같음**(코드 · 설정 · 의존성).
- **TTL-Work_rev2.** `5c4e4b4a` → origin/main 으로 ff 했다(117커밋+). 그래서 이 워크트리의 새 세션은 규칙이 든 CLAUDE.md 를 읽는다.
  미커밋 14개는 `E:\Coding Infra\_rescue\ttl-work-rev2-260929\` 에 SHA256SUMS 와 함께 있다. 그중 main 과 같은 8개와 main 판이 최신인 1개는 치웠다. main 에 없는 PNG 4개는 제자리에 남겼다.
- **함정 예방.** `docs/legal/trademark-clearance-brief-260825.md` 의 "작성 당시 `docs/HANDOFF.md:N`" 역사 표기 3곳에서 백틱을 벗겼다. HANDOFF 에 블록이 얹힐 때마다 그 번호가 밀려 법무 인용 검사가 언젠가 빈 줄을 만나기 때문이다. 실제 근거 인용(p4 보관 파일)은 그대로다.
- **다음 1개.** 없음. 이후 화면을 바꾸는 세션은 CLAUDE.md 맨 위 절 순서를 그대로 따른다.

---

## 2026-09-29 23:47 / 삭제 fence·서비스 동의 서버 선행 적용과 잔여 canary

- main `90650414`의 [#1929](https://github.com/Simon-YHKim/2nd-B/pull/1929)는 현행 `0194`의 `service-v1`/`email-v6` SQL 회귀를 추가했다. 로컬 verify 846 suites·10,933 tests, PR CI 4종 PASS 뒤 병합했다. 웹 운영 게시와 Android 빌드는 없었다.
- 콘솔 claim `PROD-DELETE-CONSENT-260929`에서 운영 `zoacryukmdeivmolvyhj`에 **0192**(`20260929143410`)와 **0194**(`20260929143632`)를 적용했다. 원장 181→183행. Storage 정책·trigger·tombstone RLS와 서비스 동의 RPC ACL·`email-v6` 판본을 확인했다. 9월 27일 격리 리허설 PASS/삭제 완료로 새 임시 프로젝트는 만들지 않았다.
- [삭제 Edge run 36583694890](https://github.com/Simon-YHKim/2nd-B/actions/runs/36583694890)으로 `delete-account` v135, [동의 run 36583979169](https://github.com/Simon-YHKim/2nd-B/actions/runs/36583979169)으로 `service-consent` v1을 배포했다. 두 함수는 JWT 검증·main 소스 일치·비인증 401이다. [운영 전환 기록](qa/ACCOUNT-DELETION-ROLLOUT-260929.md)과 Relay `claim-prod-delete-consent-260929.coding.result.md` 참조.
- **남은 서버 게이트:** QA 계정의 서비스 동의 `status`는 503 `service_consent_unavailable`이었다. 잘못된 body도 503이어서 mode gate 거부로 추정하나 설정값은 모른다. 운영 삭제 전체 흐름은 일회용 계정이 없어 미검증이다. 공용 QA 계정·서버 설정은 변경하지 않았다.
- [#1902](https://github.com/Simon-YHKim/2nd-B/pull/1902)는 10월 5일 `email-v7/service-v2` Draft로 둔다. 일반 Chrome의 로그인된 Play Console에서 PolaScope 게시 개요를 읽었다. **게시 준비 변경 2건**(영어 앱 이름·전체 설명)이 있어 데이터 보안 Revision 2를 저장·제출하면 섞일 위험이 있다. 폼 저장·검토 제출·게시를 하지 않았다.
- 재개: `git fetch origin main` → `git show origin/main:docs/HANDOFF.md`. 다음은 동의 mode·읽기 canary, 일회용 계정 삭제 canary, Play 데이터 보안 원본과 게시 준비 2건의 출시 순서 확인. 관측은 09-29 23:47 KST 기준.

---

## 2026-09-29 23:1x / 앱과 localhost 는 같은 소프트웨어다 — `npm run localhost` 신설 · 8081 교체

> 발행: CLI 코딩 세션(TTL-Work_rev2, session_011kqZojB5KVspmMgAZ4rZ89). Simon 목표(원문):
> "폰 앱과 똑같이 동작하게 localhost를 변경해. 그리고 이 워크트리에서 작업하는 모든 세션이 공통으로,
> 필수로 알게해. 앱과 localhost는 같은 s/w여야 한다고. 그리고 localhost를 수정하면 앱에도 무조껀 동일하게 변경하라고."

- **무엇이 달랐나(실측).** ① 저녁까지 Simon 이 보던 localhost 는 Codex 워크트리의 개발 서버였다(기반 `287e56f1` + 미커밋 586개, 그중 104개는 main 쪽이 더 새것, `.env` 등급 강제).
  ② 22:58 에 다른 세션이 Simon 요청("localhost 띄워줘")으로 `.worktrees/localhost-main`(main `235c56bf`, detached)에서 띄운 서버는 코드는 폰 APK 와 앱 경로 차이 0 이었다. 그러나 TTL-Work_rev2 의 `.env` 를 복사해 와서 `EXPO_PUBLIC_FORCE_TIER=brain` 이었고 개발 모드(`expo start --web`)였다. 폰 APK 는 `off` · 릴리스다.
- **한 일.** [#1928](https://github.com/Simon-YHKim/2nd-B/pull/1928) 에서 `scripts/app-parity.cjs`(+테스트)와 `npm run localhost` · `web` · `app:parity` · `app:qa-release` 를 추가했다. 폰 APK 빌드 env 를 워크플로에서 읽고, `.env` 를 무시하고, 릴리스 모드와 전용 Metro 캐시로 띄운다. 8081 은 폰 QA APK 와 앱 경로가 다르면 거부한다.
  문서는 네 곳을 고쳤다: `CLAUDE.md` 맨 위 규칙 절, `AGENTS.md` 전제, 두 파일 QA 절의 "`.env` 에 FORCE_TIER" 안내 교체, `docs/ANDROID-BUILD.md` 의 QA pre-release 예외.
- **8081 교체(23:04 KST).** 띄운 세션(ttl-work-rev2-3a)의 동의를 받고 pid 43596 을 멈췄다. 같은 localhost-main 에서 새 스크립트로 다시 띄웠다. WMI 로 띄워 세션이 끝나도 산다. 로그는 `E:\2ndB\.git\app-parity\localhost-8081.log`, 기록은 같은 폴더의 `localhost-8081.json` 이다.
  localhost-main 의 복사본 `.env` 는 지웠다. 원본은 TTL-Work_rev2 에 그대로 있다.
- **검증.** 헤드리스 크롬으로 열었다: 로그인 화면, `__DEV__=false`, 번들 요청 `dev=false&minify=true`, 콘솔 오류 0.
  번들에 박힌 값은 `FORCE_TIER "off"` · `ALLOW_DEV_TIER "false"` · `LLM_MODE "live"` · `ENABLE_ADS "true"` 이고 AdSense 는 없다.
  폰 APK 런 36447786361 의 CI 로그와 EXPO_PUBLIC 30개를 대조해 29개가 일치했다. 나머지 anon 키는 로그에서 `***` 로 가려져 있어서 APK Hermes 번들에서 같은 값을 확인했다. `app:parity` 결과는 **같음**(종료코드 0)이다.
  `npm run verify` 는 25단계 통과, jest 는 846/847 이었다. 남은 1개(`approved-avatar-app`)는 #1926 이전에 받은 CRLF 체크아웃 탓이었고, 두 파일을 다시 받자 4/4 통과했다. 새 테스트 12개는 변이 3종을 모두 잡았다.
- **알게 된 함정.** `expo start --localhost` 는 `::1` 에만 뜬다. 127.0.0.1 로 여는 도구는 못 붙고 브라우저는 붙는다. 그래서 그 플래그는 뺐고, 포트 검사는 두 주소를 다 본다.
  Metro 기본 캐시(`os.tmpdir()/metro-cache`)는 모든 워크트리가 같이 쓴다. 그래서 localhost 서버에는 전용 임시 폴더를 준다.
  HANDOFF 맨 위에 블록을 얹으면 법무 문서의 줄 번호 인용이 밀린다. CI 에서 DPIA:683 의 `HANDOFF.md:331,486` 이 빈 줄을 가리켜 빨강이 났다. 원문이 있는 닫힌 보관 파일 `ARCHIVE-2026-05-25_to_2026-06-16.md:561,716` 으로 옮겼다.
- **다음 1개.** 이 PR 이 머지되면 `package.json` 변경으로 android-release 빌드가 돈다. `npm run app:qa-release` 로 새 QA APK 를 올리고, localhost-main 을 그 커밋으로 옮겨 8081 을 다시 띄운 뒤, Simon 에게 APK 링크를 준다.
  그 전까지 8081(`235c56bf`)과 폰 APK(`2fab54f0`)는 앱 경로 차이 0 이라 같은 앱이다.

---

## 2026-09-29 22:34 / 방침 v5·0208 운영 확인과 10-05 계약 Draft 정합화

- main `2fab54f0`의 [#1925](https://github.com/Simon-YHKim/2nd-B/pull/1925)는 09-29 개인정보처리방침 v5와 `email-v6`을 반영했다. 운영 0208은 00:53 KST 적용돼 원장 181행, 기존 v4·v5와 새 v6의 `status`가 ready다. 웹 [게시 run 36448554124](https://github.com/Simon-YHKim/2nd-B/actions/runs/36448554124) 뒤 공개 `/privacy-policy`에서 09-29 시행일과 선택 아바타·상세 프로필 항목을 확인했고, 인앱 공지 `ff1da0ea-21bd-4261-86f8-b95c3bec387a`도 발행됐다. 근거: `.bots/relay/outbox/claim-prod-mig-0208.coding.result.md`.
- [QA APK `qa-260929-2fab54f0`](https://github.com/Simon-YHKim/2nd-B/releases/tag/qa-260929-2fab54f0)는 arm64, `com.simonk.secondbrain` 0.9.0이며 다운로드 SHA-256이 릴리스 체크섬과 일치한다. 이 PC의 연결 Android 기기는 0대라 설치·실기기 GUI 검증은 미실행이다.
- **[#1902](https://github.com/Simon-YHKim/2nd-B/pull/1902)는 계속 Draft·미병합.** 02:2x 아래 역사 블록의 `email-v6`=10-05×3 설명은 #1925 이후 무효다. 10-05 계약은 `email-v7`=(동의 10-05 / 방침 09-29 / 약관 10-05)로 고치고, 운영 `email-v6`와 방침 v5의 아바타·상세 프로필 문구를 보존한다. 캐릭터 `2nd-B` 태그도 유지한다. 0194 서비스 동의는 운영 미적용이며 새 SQL·Edge보다 먼저 계약과 적용 순서를 검증한다.
- Play 데이터 보안 Revision 2는 아직 콘솔 제출 증거가 없다. Simon의 별도 Chrome for Testing 로그인 완료 알림 뒤 현재 폼·대기 변경을 읽고 수정한다. 광고 ON·스토어 공개는 별도 게이트를 따른다. 결제 전환은 `claim-paddle-session-ownership-13` 소유 세션과 중복 실행하지 않는다.
- 재개: `git fetch origin main` → `git show origin/main:docs/HANDOFF.md`. 다음 순서: #1902 계약·CI 수리, Play Console GUI 확인, APK 실기기 QA. 이 블록은 09-29 22:34 KST의 확인 범위다.

---

## 2026-09-28 21:0x / 워크트리 작업 전부 통합 — 아바타(0206·0207 운영 적용) · 관측소 2차 · QA 도구 → 폰 테스트용 APK

> 발행: CLI 코딩 세션(TTL-Work_rev2). Simon 19:3x(폰): "너가 직접 진행해. 승인할께 … 현재의 워크트리에서 작업된 모든 내용을 종합 통합 … APK 파일 하나" + "워크트리상에 작업한것은 놓치지 말고 모두 적용해." DECISIONS 26.09.28 19:3x · 20:5x.

**지금까지**
- 워크트리 51개를 **내용 기준**으로 전수 분류했다(squash 머지 때문에 '앞선 커밋' 수는 믿을 수 없다). 30개는 이미 main 에 있었다.
- 통합 PR: #1900(광고 보상 삭제 SQL 회귀 테스트) · #1899(Play 데이터 보안 vc56 QA 문서) · #1919(공유 워크트리의 캡처 스크립트 + 합성 인물 QA 보고서, README 동작 설명 갱신) · **#1921 아바타**(Codex 10커밋 + 0206/0207 승격 + 첫 설정 '나중에') · **이 PR 관측소 2차**.
- **운영 마이그레이션 0206 `users.avatar_spec` · 0207 `GRANT UPDATE (display_name)`** 적용(20:36, 원장 178→180). authenticated UPDATE 열이 정확히 6개(avatar_spec · birth_date · display_name · privacy_prefs · profile_details · reasoning_prefs), anon 0, 표 단위 UPDATE 없음, 정책 md5 불변. 결과 `.bots/relay/outbox/claim-prod-mig-0206-0207.coding.result.md`.
- 아바타 첫 설정: Codex 판은 기존 계정 전원을 출구 없는 설정 화면에 가뒀다 → 언제든 나갈 수 있게(뒤로 · "나중에", 세션 동안 미룸) 고쳤다. 처리방침 "프로필(선택)… 이용 제한 없음" 과 맞춘 것.
- **관측소 2차**(원본: `avatar-observatory-integration-260928` 미커밋 586경로, Codex): 새 파일 115 · 수정 61 이식 · 낡은 사본 64 제외. 두 탭 휴대전화 대시보드(DashboardPhone), 주머니 폰(PocketPhone), 휴대전화 미니앱 그림 31 PNG + 폰 3장, 망원경 조작부 개편, `/data-connections`, 대시보드 규칙(`src/lib/dashboard/*`). 독립 검토: 누락 0 · main 되돌림 0(PolaScope · #1883 · #1904 · #1912 줄 전부 유지). CameraCue 는 낡은 사본이라 뺐다(옮기면 셔터음 두 번).
- 원본 워크트리(Codex 두 곳 · TTL-Work_rev2)는 **읽기만** 했다. 8081 · 8082 개발 서버도 그대로다.

**통합하지 않은 것(이유)**
- #1814 · #1839 · #1889: S3 서버 계약(삭제 의도 대기열 · 업로드 세대)이 main 에 없다. #1814 는 로그인 잠금 회귀(G7A-1814-2)를 안고 있다. 재료로 보존.
- #1902: 10-05 약관 묶음(어긋남 둘은 별도 알림).
- reward-ledger-retention: 채택되지 않은 'memo 만 지움' 안(0202 번호 충돌).
- 정본 체크아웃 미추적 19파일(봇 운영 문서): 공개 저장소인데 제3자 연락처 · 구독 결제 일정이 있다 → **Simon 결정**.
- TTL-Work(771 미커밋): 09-13 구제본이 있고 처분은 Simon 몫. 단 0178 · 0179 를 호출하는 앱 코드가 여기에만 있다(재구현 여부 결정 필요).
- 처분 후보(지우지 않음): brand-meta(.tmp-og-render 안 브라우저 프로필) · qa-integration(임시 서버 · zip) · observatory-260925(avatar-observatory 에 흡수됨) · reward-ledger-retention.

**다음 1개**: main 머지 → `android-release.yml` 진단 APK(arm64) → QA pre-release `qa-260928-<sha8>` → Simon 폰 설치(기존 앱 먼저 삭제 — 서명이 다르다).

**후속**
1. `docs/ASSETS.md`: 휴대전화 미니앱 그림 팩의 생성 도구 · 사용 권리 **Simon 확인**(배포 전 게이트).
2. 처리방침 §1 프로필(선택)에 "아바타 설정" 추가 — 다음 방침 판본에서.
3. `src/components/dashboard/phone-apps.ts` 는 이제 자기 테스트만 쓴다(새 DashboardPhone 이 대체) — 정리 여부.
4. `src/lib/avatar/{engine,renderer}.js` 가 Windows(autocrlf) 체크아웃에서 CRLF 로 풀려 `approved-avatar-app.test` 가 로컬에서만 실패한다 — `.gitattributes` 에 `eol=lf` 권장(CI 는 초록).
5. CLAUDE.md 의 `ConstellationHome.tsx:85` 인용이 87 로 밀렸다(법무 인용 아님).

---

## 2026-09-28 11:44 / 공용 셰어 보류 · 개인 팔레트/갤러리

> Simon 정정: 공용 공유만 보류하고 개인 갤러리는 유지한다. 현재 범위: [아바타 팔레트 보고서](qa/AVATAR-PALETTE-260928.html). 바로 아래 10:53 아바타 셰어 블록은 결정 이전의 역사 기록이다.

- 휴대전화 진입은 `/avatar-palette`로 바꾼다. 로그인한 사용자가 64×64 투명 격자와 16색 팔레트로 머리·소품·옷을 그린다. 기본 아바타 가이드, 확대·이동, 격자, 지우개, 마지막 그리기 되돌리기와 임시 합성 미리보기를 제공한다. 미리보기는 프로필 아바타에 적용하지 않는다.
- 계정별 개인 갤러리에 슬롯과 무관하게 작품 최대 30개를 저장하고 열기·다시 편집·삭제한다. 기존 슬롯별 초안 최대 3개는 갤러리로 이전한다. 네이티브는 암호화 저장소, 웹은 계정별 `localStorage`이며 기기 간 동기화는 없다. 읽기 실패 시 빈 갤러리로 덮어쓰지 않고 계정 삭제 시 로컬 작품을 정리한다.
- 공용 업로드·공용 갤러리·타인 작품 가져오기·신고·차단·판매 및 공유 서버 SQL 초안은 제거한다. 첫 프로필 설정·첫 번째 별 편집과 별도 `users.avatar_spec`·표시 이름 SQL 초안은 유지한다. 운영 DB에는 새 변경을 적용하지 않았다.
- 검증: `npm run verify` 전체 게이트·Jest 836 suites / 10,851 tests, `npm run verify:web` 130개 정적 문서 통과. 마지막 UI 수정 후 lint·type-check·화면 집중 테스트도 재통과. Android 연결 기기는 없어 손가락 그리기와 스크롤 충돌·성능은 아직 확인하지 못했다.

---

## 2026-09-28 10:53 / 첫 아바타 설정 · 프로필 편집 · 아바타 셰어

> 브랜치: `codex/avatar-style-regeneration-260928`. 화면과 공개 전 순서: [아바타 셰어 완료 보고서](qa/AVATAR-SHARE-260928.html).

- 새 프로필 완료 직후 아바타 스튜디오로 이동한다. 기존 계정도 `users.avatar_spec`이 실제 `NULL`이면 첫 저장까지 앱 진입을 붙잡는다. 읽기 실패는 세션 내 탈출 경로를 둔다. 첫 번째 프로필 별에서 표시 이름·생활 정보와 아바타를 다시 편집한다. 스튜디오에서 셰어로 갈 때는 미저장 선택을 먼저 저장한다.
- 휴대전화에 `/avatar-share`를 추가했다. 성인 계정은 64×64 고정 팔레트 픽셀로 머리·옷·소품을 그리고 제출한다. 제출은 pending, 서비스 역할의 운영 검토 후 승인품만 갤러리/개인 아바타에 사용한다. 신고(에셋·제작자), 차단, 삭제, 24시간 제출 한도, 30개 보유 상한과 계정 삭제 등록부 초안을 넣었다. 타인의 그림은 픽셀만 렌더링하고 승인·노출 여부를 다시 확인한다.
- 서버 초안 `UNNUMBERED_users_avatar_spec.sql`, `UNNUMBERED_users_display_name_update.sql`, `UNNUMBERED_avatar_share.sql`, `UNNUMBERED_avatar_share_erasure_registry.sql`은 **운영 미적용**. 격리 PostgreSQL 18에서 RLS/연령/동시 제출/신고 자동 숨김을 실행 확인했고 임시 DB 서버는 정지했다. 운영 검토자와 신고 대응 절차, 약관·재사용 문구를 확정해야 공개할 수 있다.
- 검증: `npm run verify` 전체 게이트·Jest, `npm run verify:web` 정적 웹 문서 130개, 아바타 에셋·픽셀 규칙, 캐논 미러 및 디자인 참조 검사 통과. Android 실기기에서 그리기 제스처와 SVG 비용은 미측정.
- 다음 순서: 콘솔 소유 세션이 최신 SQL 번호 예약 → 서버 적용 → 실계정 RLS 및 검토 작업 흐름 확인 → Android 기기 QA → 앱 공개. 수익화는 무료 기본 공유의 사용량·신고 비용을 먼저 보고, 편집 편의 기능 또는 별도 제작자 라이선스 계약을 나중에 검토한다.

---

## 2026-09-28 09:49 / 승인 아바타 144종 앱 연결 · 공개 전 서버 순서

> 브랜치: `codex/avatar-style-regeneration-260928`. 전체 결과: [아바타 앱 연결 보고서](qa/AVATAR-APP-INTEGRATION-260928.html).

- 사용자 승인 64셀 카탈로그 144개를 React Native 앱의 `/avatar-studio`와 `/profile`에 연결했다. PNG는 선택지 예시이고 실제 조합은 승인 생성기와 렌더러가 그린다. 사람·동물 모두 일반 옷 6종을 선택하며, 직업 의상은 실제 직업 텍스트를 바꾸지 않는다.
- `users.avatar_spec`은 사용자 본인 행에 저장하는 번호 없는 SQL 초안이다. 앱 조회·저장은 구현됐고 SQL 초안의 재적용·권한·본인 RLS·형식 제약은 CI scratch PostgreSQL 단계에 등록했다. 운영 DB에는 **미적용**이다.
- `npm run verify`: 828 suites / 10,810 tests 통과. `npm run verify:web`: 129개 정적 문서와 새 경로 통과. 144 PNG · 8픽셀 그리드 · 2,892 조합 · 프로토타입 동기화 검사 통과. 연결된 Android 기기는 없어 기기 반응성·메모리 실측은 미실행.
- **다음 순서**: 콘솔 소유 세션이 최신 번호를 예약·push하고 초안을 운영에 적용 → 실제 `has_column_privilege`와 본인/타인 RLS를 확인 → 첫 웹 게시·OTA·네이티브 빌드 전에 Android 기기에서 편집·저장·재진입을 확인한다. 서버 선행 증거 없이 공개하지 않는다.

---

## 2026-09-28 07:5x / PolaScope 마무리 — 기록 누락 정리 · 10-05 단일 목록 · 메일 제목 Draft #1917 · #1902 어긋남 알림

> 발행: CLI 코딩 세션(TTL-Work_rev2, PolaScope). 근거: 읽기 전용 감사 2레인(07:22~07:31 KST) · DECISIONS 26.09.28 01:5x · 07:5x.

**지금까지**
- **#1912(내보내기 쿨다운 안내, Q-07)는 02:16:25 에 머지됐지만 라이브 웹에는 없다.** 웹 게시(02:15:29)보다 56초 늦었다. 라이브 번들에서 `export_cooldown` 0건(07:2x 실측). 다음 웹 게시와 새 네이티브 빌드에 실린다. 01:2x 블록 '막힌 것 1'(쿨다운 안내를 무엇으로 할지)은 이걸로 닫는다.
- Simon 01:5x 가 Q-06~08 을 맡겼다(DECISIONS 01:5x): Play 최종 게시는 Google 승인 뒤 코딩 세션이 누른다(게시 준비됨이 이름 변경 2건뿐일 때) · ASC 부제 = "Self-understanding from notes" · GUI 는 **Simon 크롬(Claude in Chrome)만**. 이 세션에는 크롬 도구가 붙지 않아 둘 다 대기다.
- 병기 안내(#1905)는 라이브에 있다 — 번들 `renameNote` 7건. 인앱 공지 `53a0c132` 는 withdrawn_at 없이 살아 있다(07:24 조회).
- 조종 크롬 정리: 02:1x 메모리 부족으로 조종기가 멈추며 창이 닫혔고, 긴 경로 프로필(227MB)을 지웠다. ASC 용 짧은 경로 프로필은 01:36 에 지웠다. 로그인 세션 잔존 없음. 스크립트 `driver2.mjs`·`run2.mjs` 는 다른 세션 재사용을 위해 남겼다.
- **#1902(10-05 초안, 다른 세션 · 소유 세션 미확인) 어긋남 둘**: 캐릭터 태그 2nd-B→SecondB(결정 23:2x 는 "그대로") · 개인정보처리방침 시행일 10-05(공지 `53a0c132` 에 방침은 0회). `relay/inbox/pr1902-decision-mismatch-260928.note.md` + ttl-work-rev2-f6 가 #1902 댓글로 전달. 방침 본문에는 앱 이름이 0회라 **방침을 09-28(v4)로 두면 공지 없는 개정이 생기지 않는다**.
- main HANDOFF 02:2x 블록이 링크한 `docs/qa/POLASCOPE-RELEASE-260928.md` 는 #1902 브랜치에만 있다 — main 에서는 깨진 링크.
- 메일 제목 Draft **#1917**: `supabase/config.toml:42,52` `[2nd-Brain]`→`[PolaScope]`. 10-05 머지, 같은 날 Simon 이 대시보드 값을 바꾼다(`supabase config push` 금지).
- 교훈: #1912 는 es/pt/id `consent.json` 에 번역을 넣어 `check:safety-consent-locale`(F2)에 떨어졌다가 en 사본으로 고쳤다 — 로케일을 건드리면 `check:*` 전부를 돌린다.

**10-05 적용일 단일 목록** (흩어져 있던 00:1x · 00:4x 블록 · #1903 설명 · 보고서 표를 한 곳에 모았다)

| # | 항목 | 담당 | GO | PR |
|---|---|---|---|---|
| 1 | 약관·동의 개정(제1조 PolaScope · TERMS/CONSENT 판본 · email-v6 튜플) + 병기 안내·`rename-note.test.ts` 제거 | #1902 소유 세션 | Simon(운영 SQL) | #1902 Draft — **어긋남 둘 먼저 해소** |
| 2 | 메일 제목 2개 | 코딩 #1917 + Simon 대시보드 | Simon | #1917 Draft |
| 3 | 웹 게시(#1912 쿨다운 안내 포함) | 게시 담당 세션 | Simon Production 승인 | — |
| 4 | `app.json` expo.name + 새 네이티브 빌드(홈 화면 이름) | 코딩 | Simon | #1902 포함 여부 확인 |
| 5 | 로그인 동의 화면 이름(Google · Kakao · Naver · Apple) | Simon 콘솔(크롬) | Simon | — |
| 6 | Paddle 상품명 · 카드 명세서 표시 이름(적용일 **전** 권장) | 결제 전환 세션 + Simon 콘솔 | Simon | — |
| 7 | 놓친 옛 이름 4곳(THIRD_PARTY_NOTICES 제목 · id `systemHint` · site-meta 주석 · 공개 proto) | #1902 안 | — | #1902 |
| 8 | (날짜 무관) Play 최종 게시 Q-06 · ASC 부제 Q-08 | 코딩(Simon 크롬) | 결정됨 | — |

**다음 1개**: Simon 이 이 세션에 크롬 연동을 켠다(`/chrome`, 안 되면 `claude --chrome --resume`) → ASC 부제 입력, Play 승인 여부 확인.

**막힌 것**
1. Claude in Chrome 도구가 이 세션에 없다(확장은 Simon 크롬에 설치됨).
2. Play 데이터 보안 Revision 2 가 먼저 제출되면 게시 준비됨 목록이 섞여 Q-06 조건이 깨진다 — 순서 주의.
3. #1902 방침 날짜: 09-28 유지(권장) 또는 10-05 유지 + 오늘 새 공지(운영 쓰기, Simon 결정).

---

## 2026-09-28 02:2x / 10-05 PolaScope 동의 Draft·SQL 검증

- [PR #1902](https://github.com/Simon-YHKim/2nd-B/pull/1902)는 **2026-10-05 적용일까지 Draft**다. 운영 0203의 `email-v5`(09-07 동의 / 09-28 방침 / 08-16 약관)를 보존하고, 새 가입 `email-v6`(세 판본 모두 10-05)·`service-v2`를 별도 계약으로 준비했다. 기존 원장 영수증을 고치지 않는다.
- 번호 없는 forward SQL 초안은 **운영에 미적용**이다. 일회용 PostgreSQL에서 신·구 가입·서비스 동의·CAS·ACL을 실제 실행하는 PR SQL CI run `36336770728`이 통과했다. 최신 main #1912 통합 뒤 로컬 `npm run verify -- --runInBand`는 824 suites / 10,759 tests 통과. PR 일반 CI는 최종 push 기준으로 확인한다.
- 다음 서버 작업은 10-05 적용일과 최종 법률문서를 확인한 뒤 초안을 최신 번호로 승격하고, 콘솔 소유 세션의 운영 적용·Edge 신/구 `status` 카나리아를 마치는 것이다. 그 전에는 #1902 병합·공개를 하지 않는다. 자세한 순서는 [배포 게이트](https://github.com/Simon-YHKim/2nd-B/blob/fix/polascope-web-260927/docs/qa/POLASCOPE-RELEASE-260928.md).
- 별도 GUI 잔여: Play 데이터 보안 Revision 2 제출은 Simon의 Play Console 로그인 완료 알림을 기다린다. 결제 전환 3단계 이후는 `claim-paddle-session-ownership-13` 소유 세션이 담당한다. 이 두 작업의 상태를 #1902 계약 적용과 혼동하지 않는다.

---

## 2026-09-28 02:1x / 방침 v4(공지형) 운영 반영 · 웹 게시(PolaScope) · 방침 공지

**목적**: Simon 01:1x "남은 작업 진행(승인함), GUI 도" — Grok 봇 사용량 소진으로 코딩 세션(ttl-work-rev2-f6)이 운영 적용 · 게시 · Production 승인을 대행했다. PolaScope 세션(ttl-work-rev2-7b)과 역할을 나눴다(콘솔 이름 · export 는 그쪽).

**지금까지**
- **#1909** 방침 v4 = 공지형 개정(Simon 00:4x): 본문(Gaius v4, buy · r90 · r90x 뺌) · `PRIVACY_POLICY_VERSION=2026-09-28` · `email-v5` · **0203**(가입 계약 v5 + LLM 동의 현재 = v4·v5, 판정은 사용자당 한 줄) · 0194 수정(운영 미적용) · `check-definer-grants` 해시 **집합**(0191·0203). 검토는 새 문맥 **같은 벤더** 검토자 PASS(교차 벤더 Relay 불가).
- **0203 운영 적용 01:35**: 원장 175→**176**, 지문 적용 전 `af24e78e…` / 적용 뒤 `0a1534bb…` = 로컬 운영 재현본.
- **#1904** FCM 자동 등록 끄기 머지(다음 네이티브 빌드에 실림). **#1911**(Codex 세션 PR, app.json 웹 이름) 넘겨받아 머지 — ⚠ `expo.web.name` 도 Expo **지문 소스**다(Android `14c874c6→337f773a`). OTA 는 이미 #1904 로 vc56 런타임에서 벗어났다.
- **웹 게시 02:15:29 KST**: 런 36335857143, main `57ddc0db`, 승인은 Simon 지시로 코딩 세션. 라이브 제목 · og · manifest = PolaScope, 방침 시행일 09-28, 번들 `email-v5`.
- **방침 원격 공지** 02:16:46: notices `721ae87c-8699-4174-86fd-1a4ea6584d1b`(major).

**다음 1개**: Simon 이 이 코딩 세션에 **Claude in Chrome 연결**(`/chrome`, 확장 설치) → 결제 전환 3단계(바인딩 시크릿)부터 GUI 진행.

**막힌 것**
1. 결제 전환 3·5·6·7·11단계는 Supabase · Paddle 대시보드 GUI. Playwright 로 띄운 별도 크롬은 Google 로그인이 막혔다(Simon 확인). CLI 에서 computer use 는 Windows 미지원(Desktop 앱만).
2. Play 데이터 보안 Revision 2 제출(방침 게시일과 같은 날) — Play Console GUI.
3. 보관 · 삭제 구조(B1~X1 · 카드 정보 · 등록부 문구) — 등록부 가드가 과거 행 변경을 막아 가드 설계부터. 급하지 않다(방침에서 해당 문장은 뺐다).

**함정**
- 웹 게시는 두 단계다: 같은 SHA 의 push(build-only) 빌드 로그에서 `PUBLIC_CONFIG_SHA256` · `ARTIFACT_CONTENT_SHA256` 을 얻어 `publish:<sha>:<cfg>:<art>` 로 디스패치. 빌드~승인 사이 main 이 움직이면 죽으므로 다른 세션과 창을 맞출 것.
- 같은 Simon 지시가 두 코딩 세션에 동시에 갈 수 있다 → 운영 쓰기 전 버스 claim 과 `ListAgents`/SendMessage 로 분담부터.

## 2026-09-28 01:4x / 콘솔 3곳 앱 이름 PolaScope 완료 — Play 는 검토 중(최종 게시는 Simon)

> 발행: CLI 코딩 세션(TTL-Work_rev2). DECISIONS 26.09.28 01:3x(코디네이터 판단). 결과: `.bots/relay/outbox/console-rename-polascope.coding.result.md`.

**지금까지**
- Grok 봇 사용량 소진(Simon 01:1x) → 코딩 세션이 Playwright 파이프 제어 크롬으로 직접 했다. 로그인 · 2FA 는 Simon 본인. Relay 요청서에 인수 claim.
- **AdMob**: `2nd-B Android` → `PolaScope Android`, `2nd-B iOS` → `PolaScope iOS`(내부 이름, 플랫폼 접미사 유지). 새로고침 뒤 값 확인.
- **Play**(`com.simonk.secondbrain`, en-US 하나): 이름 `2nd-Brain: Self Knowledge` → `PolaScope`, 자세한 설명 속 이름 1곳 교체. 대기 변경 2건뿐임을 보고 **검토 전송** → "검토 중인 변경사항".
- **App Store Connect**(`6792266942`, 영어(미국) 하나): 이름 `2nd-Brain: Self Knowledge` → `PolaScope`. 새로고침 뒤 이름 칸과 머리 제목 확인. 부제는 원래 빈칸.
- 함정: 조종 크롬 프로필을 긴 Temp 경로에 두면 **CacheStorage 가 전 사이트에서 실패**하고 ASC 는 로그인 뒤 흰 화면이다(API 는 200). 짧은 경로(`%LOCALAPPDATA%` 아래) 프로필로 새 창을 띄워 해결했고, 그 창은 닫고 프로필을 지웠다.

**다음 1개**: Play 검토가 통과하면 Simon 이 게시 개요에서 최종 "게시"를 누를지 정한다(관리형 게시).

**막힌 것**
1. ASC 부제(빈칸) · Play 간단한 설명은 이번 범위 밖이다. 정본은 `docs/store-copy/drafts.json`(appStoreSubtitle 5개 언어)이다.
2. 첫 조종 크롬 창(긴 경로 프로필)은 Simon 이 다른 탭에서 쓰는 중이라 열어 두었다. Simon 이 닫으면 프로필 폴더를 지운다.

---

## 2026-09-28 01:2x / 상담 "써도 된대" · export-account 재배포 완료(카나리아 통과) · 콘솔 이름은 코딩 세션이 직접

> 발행: CLI 코딩 세션(TTL-Work_rev2). DECISIONS 26.09.28 00:3x(Simon). PR #1908.
> 보고서: "PolaScope 적용 현황" <https://claude.ai/artifact/UZei9vfkSSkLCFMjkgLeiv>

**지금까지**
- Simon(00:3x): "1. 써도 된대. 2. 최대한 빨리 3. 너가 바꿔줘." → 무료 변리사 상담 결과 PolaScope 사용 가능(상담 세부는 기록 없음) · export-account 즉시 재배포 · 콘솔 이름 변경을 코딩 세션에 맡김.
- 사전 점검(읽기 전용 2레인, 00:40~00:55 KST): 운영 스키마 46/46 present · 설치 앱 4판(v0.7.0 · v0.8.0 · QA APK · 라이브 웹 557f2c02) 호환 · blocker 0. 남은 위험은 `claim_account_export` 의 운영 첫 실행이었다.
- **export-account 재배포**: 런 36331196441(main `f1aa4f14`), Simon Production 승인, **01:17 KST success**. 스키마 게이트 "1 function(s), 45 table(s), and 0 column(s) present".
- **카나리아(QA 계정, 01:18 KST)**: 200 · `content-disposition: attachment; filename="polascope-account-export.json"` · 표 45 · errors 0 · 6.1초.
  `account_export_rate_limits` 1행 = claim 게이트(`billing_request_role`)가 Edge 키로 통과한다는 첫 실측. 5분 안 재호출은 429 `export_cooldown`(retry-after 278), 웹 Origin 호출도 같은 429 에 ACAO 일치.
  배포 전 기준선(v129, 00:5x): 200 · 파일명 헤더 없음 · 표 37 · 5.9초.
- 되돌리기 원본: 운영 v129 = `92cf02d8` 판(08-25 resurface ledger). 워크플로는 main 에서만 배포하므로 되돌리려면 되돌림 PR 이 필요하다.
- **콘솔 이름(ASC · Play · AdMob)**: Grok 봇 사용량 소진(Simon 01:1x) → 코딩 세션이 Playwright 파이프 제어 크롬(전용 새 프로필, 디버깅 포트 없음)으로 직접 한다. 로그인·2FA 는 Simon 본인. `relay/inbox/console-rename-polascope.note.md` 에 인수 갱신 + `.claim`.
- 역할 분담(다른 코딩 세션 ttl-work-rev2-f6 과 합의): #1909 · 0203 · **웹 게시** · 방침 공지 · #1904 · Paddle 2~13단계는 그쪽. 이 세션은 웹 게시를 디스패치하지 않는다.

**다음 1개**: Simon 이 2번 모니터 크롬 창에서 Google · Apple 로그인 → 코딩 세션이 AdMob → Play → ASC 이름을 `PolaScope` 로.

**막힌 것 · 달라진 동작**
1. 쿨다운(300초)이 데이터 읽기 **전에** 소모된다. 실패·공유 시트 취소 뒤 다시 누르면 5분간 실패 문구만 나오고, 옛 APK 문구는 "다시 시도해 주세요"다. `retry_after_seconds` 표시와 재요청 없는 재전달(`export-session.ts` 연결) 중 무엇을 할지 정해야 한다.
2. 부분 실패 200(표별 errors) → **전체 503**(fail-closed). 표 이름 변경 · 열 삭제 PR 은 export-account 목록을 함께 봐야 한다. 안 그러면 내보내기 전체가 죽는다.
3. 프로필(`public.users`) 없는 auth 사용자 4명은 이제 503 이다(이전에는 200 빈 내보내기). 내보낼 데이터는 사실상 없다.

---

## 2026-09-28 00:4x / PolaScope 공지 발행 · 병기 안내 · 파일명 — 엣지 재배포는 범위 확인 대기

> 발행: CLI 코딩 세션(TTL-Work_rev2). DECISIONS 26.09.28 00:1x(Simon) · 00:2x(코디네이터 판단).
> 보고서: "PolaScope 적용 현황" <https://claude.ai/artifact/UZei9vfkSSkLCFMjkgLeiv>

**지금까지**
- Simon 선택(00:1x): 약관 적용일 **2026-10-05(월)** · 공지 2026-09-28 · 공지 발행 GO · 적용일 전 게시 시 병기 안내 먼저 · 내보내기 파일명 polascope-*.
- **인앱 공지 발행**: 2026-09-28 00:08:25 KST 운영 `notices` major 1건(id `53a0c132-f24a-4ac3-88e5-434a04d86133`, min_app_version NULL). 발행 전 같은 제목 0건 확인.
  철회가 필요하면 `withdrawn_at` 을 채운다(0114). 로그인 사용자에게만 보인다.
- **#1905 병기 안내**: 가입 ConsentBlock · ConsentNotice · service-consent · 동의 상세 · 약관 문서 화면에 "PolaScope는 2nd-Brain의 새 이름…" 한 줄.
  인용 줄보다 뒤에만 넣었다. `rename-note.test.ts` 가 고정하고, 약관·동의 개정 PR 에서 함께 지운다.
- **23:15 Relay 증명 GO**(이름 변경 뒤 웹 게시, 실행자 Hadrianus)의 조건이 #1903 머지로 채워졌다. `relay/inbox/web-publish-after-renamenote.note.md` 로 **#1905 머지 뒤 게시**를 요청했다.
- **#1906 파일명**: polascope-data-* · polascope-wiki.md · polascope-iden.json · polascope-routine.ics · polascope-account-export.json. 형식 식별자 `2nd-b-account-export` 는 유지.

**다음 1개**: Simon 무료 변리사 상담(02-525-3476) — "지금 PolaScope 를 써도 되는가".

**막힌 것**
1. **export-account 엣지 재배포는 디스패치하지 않았다.** 운영은 v129(2026-08-24)이고 main 에는 그 뒤 08-25 원장 표 · 09-13 보안 강화(+601/-152)가 있다.
   재배포하면 파일명만이 아니라 그 변경 전부가 나간다. 전제 RPC `claim_account_export` 는 운영에 있다. 범위를 보여 주고 Simon GO 를 받은 뒤 `deploy-edge-function.yml`.
2. 적용일(10-05) 같은 날 묶음: 약관·동의 PR(TERMS_VERSION · CONSENT_VERSION · 서버 계약 마이그레이션 · 제1조 "PolaScope(구 명칭 2nd-Brain)") + 병기 안내 제거 +
   메일 제목(대시보드 + config.toml) + app.json 표시 이름 + 새 네이티브 빌드 + 로그인 동의 화면 이름. 각각 Simon GO.
3. 이 블록을 쓰며 09-21 새벽 블록을 `handoff/HANDOFF-2026-09-p2.md` 맨 위로 원문 그대로 옮겼다(p2 16블록).

---

## 2026-09-28 00:1x / 앱 이름은 PolaScope 로 확정·적용 — 머지 ≠ 게시, 약관 적용일에 맞춰 공개

> 발행: CLI 코딩 세션(TTL-Work_rev2). Simon 원문 23:2x: "어찌됐거나 누가 뭐라든 지금부터 앱 이름은 PolaScope 이다. 적용해."
> DECISIONS 23:2x(Simon) · 23:5x(코디네이터 판단) 두 줄.

**지금까지**
- 브랜치 `feat/app-name-polascope`: 앱 이름 가족 전체(2nd-Brain · 이름으로 쓴 두번째 뇌 · 약칭 2nd-B · 웹/광고 2ndB)를 **PolaScope** 로 바꿨다.
  로케일 5개 · 웹(SITE_NAME · manifest · landing · og 카드 + `public/og-image.png` 다시 뽑음) · 앱 문구 · LLM 프롬프트 속 자기 이름 · 스토어 초안 · CI 핀.
  한국어는 라틴 표기에 받침 없는 조사(는/가/를/와/로/란).
- 검토 세 레인(놓친 곳 · CI · 같은 흐름 충돌) 반영: 한국어 통화 회고 2줄, 캐논 온보딩 태그(한국어 첫 장이 런타임에 읽음), 캐릭터 a11y, 매뉴얼 해시 핀.
- 일부러 **안 바꾼 것**: 식별자·경로 전부, 캐릭터 가족, `consent.json` · 약관(사전 공지 뒤 별도 PR), 메일 제목(대시보드와 함께),
  릴리스 파일명, LLM 지식 시드, 내보내기 파일명(`2nd-brain-*`), 개념 태그라인("A second brain built from …").
- **`app.json` 표시 이름은 이번 PR 에서 뺐다.** expo.name 이 fingerprint 소스라 머지하면 새 빌드 전까지 OTA 가 전부 막힌다. 네이티브 빌드 PR 로 간다.
- 로컬 검증: jest 876 suites(src/lib 671 · screens+scripts 56 · 나머지 149) 통과 · tsc 0 · eslint 오류 0 · check:* 13종 + constraints FAIL 0.

**다음 1개**: Simon 이 무료 변리사 상담(지식재산처 서울사무소 · 대한변리사회 공익상담 02-525-3476)에서 "지금 PolaScope 를 써도 되는가"(의뢰서 Q4)를 먼저 묻는다.

**막힌 것 · 순서**
1. **머지 ≠ 게시.** 가입 화면은 PolaScope 인데 동의 문구 · 약관 · 메일 제목은 2nd-Brain 이다. 권고 순서:
   인앱 공지(D0, 운영 쓰기 GO) → 적용일 D+7 에 약관·동의 PR(TERMS_VERSION · CONSENT_VERSION · 서버 튜플 마이그레이션) + 웹 게시 + 새 네이티브 빌드(app.json 이름 포함) + 콘솔 이름들을 같은 날.
   그 전에 게시해야 하면(결제 전환의 웹 게시 단계 등) 가입 흐름에 '구 2nd-Brain' 병기 안내를 먼저 넣는다.
2. 콘솔 이름 변경(각 Simon GO): ASC 앱 이름 · Play 등록정보 · AdMob · Google/Kakao/Naver/Apple 로그인 동의 화면 · Supabase 메일 제목(+config.toml) · Paddle 상품명·명세서 표시.
3. 이미 기기에 예약된 루틴 알림 제목은 '2nd Brain' 으로 남는다(루틴을 다시 저장하면 바뀐다).

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

## 2026-09-26 20:52 / Android 음성 Stop 수정·게이트 유지

- Android 제품 Record→Stop에서 React Native의 `ArrayBuffer` 기반 `Blob` 거부로 전사가 실패했다. `6cede82d`는 제한 크기 읽기 후 중단 가능한 청크 base64 변환으로 수정했고, 동일 AVD에서 오프라인 mock 전사 문구 표시·임시 음성 파일 삭제를 확인했다. 원격 DB·Edge 쓰기와 유료 호출 0건, 기록 저장 미실행. [화면과 검증 범위](qa/ANDROID-VOICE-CANCEL-260926.md).
- PR #1865는 Draft다. 문서 게이트 정정 `16850053`의 로컬 전체 verify(820 suites·10,691 Jest tests·UI 76)와 원격 CI 4/4는 통과했다. 음성 수정 `6cede82d`의 집중 Jest 19/19·TypeScript·대상 ESLint와 통합 전체 verify(820 suites·10,693 Jest tests·UI 76)는 통과했다. 새 CI는 대기 중이다.
- AdMob은 Q5 제3자 제공 중심 판단과 활성화 차단을 유지한다. 백업 전체 격리 복원 드릴은 승인됐지만 KeePassXC 개인키·임시 DB 접속·삭제 경로가 없어 프로젝트 생성 전 중단됐다. Paddle sandbox는 별도 프로젝트·설정·거래 증거가 없어 미완료다. Grok 후속 전달은 보류한다.

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

