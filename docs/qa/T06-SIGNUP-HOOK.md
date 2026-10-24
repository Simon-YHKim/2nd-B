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
3. 전역 10분 1,000회 상한을 키 할당 전에 검사한다. 정책 행 잠금과 UPSERT로 동시 호출을
   직렬화하고 count를 포화시킨다. 유지하는 두 창의 집계 행은 최대 4,000개다.
   고정 창 경계에서는 10분보다 짧은 간격에 20회가 가능하다. 공용 IP와 전역 상한의 서비스
   거부 위험이 있어 이 숫자는 활성화 전 트래픽에 맞춰 다시 검토해야 한다.
4. 창·차원·IP 또는 canonical mailbox를 DB에서 생성한 비밀키로 HMAC-SHA256한다.
   집계에는 창, 차원, 32바이트 해시, 횟수만 있다. 해시에도 보관 제한을 적용한다.
   키를 코드·로그·PR에 출력하지 않는다. 주소·DOB·요청 JSON·원문 IP를 새 테이블에 보관하지 않는다.
5. `prune_signup_hook_attempts()`는 이전 창보다 오래된 집계를 지운다. 요청 때도 부르지만
   **유휴 중 삭제를 위해 소유자 권한의 1분 주기 실행과 그 증거가 필요하다**.
   이 PR은 스케줄러를 설치하지 않는다. 검증된 주기가 있으면 보관 상한은 약 21분이다.
6. 0113의 NULL email, 확인된·삭제되지 않은 auth 계정, public 프로필, 자기 id 제외,
   0108 canonicalizer를 그대로 따른다. 이메일 NULL은 비교를 생략하고 빈 문자열은 비교한다.
   사전 조회 뒤의 경쟁은 0113이 처리하며, 경쟁으로 인한 500은 여전히 일반 실패다.
7. DOB·14~17세 여부는 훅 분기와 고정 응답에 사용하지 않는다. 기존 가입 연령 제약은 그대로다.
8. 새 앱 안내는 기존 단일 alert의 수명·입력 시 해제·언어 전환·버튼 위 위치를 따른다.
   쓰이지 않던 별도 복구 카드는 화면에서 제거했다. 500, 429, 메시지만 같은 오류는 기존 안내다.
9. 로그인·재설정은 기존 일반 안내를 유지하고 그 경로의 서버 오류 원문 console 출력을 없앴다.
   기존에 없는 계정/틀린 비밀번호 및 재설정의 서버 응답 동등성을 이 변경으로 입증한 것은 아니다.

## 활성화 차단 조건: 전부 해결하기 전 OFF

| 조건 | 이번 증거 | 아직 필요한 증거 |
|---|---|---|
| IP·기기별 속도 제한 | 훅의 IP 제한·동시 호출·중복 거절 집계 | 신뢰된 기기 신호, 직접 Auth 호출 우회 차단, OAuth·구버전 앱 경로의 커버리지 |
| 반복 시도 해시 기록 | HMAC 집계·행 제한·삭제 함수 | 유휴 중 삭제 스케줄러, 배포 Auth에서 거절 후 집계가 남는지 |
| 로그인·재설정 동일 원칙 | 일반 앱 안내, 오류 원문 로그 제거 | 계정 유무별 HTTP 코드·본문·타이밍 및 IP/기기 제한 경로를 별도 로컬 Auth에서 비교 |
| 14~17세 구분 없음 | 3개 나이 입력에 동일 훅 결과, 동일 5언어 문구 | 운영 버전 응답·주변 로그도 나이를 드러내지 않는지 |
| 거절 원문 미보관 | 새 상태 스키마에 주소/DOB/원문 IP 없음, 사용자 행 증가 없음 | Auth·DB·gateway 오류/slow-query/audit 로그의 요청 본문·SQL bind 값 비기록 설정 및 실측 |

기기 ID를 `user_metadata`에 넣기만 하면 호출자가 바꿀 수 있다. 누락·변조 가능한 값을
권위 있는 제한으로 보고하지 않는다. 이 조건의 담당 서버 경로를 정하고 구현하거나,
조건 변경을 대표님이 결정해야 활성화할 수 있다. 현재 PR에 READY 승인이나 그 권한은 없다.
일반 로그인 성공·실패 자체를 같게 만드는 것이 아니라, 실패 응답에서 계정 존재를 가르지 않는
원칙이다. 기존 계정의 정확한 주소 재가입은 Auth가 훅 전에 처리할 수 있으므로 실측 표에 포함한다.

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

빈 `t06_signup_test_*` DB에서 실행:

```text
psql -X -h 127.0.0.1 -p <empty-local-port> -U postgres -d t06_signup_test_local -v ON_ERROR_STOP=1 -f db/migration-drafts/tests/before-user-created-signup.sql
```

검증 결과(2026-10-24 KST): 관련 Jest 17묶음 337개 통과, SQL 68개 단언 통과.
SQL의 주소 사례 12개 모두 훅과 0113의 결과가 같았다. 같은 IP로 두 프로세스가 보낸
12개 요청은 403 10개 + 429 2개였고 한도 초과 요청에 중복 판정 결과를 돌려주지 않았다.
변이 18/18 사멸: 앱 6개(상태·코드·메시지 검사, 분기 연결, 문구, 원문 로그),
SQL 12개(기본 ON, 미확인·삭제·자기 id·프로필 조건, 응답 상태, IP·전역 한도, anon 권한,
보관 기한, HMAC 키, 롤백 중 0113 트리거 제거).
tsc, 변경 파일 eslint, constraints, i18n, emdash, lexicon, definer-grants,
i18n-untranslated, copy-endings, explanatory-copy, anti-anthro, mascot-voice가 종료코드 0이었다.
전체 verify는 자원 규칙에 따라 PR CI 몫이다. 독립 검토는 코디네이터에게 인계한다.

이 시험은 실제 0108/0113을 최소 테이블에 설치한다. 전체 운영 스키마 재생이나 GoTrue e2e가 아니다.
CI의 독립 PostgreSQL 16 DB에도 등록했다. 구현 세션은 Windows 로컬 PostgreSQL 18을 썼다.
SQL 시험은 DB 이름과 auth.users 부재를 확인하며, 기존 DB에 재실행하면 중단한다.
Jest는 순수 함수, 실제 콜백 소스 실행, SDK의 가짜 HTTP 변환만 사용한다. RN 렌더러는 없다.

번호 부여, 운영·Relay·대시보드, 배포, APK, 계정 로그인, 8081 조작, DECISIONS/HANDOFF 수정,
인터뷰 #2440은 수행하지 않았다. 기존 카드의 내부 분기와 번역 키 정리는 API/테스트 계약을
불필요하게 넓히지 않기 위해 남겼다. 승인 대기 가입의 기존 보관 정책은 별도 Q-261013-48 범위다.
VISION 축: 1. 알아가기, 자기 데이터 축적에 진입하는 가입 경로의 정확성.
