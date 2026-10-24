# T06: 가입 거절 훅 초안 및 활성화 인계

상태: **번호 없음, 정책 OFF, 운영 적용 0, 앱 안내 휴면. 활성화 불가.**
기기별 제한을 구현·검증하지 못했으므로 법무 조건 넷을 모두 충족한 결과가 아니다.
그 조건을 IP 제한이나 클라이언트가 바꿀 수 있는 설치 ID로 대신하지 않는다.

## 결정과 범위

- T06 장부 원문: `E:/Coding Infra/reports/devlab-261010/s2-astra/t06-ledger.txt`.
  이 파일은 둘째 문장 중간에서 끝나므로 문구는 아래 결정 원문으로 대조했다.
- `DECISIONS-2026-10-13.md` 13:23: 0113의 같은 조건을 Auth 훅에서 미리 확인하고 트리거는 유지.
- 18:48, 18:57, 19:14: 가입 여부 신호가 선명해지는 대가 및 법무 조건.
- 20:43 묶음에는 가·다가 함께 선택됐고, **21:42에 기록된 대표님의 21:36 답
  Q-261013-79 = 가**가 이를 해소했다. 원문: 「가: 가입할 때 서버가 이유를 말하고
  「이 주소로는 계정을 만들 수 없습니다.」」.
- 동일 결정의 확정 문구: 「이 주소로는 계정을 만들 수 없습니다.」 +
  「가입한 적이 있다면 그때 쓴 주소로 로그인해 주세요. 처음이라면 다른 이메일 주소를 써 주세요.」.
- 내부 법무 의견 원문: `.bots/legal/outbox/relay-q76-signup-refusal-1905.result.md`.
  R1에서 정본 체크아웃의 해당 파일 44~46행을 다시 읽었다. 조건 2 원문은
  「반복 시도를 탐지해 기록할 것(주소 원문 대신 해시)」다. 조건 1의 숫자는 서버 쪽이 정한다.
  메일함 카운터를 쓰기만 하던 공백을 아래 반복 제한으로 닫았다.
  이 PR은 새 법률 해석이나 조건 완화 승인이 아니다.

## 확인한 공식 계약

[Before User Created](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)는
단일 `jsonb` event의 `metadata.ip_address`, `user.id`, `user.email`을 받는다.
허용은 `{}`, 거절은 `{"error":{"http_code":403,"message":"polascope_signup_refused"}}`다.
`user_metadata`는 요청자가 쓰는 값이며 신뢰된 기기 신호가 아니다.

[Auth Hooks 권한](https://supabase.com/docs/guides/auth/auth-hooks)의 원칙대로 외부 호출자는
`supabase_auth_admin`만 EXECUTE한다. `PUBLIC`, `anon`, `authenticated`, `service_role`은
실행할 수 없고, `supabase_auth_admin`도 상태 테이블을 직접 읽거나 쓸 수 없다.
테이블 조회에는 빈 search_path의 SECURITY DEFINER 함수를 사용한다.
소유자·슈퍼유저의 관리 권한까지 차단했다는 뜻은 아니다.

확인한 upstream Auth SHA: `c3348e8f1cb31454e9783e4eb9eab1e71ad9652f`.

- [hookserrors.go](https://github.com/supabase/auth/blob/c3348e8f1cb31454e9783e4eb9eab1e71ad9652f/internal/hooks/hookserrors/hookserrors.go):
  오류 입력은 `http_code`와 `message`뿐이다. 임의의 `error.code`는 전파되지 않는다.
- [errors.go](https://github.com/supabase/auth/blob/c3348e8f1cb31454e9783e4eb9eab1e71ad9652f/internal/api/errors.go):
  이 403의 wire code는 `unknown`. 최신 형식은 `{"code":"unknown","message":"polascope_signup_refused"}`,
  이전 형식은 `{"code":403,"error_code":"unknown","msg":"polascope_signup_refused"}`.
  앱은 SDK 변환 후 `status=403`, `code=unknown`, 고정 message 세 값이 모두 맞아야 표시한다.
- [hooks.go](https://github.com/supabase/auth/blob/c3348e8f1cb31454e9783e4eb9eab1e71ad9652f/internal/api/hooks.go),
  [hookspgfunc.go](https://github.com/supabase/auth/blob/c3348e8f1cb31454e9783e4eb9eab1e71ad9652f/internal/hooks/hookspgfunc/hookspgfunc.go):
  Before User Created는 사용자 생성 트랜잭션 밖에서 실행하며 함수 반환 후 JSON 오류를 해석한다.
  따라서 JSON 거절은 시도 집계를 롤백하지 않는다. SQL 예외로 거절하지 않는 이유다.

위 SHA는 운영 Auth 버전을 확인했다는 증거가 아니다. 로컬 SQL 실행과 설치된 JS SDK의
가짜 HTTP 응답 디코딩을 측정했고 실제 GoTrue 서버·메일·OAuth·운영 로그는 실행하지 않았다.

## 구현한 경계

1. 정책 OFF이면 `{}`를 반환하며 집계도 남기지 않는다. 실수로 대시보드에서 연결하더라도
   정책이 OFF인 동안은 새 가입 여부 신호가 나오지 않는다. 0113은 계속 동작한다.
2. ON일 때 IP당 고정 10분 창 10회. 허용·중복 거절 모두 센다. 주소 조회보다 먼저 적용하고
   초과 시 알려진 주소·새 주소 모두 같은 `429 signup_request_limited`를 반환한다.
   IPv6는 /64 단위, IPv4는 주소 단위이며 IPv4-mapped IPv6도 해당 IPv4와 묶는다.
   주소 표기는 [PostgreSQL의 family/host/network/set_masklen](https://www.postgresql.org/docs/18/functions-net.html)으로 정규화한다.
3. 같은 정책 행 잠금 안에서 IP 카운터를 먼저 읽는다. 이미 10회에 도달한 IP의 추가 요청은
   IP 집계만 올리고 즉시 429를 반환한다. 전체 예산·새 메일함 행을 소비하지 않는다.
   IP 검사를 통과한 요청만 전역 10분 1,000회 예산을 쓰며, 새 키 할당 전에 상한을 검사한다.
   정책 행 잠금과 UPSERT로 동시 호출을 직렬화하고 count를 포화시킨다.
   창당 최대 1,000개 요청이 각 2개 이하의 키를 할당하므로 유지하는 두 창은 최대 4,000행이다.
   고정 창 경계에서는 10분보다 짧은 간격에 20회가 가능하다. 공용 IP와 전역 상한의 서비스
   거부 위험이 있어 이 숫자는 활성화 전 트래픽에 맞춰 다시 검토해야 한다.
4. 창·차원·IP 또는 canonical mailbox를 DB에서 생성한 비밀키로 HMAC-SHA256한다.
   집계에는 창, 차원, 32바이트 해시, 횟수만 있다. 해시에도 보관 제한을 적용한다.
   키를 코드·로그·PR에 출력하지 않는다. 주소·DOB·요청 JSON·원문 IP를 새 테이블에 보관하지 않는다.
   메일함 카운터를 읽어 동일 canonical mailbox의 11번째부터 429로 제한한다.
   IP를 바꾸거나 Gmail의 점·별칭·googlemail 표기를 바꿔도 합산된다. 존재 조회 전에 적용하므로
   신규·기존 메일함의 한도와 응답이 같다. 다음 창에서는 다시 10회가 가능하다.
   알려진 주소에 반복 요청을 보내 그 주소의 가입을 막는 위험은 남으며 활성화 전 검토 대상이다.
5. `prune_signup_hook_attempts()`는 이전 창보다 오래된 집계를 지운다. 요청 때도 부르지만
   **유휴 중 삭제를 위해 소유자 권한의 1분 주기 실행과 그 증거가 필요하다**.
   이 PR은 스케줄러를 설치하지 않는다. 검증된 주기가 있으면 보관 상한은 약 21분이다.
6. 0113의 NULL email, 확인된·삭제되지 않은 auth 계정, public 프로필, 자기 id 제외,
   0108 canonicalizer를 그대로 따른다. 이메일 NULL은 비교를 생략하고 빈 문자열은 비교한다.
   사전 조회 뒤의 경쟁은 0113이 처리하며, 경쟁으로 인한 500은 여전히 일반 실패다.
7. DOB·14~17세 여부는 훅 분기와 고정 응답에 사용하지 않는다. 기존 가입 연령 제약은 그대로다.
8. 새 앱 안내는 기존 단일 alert의 수명·입력 시 해제·언어 전환·버튼 위 위치를 따른다.
   쓰이지 않던 별도 복구 카드는 화면에서 제거했다. 500, 429, 메시지만 같은 오류는 기존 안내다.
   R1에서는 화면이 읽지 않는 `existingAccountHelp` 상태와 미사용 제목·본문 키를 제거했다.
   내부 `maybeExistingAccount` 타입은 호환상 유지하되 일반 가입 실패 안내에 연결한다.
   현재 이 오류를 만드는 호출부는 없고, 이후 돌아오더라도 무응답으로 끝나지 않는다.
9. 로그인·재설정은 기존 일반 안내를 유지하고 그 경로의 서버 오류 원문 console 출력을 없앴다.
   기존에 없는 계정/틀린 비밀번호 및 재설정의 서버 응답 동등성을 이 변경으로 입증한 것은 아니다.

## 활성화 차단 조건: 전부 해결하기 전 OFF

| 조건 | 이번 증거 | 아직 필요한 증거 |
|---|---|---|
| IP·기기별 속도 제한 | IPv4·IPv6 /64 제한·동시 호출·초과 IP의 예산 미소비 | 신뢰된 기기 신호, forwarded 헤더에서 Auth IP까지의 신뢰 경계, 직접 Auth 호출 우회 차단, OAuth·구버전 앱 경로의 커버리지 |
| 반복 시도 해시 기록·판정 | canonical mailbox당 10분 10회, 분산 별칭의 11번째부터 공통 429, HMAC 집계·행 제한·삭제 함수 | 유휴 중 삭제 스케줄러, 배포 Auth에서 거절 후 집계가 남는지, 특정 주소 반복에 의한 가입 차단 위험 검토 |
| 로그인·재설정 동일 원칙 | 일반 앱 안내, 오류 원문 로그 제거 | 계정 유무별 HTTP 코드·본문·타이밍 및 IP/기기 제한 경로를 별도 로컬 Auth에서 비교 |
| 14~17세 구분 없음 | 3개 나이 입력에 동일 훅 결과, 동일 5언어 문구 | 운영 버전 응답·주변 로그도 나이를 드러내지 않는지 |
| 거절 원문 미보관 | 새 상태 스키마에 주소/DOB/원문 IP 없음, 사용자 행 증가 없음 | Auth·DB·gateway 오류/slow-query/audit 로그의 요청 본문·SQL bind 원문 및 HMAC 키 비기록 설정·실측, 아래 키 보관 결정 |

기기 ID를 `user_metadata`에 넣기만 하면 호출자가 바꿀 수 있다. 누락·변조 가능한 값을
권위 있는 제한으로 보고하지 않는다. 이 조건의 담당 서버 경로를 정하고 구현하거나,
조건 변경을 대표님이 결정해야 활성화할 수 있다. 현재 PR에 READY 승인이나 그 권한은 없다.
일반 로그인 성공·실패 자체를 같게 만드는 것이 아니라, 실패 응답에서 계정 존재를 가르지 않는
원칙이다. 기존 계정의 정확한 주소 재가입은 Auth가 훅 전에 처리할 수 있으므로 실측 표에 포함한다.

### R1에서 남긴 키 보관과 외부 경로 증거

- HMAC 키는 여전히 `signup_hook_policy.hash_key`에 있다. API 역할은 읽을 수 없지만
  postgres·백업 열람자는 키와 해시를 함께 얻을 수 있다. 짧은 보관 기간이나 HMAC만으로
  이 위험이 해소됐다고 주장하지 않는다. 동적 SQL의 `$1`은 원문, `$2`는 키이므로
  pgaudit·auto_explain·오류의 bind 출력도 모두 비기록 검증 대상이다.
- 저장소 SQL에는 Vault·`decrypted_secrets`·서버 secret 설정을 읽는 관례가 없다.
  Naver 선례는 `supabase/functions/oauth-naver/index.ts`의 Edge 환경변수
  `NAVER_OAUTH_HMAC_PEPPER`이며 DB에는 해시만 전달한다. PG 훅이 Edge 환경변수를
  읽는 경로는 없으므로 그대로 재사용할 수 없다.
- [Supabase Vault](https://supabase.com/docs/guides/database/vault)는 별도 암호화 키로
  디스크·백업의 secret을 암호화하지만 복호화 뷰 권한은 따로 제한해야 한다.
  이번 격리 PG는 해당 확장 없이 실행하며, 운영 확장·키 주입·복원 관례를 확인하지 않았다.
  검증하지 않은 Vault 의존성을 초안에 넣지 않았다. **활성화 전** 별도 키 보관·백업 경로를
  구현·검증하거나 이 잔여 위험을 명시적으로 검토해야 한다. 다른 평문 테이블로 옮기기만
  해서는 같은 백업 노출을 해결하지 못한다.
- Naver의 서버 `admin.createUser`에서 훅 실행 여부와 IP의 실제 출처를 별도로 확인한다.
  Edge 공용 IP가 들어오면 모든 Naver 가입이 한 버킷을 쓰며, IP 누락이면 400이다.
- 이메일 없는 OAuth의 `null`/빈 문자열 event 모양과 저장 열을 실제 Auth에서 대조한다.
  로컬 SQL의 0113 동등성은 이 외부 입력 모양까지 증명하지 않는다.
- 웹 CORS에서 `X-Supabase-Api-Version`을 SDK가 읽는지 확인한다. 읽지 못해 `code`가
  사라지면 앱은 일반 실패로 남는다. 네이티브와 웹을 각각 측정하기 전 활성화하지 않는다.

## 운영 작업 카드 초안 (지금 실행하지 않음)

- 제목: T06 Before User Created 활성화
- 담당: 번호·독립 검토·머지·8081 확인 = 코디네이터, SQL 적용 = Relay,
  **Authentication › Hooks 설정 변경 = 대표님**.
- 실행 전: 독립 Codex daybreak PASS, 새 medium 0, CI 초록, 위 차단 조건 전부의 증거 링크.
- 1: 코디네이터가 번호를 부여하고 시험 경로·초안 등록을 함께 승격한다. 0113은 수정하지 않는다.
- 2: Relay가 검토받은 번호 파일 전체를 한 트랜잭션으로 적용한다. 정책 OFF와 ACL을 확인하고
  소유자 권한 삭제 스케줄러를 준비한다. 비밀키는 조회·출력하지 않는다.
- 3: 대표님이 Dashboard → Authentication → Hooks → Before User Created → Postgres →
  `public.before_user_created_signup(event jsonb)`를 선택하고 저장한다. 이때 정책은 아직 OFF다.
  Relay가 저장 직후 ACL을 다시 대조한다(0141의 Dashboard grant 재실행 선례).
  anon·authenticated·service_role의 EXECUTE가 모두 false인지 재확인한다.
- 4: Relay가 승인된 증거를 확인한 뒤 `signup_hook_policy.enabled`만 ON으로 바꾼다.
  승인된 시험 경로에서 허용 `{}`, 거절 403/unknown/token, 429 및 원문 미보관을 확인한다.
- 5: 코디네이터가 8081에서 응답 대체 방식으로 5언어·단일 안내·입력 해제·현재 500 유지·접근성을
  확인한다. 운영에 시험 계정을 만드는 단계는 이 카드에 포함하지 않는다.
- 중단: 과도한 가입 실패, 응답 형식 불일치, 원문 로그, 제한 우회 중 하나라도 있으면
  대표님이 훅을 끄고 Relay가 정책을 OFF로 둔다. 0113과 기존 앱 안내로 돌아간다.
- 제거: 훅 설정 해제와 전용 삭제 스케줄러 해제 후
  `db/migration-drafts/rollback/UNNUMBERED_before_user_created_signup_down.sql` 전체를 한 트랜잭션으로.
  DROP CASCADE를 쓰지 않는다. 신규 해시·키·함수만 없애며 0113은 남는다.

## 로컬 재현 및 남긴 것

새 로컬 PG의 사용하지 않은 `t06_signup_test_*` DB 이름으로 실행:

```text
python scripts/test-before-user-created-signup.py <empty-local-port> t06_signup_test_local
```

R1 SQL 검증(2026-10-24 KST): **139개 단언**, 주소 사례 **12/12**가 0113과 동일.
한 IP의 1,000회는 허용 10·제한 990, 예산 10이며 다른 IP는 허용된다.
IPv6 한 /64의 30개 주소는 거절 10·제한 20·IP 행 1이다.
신규·기존 메일함 각각 12개 IP에서 별칭을 넣으면 11번째부터 같은 429다.
서로 다른 IP·메일함 1,000개로 실제 저장 상한 2,000행과 초과 시 추가 할당 0을 확인한다.
SQL 변이 **5/5 사멸**: IP 선검사·IPv6 /64·IPv4-mapped 정규화·메일함 제한·전역 상한.
각각 특정 동작 단언의 실패를 확인하며 구문 오류는 변이 사멸로 세지 않는다.
같은 IP·같은 메일함의 2연결/12요청 재생은 각각 403 10·429 2,
전체 예산 마지막 자리 재생은 허용 1·429 11이다. 모든 경쟁 순서를 강제한 시험은 아니다.
이 실행기는 원본 파일을 수정하지 않고 메모리 사본에서 변이하며 데이터베이스를 삭제하지 않는다.
앱의 현재 회차 검증·변이 수치와 CI 판정은 PR 본문에 기록한다.
전체 verify는 자원 규칙에 따라 PR CI 몫이다. 독립 검토는 코디네이터에게 인계한다.

이 시험은 실제 0108/0113을 최소 테이블에 설치한다. 전체 운영 스키마 재생이나 GoTrue e2e가 아니다.
CI의 독립 PostgreSQL 16 DB에도 등록했다. 구현 세션은 Windows 로컬 PostgreSQL 18을 썼다.
SQL 시험은 DB 이름과 auth.users 부재를 확인하며, 기존 DB에 재실행하면 중단한다.
Jest는 순수 함수, 실제 콜백 소스 실행, SDK의 가짜 HTTP 변환만 사용한다. RN 렌더러는 없다.

번호 부여, 운영·Relay·대시보드, 배포, APK, 계정 로그인, 8081 조작, DECISIONS/HANDOFF 수정,
인터뷰 #2440은 수행하지 않았다. 승인 대기 가입의 기존 보관 정책은 별도 Q-261013-48 범위다.
VISION 축: 1. 알아가기, 자기 데이터 축적에 진입하는 가입 경로의 정확성.
