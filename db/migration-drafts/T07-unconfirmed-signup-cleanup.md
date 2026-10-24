# T07: 이메일 확인 미완료 가입 정리 초안

Q-261013-48, `DECISIONS-2026-10-13.md` 19:43 및 20:29의 승인 범위다.
법무 원문은 정본 체크아웃의 로컬 자료
`.bots/legal/outbox/relay-q48-unconfirmed-signups-1938.result.md`다.
원문은 법무 내부 의견 초안이며 외부 법률 자문 승인으로 취급하지 않는다.
T08 선행 조건은 발주서에서 충족으로 확인했다. 이 변경은 번호 부여·운영 적용·게시가 아니다.

## 지우는 조건과 남기는 조건

| 검사 | 동작 |
|---|---|
| 이메일 미확인 + `confirmation_sent_at + 600초 + 24시간 <= 실행 기준 시각` | 아래 제외 조건이 모두 없으면 Auth 행 삭제 |
| `confirmation_sent_at` 없음 | 남김. 생성 시각으로 대신 계산하지 않음 |
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
  confirmation_sent_at을 갱신한다. 매번 최신 발급 시각을 사용한다.
- 0149의 `complete_verified_email_signup()`은 이메일 확인 전환에서만 프로필을 만든다.
  14세 미만이면 RETURN하여 Auth 메타데이터는 남을 수 있었다. 새 BEFORE 트리거는
  auth.users와 auth.identities의 INSERT/메타데이터 UPDATE에서 해당 키만 제거한다.
  적용 전 잔여 값은 같은 트랜잭션에서 두 테이블을 정리한다. 이미 확인되었거나 OAuth가
  연결된 계정도 **계정은 남기고** 이 잘못 수집된 signup 키만 지운다.
- `public.users.birth_date`는 0030/0050의 서버 나이 문에서 14세 미만 INSERT/날짜 UPDATE를 거절한다.
  이 문과 NOT NULL 계약은 유지한다. 운영에 수동 우회로 만든 잘못된 프로필이 있다면
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

제1조 수집 항목을 바꾸지 않고 제3조 첫 보유기간 문단 뒤에 법무 문형 N=1을 그대로 넣었다.
CI의 원문 일치 계약 때문에 앱 스냅샷 `src/lib/legal/legal-documents.ts`와
생성 HTML `public/legal/privacy.html`도 함께 맞췄다. locale 키 변경은 없다.
시행일·최종 개정일·`PRIVACY_POLICY_VERSION=2026-10-07`·가입 동의 계약은 바꾸지 않았다.
앱/HTML 사본도 소스 변경이므로 머지 뒤 자동 앱 빌드에는 포함될 수 있다.

**게시 전 해결할 차이:** 발주된 알고리즘은 만료 후 24시간이 지나야 삭제 대상이 되고
하루 한 번 실행한다. 성공하고 적체가 없어도 실제 파기는 만료 후 24~48시간 사이가 된다.
법무의 지정 문장 「만료된 날부터 1일 안에」를 모든 행에 보장하는 구현은 아니다.
잠금·실패·상한·제외 계정은 더 늦거나 삭제되지 않는다. 지정 문형/일정을 임의 변경하지 않았으며,
코디네이터가 법무와 이 차이를 해소하기 전에는 이 문안을 적용 사실로 게시하면 안 된다.
번역·판본·가입 계약 동기화도 별도 게시 단계에서 확정한다.

1. 독립 Codex daybreak PASS + 새 medium 0 + CI 초록. 코디네이터가 번호를 부여한다.
2. Relay 승인 블록에 전체 SQL을 한 트랜잭션으로 싣는다. 운영 담당자가 Auth 실제 칸·
   OTP 600초·public.users의 서버 나이 문·레지스트리/Storage 스키마를 확인한다.
   이 초안은 칸이 없으면 멈추며 created_at으로 대체하지 않는다.
3. postgres로 적용한다. 기존 14세 미만 signup DOB 키도 이 트랜잭션에서 제거한다.
   pg_cron이 있을 때만 기존 방식으로 예약한다. UTC `37 14 * * *` = KST 23:37
   (운영 cron.timezone=UTC 확인 필요). 없으면 NOTICE를 내며 **예약되지 않는다**.
4. 소유자·권한·고정 search_path, cron 한 건/명령/시간대와 첫 실행 결과를 값 없이 확인한다.
   코드 만료 설정이 바뀌면 이 600초 상수도 재검토한다.
5. 위 문형과 실제 기한 차이 해소 후 처리방침 판본·동의 계약·번역·공개 페이지를 별도 절차로 게시한다.
   이번 PR은 번호 부여·Relay·게시·배포·8081 변경을 실행하지 않는다.

## 로컬 시험과 되돌리기

새 빈 PG 클러스터 또는 폐기 가능한 로컬 서버에서:

```text
python scripts/test-unconfirmed-signup-cleanup.py 55487 t07_cleanup_test_ci
```

포트는 명시하고 host는 127.0.0.1, 사용자 postgres로 고정한다. PG 서비스/호스트 환경변수는
전달하지 않는다. 운영 URL·dotenv·기존 DB 재사용·DB 삭제를 허용하지 않는다.
Auth/Storage는 최소 스키마이며 나이 문과 프로필/동의 함수는 실제 마이그레이션을 읽는다.
행 삭제/보존·상한·재실행·실패 재시도·권한·pg_cron 없음·누락 발급 칸·SQL 변이를 확인한다.
동시성은 별도 세션의 실제 잠금 및 pg_blocking_pids 관측으로 확인한다.
실제 Supabase Auth API/메일 호출이나 실제 pg_cron daemon 실행을 검증한 것은 아니다.

되돌릴 때는 운영 담당자가
`rollback/UNNUMBERED_unconfirmed_signup_cleanup_down.sql` 전체를 한 트랜잭션으로 실행한다.
cron을 먼저 해제하고 두 트리거와 세 함수를 지운다. 삭제된 Auth 행·생년월일은 복구하지 않는다.
원복 후 새 14세 미만 메타데이터가 다시 남을 수 있으므로 나이 문/별도 정리 대책을 함께 판단한다.
문안은 별도 소스 되돌림과 게시 절차가 필요하다.

VISION: 세 축 공통의 계정·개인정보 수명 관리. 아직 자기 기록이 생기지 않은 가입 정보를
불필요하게 보관하지 않으며, 알아가기·개인 비서·공상 구체화의 기존 데이터를 건드리지 않는다.
