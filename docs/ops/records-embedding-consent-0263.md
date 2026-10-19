# 0263 연결용 데이터 철회: Relay 인수

상태: **구현·로컬 시험 단계. 운영 미적용, 잔여 미집계, 앱 전환 금지.**
이 문서는 `docs/ops/`의 기존 운영 인수 관례를 따른다. 설치와 데이터 정리를 분리하고
0행 커서 규칙·앱 전환 조건을 PR 밖에서도 찾도록 새 파일로 둔다.

근거: 2026-10-19 12:35 `DECISIONS.md`의 "의미 연결 동의가 꺼지는 같은 서버 트랜잭션에서
연결용 데이터를 지우는 DB 트리거". 설계는
`E:/Coding Infra/reports/devlab-261010/s2-astra/embed-design-r2.md`.
1회차는 잠금·연령·RLS·호환성 등을 보완하도록 요구했고, 2회차는
PASS WITH CONCERNS(차단 0, medium 4, low 2)였다. 구현 독립 검토는 별도다.
VISION 축은 1(자기 데이터의 사용 선택)과 2(동의한 기록으로 개인 비서 기반 구축)다.

## 적용 전 조건

- 대표님 확인 후 Relay만 운영 적용한다. `_sync/TO-CLI.md`에 "적용 중"과 시각을 표시한다.
- 정확한 PR 커밋·0263 정규화 SHA256·기존 함수/트리거/권한을 확인한다. 번호 지문은
  `scripts/__tests__/supabase-security-drafts.test.ts`에 있다. 운영 판본 매핑을 별도 기록한다.
- `0262`(#2624) 및 다른 대기 마이그레이션을 포괄 `db push`로 함께 적용하지 않는다.
  `0263`은 0262의 새 문구 판본에 의존하지 않는다. 설치가 요구하는 선행 스키마·권한은
  설치 내부 검사에서 확인하며, 맞지 않으면 검사 자체를 약화하지 않는다.
- 운영의 `postgres`가 superuser 또는 BYPASSRLS인지, 실제 요청의 `statement_timeout`과
  `lock_timeout`이 얼마인지 확인한다. 이 세션은 운영에 접속하지 않았다.
- 설치 자체가 철회 동작을 바꾸므로, §2의 읽기 집계를 설치 전에도 실행해 최대 사용자
  규모를 확인한다. 로컬 시험 규모나 요청 시간 여유를 넘으면 운영 설치도 보류한다.

## 1. 트리거 설치

CLI가 트랜잭션을 소유한다. 승인된 단일 파일을 Relay 절차에 따라 적용한다.
수동 psql 적용으로 승인받은 경우에만 같은 의미의 다음 블록을 쓴다.

```sql
BEGIN;
\i db/migrations/0263_records_embedding_consent_guard.sql
COMMIT;
```

설치는 사용자/기록을 전수 갱신하지 않는다. 소유자, BYPASSRLS 능력, 빈 search_path,
row_security=off, VOLATILE, 직접 EXECUTE 회수, FORCE RLS, 클라이언트 읽기 권한,
트리거 이벤트·감시 열·WHEN·활성을 검사한다. 하나라도 실패하면 전체 설치가 실패한다.

```sql
SELECT n.nspname, p.proname, pg_get_userbyid(p.proowner),
       p.prosecdef, p.provolatile, p.proconfig, p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.oid IN ('public.guard_record_embedding_write()'::regprocedure,
               'public.clear_record_embeddings_on_privacy_change()'::regprocedure);
SELECT tgrelid::regclass, tgname, tgenabled, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgname IN ('zz_records_embedding_write_guard','zz_records_embedding_consent_changed');
```

## 2. 잔여 건수 세기

전체를 볼 수 있는 승인된 관리 역할에서 실행한다. 집계가 시간 제한으로 실패하면
"0건"이 아니라 "집계 못 함"이다. 분류 수는 겹친다. `total_to_clear`를 기준으로 삼는다.

```sql
BEGIN READ ONLY;
SET LOCAL row_security = off;
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF current_user <> 'postgres'
     OR pg_catalog.row_security_active('public.users'::regclass)
     OR pg_catalog.row_security_active('public.records'::regclass) THEN
    RAISE EXCEPTION 'reviewed administrative role required';
  END IF;
END $$;
WITH inventory AS (
  SELECT r.user_id, r.embedding IS NOT NULL AS has_vector,
         r.embedding_model IS NOT NULL AS has_model,
         COALESCE((u.privacy_prefs->'records_embedding'='true'::jsonb)
           AND u.minor_tier='adult'
           AND u.birth_date <= (CURRENT_DATE-INTERVAL '18 years')::date, false) AS allowed
  FROM public.records r JOIN public.users u ON u.id=r.user_id
  WHERE r.embedding IS NOT NULL OR r.embedding_model IS NOT NULL
), candidates AS (
  SELECT *, NOT allowed OR has_vector <> has_model AS needs_clear FROM inventory
), per_user AS (
  SELECT user_id, count(*) AS n FROM candidates GROUP BY user_id
)
SELECT count(*) FILTER (WHERE NOT allowed) AS disallowed_rows,
       count(*) FILTER (WHERE has_vector AND NOT has_model) AS vector_only_rows,
       count(*) FILTER (WHERE has_model AND NOT has_vector) AS model_only_rows,
       count(*) FILTER (WHERE needs_clear) AS total_to_clear,
       count(DISTINCT user_id) FILTER (WHERE needs_clear) AS affected_users,
       COALESCE((SELECT max(n) FROM per_user),0) AS largest_indexed_user
FROM candidates;
COMMIT;
```

## 3. 사용자별 배치 정리

실행 SQL 정본은 [records_embedding_cleanup_batch.sql](../../db/ops/records_embedding_cleanup_batch.sql)이다.
사용자 행을 먼저 잠그고 그 뒤 최신 허용 상태를 다시 계산한다. 한 호출은 사용자 한 명,
최대 500행, 한 트랜잭션이다. 앱 화면이나 프로필의 원문은 삭제하지 않는다.

```sql
\set after_user ''
\i db/ops/records_embedding_cleanup_batch.sql
-- 반환 JSON의 next_user를 그대로 다음 호출에 넣는다. 예시 UUID를 복사하지 않는다.
-- \set after_user '<직전 next_user>'
-- \i db/ops/records_embedding_cleanup_batch.sql
```

매 호출의 커서·건수·시간·실패를 기록한다. **cleared=0이어도 next_user로 전진한다.**
해당 사용자의 기록이 전부 잠겨 있었을 수 있다. 500행을 정리한 사용자도 다음 사용자로
넘기며, 다음 순회에서 남은 행을 처리한다. `end_of_sweep=true`면 §2를 다시 실행한다.
잔여가 있으면 잠금 해제 후 빈 커서부터 새 순회를 시작한다. 무한 자동 반복은 하지 않는다.
동시에 켜진 사용자의 완전한 벡터/모델 쌍은 새 허용 상태를 확인해 유지한다.

## 4. 잔여 0 확인과 앱 전환 조건

§2의 `total_to_clear=0` 및 각 잔여 분류 0, 두 트리거 활성·함수 해시·권한 일치를
확인한 뒤에만 Relay가 "완료"로 기록한다. 그 전 상태는 "트리거 설치됨, 잔여 정리 중"이다.

**이 PR은 화면의 직접 삭제 호출과 백필 종료 정리를 유지한다.** 사용자가 보는 문구·조작은
바뀌지 않는다. 새 서버 설치 후에는 성공한 허용→불허 변경과 두 열 삭제가 원자적이고,
늦은 non-NULL 쓰기는 비워진다. 앱 저장 반환값은 실제 `RETURNING id, embedding_model`을
확인해 서버가 비웠거나 0행이면 false다. 단건·백필의 저장 건수에도 같은 결과를 쓴다.

다음 앱 PR에서 직접 삭제를 제거하려면 다음 조건을 **모두** 충족해야 한다.

1. 운영 설치·잔여 0·기존 클라이언트 호환 확인.
2. 로컬 10만 행 시험 및 운영 최대 사용자 규모를 재현한 시험 결과 확보.
3. 실제 요청 시간 제한 `T` 확인. 동일 규모에서 5회 측정한 최대 철회 시간이
   `min(T/3, T-5초)` 이하, 즉 적어도 3배 시간 여유와 5초 절대 여유를 확보한다.
   무제한 timeout은 이 조건의 대체가 아니다. 실제 부하·잠금 대기를 포함해 확인한다.
4. 초기 운영 상한은 **사용자당 50,000개**의 non-NULL 쌍/반쪽 행으로 제안한다.
   100,000행 시험의 절반인 2배 행 수 여유다. 이는 아직 운영 검증된 안전 상한이 아니다.
   **40,000개(80%) 접근 알림**과 담당자의 대응·집계 주기를 운영에 연결하고 증거를 남긴다.
   이 PR은 운영 작업 스케줄이나 알림 서비스를 설치하지 않는다.
5. 40,000 접근 시 허용 시간 재측정과 상한 재검토. 50,000 초과 예상 또는 §3 시간 여유가
   무너지면 신규 색인 저장을 아래 안전 모드로 중단하고, 더 큰 규모 검증 또는 별도
   비동기 `revoking` 계약을 설계한다. 철회를 막거나 OFF만 먼저 저장하지 않는다.
6. `savePrivacyPrefs`의 정확히 한 행 저장 확인과 화면 실패 처리는 별도 앱 전환 PR에서
   시험한다. 현재의 0행 저장·전체 객체 마지막 쓰기 우선 문제를 해결했다고 주장하지 않는다.

## 호환성과 영구 복구 계약

| 요청/조합 | 결과 |
|---|---|
| 현재 앱 + 기존 DB | 기존 분리 삭제 경합이 남음. 새 반환값 검사는 사용 가능 |
| 현재 앱 + 0263, 정리 전 | 새 철회·쓰기에 트리거 적용. 과거 잔여 전체 보장은 미완료 |
| 현재 앱 + 0263, 잔여 0 | 기존 직접 삭제는 중복 정리로 계속 허용 |
| 새 앱(직접 삭제 없음) + 기존 DB | 허용하지 않는 조합 |
| 옛 앱, 모델 없이 새 벡터 쓰기 | 반쪽이면 두 열 NULL. 원문 저장은 유지 |
| 옛 앱, 기존 모델 위에 embedding만 갱신 | 허용 상태라면 기존 모델을 유지. provenance가 낡을 수 있음 |
| OFF→ON 뒤 오래된 NULL 요청/false 전체 객체 | 새 벡터가 지워질 수 있음. 세대/CAS는 이번 범위 밖 |

R2-02는 수용한 한계다. 행 이미지로 열 생략과 동일 모델명 재전송을 구별할 수 없어 모델을
추측하거나 비우지 않는다. 정확한 provenance가 필요하면 별도 RPC/세대 계약으로 전환한다.

**새 앱이 직접 삭제를 한 번이라도 제거한 뒤에는 두 트리거를 삭제·비활성화하는 운영 DOWN을
영구 금지한다.** 앱을 되돌려도 이미 설치된 모바일 클라이언트는 남는다.
[0263_down.sql](../../db/migrations/rollback/0263_down.sql)은 로컬 구조 시험용이며 지운 데이터는 복원하지 않는다.
문제가 있으면 검토된 forward fix, 또는 철회 트리거를 유지하고 모든 후보 쓰기를 NULL로
바꾸는 안전 모드를 Relay가 적용한다. 다음은 승인·검토 후 새 마이그레이션으로 작성할 본문이다.

```sql
CREATE OR REPLACE FUNCTION public.guard_record_embedding_write()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = '' SET row_security = off AS $$
BEGIN
  NEW.embedding := NULL;
  NEW.embedding_model := NULL;
  RETURN NEW;
END;
$$;
ALTER FUNCTION public.guard_record_embedding_write() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_record_embedding_write() FROM PUBLIC, anon, authenticated, service_role;
-- 두 트리거를 유지하고, 원래 0263의 소유자/권한/활성 검사를 다시 수행한다.
```

## 로컬 검증 기록

2026-10-19 로컬 SQL 계약·경합 11개 실행 묶음과 아래 4규모 성능 시험 통과.
관련 Jest 8 suites / 106 tests, SQL 변이 14/14 및 앱 변이 8/8 검출 후 원복·재검증 통과.
환경: Windows Docker의 기존 캐시 이미지,
CI와 같은 PG16·pgvector digest, 컨테이너 2 CPU·768 MiB, 전체 번호 마이그레이션 psql 재생.
CI는 고정된 Supabase CLI로 별도 재생한다. 768차원 벡터·HNSW·기존 트리거를 유지한다.
로컬은 synthetic fixture이며 운영 분포·동시 부하·운영 지연의 증거가 아니다.

| 대상 행 | 철회 SQL 시간(ms) | WAL bytes | 새 쓰기 검사 호출 | 기존 updated_at 호출 |
|---:|---:|---:|---:|---:|
| 0 | 6.471 | 480 | 0 | 1 |
| 1,000 | 26.504 | 967,032 | 0 | 1,001 |
| 10,000 | 223.935 | 9,746,952 | 0 | 10,001 |
| 100,000 | 3,140.204 | 437,792,776 | 0 | 100,001 |

시각은 DB의 `clock_timestamp()`로 같은 트랜잭션에서 재고, WAL은 insert LSN 차이다.
시간에는 측정용 임시 테이블 생성 뒤의 작은 부가 비용이 포함되며 커밋 왕복은 제외한다.
각 규모 1회이며 실제 동시 부하의 lock 대기 시간 상한을 측정한 것은 아니다.
잠금 자체는 별도 연결의 `pg_stat_activity.wait_event_type='Lock'`로 확인했다.
10만 행의 3배는 9.421초다. 예를 들어 T=10초라면 이 단일 로컬 값의 비율은 3.18배지만,
운영 5회 최대값과 여유 조건을 확인하기 전에는 앱 전환을 허용하지 않는다.
