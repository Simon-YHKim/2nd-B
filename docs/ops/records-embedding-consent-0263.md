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

## 구현 검토 1회차 후 보강: 앱 먼저, 서버 나중

지적 1(high)은 **(나) JSON 표식 CAS**로 보강한다. 별도 RPC·열·권한 계약을 추가하지 않아
기존 JSON 저장 경로를 유지하고, 서버 적용 전에도 앱을 게시할 수 있는 쪽이다.
시각 비교는 기기 시계와 지연 요청 때문에 쓰지 않는다. 저장된 서버 판본
`records_embedding_revision`의 정확한 다음 정수만 `records_embedding_enable_revision`으로 받는다.

- 화면의 명시적인 켜기만 `savePrivacyPrefs(..., { enableRecordsEmbedding: true })`를 쓴다.
  raw JSON을 엄격히 읽고 판본+1을 보낸다. 읽기 실패·0행·서버가 OFF로 반환하면 실패한다.
- 서버 BEFORE 트리거는 클라이언트가 보낸 저장 판본을 무시하고, 켜기 표식을 소비해 지운다.
  일반 전체 객체 UPDATE는 ON 유지·철회만 가능하다. OFF→ON에는 유효한 표식이 필요하다.
  철회와 OFF→OFF 저장도 판본을 올린다. 따라서 이미 준비된 켜기 요청과 오래된 전체 true는
  철회 뒤 동의를 되살리지 못한다. CAS 충돌은 자동 재시도하지 않고 기존 실패 UI로 돌아간다.
- 기존 ON은 유지한다. INSERT의 표식 없는 true와 연령 조건을 벗어난 true는 OFF로 낮춘다.
  숫자 판본은 JS 안전 정수 범위다. 잘못되거나 소진된 기존 판본은 아래 복구 절차를 따른다.
  새 데이터 표·열은 없다.

**적용 순서:** 독립 검토·CI 통과 → 이 앱 변경 머지 → 새 웹 앱 게시와 실제 번들 확인 →
Relay의 0263 운영 적용 → 잔여 정리/0 확인. 앱 머지·게시와 운영 적용은 구현 담당이 하지 않는다.
기존 DB는 표식을 사용하지 않는 JSON 키로 저장하므로 앱을 먼저 게시해도 켜기가 동작한다.
반대로 서버를 먼저 적용하면 지금 웹 앱의 표식 없는 OFF→ON은
`40001 / records_embedding_consent_conflict`로 실패한다. 서버 OFF·로컬 OFF·기존 원장을 유지한다.
옛 모바일·캐시된 웹은 서버 적용 후 새로 켜지 못하며 업데이트/새로고침이 필요하다.
ON 유지와 철회는 계속 가능하다. **직접 삭제를 없애는 앱 전환은 아래 §4의 별도 후속**이다.

## 구현 3회차: 늦은 NULL 삭제와 잘못된 판본

구현 2회차 판정은 BLOCK(high 0, medium 2)이었다. **ON 상태에서 완전한 OLD 쌍을
직접 두 NULL로 만드는 정상 경로는 없다.** 반쪽 정리와 구분해야 한다는 판정을 수용한다.
`zz_records_embedding_delete_guard`는 같은 소유자의 완전한 쌍→두 NULL 전이만 받는다.
사용자를 ID로 `FOR SHARE`한 뒤 현재 허용 상태가 ON이면 OLD 쌍을 조용히 유지한다.
OFF 상태의 철회 삭제, OLD 반쪽 정리, 행 자체 DELETE는 계속 허용한다.
별도 우회 표식·RPC·트랜잭션 설정은 필요하지 않으므로 추가하지 않았다.

삭제 가드는 쓰기 가드보다 먼저 실행된다(트리거 이름 순서). 쓰기 가드가 반쪽 후보나
소유자 변경을 이유로 만든 NULL은 다시 살리지 않는다. 소유자가 바뀌며 명시적 NULL을
보낸 경우도 삭제 가드에서 제외한다. 순서를 뒤집는 변이는 반쪽 정리 시험에서 실패한다.
완전한 쌍 삭제도 READ COMMITTED만 허용한다. 더 강한 격리 수준의 옛 snapshot을 읽어
새 동의 상태를 놓치지 않도록 충돌로 돌린다.

| 조사한 경로 | 코드 근거 | 확인한 동작 |
|---|---|---|
| ON 상태의 반쪽 데이터 정리 | `db/ops/records_embedding_cleanup_batch.sql:55`, `:67`, `:74`, `:76` | 현재 동의가 ON이어도 vector/model 한쪽만 있으면 두 열을 비움. 정상 경로이며 실제 SQL 시험으로 고정 |
| 쓰기 중 반쪽·소유자 교체 | `db/migrations/0263_records_embedding_consent_guard.sql:154`, `:159` | non-NULL 후보를 서버가 두 NULL로 바꿈. 삭제 가드가 먼저 실행되므로 이 NULL은 유지 |
| `recordEmbeddingHeld` | `src/lib/records/records-embeddings.ts:85`, `:154`, `:261` | 계산/백필 제외만 함. 기존 벡터 삭제는 아님 |
| 본문 수정 | `src/lib/records/create.ts:639` | `update(patch)`만 실행. 벡터 비우기·재계산 경로 없음 |
| 모델 교체 | `db/migrations/0068_reset_wiki_embeddings.sql:29`, `0142_embedding_provenance.sql:81` | 0068은 wiki만 비움. 0142는 records 모델명을 채움. 현재 records의 모델 교체용 NULL 경로 없음 |
| 화면 철회·백필 종료 | `DeepSpaceDesignScreens.tsx:1038`, `records-embeddings.ts:398` | OFF 저장/조회 뒤 호출. ON에서 쓰는 정상 기능이 아니라 지연되면 문제의 손실을 만드는 경로 |
| 단건·여러 기록 삭제 | `src/lib/records/create.ts:660`, `src/lib/records/delete-bulk.ts:22`, `:39`, `:55`, `:71` | 행 자체 DELETE. UPDATE 가드와 무관하며 동의 ON에서도 계속 삭제 |
| 서버 함수·정리 SQL | `db/migrations/0263_records_embedding_consent_guard.sql:136`; `db/ops/records_embedding_cleanup_batch.sql:76` | 철회는 현재 OFF에서 삭제. 정리 배치는 OFF 또는 OLD 반쪽만 선택 |
| Edge 임베딩 | `supabase/functions/openai-proxy/index.ts:664`, `supabase/functions/gemini-proxy/index.ts:636` | 모델 응답을 반환. records의 벡터를 NULL로 갱신하는 Edge 경로 없음 |

검색 범위: `src`, `db`, `scripts`, `supabase/functions`의 embedding 쓰기·NULL·삭제 호출.
`recordEmbeddingHeld`와 기록 생성 시 위기 보류(`create.ts:463`)는 기존 벡터 삭제가 아니라
새 생성 중단이다. 본문 수정 후 기존 벡터 무효화·내구성 있는 ai_hold는 기존 별도 범위다.
이번 가드는 기존 위기 보류 경로를 변경하지 않는다. 향후 ON 중 명시적인 무효화 기능을
추가하면 전체 철회용 직접 NULL과 구별하는 서버 계약을 함께 설계해야 한다.

판본은 **JSON 타입→정수 문자열 모양→범위** 순서의 중첩 IF를 통과한 뒤에만 bigint로
캐스트한다. 키 부재만 기존 판본 0이고, 문자열·소수·음수·JSON null·객체·배열·boolean·
초과/소진 판본은 서버 판본 1과 OFF로 정규화한다. 같은 요청의 켜기 표식은 버리고
두 열을 같은 트랜잭션에서 삭제한다. 숫자 1을 재사용하면 과거 켜기 값 2도 다시 맞을 수
있으므로 서버 UUID `records_embedding_recovery`를 새로 발급한다. 명시적 켜기는 엄격한
읽기에서 받은 값을 `records_embedding_enable_recovery`로 보내며, 서버가 현재 토큰과
다음 판본을 함께 비교한다. 다음 읽기 뒤 새 CAS(2+새 토큰)로만 켤 수 있다. 토큰은 일반
전체 객체 저장으로 덮거나 지울 수 없고, 켜기 표식은 소비해 없앤다. 기존 토큰 자체가
잘못된 경우도 철회·정규화한다. 서버 복구가 없었던 사용자의 기존 CAS 계약은 유지한다.
이 복구는 이름만 바꾸는 UPDATE에도 발생할 수 있어 AFTER는 모든 사용자 UPDATE의
최종 행을 확인한다. 잘못된 판본 때문에 철회 자체가 롤백되는 경로를 없앴다.

## 구현 4회차: 옛 앱 오류와 설치 검사

구현 3회차 판정의 medium 2건·low 1건만 보강했다.

| 지적 | 변경 | 회귀 근거 |
|---|---|---|
| 표식 없는 OFF→ON의 성공 오인 | UPDATE의 해당 전이를 기존 CAS와 같은 SQLSTATE `40001`, 메시지 키 `records_embedding_consent_conflict`로 거절 | 실제 authenticated SQL에서 오류 코드·키·전체 OFF JSON·NULL 쌍 유지. Jest는 main과 같은 무표식 저장 경로에서 실패 전파·화면에 넘길 값과 로컬 동의 OFF·grant 미기록 확인. 새 CAS 켜기 성공 유지 |
| 정리 전 두 트리거만 검사 | 네 트리거의 이름·함수·이벤트·대상 열·WHEN·활성을 설치 검사와 같게 검사 | 각 트리거 × 비활성·이름·함수·이벤트·WHEN·대상 열 6종 = 24건 모두 정리 전 실패. Jest로 설치/정리 조건 일치와 사용자 선택 전 검사 위치 고정 |
| 클라이언트 열 권한 누락 | `users.privacy_prefs SELECT`, `records.user_id SELECT`, `records.embedding/embedding_model UPDATE` 검사 | 테이블 권한을 나머지 열 권한으로 바꿔 하나씩만 제거한 4건 모두 설치 실패·롤백 |

표식 없는 OFF→ON 검사는 판본 복구보다 먼저 실행한다. 오류를 성공으로 오인하지 않게
해당 요청 전체를 거절하며, 기존 ON 유지·철회·표식 있는 켜기·잘못된 판본의 철회 복구는 유지한다.
앱 소스·`prefs.ts`·문자열·로케일 키는 바꾸지 않았다. DPIA 인용 이동은 없다.

## 적용 전 조건

- 대표님 확인 후 Relay만 운영 적용한다. `_sync/TO-CLI.md`에 "적용 중"과 시각을 표시한다.
- 정확한 PR 커밋·0263 정규화 SHA256·기존 함수/트리거/권한을 확인한다. 번호 지문은
  `scripts/__tests__/supabase-security-drafts.test.ts`에 있다. 운영 판본 매핑을 별도 기록한다.
- `0262`(#2624) 및 다른 대기 마이그레이션을 포괄 `db push`로 함께 적용하지 않는다.
  `0263`은 0262의 새 문구 판본에 의존하지 않는다. 설치가 요구하는 선행 스키마·권한은
  설치 내부 검사에서 확인하며, 맞지 않으면 검사 자체를 약화하지 않는다.
- 설치 검사가 확인하는 `authenticated` 의 열 권한은 아홉 개다(5회차 기준 · `0263` 의 설치 검증 블록): `users.privacy_prefs` SELECT · UPDATE, `users.id` SELECT, `records.id` · `records.user_id` · `records.embedding` · `records.embedding_model` SELECT, `records.embedding` · `records.embedding_model` UPDATE. 하나라도 없으면 설치가 실패하고 롤백된다. 위 「구현 4회차」 표의 넷은 그때의 기록이다.
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
               'public.clear_record_embeddings_on_privacy_change()'::regprocedure,
               'public.guard_records_embedding_consent()'::regprocedure,
               'public.guard_record_embedding_delete()'::regprocedure);
SELECT tgrelid::regclass, tgname, tgenabled, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgname IN ('zz_records_embedding_write_guard','zz_records_embedding_delete_guard','zz_records_embedding_consent_changed','zz_records_embedding_consent_cas');
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

§2의 `total_to_clear=0` 및 각 잔여 분류 0, 네 트리거 활성·함수 해시·권한 일치를
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
6. 이번 PR은 켜기의 정확히 한 행·실제 ON 응답을 검사한다. 일반 저장/철회의 0행 판정은
   별도 앱 전환 PR에서 시험한다. 다른 선택의 전체 객체 마지막 쓰기 우선은 그대로다.

## 호환성과 영구 복구 계약

| 요청/조합 | 결과 |
|---|---|
| 표식 앱 + 기존 DB | 켜기 가능. 표식은 사용하지 않는 JSON 키로 저장. 기존 삭제 경합은 남음 |
| 표식 앱 + 0263, 정리 전 | CAS 켜기·원자적 철회 적용. 과거 잔여 전체 보장은 미완료 |
| 표식 없는 옛 앱 + 0263 | ON 유지·철회 가능. 새 OFF→ON은 거부되므로 업데이트 필요 |
| 새 앱(직접 삭제 없음) + 기존 DB | 허용하지 않는 조합 |
| 옛 앱, 모델 없이 새 벡터 쓰기 | 반쪽이면 두 열 NULL. 원문 저장은 유지 |
| 옛 앱, 기존 모델 위에 embedding만 갱신 | 허용 상태라면 기존 모델을 유지. provenance가 낡을 수 있음 |
| OFF 뒤 오래된 true 전체 객체/낡은 켜기 표식 | 동의 복원 불가. 유효한 새 표식만 켜기 가능 |
| OFF→ON 뒤 오래된 NULL 요청 | 현재 ON의 완전한 쌍은 유지. 반쪽 정리는 계속 가능 |
| OFF→ON 뒤 오래된 false 전체 객체 | 철회 의사를 서버에서 구별하지 않음. OFF로 저장하고 삭제하는 기존 동작 유지 |
| 잘못된 저장 판본에서 철회·다른 UPDATE | 서버 판본 1·새 복구 토큰·OFF로 복구하고 삭제. 표식 없는 OFF→ON은 위 충돌 오류로 거절 |

R2-02는 수용한 한계다. 행 이미지로 열 생략과 동일 모델명 재전송을 구별할 수 없어 모델을
추측하거나 비우지 않는다. 정확한 provenance가 필요하면 별도 RPC/세대 계약으로 전환한다.

**네 트리거를 삭제·비활성화하는 운영 DOWN을
영구 금지한다.** 앱을 되돌려도 이미 설치된 모바일 클라이언트는 남는다.
`db/README.md`와 번호 지문 등록부는 모든 마이그레이션의 DOWN 파일을 요구하지 않는다.
0263 DOWN은 제거했다. 구조 시험 DROP은 실행기 안에만 두고 DB 이름을
`embed_consent_test_*`로 검사한다. 로컬 `postgres` DB에서는 실제로 거절되는지 시험한다.
호출자 트랜잭션에서 DROP/재설치를 함께 하며, ROLLBACK이 두 작업을 되돌리는 것과
마이그레이션 원장·다른 트리거가 그대로인 것도 확인한다. 지운 데이터는 복원하지 않는다.
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
-- 네 트리거를 유지하고, 원래 0263의 소유자/권한/활성 검사를 다시 수행한다.
```

## 로컬 검증 기록

2026-10-19 구현 4회차: 전체 번호 스키마 psql 재생, SQL 계약·경합·성능
**26개 실행 묶음**, 관련 Jest **11 suites / 192 tests** 통과.
변이 **SQL 12/12 + 앱 2/2 = 14/14** 검출. 조용한 OFF 복원·오류 코드/키 교체·
네 권한 검사 누락·기존 두 트리거 검사 복원·네 트리거 검사 개별 누락·앱 오류 무시/
오류 전 로컬 ON 반영을 각각 실행했다. 정상 파일 바이트를 복원했다.
tsc·변경 파일 ESLint·금지어·C7(4,433키·40 namespaces·5언어)·긴 줄표·DEFINER 검사 종료 0.
원자료: `E:/Coding Infra/reports/devlab-261010/s2-astra/embed-r4-verification/`.
같은 2 CPU·768 MiB PG16/pgvector·768차원/HNSW 환경, 규모별 1회 측정이다.

| 대상 행 | 철회 SQL 시간(ms) | WAL bytes | 쓰기 검사 호출 | 삭제 검사 호출 | 기존 updated_at 호출 |
|---:|---:|---:|---:|---:|---:|
| 0 | 5.549 | 248 | 0 | 0 | 1 |
| 1,000 | 29.095 | 999,064 | 0 | 1,000 | 1,001 |
| 10,000 | 240.265 | 9,811,368 | 0 | 10,000 | 10,001 |
| 100,000 | 3,704.376 | 438,990,112 | 0 | 100,000 | 100,001 |

잔여 모두 0. DB 시계의 SQL 시간이며 커밋 왕복·운영 분포·동시 부하 상한이 아니다.
과거 회차와 개선율을 비교하지 않는다. 운영 5회 측정·독립 검토·CI는 별도 조건이다.

### 이전 3회차 기록

2026-10-19 구현 3회차: SQL 계약·경합·성능 **18개 실행 묶음** 통과.
번호 마이그레이션 전체 psql 재생 후 최종 0263 재설치·실제 역할·경합·성능을 확인했다.
관련 Jest **11 suites / 190 tests**, 이번 보강 변이 **SQL 16/16 + 앱 3/3 = 19/19** 검출.
변이 원복 후 정상본 재검증 통과. 과거 회차 수치를 더하지 않는다. 소유자 조건만 제거한
변이 1개는 뒤쪽 쓰기 가드가 같은 결과를 보장하는 동등 변이여서 검출 분모에서 제외했다.
판본 문자열·소수·초과값을 포함한 10종, 복구 토큰 이상 4종, 숫자 CAS 재충돌과 이전 토큰
재사용, 일반 필드 UPDATE의 복구, 반쪽·소유자 변경·단건 DELETE를 실제 SQL로 검사했다.
`prefs.ts`는 변경하지 않았고 DPIA 앵커 시험도 통과했다.
tsc·변경 파일 ESLint·금지어·C7(4,433키·40 namespaces·5언어)·긴 줄표·제약·DEFINER 검사 종료 0.
원자료: `E:/Coding Infra/reports/devlab-261010/s2-astra/embed-r3-verification/`.
환경: Windows Docker의 기존 캐시 이미지,
CI와 같은 PG16·pgvector digest, 컨테이너 2 CPU·768 MiB, 전체 번호 마이그레이션 psql 재생.
CI는 고정된 Supabase CLI로 별도 재생한다. 768차원 벡터·HNSW·기존 트리거를 유지한다.
로컬은 synthetic fixture이며 운영 분포·동시 부하·운영 지연의 증거가 아니다.

| 대상 행 | 철회 SQL 시간(ms) | WAL bytes | 쓰기 검사 호출 | 삭제 검사 호출 | 기존 updated_at 호출 |
|---:|---:|---:|---:|---:|---:|
| 0 | 5.818 | 248 | 0 | 0 | 1 |
| 1,000 | 32.344 | 993,760 | 0 | 1,000 | 1,001 |
| 10,000 | 266.846 | 9,761,800 | 0 | 10,000 | 10,001 |
| 100,000 | 4,201.240 | 433,161,568 | 0 | 100,000 | 100,001 |

시각은 DB의 `clock_timestamp()`로 같은 트랜잭션에서 재고, WAL은 insert LSN 차이다.
시간에는 측정용 임시 테이블 생성 뒤의 작은 부가 비용이 포함되며 커밋 왕복은 제외한다.
각 규모 1회이며 실제 동시 부하의 lock 대기 시간 상한을 측정한 것은 아니다.
잠금 자체는 별도 연결의 `pg_stat_activity.wait_event_type='Lock'`로 확인했다.
모든 규모의 잔여는 0이다. 삭제 가드의 행별 잠금/재확인 비용도 이번 수치에 포함했다.
복구 토큰 보강 전 중간 측정은 3,983.972ms였다. 최종 측정과 개선율을 비교하지 않는다.
운영 5회 최대값과 여유 조건을 확인하기 전에는 직접 삭제를 없애는 앱 전환을 허용하지 않는다.
