# Paddle sandbox 격리 및 전환

작성: 2026-09-25 22:04 KST. 이 문서는 로컬 구현을 설명한다. 계정 생성, Edge 배포,
시크릿 설정, 실제 Paddle sandbox 결제는 이번 구현에서 실행하지 않았다.

## 배치 계약

Sandbox는 별도 Supabase 프로젝트 또는 별도 로컬 DB에 같은 함수를 배포한다.
운영 프로젝트 안에서 URL query나 함수 이름만 바꿔 두 환경을 제공하지 않는다.
`subscriptions`, `paddle_webhook_events`, `revenue_events`, self-service 원장은 물리적으로
분리된 DB에 기록된다. DB 스키마에 환경 컬럼을 추가하는 변경은 없다.

| 설정 | 운영 | Sandbox |
|---|---|---|
| `PADDLE_ENVIRONMENT` | `production`; 미설정도 기존 운영 의미 | 명시적 `sandbox` |
| `SUPABASE_URL` / 서비스 역할 키 | 운영 프로젝트 | 별도 프로젝트 또는 로컬 DB |
| `PADDLE_LIVE_SUPABASE_URL` | 운영 URL 고정 권장; 설정하면 현재 프로젝트와 같아야 함 | 실제 운영 URL 필수 |
| `PADDLE_SANDBOX_SUPABASE_URL` | 사용하지 않음 | 실제 현재 `SUPABASE_URL`과 같고 운영 URL과 달라야 함 |
| `PADDLE_API_KEY` | `pdl_live_apikey_`로 시작하는 서버 API 키 | `pdl_sdbx_apikey_`로 시작하는 서버 API 키 |
| `PADDLE_API_BASE` | 미설정 또는 `https://api.paddle.com` | 미설정 또는 `https://sandbox-api.paddle.com` |
| `PADDLE_WEBHOOK_SECRET` | 운영 notification destination 전용 | sandbox destination 전용, 운영과 공유 금지 |
| `PADDLE_CHECKOUT_BINDING_SECRET` | 운영 전용 서버 HMAC 키 | sandbox 전용 서버 HMAC 키, 운영과 공유 금지 |
| `PADDLE_PRICE_CORTEX`, `PADDLE_PRICE_BRAIN` | 운영 가격 ID 목록 | sandbox 가격 ID 목록, 쉼표 구분 |
| `EXPO_PUBLIC_SUPABASE_URL` / anon key | 운영 프로젝트 | sandbox 프로젝트 또는 로컬 API URL |
| `EXPO_PUBLIC_PADDLE_ENVIRONMENT` | `production`; 미설정 호환 | `sandbox` |
| `EXPO_PUBLIC_PADDLE_CLIENT_TOKEN` | `live_` client token | `test_` client token |
| `EXPO_PUBLIC_PADDLE_PRICE_{CORTEX,BRAIN}_{MONTHLY,YEARLY}` | 운영 가격 네 종류 | sandbox 가격 네 종류 |

키와 토큰 값은 환경변수/시크릿 저장소에만 둔다. 공개 번들에는 client token만 넣는다.
API 키·notification secret·binding secret·service role 키는 공개 변수에 넣지 않는다.
API 키는 Paddle 공식 현행 형식만 허용한다. 2025-05 이전 legacy API 키는 새 키로
교체해야 한다. 미확인 문자열이나 client token을 서버 API 키로 사용할 수 없다.

로컬 Edge 내부 `SUPABASE_URL`이 `http://kong:8000`이고 브라우저 URL이
`http://127.0.0.1:54321`처럼 서로 다르면 v2 binding audience 검사가 닫힌다.
양쪽에서 같은 API origin에 접근하도록 로컬 네트워크를 구성하거나 별도 hosted
sandbox 프로젝트를 사용한다. audience 검사나 운영 URL 비교를 끄지 않는다.

### 정적 웹 CSP

정적 HTML도 같은 빌드의 `EXPO_PUBLIC_PADDLE_ENVIRONMENT`, Supabase URL,
Paddle client token을 받는다. `sandbox`를 명시하고, 운영과 다른 단일 HTTPS
`<project>.supabase.co` origin 및 올바른 `test_` token이 있어야 sandbox 호스트가
열린다. 경로·query·fragment·사용자 정보·포트를 넣은 URL은 허용하지 않는다.
잘못되거나 불완전한 sandbox 설정은 운영과 sandbox의 DB/Paddle 호스트를 모두 닫는다.
요청 URL/query로 환경을 선택하지 않는다.

| 용도 | Sandbox 정책에서 허용하는 대상 |
|---|---|
| DB / Realtime | 빌드에 지정한 단일 HTTPS Supabase origin과 그 WSS origin |
| SDK script | `https://cdn.paddle.com/paddle/v2/paddle.js` |
| API / checkout 연결 | `https://sandbox-api.paddle.com`, `https://sandbox-buy.paddle.com`, `https://sandbox-create-checkout.paddle.com` |
| Checkout frame | `https://sandbox-buy.paddle.com`, `https://sandbox-cdn.paddle.com/paddle/v2/error.html` |
| SDK style / image | `https://sandbox-cdn.paddle.com/paddle/v2/assets/css/paddle.css`, `https://sandbox-cdn.paddle.com/paddle/v2/assets/images/` |

Sandbox 호스트는 2026-09-25에 [공식 Paddle.js 소스](https://cdn.paddle.com/paddle/v2/paddle.js)의
환경별 endpoint map과 asset 경로를 직접 확인했다. wildcard나 전체 HTTPS 허용은 없다.
Sandbox 정책에서는 운영 Supabase와 운영 Paddle 결제 호스트도 제거한다.

기존 production `GITHUB_PAGES_CSP`와 Vercel 응답 헤더는 유지된다. 따라서 sandbox는
별도 정적 호스트에서 제공하고, 그 호스트가 운영 전용 CSP 응답 헤더를 추가하지 않는지
확인한다. 응답 헤더와 meta CSP는 함께 적용되므로 운영 Vercel 헤더가 sandbox를 다시
차단할 수 있다. 현재 정적 웹 정책은 직접 localhost/Kong DB 연결을 허용하지 않는다.
브라우저 sandbox QA에는 위 HTTPS 조건을 만족하는 별도 hosted 프로젝트를 사용한다.

## 코드가 지키는 경계

1. 두 Edge 모두 환경과 DB pin을 먼저 검사한다. sandbox와 운영 URL이 같거나
   pin이 없으면 DB client 생성·RPC·Paddle 요청 전에 503이다.
2. 요청의 query와 body는 서버 환경을 바꾸지 않는다. `checkout_binding`의
   `paddle_environment`는 서버 설정과의 일치 확인용이다. 환불/취소 body는 이를 받지 않는다.
3. 새 클라이언트는 `{action: 'checkout_binding', price_id, paddle_environment}`를 보낸다.
   서버는 Auth 검증과 rate limit 후 허용 가격 목록을 확인한다. v2 HMAC에는 사용자,
   발급시각, nonce, 환경, 프로젝트 origin, 가격 ID가 함께 들어간다.
4. 브라우저는 v2 binding의 소유자·환경·origin·가격을 확인한 뒤 SDK 환경을 설정한다.
   SDK는 페이지 생명주기 동안 첫 token/environment에 고정된다. 다른 환경으로 바꾸려면
   올바른 빌드를 새로 로드한다. SDK 오류는 결제창을 열지 않는 실패 결과로 반환한다.
   binding 발급·SDK 로딩 중 계정 전환이 시작되면 이전 사용자의 결제창을 열지 않는다.
   완료 콜백도 시작 시점의 계정 lease와 binding nonce가 모두 유효할 때만 분석에 전달한다.
5. Webhook은 기존 raw-body HMAC, IP gate, bounded parser, 멱등 RPC를 유지한다.
   다른 프로젝트나 환경의 binding은 기존 구독 소유자 원장이 있어도 거부한다.
   같은 환경에서 binding 유효기간이 지난 갱신은 기존의 단일 소유자 원장으로 처리한다.
6. 환불·취소는 인증된 사용자의 현재 자격과 DB 소유 ID를 다시 확인하며,
   해당 배포의 API root와 같은 환경의 API 키만 함께 전송한다. redirect는 계속 거부한다.
   Sandbox의 adjustment webhook도 격리 DB만 수정한다.
7. Sandbox 이벤트는 전환 분석을 전송하지 않는다. 운영 분석도 동의가 있어야 하며,
   SDK 성공 콜백은 구독 지급 권한이 없다. 권한은 서명 webhook과 DB RPC가 결정한다.

## 설정과 canary 순서

아래 외부 작업은 콘솔 세션 소유다. 새 서비스 생성·배포·결제에는 해당 승인 절차를 따른다.

1. 별도 DB에 현재 migration 기반과 필요한 billing RPC를 준비한다. 저장소의
   `UNNUMBERED_paddle_refund_consequence_integrity.sql` 적용/번호 규칙 및 strict webhook
   전환 조건은 [SESSION-OWNERSHIP.md](SESSION-OWNERSHIP.md)의 Paddle 절을 그대로 따른다.
   이 sandbox 구현이 기존 보류된 migration 배포를 대신 승인하지 않는다.
2. 실제 운영 URL, sandbox URL, 양쪽 DB 식별자를 기록해 pin을 검토한다.
   운영 사용자·결제·원장을 sandbox로 복사하지 않는다. sandbox 자체 QA 계정을 쓴다.
3. sandbox Paddle 계정에서 자체 상품/가격/토큰/API 키/notification destination을 준비한다.
   두 tier 가격 목록이 겹치지 않는지 확인한다. 월/연 가격과 VAT 표시는 preview로 확인한다.
4. `PADDLE_WEBHOOK_ENABLED`와 `PADDLE_SELF_SERVICE_ENABLED`를 꺼 둔 채 같은 소스를
   sandbox 프로젝트에 배포한다. production 변수와 secret을 가져오지 않는다.
5. sandbox 전용 웹 빌드에 test token, sandbox 가격, sandbox Supabase URL/anon key를 넣는다.
   callback 주소는 sandbox `paddle-webhook`으로 고정하고 query mode를 사용하지 않는다.
6. sandbox 감시 창에서 플래그를 켜고 테스트 결제 → 서명 webhook → sandbox 구독/매출
   원장 반영을 확인한다. 동일 이벤트 재전송이 원장을 중복 생성하지 않아야 한다.
7. sandbox 구독 갱신·취소, 환불 접수 → adjustment 승인 → 환불 원장/권한 결과를 확인한다.
   지급/취소 결과는 SDK 화면만 보고 판정하지 않는다. partial/full, 승인 지연,
   duplicate/reordered webhook은 기존 refund 회귀 계약과 일치해야 한다.
8. 거부 canary: 잘못된 signature, 운영 token + sandbox build, 운영 API 키 + sandbox
   refund, 다른 프로젝트/가격 binding, 운영 DB URL pin, `?env=production` 조작을 확인한다.
   운영 DB 원장 변화는 0이어야 한다. 이 확인 전에는 sandbox 종단 검증 완료로 기록하지 않는다.

## 기존 운영 호환과 롤백

`PADDLE_ENVIRONMENT`와 공개 환경 변수가 없으면 운영 의미가 유지된다. 기존 production
클라이언트의 `{action:'checkout_binding'}`는 기존 v1 HMAC을 받으며 production webhook은
유효한 v1 서명을 계속 검증한다. sandbox는 v1 발급/검증을 허용하지 않는다.

새 v2 클라이언트 활성화 순서는 **v2 webhook verifier → subscription-manage signer → 웹 빌드**다.
구 Edge는 새 body를 거부하므로 서버 준비 전 새 웹 빌드를 활성화하지 않는다.
앞서 명시한 refund migration 동시 전환이 필요한 운영이면 SESSION-OWNERSHIP의 OFF/drain
절차가 이 순서보다 먼저 적용된다.

문제 발생 시 checkout client를 이전 production 빌드로 되돌리고 서버 v2 verifier는 유지한다.
이미 발급한 v2 binding이 존재하므로 verifier를 구버전으로 즉시 되돌리면 지급이 끊긴다.
마지막 v2 발급 뒤 기존 7일 유효기간과 5분 skew, 열린 결제 및 provider 재전송을 확인한
뒤에만 구 verifier 복귀를 검토한다. DB down migration과 sandbox DB의 운영 재사용은 하지 않는다.
Sandbox 중단 시 해당 sandbox 플래그를 끄고 격리 상태를 유지한다.

## 자동 검증과 남은 증거

실제 `src/lib/billing/__tests__` 파일들을 `--runTestsByPath`로 지정해 검사한다.
백업 디렉터리의 복사본이 함께 수집되지 않도록 PowerShell에서는 다음을 사용한다.

```powershell
$billingTests = @(rg --files src/lib/billing/__tests__ | Where-Object { $_ -match '\.test\.tsx?$' })
npx jest --runInBand --runTestsByPath @billingTests
```

이 검사는 실제 Edge 소스를 transpile해
외부 요청/DB를 fake로 대체한 handler 검사, 실제 HMAC, 환경/가격 경계, SDK mock을 실행한다.
네트워크·실제 Paddle·실DB에는 연결하지 않는다. 별도 SDK callback/동의 분석 검사는
`paddle-checkout-analytics.test.ts` 및 analytics 검사에서 수행한다.

남은 운영 증거는 별도 Supabase 배포 식별자, sandbox notification 설정, test token/가격
일치, SDK Test Mode 표시, 결제/갱신/환불 원장과 운영 DB 무변경 결과다.
실제 값은 이 문서나 채팅에 붙이지 않는다.

공식 출처: [Paddle sandbox](https://developer.paddle.com/sdks/sandbox/),
[API authentication](https://developer.paddle.com/api-reference/about/authentication/),
[client tokens](https://developer.paddle.com/paddle-js/about/client-side-tokens/),
[Paddle.Initialize](https://developer.paddle.com/paddle-js/methods/paddle-initialize/),
[Paddle.Update](https://developer.paddle.com/paddle-js/methods/paddle-update/).
