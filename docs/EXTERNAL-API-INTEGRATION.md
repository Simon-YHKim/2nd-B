# 작업지시서 — 외부 API 연동 (Claude Code 인계)

> 작성: Cowork 세션 / 2026-06-26 KST · repo `Simon-YHKim/2nd-B` (main) · Supabase ref `zoacryukmdeivmolvyhj`
> 목적: 외부 API "키/시크릿 프로비저닝"은 콘솔에서 완료됨. 이제 **이 키들을 쓰는 코드(엣지 함수·프록시)와 배포**가 남았음. 아래가 현재 상태 + 해야 할 코드 작업.
>
> 상태: **프로비저닝 DONE / 코드 TODO** — 다음 세션이 B 섹션부터 착수.

---

## A. 이미 완료된 프로비저닝 (콘솔/저장소) — 코드에서 "있다고 가정" 가능

### GitHub Variables (공개값, 빌드 시 EXPO_PUBLIC_* 로 번들에 인라인)
| 이름 | 값/비고 |
|---|---|
| `EXPO_PUBLIC_EXIM_FX_KEY` | 수출입은행 현재환율 authkey. **표본 호출 성공 확인됨.** |
| `EXPO_PUBLIC_NAVER_CLIENT_ID` | `A1Su7C7EgyR49be6V4rT` (네이버 앱 Client ID, 공개) |
| `EXPO_PUBLIC_MFDS_FOOD_KEY` | data.go.kr serviceKey(64자 hex). **활용신청 승인됨, 게이트웨이 활성화 대기**(수십분~수시간 후 유효) |
| `EXPO_PUBLIC_ENABLE_KAKAO` | `true` |
| `EXPO_PUBLIC_ENABLE_NAVER` | **미설정(=OFF). oauth-naver 엣지함수 배포 + 네이버 콘솔 콜백 확인 전까지 절대 켜지 말 것** (과거 콘솔 미완 + ON → raw JSON 에러 전례) |

### GitHub Secrets
- `EXPO_TOKEN` — 기존 등록·검증됨(EAS Update OTA용).

### Supabase Edge Function Secrets (서버측, 콘솔에 저장 완료)
- `KAKAO_REST_API_KEY` — 카카오 REST 키(Local 키워드 장소검색용)
- `NAVER_OAUTH_CLIENT_SECRET` — 네이버 로그인용 secret
- `NAVER_SEARCH_CLIENT_ID` = `A1Su7C7EgyR49be6V4rT`
- `NAVER_SEARCH_CLIENT_SECRET` — 네이버 검색용 secret (단일 앱이라 OAUTH secret과 동일 값)

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

### 3. FX edge proxy 하드닝 (수출입은행)
- `GET https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${KEY}&data=AP01`
- 주말/장 시작 전엔 빈 배열 가능 → graceful 처리.
- **하드닝**: 현재 키가 공개 Variable(`EXPO_PUBLIC_EXIM_FX_KEY`)이라 웹 번들 노출됨. 엣지 프록시로 옮기고 **키를 Supabase Secret(`EXIM_FX_KEY`)으로 이전** 후 public Variable 제거 권장(CLAUDE.md: 진짜 키는 EXPO_PUBLIC_ 금지).

### 4. 식약처(MFDS) food nutrition edge proxy
- ⚠️ **올바른 엔드포인트는 `02`**: `https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02`
  (작업지침 원문의 `...Info01/...Inq01`은 틀림 — 콘솔 상세의 End Point가 `FoodNtrCpntDbInfo02`)
- params: `serviceKey`(=`EXPO_PUBLIC_MFDS_FOOD_KEY`), `type=json`, `pageNo`, `numOfRows`, 음식명 검색파라미터. **02 버전 정확한 파라미터명은 참고문서 `출력메세지_식품영양성분DB정보.xlsx` 확인**(01의 `FOOD_NM_KR`과 다를 수 있음).
- 키 활성화 대기 중 — 활성화 후 `numOfRows=1` 표본으로 검증. "Unauthorized"=아직 미활성.
- **하드닝**: FX와 동일하게 키를 Supabase Secret(`MFDS_FOOD_KEY`)로 이전 + 프록시화 권장.

### 5. 앱 측 토글/통합
- Kakao 로그인 버튼: `EXPO_PUBLIC_ENABLE_KAKAO`로 게이팅(이미 true), `signInWithOAuth({provider:'kakao'})`.
- Naver 로그인 버튼: `EXPO_PUBLIC_ENABLE_NAVER`로 게이팅(OFF 유지 → 2번 배포 후 ON).
- places-search / FX / 식약처: 각 엣지함수 호출 래퍼.

---

## C. 제약·체크리스트 (CLAUDE.md 준수)
- 시크릿 하드코딩 금지 → `.env`/Supabase Secret/Deno.env. `.env`는 `.gitignore`.
- **EXPO_PUBLIC_*에 진짜 시크릿 금지** → FX/MFDS 키 하드닝(프록시+Secret 이전)이 그 일환.
- 어휘정책: 임상/의료 표현 금지(places는 비임상 길안내). 식약처는 식품영양 데이터(비임상) OK.
- 프로덕션 기능엔 테스트 동반(엣지함수 단위테스트), push 전 `npm run verify` 통과.
- main 직접 push 금지 → 브랜치+PR, `verify`(CI) 통과 후 머지. (현재 branch protection: main에 verify required)
- 라이브 검증 사이클은 허브 PROTOCOL 따름.

## D. 적용(배포) 순서
1. Simon: 네이버 콘솔 Callback URL 2개 확인 / 식약처 키 활성화 대기.
2. Claude Code: 위 1~5 엣지함수·프록시 작성 + 테스트 → 브랜치 PR → `verify` 통과 → main 머지.
3. 머지 후: 웹배포/EAS Update OTA 워크플로 실행 → `EXPO_PUBLIC_*` 값이 번들에 반영.
4. oauth-naver 배포 확인되면 `EXPO_PUBLIC_ENABLE_NAVER=true`.
5. 라이브에서 카카오/네이버 로그인 · 장소검색 · 환율 · 식품영양 동작 확인.
