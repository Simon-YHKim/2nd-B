# 2nd-Brain Handoff

> 가장 최신 섹션이 맨 위. 2026-06-16 이전 sprint 핸드오프는 [handoff/ARCHIVE-2026-05-25_to_2026-06-16.md](handoff/ARCHIVE-2026-05-25_to_2026-06-16.md) 로 아카이브됨(2026-07-03).
> Live: <https://simon-yhkim.github.io/2nd-B/>

## 이 로그는 기간으로 쪼개져 있다

단일 파일 100KB 상한(Simon 지침 §2 · §0-1)을 지키려고 **요약이 아니라 기간으로**
나눴다. 이 파일은 **활성 창**이고, 밀려난 블록은 아래 파일에 원문 그대로 있다.
한 글자도 요약하지 않았다.

| 덮는 기간 | 파일 | 블록 | 크기 |
|---|---|---|---|
| 2026-09-25 ~ 2026-09-27 | [handoff/HANDOFF-2026-09-p3.md](handoff/HANDOFF-2026-09-p3.md) | 35 | 81KB |
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

## Latest — 2026-10-01 02:43 / 건강 기록 자동 읽기(Android): 이 폰에서 연결한 계정만 · 하루 한 번 · 권한 창 없이

- **왜**: Simon 09-30 `/data-connections` 지시("핸드폰 권한을 얻어야 하는것은 권한을 부여해서 작업할수 있게 … 자동으로 읽어낼수 있게 셋팅하자" · "하루 한번"). [#1965](https://github.com/Simon-YHKim/2nd-B/pull/1965) 는 출처를 폰 권한 우선으로 묶기만 했고 "자동으로 읽는 건 아직 없다"고 적었다. 이 PR 이 그 건강 부분이다.
- **무엇** ([#1968](https://github.com/Simon-YHKim/2nd-B/pull/1968)): `src/lib/health/auto-read.ts`(무엇을 읽나) + `auto-read-runner.ts`(언제 도나) + `src/components/health/HealthAutoReadSync.tsx`(`_layout.tsx` 의 `AuthProvider` 안에 하나).
  - 조건: 성인 · 자동 새로고침 켜짐 · 하루 한 번(새로고침 시각 뒤) · 서버 `health_import` 동의 · 이미 허용된 것만(`readGranted`, 창 없음, 자동 경로의 `requestPermission` 호출 0).
  - **이 폰에서 이 계정이 '오늘 반영'으로 권한을 준 적이 있어야 한다**(armed 표시). OS 권한은 계정이 아니라 폰의 앱에 붙어서, 이게 없으면 같은 폰에 로그인한 다른 성인 계정이 주인의 기록을 물려받는다.
  - 앱이 앞에 있을 때만 시작하고 뒤로 가면 버린다(Health Connect 가 백그라운드 읽기를 거부). 한 번에 하나 · 계정 리스 · 5분 기한 · 앱을 켜 둔 채 시각이 지나면 타이머로.
  - 걸음·운동·수면만. 심박은 판독값마다 한 줄(하루 수천 줄)이고 최근 50개 화면에서 수면을 밀어내서 탭 전용으로 남겼다.
  - 범위: 마지막 **완전한** 읽기 날 0시 → 지금(늦어도 어제 0시, 최대 3일 전). 실패·중단된 읽기는 '시도'만 표시하고 범위 기준은 그대로 둬서 다음에 다시 읽는다. 1,000건씩 저장.
- **같이 고친 기존 결함**: ① Health Connect `read()` 가 첫 페이지(1,000건)만 읽었다 → `pageToken` 끝까지, 실패한 페이지 앞은 보존. ② 저장된 행마다 루틴 목록을 다시 불러왔다 → 호출마다 한 번. ③ 어제 기록이 오늘 만든 루틴을 어제 날짜로 완료하지 않게.
- **문구(5개 언어)**: 새로고침 설명에 "대시보드가 열려 있을 때"를 되살리고, 건강은 "Android 앱에서 '오늘 반영'으로 연결한 폰에서만"으로 한정했다. 건강 카드 안내에서 iOS 약속을 뺐다("iPhone은 아직 읽지 못해요"). '오늘 반영' 결과 줄에 "이 폰에서는 하루 한 번 자동으로도 읽어요"를 붙인다.
- **검증**: `npm run verify` 870 묶음 · 11,278건 통과(종료코드 0) · 일부러 망가뜨린 11곳 전부 잡힘 · 적대적 리뷰 4관점 20건(겹침 포함) → 확인 18 · 반박 2.
- **알려진 한계**: 자동 읽기가 끝나도 열린 대시보드는 다시 포커스될 때 보인다(`DashboardPhone.tsx` 는 다른 세션이 수정 중이라 건드리지 않았다) · '오늘 반영'의 "새로 들어간 항목" 수는 upsert 가 갱신된 행도 돌려줘서 부풀려진다(기존 결함, 서버 RPC 필요) · iOS 는 HealthKit 어댑터를 @kingstinct 14 에 맞추고 레지스트리 순서를 고쳐야 한다 · 실기기 검증 없음(Health Connect 에 시험 기록을 넣을 도구가 이 PC 에 없다).
- **다음 세션**: Health Connect 가 있는 폰에서 ① 성인 계정으로 '오늘 반영'(동의 · 권한) ② 다음 날 새로고침 시각 뒤에 앱 열기 ③ 건강 기록에 전날 저녁 기록이 들어왔는지. 결정 대기: Q-261001-01(폰 캘린더 · #1902 와 묶음) · Q-261001-02(카카오톡 · SMS 카드).

---

## 2026-10-01 02:10 / Android 진단 성공·공개 법률 웹 QA·10월 Draft 준비

- **Android·앱 동등성**: [진단 빌드 36741708266](https://github.com/Simon-YHKim/2nd-B/actions/runs/36741708266)이 `3f8c7544`에서 성공했다. APK 생성·`arm64-v8a` 확인·artifact 업로드가 통과했고 환경 digest `e90c4cb7…`는 localhost와 같다. 그 뒤 다른 세션의 [#1965](https://github.com/Simon-YHKim/2nd-B/pull/1965)가 main `0e2bb32e`에 병합됐다. 8081은 문서 반영 main `a0bdd6e6`까지 따라갔고 `npm run app:parity`는 앱 경로 차이 0·설정/의존성 일치로 **같음**(exit 0)이다. 새 SHA의 [진단 빌드 36745473207](https://github.com/Simon-YHKim/2nd-B/actions/runs/36745473207)도 성공했다. APK 생성·`arm64-v8a`·artifact 업로드가 모두 통과했다. 폰 QA APK 게시는 실행하지 않았다.
- **공개 웹 읽기 전용 QA**: 375×812 Chrome에서 `/`, `/privacy-policy`, `/terms`, `/refund`, `/legal/privacy.html`, `/legal/terms.html`, `/legal/refund.html`의 HTTP 200, JS 페이지 오류 0, 가로 넘침 0, 보이는 깨진 이미지 0을 확인했다. 요청 쓰기 0건. 앱 개인정보처리방침은 시행 2026-09-29, 약관은 2026-08-16으로 렌더링되고 10월 5일 이름 전환 전 `2nd-Brain`과 `PolaScope`의 관계를 설명한다. 정적 법률 HTML의 제목은 아직 `2nd-Brain`이다. 운영 웹 재게시는 하지 않았다. 결과 파일은 로컬 `E:\2ndB\.git\app-parity\legal-live-qa-results-261001.json`이다.
- **10월 5일 계약 Draft**: [#1902](https://github.com/Simon-YHKim/2nd-B/pull/1902) 본문의 오래된 “0194 미적용” 주장을 9월 29일 콘솔 claim `PROD-DELETE-CONSENT-260929`의 0192·0194 적용 기록에 맞춰 정정했다. 법률 계약 내용은 바꾸지 않고, 한 파일의 최신 인용 충돌을 풀어 Draft head `4c81c0ce`에 main `a0bdd6e6`을 통합했다. 로컬 verify 865 suites/11,226 tests 및 PR CI `lint`·`verify`·`web-export-smoke`·PostgreSQL `sql` 4종이 통과했고 GitHub는 충돌 없음으로 판정했다. #1902와 메일 제목 [#1917](https://github.com/Simon-YHKim/2nd-B/pull/1917)은 적용일 전 Draft로 유지한다. 전환 전 운영 원장 재조회·법률 계약·서버 선행 조건 검증이 필요하다.
- **세션 정리·남은 확인**: 병합이 확인된 제 공유 claim 네 개(#1894·#1899·#1900 SQL PASS·#1911)를 `done`으로 갱신했다. Play Console 로그인 창은 보이지 않았고 `adb devices -l`에는 연결 기기가 없다. 실제 Android 사진 선택기·TalkBack·유효한 초대 서버 경로와 Play Data Safety 양식은 미검증이다. 운영 DB·Edge·콘솔 변경은 `docs/SESSION-OWNERSHIP.md`의 담당 경계를 따른다. Grok 후속은 Simon 지시대로 보류한다. 원래 `TTL-Work_rev2`의 다른 세션 미커밋 대시보드 변경은 건드리지 않았다.
- **다음 세션**: `git fetch origin main` → `git show origin/main:docs/HANDOFF.md` → 후속 main 변경 시 `npm run app:parity`와 같은 앱 코드의 진단 빌드를 확인. 건강 자동 읽기는 #1965 담당 세션의 후속이다. 10월 5일 전 #1902·#1917을 병합하지 않는다. 운영·공개·비용·삭제 게이트는 기존 승인 범위와 저장소 지침을 확인한다.

---

## 2026-10-01 01:23 / 데이터 연동 화면 정리: 하루 한 번 새로고침 · 휠 시간 선택 · 기기 권한 우선 출처 목록

> 발행: Claude Code 세션(ttl-work-rev2-6a, session_01Y5crhLjB7nQUp3Co7rMzHu). 작업 워크트리 `.worktrees/data-conn-260930`, 브랜치 `claude/data-connections-phone-first-260930`. TTL-Work_rev2 의 다른 세션 미커밋 변경(DashboardPhone 등)은 건드리지 않았다. 이 브랜치가 `locales/*/ops.json` · `phone-settings-contract.test.ts` 를 바꿨으므로 그쪽이 나중에 머지하면 충돌 해소가 필요할 수 있다.

- **Simon 요청(09-30 23:1x, localhost 요소별 지시).** 반복 간격 버튼 · "켜짐 · 반복 간격과…" · "기준 시각 (24시간)" · 간격 설명 · 출처 소개문 = "제거.", 새로고침 = "가로로 긴 버튼", 시각 입력 = 참조 사진 같은 휠 팝업을 "우리 앱에 맞게", 출처 목록 = "핸드폰 권한을 얻어야 하는것은 권한을 부여해서 … 파일 첨부 최대한 지양 … 자동으로 읽어낼수 있게". 23:3x "내 의도는 하루 한번이야." 결정 기록: DECISIONS 26.09.30 23:35 · 26.10.01 00:21 · 01:16(정정).
- **한 일.** 새로고침은 하루 한 번(`refresh-cadence.ts`, 순수 계산은 `refresh-schedule.ts`), 기본 07:00. 옛 저장값: 24시간은 시각 유지, 3·6·12시간은 기준 시각 유지(00:00 이면 07:00), 30·60분은 07:00. 서머타임 틈에 든 시각은 다음 날로 넘어간다. 휠은 `components/pixel/PixelTimeSheet.tsx` · `PixelWheel.tsx` · `time-wheel.ts`: 칸 순서와 12/24시간제는 `common:timePicker.pattern`, 12시간제 시 칸은 24칸을 돌아 11시→12시에서 오전/오후가 넘어간다. 출처는 `SOURCE_GROUPS` 로 기기 권한 → 가져오기 필요 → 직접 기록(SNS 6개가 카드 1장). 건강·Garmin 카드는 `/import?mode=account` 로 바로 열리고 건강도 `adultOnly`. 동의만 켜진 상태는 "앱의 기기 건강 접근 켜짐 · 아직 읽은 기록 없음"이다.
- **안 한 것(명시).** ① 건강 자동 읽기: 아직 없다. 설치 앱에서 동의·권한 뒤 '오늘 반영'을 누를 때 그날만 읽는다. ② 기기 캘린더·위치 읽기: 처리방침 §1 에 항목이 없고, iOS 캘린더 문구가 '추가 전용'이며, Android 는 READ_CALENDAR 가 이미 선언돼 있어 JS 만으로 켜면 고지 없는 수집이 된다. ③ 구글 타임라인 파서가 옛 Takeout 두 형식만 읽는 기존 한계.
- **검증.** `npm run verify` 통과(리베이스 뒤 재실행 결과는 PR 본문). 브라우저 검사 `docs/qa/data-connections-260930/check.cjs` 14/14(8082 세션 서버, 앱 아님): 지운 요소 0, 버튼 폭, 기본 오전 7:00, 첫 포커스=닫기, 탭 순서, 누르기·방향키·휠·끌기, 11시→12시 오후, 저장·재로딩 유지, Esc·바깥 닫기, 묶음 순서, 320/375/425px 가로 넘침 0, 짧은 끌기 한 칸, 페이지 오류 0, 계정 쓰기 0. 적대적 리뷰 5관점 × 반박 검증에서 29건 확인 → 전부 반영. 변이 검사 2건: 서머타임 테스트(범위를 되돌리면 실패), 끌기 가드(빼면 9시→11시로 실패).
- **웹 vs 네이티브.** 휠 끌기·안드로이드 뒤로·TalkBack·가장 큰 글꼴은 웹으로 확인할 수 없다. 폰 QA APK 는 Simon 이 볼 때만(`npm run app:qa-release`).
- **다음 1개.** 건강 자동 읽기 PR: 이미 동의·허용한 성인만, 앱이 활성일 때, 하루 한 번 새로고침 시각 이후, 권한을 새로 묻지 않고(Health Connect 는 부여된 권한 조회, iOS 는 한 번 요청한 뒤에만) 오늘 범위를 `ingestHealthSamples` 로. 카드 문구와 `dataRefreshScope` 도 같이 고친다. Simon 결정 대기: 기기 캘린더를 읽을 범위(기기 안 표시만 / 기록·위키 저장, 10-05 방침 묶음 #1902 와 순서), 카카오톡·SMS 파일 카드 유지 여부.

---

## 2026-10-01 01:07 / 메모 OCR 수기 입력·저장 안내 GUI 회귀 수정

- **PR #1963 병합 SHA `3f8c7544`**: [PR #1963](https://github.com/Simon-YHKim/2nd-B/pull/1963)은 OCR 오류 뒤 결과 상자에 수기로 입력한 글을 `메모에 넣기`로 옮길 수 있게 했다. 비활성 저장 버튼의 안내도 기본 메모·링크·할 일에서는 공통 입력 안내를, 4W1H 메모에서만 필수 `무엇을` 칸 안내를 쓴다. 영어·한국어·스페인어·포르투갈어·인도네시아어 문구와 회귀 테스트를 포함한다. DB·운영 설정 변경은 없다.
- **검증**: 병합 전 로컬 `npm run verify -- --runInBand` 862 suites/11,163 tests 통과. 최신 main `7a1d1d3f`를 브랜치에 통합한 뒤 PR CI `lint`·`verify`·`web-export-smoke` 3/3 통과. 375×812 격리 Chrome에서 OCR POST를 차단해 오류를 재현하고 수기 입력·메모 삽입을 확인했다. 저장 쓰기는 하지 않았고 페이지 오류 0건·가로 넘침 없음. [QA 기록](qa/memo-gui-fixes-261001.md) · [화면](qa/memo-gui-ocr-manual-261001.png).
- **앱/localhost**: 8081 감독자가 `3f8c7544`를 따라갔다. `npm run app:parity`는 앱 경로 차이 0개, 설정·의존성 일치로 **같음**(exit 0)을 보고했다. 같은 SHA의 [Android 진단 빌드 36741708266](https://github.com/Simon-YHKim/2nd-B/actions/runs/36741708266)은 확인 시 대기 중이므로 최종 결과를 다시 확인한다. QA APK는 Simon이 폰에서 보기를 원할 때만 게시한다.
- **남은 확인**: 실제 Android 사진 선택기·TalkBack 안내·OCR 성공 유료 경로는 기기와 유료 호출 없이 검증하지 못했다. `adb devices -l`에 연결 기기가 없다. Play Console 로그인이 확인되지 않았고 운영 동의·Play 신고·DB/Edge 적용은 `docs/SESSION-OWNERSHIP.md`의 콘솔 소유 경계를 따른다. Grok 후속은 Simon의 보류를 유지한다. 공개 Pages는 읽기 전용 QA에서 이전 배포의 PolaScope 로그인 화면을 확인했으며 이 PR SHA의 운영 웹 게시는 하지 않았다. 원래 `TTL-Work_rev2`의 다른 세션 미커밋 변경은 건드리지 않았다.
- **다음 세션**: `git fetch origin main` → `git show origin/main:docs/HANDOFF.md` → 빌드 36741708266 최종 결과와 `npm run app:parity`를 재확인한다. 기기·콘솔 접근이 가능해지면 위 미검증 항목을 확인한다. Simon의 최신 지시대로 작은 구현 판단을 반복 질문하지 않는다. 운영·공개·비용·삭제 게이트는 기존 승인 범위와 저장소 지침을 확인한다.

---

## 2026-09-30 23:57 / 커뮤니티 초대 입장 경합 수정·GUI 검증·앱 동등성

- **PR #1958 병합 SHA `90fd6b83`**: [PR #1958](https://github.com/Simon-YHKim/2nd-B/pull/1958)이 CI `lint`·`verify`·`web-export-smoke` 3/3 통과 후 병합됐다. 초대 A의 비동기 프로필·입장 결과가 토큰 B, 사용자 변경, 재시도, 화면 이탈 뒤 현재 화면을 이동시키거나 오류를 덮지 않도록 요청 유효성을 검사한다. A가 프로필 단계에서 낡아졌다면 입장 RPC도 호출하지 않는다. DB·운영 설정 변경은 없다.
- **검증**: 병합 전 최신 main 기반 `npm run verify -- --runInBand` 861 suites/11,141 tests 통과. 지연 Promise 회귀 테스트 4개가 현재 성공·프로필 중 초대 전환·입장 중 전환·오래된 오류 무시를 검증한다. 375×812 Chrome QA에서 잘못된 초대의 오류 화면과 모의 입장의 방 경로 이동을 확인했다. 페이지 오류·가로 넘침 0건이며 쓰기 응답은 모의 처리했다. [QA 기록](qa/community-join-lifecycle-260930.md) · [화면](qa/community-join-lifecycle-260930.png).
- **앱/localhost**: 8081 감독자가 `90fd6b83`을 따라갔다. `npm run app:parity`는 앱 경로 차이 0, 설정·의존성 일치, 같은 SHA의 [Android 진단 빌드 36732694009](https://github.com/Simon-YHKim/2nd-B/actions/runs/36732694009) 진행 중으로 **같음**을 보고했다. 빌드는 서명 전 최신 main 게이트를 통과했으며 최종 성공은 아직 확인하지 않았다. OTA 런 36732693996은 성공했다. QA APK 게시는 Simon이 폰에서 보기를 원할 때만 한다.
- **남은 확인**: 실제 유효한 초대의 서버 권한·만료·소진 규칙과 ARM Android 실기기 뒤로가기·글꼴 확대·TalkBack은 검증하지 못했다. `adb devices -l`에 연결 기기가 없었다. Play Console 로그인 상태도 확인되지 않았다. 운영 동의 모드·503·Play Data Safety·서버 적용은 `docs/SESSION-OWNERSHIP.md`의 담당 경계를 따른다. Grok 후속은 Simon의 보류를 유지한다. 원래 `TTL-Work_rev2`의 다른 세션 미커밋 변경은 건드리지 않았다.
- **다음 세션**: `git fetch origin main` → `git show origin/main:docs/HANDOFF.md` → 빌드 36732694009 최종 결과와 `npm run app:parity` 재확인. 실제 기기와 서버 접근이 가능해지면 위 미검증 항목을 검증한다. Simon의 최신 지시대로 작은 구현 판단을 반복 질문하지 않는다. 공개·운영·비용·삭제 게이트는 기존 승인 범위와 저장소 지침을 확인한다.

---

## 2026-09-30 23:00 / 커뮤니티 방 딥링크 오류 상태·앱 동등성 확인

- **main `7c96eeec`**: [PR #1949](https://github.com/Simon-YHKim/2nd-B/pull/1949)는 `246c5a0b`에 CI 3종 통과 후 병합됐다. 참여하지 않는 방 URL에서 빈 대화방·입력·나가기 대신 접근 불가 안내와 목록 복귀를 표시한다. 단일 ID 조회가 최근 50개 목록 제한보다 먼저 적용되고, 경로 전환 중 이전 방 상태·늦은 응답이 새 방에 섞이지 않는다. 5개 언어 문구와 회귀 테스트를 포함한다. 그 뒤 #1951·#1953 문서와 #1952 앱 변경이 main에 추가됐다.
- **검증**: 최신 main을 통합한 로컬 `npm run verify -- --runInBand` 854 suites/11,066 tests 통과. PR CI `lint`·`verify`·`web-export-smoke` 3/3 통과. QA 계정의 375×812 Chrome 읽기 전용 검사에서 존재하지 않는 방의 입력·나가기 0건, pageerror·가로 넘침 0건. 잘못된 초대 링크는 오류 화면만 검증했고 프로필 POST 1건을 차단했다. [QA 기록](qa/community-room-unavailable-260930.md) · [완료 보고](qa/community-room-handoff-260930.html).
- **앱/localhost**: 8081 감독자가 최신 `7c96eeec`를 따라간 뒤 `npm run app:parity`가 앱 경로 차이 0, 설정·의존성 일치, 같은 앱 코드 `ad42a1f5`의 [Android 진단 빌드 36723491160](https://github.com/Simon-YHKim/2nd-B/actions/runs/36723491160) 진행 중으로 **같음**을 보고했다. #1949의 대기 빌드 36722377116은 뒤따른 문서 병합 시 게이트에서 실패했고, 별도 세션이 재실행한 빌드 36723106509도 진행 중이다. 두 대체 빌드는 마지막 main 게이트를 통과했으나 최종 성공 여부는 후속 확인한다. QA APK는 09-30 결정대로 Simon이 폰에서 볼 때만 게시한다.
- **남은 확인**: ARM Android 실기기에서 글꼴 확대·TalkBack과 실제 유효한 커뮤니티 room/join 흐름을 확인한다. 운영 동의 모드·503·Play Data Safety 및 서버 적용은 콘솔 소유 경계를 따른다. Grok 후속은 Simon의 기존 보류를 유지한다. 원래 `TTL-Work_rev2`의 다른 세션 미커밋 변경은 건드리지 않았다.
- **다음 세션**: `git fetch origin main` → `git show origin/main:docs/HANDOFF.md` → Android 빌드 결과와 `npm run app:parity` 확인. #1953의 빌드 중단 기록은 바로 아래 22:39 블록에 보존했다. 공개·운영 적용 전 별도 게이트는 아래 기록과 `docs/SESSION-OWNERSHIP.md`를 따른다.

---

## 2026-09-30 22:39 / 덧붙임 — 문서 머지(#1951)가 #1949 의 대기 빌드를 끊음 → main 으로 다시 빌드

> 발행: CLI 코딩 세션(TTL-Work_rev2, session_011kqZojB5KVspmMgAZ4rZ89). 바로 아래 22:27 블록 뒤에 생긴 일이다.

- **무슨 일.** 22:27 블록을 올린 문서 PR #1951 이 22:37 에 머지됐다. 그 PR 이 CI 를 도는 사이 다른 세션의 앱 변경 #1949(`246c5a0b`)가 먼저 머지됐다. #1949 의 push 빌드(런 36722377116)는 대기열에 있었다. #1951 머지로 main 이 `89b31885` 로 움직였으므로, 그 빌드는 시작하면 게이트에서 끊긴다. 문서 머지로는 새 빌드가 돌지 않는다.
- **왜 막지 못했나.** 자동 머지를 켜기 전에 한 번만 확인했다(그때 가장 최근 빌드는 게이트를 지난 뒤였다). CI 가 도는 사이 끼어든 머지는 보지 못했다.
- **메운 것.** 22:38 에 `gh workflow run android-release.yml --ref main` 을 돌렸다(런 36723106509, `89b31885`). CLAUDE.md 에 적힌 대처 그대로다. 이 빌드가 끝나기 전까지는 `app:parity` 가 '수동 빌드 진행 중 - 끝나야 판정' 으로 '다름' 을 낸다. 끝나면 같은 코드 · 같은 설정의 성공으로 바뀐다.
- **교훈(모든 세션).** 스크립트 · 문서만 바꾸는 PR 은 자동 머지를 켜지 말고, CI 초록 뒤 머지 **직전에** 대기 · 진행 중인 main 빌드가 마지막 게이트('Recheck current main before signing credentials')를 지났는지 다시 보고 손으로 머지한다. 이 덧붙임 PR 도 그렇게 머지했다.

---

## 2026-09-30 22:27 / 마무리 — 세 번째 자기 갱신 성공 · 최종 대조 같음 · 정리

> 발행: CLI 코딩 세션(TTL-Work_rev2, session_011kqZojB5KVspmMgAZ4rZ89). 바로 아래 22:00 블록의 "머지되면 한 번 더 갈아탄다" 가 어떻게 됐는지 적는다.

- **세 번째 자기 갱신 성공.** #1948 이 22:06 에 머지됐다. 약 35초 뒤 새 감독자(pid 12996)가 `422a352f` 로 넘겨받았다. 첫 번들은 77초 걸렸고 두 주소 모두 200 이었다. 22:20 에는 다른 세션의 앱 변경 `97bfecc3`(#1947)도 따라가 다시 띄웠다.
- **최종 대조(22:22).** 같음.
  - localhost-main 이 `97bfecc3` 로 origin/main 과 같고, digest `e90c4cb7` · 의존성도 같다.
  - 같은 코드의 APK 는 빌드 중이다(런 36720868405).
  - 캐시를 비운 직후인데도 판정이 정확했다. 필터 없는 런 목록(#1948) 덕이다.
- **빌드.** `24501600`(런 36716945818)은 성공했고, 주석은 digest `e90c4cb7…` · `arm64-v8a` 다.
- **정리.**
  - 작업 워크트리 `app-parity-follow-260930` 를 지웠다. 정션을 먼저 끊었고, 공용 node_modules 는 726 → 726 으로 그대로다.
  - 머지된 브랜치 4개를 로컬 · 원격에서 지웠다(#1940 · #1942 · #1945 · #1948).
- **보고서 v2.** https://claude.ai/artifact/STLymvskwA1tBNFgv4ArrL (같은 주소를 갱신했다).
- **다음 1개.** 없음. 머지만 하면 8081 과 CI 빌드가 따라간다. 폰에서 보실 때만 `npm run app:qa-release`.

---

## 2026-09-30 22:00 / 정정: 대조의 '기록 없음' 원인은 불완전한 런 목록 — 필터 없는 조회로 바꿈 · 두 번째 자기 갱신 성공

> 발행: CLI 코딩 세션(TTL-Work_rev2, session_011kqZojB5KVspmMgAZ4rZ89). 바로 아래 21:38 블록을 바로잡는다.

- **두 번째 자기 갱신 성공.** #1945 가 21:46 에 머지됐다. 21:47:24 에 옛 감독자가 기록을 넘겼고, 21:47:35 에 새 감독자(pid 45552)가 `24501600` 으로 떴다. 옛 감독자(44976)는 끝났다. 127.0.0.1 · ::1 모두 200.
- **그 직후 대조가 세 번째로 '기록 없음' 을 냈다.** #1945 에 넣은 근거 표시가 원인을 보여 줬다.
  - 찍힌 최근 런 셋이 전부 옛 수동 빌드(`4ee03669` · `c423ba88` · `2d688ef0`)였다.
  - 방금 생긴 push 런(`24501600` 대기 · `4249f73f` 진행)은 하나도 없었다. 즉 `gh run list --branch main --event push` 가 빈 목록을 성공으로 돌려줬다.
  - 세 번 모두 이 길로 설명된다. 세 번 모두 8081 이 캐시를 비우고 번들링하던 때였다.
- **정정: 21:38 블록의 "그 판정에 이르는 길은 앱 코드 대조(git diff)의 오류를 삼키는 것뿐이다" 는 틀렸다.** 런 목록이 불완전하게 오는 길을 놓쳤다. #1942(결론이 빈 '완료') · #1945(대조 오류 드러내기)는 다른 틈을 막으므로 그대로 둔다.
- **고침(이 PR).**
  - 필터 없는 REST 목록(`actions/workflows/android-release.yml/runs?per_page=100`)을 받아 main 의 push · 수동 런을 여기서 거른다. GitHub 문서상 branch · event 필터가 붙은 조회는 검색 색인을 거친다.
  - main 의 push 런이 하나도 없으면 3초 뒤 다시 묻고, 세 번째도 없으면 '확인 못 함' 으로 멈춘다.
- **실측(부하).** 12코어를 가득 태우면 `gh run list` 한 번이 8~60초 걸렸고, 8번 중 2번은 60초 제한을 넘기거나 연결 오류로 끝났다. '성공인데 빈 목록' 은 재현되지 않았다. 그래서 네트워크 상한을 60초에서 120초로 늘렸다.
- **지금(22:00).** 같음. localhost-main `24501600` = origin/main, digest `e90c4cb7`, 의존성 같음. 같은 코드의 APK 는 빌드 중이다(런 36716945818).
- **다음 1개.** 없음. 이 PR 도 스크립트를 바꾸므로 머지되면 감독자가 한 번 더 갈아탄다. 워크플로는 건드리지 않았다.

---

## 2026-09-30 21:38 / #1940 머지 뒤 실측 — 8081 인수 · CI digest 일치 · 따라가기 3종과 첫 자기 갱신 성공 · 대조 오류 드러내기

> 발행: CLI 코딩 세션(TTL-Work_rev2, session_011kqZojB5KVspmMgAZ4rZ89). 아래 20:13 블록의 '다음 1개' 와 '미검증 1건' 을 실행하고 확인한 기록이다.

- **8081 인수(20:27 KST).** `npm run localhost` 가 옛 방식 감독자를 감독자로 알아봤다(pid 30172, `node scripts/app-parity.cjs localhost` - --port 없음). main `8f27d5e4` 스크립트의 preflight 가 통과한 뒤에 멈추고 넘겨받았다.
  - 헤드리스로 확인: 로그인 화면이 뜬다. `__DEV__` false, 번들 `dev=false&minify=true`. 번들 값은 FORCE_TIER `off` · ALLOW_DEV_TIER `false` · LLM_MODE `live` · ENABLE_ADS `true`. 콘솔 오류 0. 127.0.0.1 · ::1 모두 200.
- **미검증 1건 해소.** #1940 로 돈 첫 빌드(런 36708582875)의 `app-env-digest` 주석이 `e90c4cb7453f…` 로 로컬 계산과 같다. 러너는 값이 빈 `EXPO_PUBLIC_SAFETY_VENDOR` 도 넘긴다. `app-apk-abi` 주석은 `arm64-v8a`.
  - 그 빌드는 Gradle 이 NDK 27.0.12077973 을 받다가 압축이 깨져 한 번 실패했다("Archive is not a ZIP archive"). 러너 쪽 문제다. 같은 커밋으로 재실행(attempt 2)하니 **성공**했다.
  - #1941 빌드(런 36709884906)도 성공했고, digest 일치 · arm64 다.
- **따라가기 실측 3종.**
  - 다른 세션의 앱 변경 #1941 → "앱 경로 29개 바뀜 - 다시 띄운다".
  - 문서 #1943 → "옮겼다(앱 경로 변경 없음, 서버 유지)".
  - 스크립트 #1942 → **첫 실제 자기 갱신**: 21:17:02 KST 에 새 스크립트 preflight 를 통과했고, 약 10초 뒤 새 감독자(pid 44976)가 `f275fde4` 로 기록을 넘겨받았다. 옛 감독자는 스스로 끝났다. 뒤이은 #1944(앱 아이콘)도 따라갔다.
- **정정 - 20:13 블록의 "진행 중인 수동 빌드도 1분 안에 폰용인지 알 수 있다" 는 틀렸다.** GitHub 는 check-run 주석을 job 이 끝난 뒤에야 보여 준다. digest 단계를 지난 진행 중 job 의 annotations_count 가 0 이었다(실측). 그래서 진행 중인 수동 빌드는 끝나야 폰용 · 같은 설정인지 판정된다. `qa-release` 는 이제 그런 빌드를 주석 폴링 없이 끝날 때까지 기다린다.
- **대조가 두 번 틀린 이름('기록 없음')을 냈다.** 둘 다 8081 이 새로 뜨며 캐시를 비우고 번들링하던 때였고, 몇 분 뒤 다시 치면 바르게 나왔다.
  - 1번째(#1940 직후)는 런이 '완료' 로 바뀐 순간 결론이 비어 있던 틈이었다 → #1942 에서 진행 중으로 본다.
  - 2번째(#1942 직후)는 같은 앱 코드인 런이 있는데도 나왔다. 그 판정에 이르는 길은 앱 코드 대조(git diff)의 오류를 '다른 코드' 로 삼키는 것뿐이다 → 이 PR 에서 받은 커밋의 대조 오류는 한 번 더 보고, 그래도 나면 '확인 못 함' 으로 드러낸다. 주석 조회 실패도 건수를 밝히고, '같음' 이 아닌 판정에는 최근 런 셋을 근거로 붙인다.
  - 실측: gh 호출이 가끔 10~18초 걸렸다(평소 2~3초).
- **지금 대조(21:3x).** 같음. localhost-main 이 origin/main 과 같고 digest `e90c4cb7` · 의존성이 같다. 같은 코드의 APK 빌드는 진행 중이다(런 36715653238, `4249f73f`). 폰 QA APK(`qa-260930-5e52894b`)는 앱 경로 31개 뒤처졌고 참고로만 나온다.
- **다른 세션.** ttl-work-rev2-3a · 6f 에 09-30 판 규칙을 알렸다.
- **남긴 것.** TTL-Work_rev2 체크아웃은 main 으로 당기지 않았다. 다른 세션의 미커밋 변경(locales ops.json · DashboardPhone.tsx 등)이 있어서다.
- **다음 1개.** 없음. 머지만 하면 8081 과 CI 빌드가 따라간다. 이 PR 은 스크립트와 워크플로(주석)를 바꾸므로 머지되면 감독자가 한 번 더 갈아타고 새 빌드가 돈다. 폰에서 보실 때만 `npm run app:qa-release`.

---

## 2026-09-30 20:41 / 모바일 GUI P2 맥락·출처 보완과 앱 parity

- **main `864fd061`**: [PR #1941](https://github.com/Simon-YHKim/2nd-B/pull/1941) 병합. 커뮤니티·초대·검사 등 9개 경로에서 부적절한 공통 렌즈 TIP을 숨기고 화면별 안내를 표시했다. 커리어 기록에는 인터뷰/기록 출처와 저장 당시 화면 언어를 분리해 표시한다. 옛 기록의 불명확한 언어는 추정하지 않으며 원문 제목·본문은 그대로다. 위키 0페이지 안내·데이터 연결 로딩 문구·375px 커리어 제목/버튼 배치도 수정했다.
- **검증**: 최신 main 병합 후 로컬 `npm run verify` 848 suites/11,012 tests 통과, PR CI `lint`·`verify`·`web-export-smoke` 3/3 통과. QA 계정 Chrome 375px의 9개 경로에서 잘못된 TIP·page error 0건, 425px의 커뮤니티·커리어·위키에서 가로 넘침·page error 0건. [자체완결 GUI 보고서](qa/gui-p2-260930/report.html). 동적 room/join 링크와 Android 네이티브 글꼴 확대·TalkBack은 직접 검증하지 않았다.
- **앱/localhost**: 20:39 KST `localhost-main`이 `864fd061`을 따라갔고 `npm run app:parity`는 앱 경로 차이 0, 설정/의존성 일치, 동일 SHA의 Android [자동 빌드 #36709884906](https://github.com/Simon-YHKim/2nd-B/actions/runs/36709884906) 대기 중으로 **같음**. 빌드 완료 여부는 다시 확인할 것. 폰 QA APK `qa-260930-5e52894b`는 과거 버전이며, 09-30 결정에 따라 Simon이 폰에서 볼 때만 새 QA APK를 게시한다.
- **작업 경계**: 원래 `TTL-Work_rev2`의 대시보드 관련 미커밋 작업은 다른 세션 소유라 손대지 않았다. Grok 후속 발주는 사용자의 기존 보류를 유지한다. GUI P2는 격리 브랜치에서만 작업했고 Supabase 운영 쓰기·광고 ON·스토어/웹 게시를 하지 않았다.

### 다음 확인
1. Android 자동 빌드 #36709884906의 성공과 `npm run app:parity`의 계속된 **같음**을 확인한다. 폰용 QA APK는 Simon이 실제 설치/확인을 원할 때만 게시한다.
2. 실제 Android에서 글꼴 확대·TalkBack, 커뮤니티 동적 room/join 경로를 확인한다. 운영 DB/Edge·AdMob·스토어 공개의 기존 게이트는 아래 최신 결정 기록과 `docs/SESSION-OWNERSHIP.md`를 따른다.
3. 사용자는 반복 질문 없이 안전한 작업을 판단해 진행하라고 요청했다. 비용·파괴·운영 적용에 명시 승인 요건이 남는 경우 기존 승인 범위와 저장소 지침을 먼저 확인한다.

---

## 2026-09-30 20:13 / 앱 = localhost 의 기준을 origin/main 으로 — 8081 이 main 을 스스로 따라간다 · APK 게시는 볼 때만

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

