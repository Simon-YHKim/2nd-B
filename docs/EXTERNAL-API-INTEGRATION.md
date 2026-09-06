# 작업지시서 — 외부 API 연동 (Claude Code 인계)

> 작성: Cowork 세션 / 2026-06-26 KST · repo `Simon-YHKim/2nd-B` (main) · Supabase ref `zoacryukmdeivmolvyhj`
> 목적: 외부 API 자격증명의 보관 위치와 안전한 배포 순서를 기록한다. 값은 이 문서, GitHub,
> EAS, 빌드 로그에 적지 않는다.
>
> 상태: `public-data-proxy`와 클라이언트 호출 경로는 구현됨. 운영 마이그레이션 적용,
> Edge Function 배포, 스모크 테스트와 레거시 변수 회수는 아직 별도 승인과 실행 증거가 필요하다.

---

## A. 자격증명 보관 계약

### GitHub Variables (공개값, 빌드 시 EXPO_PUBLIC_* 로 번들에 인라인)
| 이름 | 값/비고 |
|---|---|
| `EXPO_PUBLIC_NAVER_CLIENT_ID` | 네이버 앱 Client ID. 값은 GitHub 설정에서만 관리한다. |
| `EXPO_PUBLIC_ENABLE_KAKAO` | `true` |
| `EXPO_PUBLIC_ENABLE_NAVER` | **미설정(=OFF). oauth-naver 엣지함수 배포 + 네이버 콘솔 콜백 확인 전까지 절대 켜지 말 것** (과거 콘솔 미완 + ON → raw JSON 에러 전례) |

환율·식품 API 자격증명은 클라이언트 공개값이 아니다. 레거시
`EXPO_PUBLIC_EXIM_FX_KEY`, `EXPO_PUBLIC_MFDS_FOOD_KEY`를 새 빌드에 전달하거나 다시
등록하지 않는다.

### GitHub Secrets
- `EXPO_TOKEN` — 기존 등록·검증됨(EAS Update OTA용).

### Supabase Edge Function Secrets (서버측 전용)
- `KAKAO_REST_API_KEY` — 카카오 REST 키(Local 키워드 장소검색용)
- `NAVER_OAUTH_CLIENT_SECRET` — 네이버 로그인용 secret
- `NAVER_SEARCH_CLIENT_ID` — 네이버 검색용 Client ID
- `NAVER_SEARCH_CLIENT_SECRET` — 네이버 검색용 secret (단일 앱이라 OAUTH secret과 동일 값)
- `EXIM_FX_API_KEY` — 한국수출입은행 환율 API 서버 전용 키
- `MFDS_FOOD_API_KEY` — 식약처 식품영양 API 서버 전용 키

운영 환경에 이미 있다는 가정은 금지한다. 시크릿의 존재 여부만 확인하고 값을 출력하지
않는다. 두 공개데이터 서버 키는 GitHub
Variables, EAS environment, `EXPO_PUBLIC_*` 이름으로 복제하지 않는다.

### Supabase Auth
- **Kakao provider 활성화 완료** (REST 키=client id, 클라이언트 시크릿=secret). 앱은 `supabase.auth.signInWithOAuth({ provider: 'kakao' })`로 호출하면 됨. 콜백 `https://zoacryukmdeivmolvyhj.supabase.co/auth/v1/callback` 카카오에 등록됨.
- **Naver provider는 Supabase 빌트인에 없음** → 커스텀 엣지함수(oauth-naver)로 처리해야 함.

### 콘솔 앱
- Kakao 앱 ID `1496341`, 카카오 로그인 ON, Redirect URI 2개(GitHub Pages + Supabase 콜백) 등록, Local API는 REST 키로 바로 사용 가능.
- Naver 앱(`A1Su7C7EgyR49be6V4rT`): 네이버 로그인 + 검색 API 사용 설정. (Callback URL 2개 — Simon이 콘솔에서 확인 중)

---

## B. 코드 작업 (해야 할 것)

### 1. `places-search` 엣지 함수 (Supabase Edge Function)
비임상 "기관 길안내/장소검색" 용도만 (CLAUDE.md 어휘정책: 임상 표현 금지).
- **Kakao Local (키워드)**: `GET https://dapi.kakao.com/v2/local/search/keyword.json?query=...`
  헤더 `Authorization: KakaoAK ${KAKAO_REST_API_KEY}`
- **Naver Local**: `GET https://openapi.naver.com/v1/search/local.json?query=...&display=5`
  헤더 `X-Naver-Client-Id: ${NAVER_SEARCH_CLIENT_ID}`, `X-Naver-Client-Secret: ${NAVER_SEARCH_CLIENT_SECRET}` (최대 5건)
- 두 소스 결과를 공통 스키마로 정규화해 반환. 시크릿은 Deno.env에서 읽기(클라이언트 노출 금지).

### 2. `oauth-naver` 엣지 함수 (네이버 로그인 code→token 교환)
- 앱 → `https://nid.naver.com/oauth2.0/authorize?...redirect_uri=https://simon-yhkim.github.io/2nd-B/oauth-callback&state=...`
- 콜백 페이지 → `oauth-naver` 호출 → `POST https://nid.naver.com/oauth2.0/token` (client_id=`NAVER_SEARCH_CLIENT_ID`, client_secret=`NAVER_OAUTH_CLIENT_SECRET`, code, state)
- 프로필 `GET https://openapi.naver.com/v1/nid/me` → Supabase 세션 연결(자체 사용자 매핑).
- **배포 완료 후에만** `EXPO_PUBLIC_ENABLE_NAVER=true` 설정(내가/Simon). state·CSRF 검증 필수.

### 3. 공개데이터 프록시 (구현 완료, 운영 배포 전)

`supabase/functions/public-data-proxy` 하나가 두 provider를 처리한다.

- `exim_fx`: 한국수출입은행 현재환율 `AP01`
- `mfds_food`: 식약처 `FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02`
- 앱은 로그인 세션으로 `functions.invoke("public-data-proxy")`만 호출한다. 공급자 URL이나
  키를 직접 호출하는 폴백은 없다.
- `supabase/config.toml`의 `verify_jwt = true`와 함수의 사용자 ID 추출을 모두 통과해야 한다.
- 함수는 공급자 키 누락, Supabase 환경 누락, 쿼터 RPC 오류를 `503`으로 닫는다. 사용자 또는
  공급자 일일 한도 도달은 `429`, 공급자 오류·잘못된 응답은 `502` 또는 `429`로 정규화한다.
- 사용자 일일 상한은 `exim_fx=20`, `mfds_food=50`; 공급자 전체 상한은 각각 UTC 일자당
  `900`이다. 공급자 전체 상한은 클라이언트 인자로 올릴 수 없다.
- upstream timeout은 7초, redirect는 차단, 응답 본문은 256 KiB로 제한한다.

쿼터 계약은 현재 `db/migrations/0151_public_data_quota.sql`에 있으나 **0151은 임시 번호**다.
열린 마이그레이션 스택과 통합 직전에 최종 번호로 다시 매겨야 하며, 현재 파일명을 최종
운영 번호로 주장하거나 그대로 push/deploy하지 않는다.

### 5. 앱 측 토글/통합
- Kakao 로그인 버튼: `EXPO_PUBLIC_ENABLE_KAKAO`로 게이팅(이미 true), `signInWithOAuth({provider:'kakao'})`.
- Naver 로그인 버튼: `EXPO_PUBLIC_ENABLE_NAVER`로 게이팅(OFF 유지 → 2번 배포 후 ON).
- places-search: 전용 엣지함수 호출 래퍼.
- FX / 식약처: 인증된 `public-data-proxy` 호출. 공개 키가 없거나 프록시가 실패해도 공급자에
  직접 요청하지 않는다.

---

## C. 제약·체크리스트 (CLAUDE.md 준수)
- 시크릿 하드코딩 금지 → `.env`/Supabase Secret/Deno.env. `.env`는 `.gitignore`.
- **EXPO_PUBLIC_*에 진짜 시크릿 금지** → FX/MFDS 키는 Supabase server secret에만 둔다.
- 어휘정책: 임상/의료 표현 금지(places는 비임상 길안내). 식약처는 식품영양 데이터(비임상) OK.
- 프로덕션 기능엔 테스트 동반(엣지함수 단위테스트), push 전 `npm run verify` 통과.
- main 직접 push 금지 → 브랜치+PR, `verify`(CI) 통과 후 머지. (현재 branch protection: main에 verify required)
- 라이브 검증 사이클은 허브 PROTOCOL 따름.

## D. 공개데이터 운영 적용 순서

순서를 바꾸지 않는다. 특히 프록시를 쿼터 RPC보다 먼저 배포하지 않는다.

1. 임시 `0151`을 열린 마이그레이션 스택 뒤의 최종 번호로 다시 매기고 fresh/reapply 및
   `public_data_quota_regression.sql` 검증을 통과시킨다.
2. Supabase server secret에 `EXIM_FX_API_KEY`, `MFDS_FOOD_API_KEY`가 존재하는지만 확인한다.
   값은 명령 출력, 로그, 채팅, 문서에 남기지 않는다.
3. **쿼터 마이그레이션을 먼저 적용**하고 두 원장 테이블의 RLS/FORCE RLS, RPC의
   `service_role` 전용 EXECUTE, 사용자·공급자 상한을 확인한다.
4. `public-data-proxy`를 `verify_jwt=true`로 배포한다.
5. 로그인 테스트 계정으로 `exim_fx`, `mfds_food` 성공 응답을 각각 스모크한다. 함께
   무인증 `401`, 허용되지 않은 provider `400`, 쿼터 불가 시 `429`/`503` fail-closed도 확인한다.
6. 프록시 스모크 증거가 확보된 뒤 클라이언트/워크플로 변경을 릴리스한다.
7. 새 빌드가 프록시만 사용함을 확인한 뒤, 별도 승인 하에 GitHub repository Variables와
   EAS preview/production environment에 남은 레거시 `EXPO_PUBLIC_EXIM_FX_KEY`,
   `EXPO_PUBLIC_MFDS_FOOD_KEY`를 회수한다. 현재 EAS 동기화 워크플로는 안전상 자동 삭제하지
   않으므로 콘솔 또는 승인된 EAS 명령으로 각각 제거하고 이름의 부재만 기록한다.

## E. 중단·롤백 원칙

- 1~5단계가 실패하면 릴리스와 레거시 변수 회수를 중단한다. 이전에 배포된 앱을 위해 남아
  있는 변수는 이 단계에서 삭제하지 않는다.
- 새 클라이언트는 프록시 오류 시 직접 공급자 호출로 우회하지 않는다. 쿼터 RPC 부재/오류,
  server secret 누락, 인증 실패는 의도적으로 fail-closed다.
- 함수 배포 후 문제가 생기면 마지막 검증된 함수 버전으로 되돌리거나 수정 버전을 재배포한다.
  긴급 복구를 이유로 서버 키를 `EXPO_PUBLIC_*`에 다시 넣지 않는다.
- 레거시 변수 회수 후에는 앱/함수 릴리스 자체를 검증된 버전으로 롤백한다. 회수한 키를
  공개 빌드 환경에 복원하는 것은 롤백 절차가 아니다.
