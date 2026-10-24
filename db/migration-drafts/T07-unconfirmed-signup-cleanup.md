# T07: 이메일 확인 미완료 가입 정리 초안

Q-261013-48, `DECISIONS-2026-10-13.md` 19:43 및 20:29의 승인 범위다.
법무 원문은 정본 체크아웃의 로컬 자료
`.bots/legal/outbox/relay-q48-unconfirmed-signups-1938.result.md`다.
원문은 법무 내부 의견 초안이며 외부 법률 자문 승인으로 취급하지 않는다.
T08 선행 조건은 발주서에서 충족으로 확인했다. 이 변경은 번호 부여·운영 적용·게시가 아니다.
2026-10-24 독립 검토 1회차 뒤 코디네이터 결정으로 매시 실행·만료 후 22시간 기준을 적용했다.
2회차 PASS 뒤 코디네이터 결정 (나): 가입 함수 셋은 건드리지 않고 생년월일 정리를
서버 나이 문과 같은 세션 `current_date`에 맞춘다. C10 하한의 기준일은 변경하지 않는다.

## 지우는 조건과 남기는 조건

| 검사 | 동작 |
|---|---|
| 이메일 미확인 + `confirmation_sent_at + 600초 + 22시간 <= 실행 기준 시각` | 아래 제외 조건이 모두 없으면 Auth 행 삭제 |
| `confirmation_sent_at` 없음 | 남김. 생성 시각으로 대신 계산하지 않음 |
| `recovery_sent_at`이 있고 발급 + 600초 + 22시간이 아직 지나지 않음 | 남김. 비밀번호 재설정·매직링크에도 같은 기준 적용 |
| 확인 완료, 전화번호/전화 확인, 로그인 이력, 초대, SSO, 익명, 삭제 처리 중 | 남김 |
| Auth 앱 메타데이터가 `provider=email`, `providers=[email]` 조합이 아님 | 남김. 누락·불명확한 값도 남김 |
| `auth.identities`에 이메일 이외 제공자가 있음 | 남김 |
| `auth.sessions`가 있음 | 남김 |
| `public.users`가 있음 | 남김 |
| 삭제 레지스트리의 **어느 분류든** 해당 소유자 행이 있음 | 남김. retained·client_erasable·account_delete_only를 구분해 삭제하지 않음 |
| Storage 소유자 또는 raw-clippings/record-photos 사용자 경로가 있음 | 남김. 파일 삭제 API를 우회하지 않음 |
| 위 조건을 통과한 14~17세와 성인 | 같은 기한. 생년월일로 계정 삭제 시각을 바꾸지 않음 |
| `signup_birth_date`가 유효한 14세 미만 날짜 | **그 키만** Auth 저장 시 즉시 제거. 계정의 이메일 삭제 기한은 동일 |

실행 역할은 소유자 `postgres` 하나다. PUBLIC·anon·authenticated·service_role·
supabase_auth_admin의 함수 직접 실행 권한을 회수한다. SECURITY DEFINER 함수는 빈
search_path를 사용하고 정리 함수는 RLS를 우회하되 레지스트리 전체를 읽어 제외한다.
새 테이블·원장·PII 로그는 없다. 결과는 deleted/skipped/failed 건수만 반환한다.
같은 건수를 PostgreSQL 실행 로그에 `RAISE LOG`로 남기고, 실패가 있으면 `WARNING`도 낸다.
원래 예외 내용·주소·식별자·생년월일은 기록하지 않는다.
pg_cron의 libpq 실행기는 반환 열 값을 `cron.job_run_details`에 저장하지 않고 행 수만 적는다
([공식 구현](https://github.com/citusdata/pg_cron/blob/main/src/pg_cron.c), 2026-10-24 확인).
따라서 `succeeded`만으로 개별 행 성공을 판정하지 않는다. 실행 시각/PID로 PostgreSQL 로그의
`T07 cleanup` 집계를 대조하고, Relay가 직접 한 번 호출한 반환 건수도 적용 기록에 남긴다.

기본 상한 100행, 허용 상한 1,000행이다. 제외 조건은 LIMIT 전에 적용한다.
개별 실패는 그 행만 남기고 나머지를 진행하며 다음 실행에서 재시도한다.
프로세스/트랜잭션 전체 실패는 그 실행을 롤백한다. 반복 실패·잠금·상한 초과 적체는
보관을 늦출 수 있으며 운영 담당자가 건수와 cron 실패를 확인해야 한다.
지속 실패 행이 상한을 채우면 뒤 행도 지연될 수 있다. 영속 실패 큐는 이번에 만들지 않았다.

## 생년월일이 남는 자리와 기존 경로

- 앱은 `src/lib/supabase/auth.ts`의 `signUpWithEmail()`에서 `options.data.signup_birth_date`를 보낸다.
- Supabase Auth의 [User 모델](https://github.com/supabase/auth/blob/master/internal/models/user.go)은
  `confirmation_sent_at`과 `raw_user_meta_data`를 실제 칸으로 정의한다.
  [가입 구현](https://github.com/supabase/auth/blob/master/internal/api/signup.go)은 요청 data를
  이메일 identity의 `identity_data`에도 복사한다(2026-10-24 공개 소스 확인, 운영 버전은 미접근).
  [메일 구현](https://github.com/supabase/auth/blob/master/internal/api/mail.go)은 재발급 시
  confirmation_sent_at을 갱신한다. 복구·매직링크는 recovery_sent_at을 사용한다.
  [확인 구현](https://github.com/supabase/auth/blob/master/internal/api/verify.go)의 recoverVerify도
  미확인 계정을 확인할 수 있으므로 두 발급 시각 모두 같은 컷오프로 검사한다.
- 0149의 `complete_verified_email_signup()`은 이메일 확인 전환에서만 프로필을 만든다.
  14세 미만이면 RETURN하여 Auth 메타데이터는 남을 수 있었다. 새 BEFORE 트리거는
  auth.users와 auth.identities의 INSERT/메타데이터 UPDATE에서 해당 키만 제거한다.
  적용 전 잔여 값은 같은 트랜잭션에서 두 테이블을 정리한다. 이미 확인되었거나 OAuth가
  연결된 계정도 **계정은 남기고** 이 잘못 수집된 signup 키만 지운다.
- `public.users.birth_date`는 0030/0050의 서버 나이 문에서 14세 미만 INSERT/날짜 UPDATE를 거절한다.
  이 문과 NOT NULL 계약은 유지한다. `enforce_user_age_tier`·`complete_verified_email_signup`·
  `complete_profile_signup_consent`의 본문·설정·ACL은 설치와 되돌림 모두에서 변경하지 않는다.
  스크러버·정리 함수도 시간대를 고정하지 않는다. DOB 판정은 기존 서버 나이 문과 같은
  세션 `current_date`(트랜잭션 날짜)를 사용하므로 서버가 14세 미만으로 거절한 생년월일을
  같은 기준일에 지운다. UTC 세션이면 UTC 날짜, 다른 시간대 세션이면 그 세션 날짜다.
  운영에 수동 우회로 만든 잘못된 프로필이 있다면
  별도 승인된 정정이 필요하며 이 함수는 앱 프로필을 지우지 않는다.
- 0107부터 `public.users -> auth.users` FK는 ON DELETE CASCADE다. 실제 계정 삭제는
  `supabase/functions/delete-account`의 세션 확인·Storage API 정리·Auth hard delete 경로다.
  이 초안은 그 경로를 대체하지 않고, 앱 행·파일이 없는 가입 시도만 정리한다.
  0189 레지스트리는 콘텐츠 삭제 분류를 유지한다. 새 소유자 표가 없으므로
  `db/erasure-registry.json`·0189 시드·분류·기존 사유를 바꾸지 않는다.
- 인증 서비스 로그·백업·메일 제공자에 남는 사본은 SQL 파기 범위가 아니다. 운영 보관기간과
  실제 배포 Auth 버전의 추가 사본은 Relay 확인 항목이며 이번에 조회하지 않았다.

## 동시 실행

동일 작업은 advisory lock으로 한 번만 실행한다. 후보 Auth 행은 FOR UPDATE SKIP LOCKED,
기존 identity는 FOR UPDATE NOWAIT를 잡은 뒤 전체 조건을 다시 읽고 삭제한다.
확인·재발송이 먼저 잡은 행은 건너뛴다. 새 identity/프로필의 FK KEY SHARE도 삭제와 충돌한다.
identity 제공자 변경은 기존 identity 잠금으로 직렬화한다. 부모 없는 계정에 쓰는
새 앱 경로가 추가되면 기존 계정/Storage 쓰기 장벽 및 레지스트리 등록을 유지해야 한다.

## 처리방침과 적용 순서

이 PR에서는 처리방침 원본·앱 스냅샷·생성 HTML 세 사본 모두에서 새 문장을 뺐다.
머지만으로 아직 운영에 없는 파기를 약속하지 않는다. 판본·시행일·제12조 이력도 변경하지 않는다.
아래는 **운영 적용 뒤 별도 게시 PR에서 제3조 첫 보유기간 문단 뒤에 넣을 문안**이다.

> 가입을 시작했으나 이메일 확인을 마치지 않은 경우, 입력한 이메일·생년월일 등은 확인 코드가 만료된 날부터 1일 안에 파기합니다.

매시 `37 * * * *`에 실행하고 만료 후 22시간을 지난 행을 후보로 삼는다. 정상 실행하고
적체·실패·잠금이 없으면 마지막 코드 만료 후 22~23시간 이내다. KST 달력일의 다음 날 자정
기준과 24시간 기준 모두에 여유가 있다. 잠금·실패·상한 적체가 생기면 더 늦을 수 있으므로
이 수치는 무조건적인 운영 보장이 아니다. 제외 계정은 기존 데이터 보관 절차를 따른다.

1. 독립 Codex daybreak PASS + 새 medium 0 + CI 초록.
   **번호 부여 전 코디네이터 확인:** 운영 Auth의 OTP·확인 메일 만료가 모두 600초인지 확인한다.
   저장소 `supabase/config.toml`의 `[auth.email] otp_expiry = 600`은 로컬 근거이며 운영 증거는 아니다.
   `DECISIONS.md` 2026-10-24 13:15에는 10-18 Relay 실측 600초가 기록돼 있다.
   이 세션은 운영에 접근하지 않았으므로 번호 부여 때 그 설정이 유지되는지 코디네이터가 확인한다.
   값이 다르면 번호를 부여하지 않고 컷오프·시험을 재검토한다.
2. **번호 부여 → Relay 적용**: Auth 실제 발급 칸 둘·세션 날짜와 기존 나이 문·레지스트리·
   Storage를 확인하고 전체 SQL을 postgres로 한 트랜잭션에 적용한다. 칸이 없으면 멈추며
   created_at으로 대체하지 않는다. 기존 14세 미만 signup DOB 키도 같은 트랜잭션에서 제거한다.
3. **pg_cron 등록 확인**: 없으면 관례대로 NOTICE만 내고 커밋하며 **예약되지 않는다**.
   `cron.job`에서 `jobname='purge-unconfirmed-signups' AND username='postgres'`인 행이 정확히 1건,
   schedule이 `37 * * * *`, command가 `SELECT * FROM public.purge_unconfirmed_signups(100);`인지
   확인한다. 하나라도 다르면 게시를 멈춘다. UTC/KST 모두 매시 37분이다.
4. **첫 실행 확인**: 소유자·권한·search_path·세션 날짜와 cron 실행 기록, PostgreSQL의 건수 로그를
   대조한다. 함수를 직접 1회 호출해 deleted/skipped/failed 건수도 기록한다. 실패나 적체가 남으면
   해결 후 재실행한다. 인증 감사 표 건수·통합 로그/백업/메일 사본 보관기간도 값 없이 확인한다.
5. 그 뒤 별도 **게시 PR**에 `do not merge before NNNN applied` 게이트를 붙인다.
   NNNN은 실제 적용된 번호로 바꾸며, `PRIVACY_POLICY_VERSION`·시행일·최종 개정일·제12조
   개정 이력·가입 동의 계약·번역과 세 사본을 함께 갱신한다.
   이번 PR은 번호 부여·운영 접근·Relay·게시·배포·8081 조작을 실행하지 않는다.

### 게시 PR에서 맞출 것

- **인증 감사 표의 이메일·IP 잔존:** 2회차 검토의 로컬 재생에서 `auth.users` 삭제 뒤에도
  `auth.audit_log_entries`의 `actor_username`(이메일)·`ip_address`가 남았다.
  이 초안은 그 표를 지우지 않는다. 게시 전에 운영의 감사 기록 쓰기 여부·보관기간을
  확인하고 별도 정리 또는 문안 범위를 결정해야 한다. 확인 없이 이메일 전체 파기를 고지하지 않는다.
- **「확인 코드」와 마지막 코드 시계:** 실제 삭제 기준은 확인·복구 발급 시각 중 마지막
  시각에 600초와 22시간을 더한 값이다. 복구·매직링크 재발급은 삭제 시각을 늦춘다.
  게시 예정 문안의 「확인 코드」가 이 의미를 포함하는지 확인하거나 「마지막으로 보낸 코드」
  취지로 맞춘다. 문안 확정은 별도 게시 PR에서 처리하며 이번에는 처리방침 세 사본을 바꾸지 않는다.

## 로컬 시험과 되돌리기

새 빈 PG 클러스터 또는 폐기 가능한 로컬 서버에서:

```text
python scripts/test-unconfirmed-signup-cleanup.py 55487 t07_cleanup_test_ci
```

포트는 명시하고 host는 127.0.0.1, 사용자 postgres로 고정한다. PG 서비스/호스트 환경변수는
전달하지 않는다. 운영 URL·dotenv·기존 DB 재사용·DB 삭제를 허용하지 않는다.
Auth/Storage는 최소 스키마이며 0050 나이 문과 프로필/동의 함수는 실제 마이그레이션을 읽는다.
행 삭제/보존·상한·재실행·실패 재시도·권한·pg_cron 없음·누락 발급 칸·SQL 변이를 확인한다.
동시성은 별도 세션의 실제 잠금 및 pg_blocking_pids 관측으로 확인한다.
실제 Supabase Auth API/메일 호출이나 실제 pg_cron daemon 실행을 검증한 것은 아니다.
SQL 의미 변이 26개와 로그/경고 변이 2개, 동시성 8개를 실행한다. 세션 날짜 시험은
UTC·Asia/Seoul·America/Los_Angeles의 자정 전후 시각 6개와 생년월일 3개를 조합한 54개다.
스크러버·Auth 사본 둘·서버 나이 문·확인 가입·프로필 완료가 같은 결론인지 확인하고,
정리 함수 실행 중에도 세션 시간대와 날짜가 유지되는지 확인한다. 시간대를 다시 고정하거나
가입 함수 셋 중 하나의 기준일을 바꾸는 변이 7개는 이 SQL 시험에서 실패해야 한다.
실제 함수 정의의 current_date만 시험 시각으로 치환한 트랜잭션에서 실행하고 롤백한다.
설치 전후·재설치 후·되돌림 후 가입 함수 셋의 정의·설정·ACL 스냅샷도 비교한다.
운영 함수에 시계 주입 기능은 없으며 실제 자정까지 기다린 시험은 아니다.

되돌릴 때는 운영 담당자가
`rollback/UNNUMBERED_unconfirmed_signup_cleanup_down.sql` 전체를 한 트랜잭션으로 실행한다.
cron을 먼저 해제하고 T07의 두 트리거와 세 함수만 지운다. 기존 가입 함수 셋의 설정은
바꾸지 않는다. 삭제된 Auth 행·생년월일은 복구하지 않는다.
원복 후 새 14세 미만 메타데이터가 다시 남을 수 있으므로 나이 문/별도 정리 대책을 함께 판단한다.
문안은 별도 소스 되돌림과 게시 절차가 필요하다.

VISION: 세 축 공통의 계정·개인정보 수명 관리. 아직 자기 기록이 생기지 않은 가입 정보를
불필요하게 보관하지 않으며, 알아가기·개인 비서·공상 구체화의 기존 데이터를 건드리지 않는다.
