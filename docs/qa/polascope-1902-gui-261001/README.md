# PR #1902 격리 GUI 검사 — 2026-10-01

## 범위

- PR head `ae22ada5`와 당시 main `f5ad2ef7`을 충돌 없이 합친 비공개 커밋 `103dec59`에서 검사했다. 이 커밋에는 Windows 줄바꿈 회귀 검사 수정 한 줄이 포함된다. PR의 운영 서버 계약은 적용하지 않았다.
- 전용 워크트리에서 `node scripts/app-parity.cjs serve --port=8084 --allow-diff`로 릴리스 모드 웹 화면을 띄웠다. `.env`와 강제 등급을 쓰지 않았고 8081은 건드리지 않았다.
- Chrome headless, 375×812, 한국어·영어로 공개 화면만 읽었다. 모든 POST/PUT/PATCH/DELETE 요청을 차단했다. 계정 입력, 가입·로그인 제출, 동의 저장은 하지 않았다.

## 결과

| 화면 | 확인 | 증거 |
|---|---|---|
| 홈 `/` | HTTP 200, 비로그인 시 로그인 화면으로 이동 | 로컬 전체 캡처 보관 |
| 가입 `/sign-up` | KO/EN 각 HTTP 200, PolaScope 이름과 필수 동의 안내 렌더 | [KO](signup-ko.png) · [EN](signup-en.png) |
| 동의 안내 `/consent-notice` | HTTP 200, 필수·선택 안내 렌더 | [KO](consent-ko.png) |
| 인앱 약관 `/terms` | HTTP 200, PolaScope와 시행일 `2026-10-05` | [KO](terms-ko.png) |
| 인앱 방침 `/privacy-policy` | HTTP 200, 현행 시행일 `2026-09-29` | [KO](privacy-ko.png) |
| 인앱 환불 `/refund` | HTTP 200, PolaScope와 개정일 `2026-10-05` | [KO](refund-ko.png) |
| 정적 약관·방침 `/legal/*.html` | 각 HTTP 200, PolaScope와 같은 시행일 | 로컬 전체 캡처 보관 |
| 서비스 동의 `/service-consent` | HTTP 200, 비로그인 상태에서 로그인 화면으로 이동 | 로컬 전체 캡처 보관 |

정상 진입 10건 모두 페이지 예외, 콘솔 오류, 4xx/5xx 자산 응답, 실패 요청, 쓰기 요청, 375px 가로 넘침이 **각 0건**이었다. 대표 캡처는 현재 보이는 ScrollView 부분을 보여 준다. 전체 결과와 나머지 캡처는 같은 PC의 `E:\2ndB\.git\app-parity\polascope-1902-gui-261001`에 보관했다.

추가로 `/2nd-B/sign-up`을 주소창에서 직접 요청하면 격리 로컬 서버의 문서 응답이 404지만 JS가 가입 화면을 렌더했다. 정상 로컬 경로 `/sign-up`은 200이다. 8081과 8084 모두 같은 결과여서 #1902 전용 자산 누락으로 관측되지 않았다. 별도로 2026-10-01 14:59 KST의 [현재 공개 Pages `/2nd-B/sign-up`](https://simon-yhkim.github.io/2nd-B/sign-up) GET은 HTTP 200, 제목 `PolaScope · 기록으로 알아가는 나`였다. 이는 현재 공개판의 경로 응답 확인이며 #1902 공개를 뜻하지 않는다.

비로그인 화면 검사만으로 운영 `email-v7`·`service-v2` 계약, 인증된 Edge `status`, 실제 가입 영수증을 검증할 수 없다. 10월 5일 전환 전 이 서버 조건과 새 네이티브 빌드를 별도로 확인해야 하므로 #1902는 Draft로 유지한다. 검사 뒤 8084 서버를 종료했고 운영 DB·Edge·웹·스토어는 변경하지 않았다.
