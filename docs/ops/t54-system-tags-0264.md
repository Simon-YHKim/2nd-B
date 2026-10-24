# T54: 담기·비준 표식의 system_tags 전환

결정: Q-261013-40(밝기 변화 수용, 머지 전 QA 전후 측정), Q-261013-41(소스 포함,
서버 운영 GO). 구현 기준은 설계 2판이다. 2026-10-19 번호 확인 시 origin/main은
`b95fa4e0`, 열린 #2624가 0262, #2651이 0263을 사용하며 0264 중복은 없었다.

이 문서는 운영 실행자를 위한 순서다. 구현 세션은 운영 조회·쓰기·배포를 하지 않는다.
0218은 기록 칸만 만들었으므로 T54 완료 증거가 아니다.

## 적용 범위

- `sources.system_tags text[] NOT NULL DEFAULT ARRAY[]::text[]`와 설명을 추가한다.
- 0218과 같은 모양을 강제한다: 빈 배열 또는 하한 1의 1차원 배열, NULL 원소 없음,
  최대 16개, 원소별 `[A-Za-z0-9_.:-]` 1~64자, 대소문자와 무관하게 `domain:` 금지.
- `records.system_tags`의 타입·NOT NULL·빈 배열 기본값을 먼저 확인한다.
- 기존 소스 칼럼의 타입·NULL 허용·기본값 또는 동명 제약이 다르면 전체 적용을 실패시킨다.
  정상 재적용은 허용한다. 기존 제약을 덮어쓰지 않고 서버가 파싱한 식을 비교한다.
- `public.sources` 사용자 트리거 함수 본문에 `system_tags`가 있으면 사후 조건이 실패한다.
- 사용자 태그·본문·시각의 DML, 분류 트리거, RPC, 인덱스, RLS·권한 변경은 없다.
  `sources`는 기존 삭제 등록부의 `client_erasable` 대상이라 등록부 행은 추가하지 않는다.

배열 경합 조건은 설계 검토의 작은 대안 **(가)** 를 택한다. `system_tags`만 정확히
비교하며 사용자 `tags`를 PostgREST 필터 리터럴에 넣지 않는다. 따라서 쉼표·따옴표·역슬래시·
중괄호·`NULL`·한글·빈 문자열 사용자 태그가 비준을 계속 막는 경로를 만들지 않는다.
두 배열은 PATCH 한 번으로 갱신하며 오류·0행은 실패다. 읽기와 PATCH 사이 사용자 태그
편집이 덮일 수 있는 기존 경합은 이번에 해결하지 않는다. 시스템 표식은 읽은 배열과
달라지면 0행으로 실패한다. 앱의 모양 검증을 통과한 시스템 값만 인용한 리터럴을 쓴다.

## 서버를 먼저 적용한다

1. 코디네이터가 독립 구현 검토 PASS, 새 medium 0, CI 초록과 머지 전 QA 전후 측정을
   확인한다. QA 측정은 계정 토큰으로 자기 행을 읽는 전용 스크립트로 수행하고 운영 쓰기는
   하지 않는다. 토큰·본문·원시 태그를 PR에 붙이지 않는다.
2. 적용할 PR SHA와 `db/migrations/0264_sources_system_tags.sql` 바이트·해시를 고정한다.
   최신 결정과 번호 중복을 다시 확인한다. 선행 안전 큐와 `_sync`의 다른 적용 중 표시를
   확인한 뒤 Relay가 적용 중을 표시한다.
3. **Relay 블록은 이 파일 본문 전체를 한 트랜잭션으로 실행한다.** 파일 내부에는 최상위
   `BEGIN`·`COMMIT`이 없다. Relay의 바깥 트랜잭션이 `SET LOCAL lock_timeout = '10s'`와
   실패 시 전체 취소를 보장해야 한다. 본문 일부만 실행하거나 문장마다 commit하지 않는다.
   적용 원장도 같은 트랜잭션에 포함하고, 저장소의 운영 원장 절차에 맞는 단조 증가 시각
   버전을 정한다. CI의 네 자리 `0264` 버전을 운영 원장에 그대로 복사하지 않는다.
4. 운영 실행자는 아래 읽기 확인, 기존 정책·권한의 전후 대조, 사용자 태그 무변경,
   적용 원장을 확인한다. PostgREST가 새 소스 칼럼을 조회할 수 있는지도 확인한다.
   운영의 실제 PostgREST 검증은 로컬 SQL·모의 HTTP 시험과 구분해 기록한다.
   **앱 머지 전 읽기 전용 PostgREST 확인(QA 계정 토큰 · 쓰기 0)**: records 와 sources 각각에
   `GET /rest/v1/<표>?select=id&system_tags=eq.{}&limit=1` 과
   `GET /rest/v1/<표>?select=id&system_tags=eq.{"reasoning:ratified"}&limit=1` 을 보내 둘 다 200 이고
   22P02 가 없는지 본다. `/rest/v1/` OpenAPI 에 `sources.system_tags` 가 보이는지도 본다(안 보이면
   `NOTIFY pgrst, 'reload schema'` 뒤 다시). 비준 쓰기(PATCH)는 스키마 캐시로 본문 칼럼을 검사하므로
   `select=*` 조회 성공만으로는 확인이 되지 않는다.
   **앱이 0264 보다 먼저 나가면**: 소스 비준이 요청 전에 "Ratification requires a valid system_tags column" 으로
   멈추고(쓰기 0 · 기록 비준은 0218 칸으로 정상) 화면에 적용 실패가 보인다. 그래서 서버 먼저 · 앱 나중이다.
5. Relay가 완료 표시를 남기고 코디네이터가 운영 결과를 대조한다. 서버 확인 뒤 앱 PR을
   머지하고 8081·`app:parity`를 확인한다. 구현 담당은 머지·8081 조작을 하지 않는다.

적용 전후 확인에 사용할 읽기 전용 SQL:

```sql
BEGIN READ ONLY;
SELECT c.relname AS table_name, a.attname, a.atttypid::regtype AS type,
       a.attnotnull, pg_get_expr(d.adbin,d.adrelid) AS default_value,
       col_description(a.attrelid,a.attnum) AS description
FROM pg_attribute a
JOIN pg_class c ON c.oid=a.attrelid
LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE a.attrelid IN (to_regclass('public.records'),to_regclass('public.sources'))
  AND a.attname='system_tags' AND NOT a.attisdropped
ORDER BY c.relname;

SELECT conname, convalidated, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid='public.sources'::regclass
  AND conname IN ('sources_system_tags_shape','sources_system_tags_0264_expected');

SELECT count(*) AS forbidden_source_trigger_count
FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
WHERE t.tgrelid='public.sources'::regclass AND NOT t.tgisinternal
  AND position('system_tags' IN lower(p.prosrc))>0;

SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename='sources'
ORDER BY policyname;
SELECT relrowsecurity, relforcerowsecurity, relacl
FROM pg_class WHERE oid='public.sources'::regclass;
ROLLBACK;
```

사후 기대값: 두 칼럼 모두 `text[]`, NOT NULL, 빈 배열 기본값. 소스의 설명 존재.
`sources_system_tags_shape` 하나가 validated이며 임시 이름은 0개. 금지 트리거 0개.
정책·권한·RLS는 적용 전과 같다. 별도 운영 원장의 SHA·버전은 고정한 적용 블록과 맞아야 한다.

## 머지 전 QA 전후 측정

코디네이터가 기존 QA 세션의 `T54_QA_ACCESS_TOKEN`, `T54_SUPABASE_URL`,
`T54_SUPABASE_ANON_KEY`, `T54_QA_OWNER_ID`, 고정 ISO 시각 `T54_MEASUREMENT_NOW`를
프로세스 환경에 준비한 뒤 아래 명령을 실행한다. 토큰은 CLI 인수나 출력에 넣지 않는다.
도구가 `.env`를 읽거나 로그인하지 않는다. `--help`와 인자 없는 기본 실행은 통신하지 않는다.

```text
npx tsx scripts/measure-t54-system-tags.ts --help
npx tsx scripts/measure-t54-system-tags.ts --collect > <local-report.json>
```

선택값 `T54_PAGE_SIZE`는 기본 500, `T54_MAX_ROWS`는 표마다 기본 10000이다.
인증 GET으로 소유자를 확인한 뒤 자기 ID 조건의 GET만 보내고 본문 칼럼은 조회하지 않는다.
쓰기·모델 호출은 0이다. 출력은 영역별 정리 비율·등급·정리함 수 등 집계이며 원시 태그는
포함하지 않는다. 실제 로더의 첫 조회 상한 집합, 전량 페이지 조회, 위키의 기록 5000/소스
200 상한 집합을 나눠 보고하므로 전량 집계를 그대로 화면 수치라고 해석하지 않는다.

같은 메타데이터를 두 번 읽어 대조하며 120초 안에 끝나야 한다. 실패·불완전 페이지·소유자
불일치·읽는 도중 값 변경이면 종료코드 1이다. 순차 REST는 반복 가능한 읽기 트랜잭션이
아니라 `metadata.atomicDatabaseSnapshot=false`를 명시한다. 측정 중 QA 편집을 멈추고,
일치가 더 엄격히 필요한 경우 Relay가 반복 가능한 스냅샷으로 추가 확인한다.
같은 행과 고정 시각에 옛 규칙·새 규칙을 적용한 차이로 Q-40을 확인하고 결과를 PR에 연결한다.

## 복구와 기존 설치본

`rollback/0264_down.sql`은 만들지 않는다. 새 표식을 쓴 뒤 칼럼을 지우면 출처와 비준
근거를 잃고, `tags`에 되돌려 넣으면 사용자 꼬리표 노출이 다시 생긴다. 적용 중 실패는
트랜잭션 전체를 취소한다. 적용 뒤 복구는 칼럼과 데이터를 보존하고 호환 reader가 있는
수정판을 배포한다. 기존 0218 DOWN과 그 시험은 변경하지 않는다.

P6 예외: 비준의 두 칸 쓰기는 0218 이전 배치로 우회하지 않는다. **0218 DOWN이면 기록
비준이 멈춘다.** 새 앱이 시스템 칸으로 비준한 기록은 옛 설치본에서 정리함·추론 후보로
다시 나타날 수 있으므로 QA 설치본을 교체하기 전후 차이를 기록한다.

미확인 옛 행은 그대로 둔다. 사용자 태그 모양으로 자동 이행하거나 화면에서 낱말 목록을
숨기지 않는다. 옛 `memo`·`fourw`·`link`는 화면·검색과 정리함의 기존 판정에는 남지만
밝기 정리 신호에서는 제외된다. 원본 소스와 `wiki_pages`의 옛 사본을 정리하려면 각각
소유자가 확인한 ID·예상 배열·표식 목록과 별도 손이행 절차가 필요하다. Q-41의 서버 GO를
미확인 구행 재분류 승인으로 해석하지 않는다.

## 로컬·CI 증거

```text
node db/tests/sources_system_tags_contract.mjs <loopback-port> <local-user> t54_sources_test_ci
```

이 명령은 루프백과 `t54_sources_test*` 이름만 받는다. 이미 마이그레이션을 적용한
폐기 가능한 DB에서 실행한다. CI는 모든 번호 마이그레이션을 순서대로 적용한 뒤 별도 DB를
복제한다. 각 시험도 트랜잭션 끝에 rollback한다. 모양 거절·정상 한계·기존 행 보존·재적용·
기존 RLS·관리 소스 차단·충돌 원상 보존과 SQL 변이를 실행한다. 새 표를 만든 것이 아니므로
등록부는 기존 82개를 유지한다.

2026-10-19 로컬 결과: PostgreSQL 18의 전용 클러스터에서 실제 소유자 RLS와
0223·0239·0242·0251의 소스 트리거 4개를 사용한 계약 17개 통과, SQL 변이 9/9 실패. 16개 잘못된
배열·NULL 거절, 사용자 태그 특수문자 보존, 빈 배열·문자열 `NULL`의 SQL 배열 비교를
포함한다. 최초 빨강은 `sources.system_tags` 없는 선행 스키마에서 확인했다.

두 차례 CI 재생에서 시험 DB의 `sources` 권한, 이어서 기존 0223 트리거가 읽는 `users`
권한 부재가 드러났다. 첫 로컬 환경에서 빠진 트리거와 참조 테이블을 모두 갖춘 뒤 같은
ACL 상태로 재현했다. 각 시험의 롤백 트랜잭션 안에서 `sources` SELECT·UPDATE와
`users` SELECT만 준비한다. 두 권한 준비 제거 변이, 실제 나이 판정 경로의 가져오기
차단과 우회 변이, SAVEPOINT 복구 뒤 두 테이블의 원래 ACL 대조가 이를 고정한다.
마이그레이션의 운영 권한은 바꾸지 않는다. 권한 없는 로컬 DB에서 시험이 끝난 뒤에도
두 테이블 모두 `SELECT=false`, `UPDATE=false`, `RLS=true`임을 확인했다.

전체 번호 순서의 로컬 재생은 46개 성공 뒤 0047에서 `vector` 확장이 없어 중단했다.
확장을 가짜 타입으로 대체하지 않았고 전체 재생 통과로 보고하지 않는다. 전체 순서와
PostgreSQL 16 환경의 판정은 pgvector가 있는 PR CI에 남아 있다. 실제 PostgREST 호출,
QA 측정, 운영 적용·머지는 이 로컬 결과에 포함하지 않는다.

## Relay 블록 재현 (2026-10-24)

검토된 0264 본문은 변경하지 않았다. LF 기준 108줄·5,798바이트·md5
`455fdf6e2ef02ba68ee1e055e077cff3`이다. 새 생성기는 이 해시가 다르면 거절한다.

```text
npx tsx scripts/build-t54-relay-block.ts <새로운-로컬-산출물-폴더>
```

`coding-4e-0264-apply-block.sql`과 `prestate-query.sql`을 만든다. 기존 파일은
덮어쓰지 않는다. 운영 연결·Relay inbox 복사·실행은 하지 않는 로컬 생성기다.
블록 전체를 `execute_sql` 한 번으로 적용하며 `apply_migration`은 쓰지 않는다.
같은 트랜잭션에서 검토 본문과 원장 한 줄을 기록하고, 재실행은 거절한다.
기존 번호 파일 자체의 정상 재적용 허용과 Relay 래퍼의 중복 거절은 구분한다.

코디네이터가 별도 질의를 운영에서 읽기 전용으로 실행해 아래 기대값을 먼저 대조한다.
적용 전 값은 코디네이터의 **2026-10-24 운영 PostgreSQL 17.6 읽기 전용 실측**이다.
적용 후 값은 운영 sources 항목 33줄을 정확히 재현한 PostgreSQL 18.3 복제 DB에
변경 없는 0264를 적용해 계산했다. 운영의 적용 후 실측은 아직 아니다.
이후 불일치도 중단 사유이며 항목별 원인을 확인하기 전 기대값을 바꾸지 않는다.

| 대상 | 적용 전 md5 | 적용 후 md5 |
|---|---|---|
| sources 칼럼·제약·인덱스·RLS·정책·권한 | `cf5c155ce8bbae06de1e63a9560d7d00` | `507dd52cdcfb7685bb495d672a0683e9` |
| sources 사용자 트리거·함수 본문·권한 | `d4293a68fb609923d404e4a1bf234cc5` | 동일 |
| records.system_tags 칼럼·제약 | `db9032428b9c0e618c947a22a68ca898` | 동일 |

### 운영 지문 불일치의 원인과 fixture

원문은 코디네이터가 제공한 `b0264-blocks/prod-prestate-items-261024.txt`다.
0263이 없는 기존 로컬 스냅샷에서 같은 질의의 항목을 정렬해 줄별로 대조했다.
**1~32줄이 같고 33번째 `table` 항목의 ACL만 다르다.** 열 기본값 표기·제약·인덱스·
RLS·정책·소유자는 같으며 트리거와 records 표식 지문도 같다.

| 33번째 항목의 마지막 값 | 내용 |
|---|---|
| 기존 로컬 | `null` (`pg_class.relacl`) |
| 운영 | `["anon=arwdDxtm/postgres", "authenticated=arwdDxtm/postgres", "postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres"]` |

로컬 부트스트랩은 함수 기본 권한과 일부 테이블 권한만 준비한다
(`.github/workflows/supabase-dry-run.yml`). sources를 만든 0022에도 테이블 GRANT가
없어서 해당 재생에는 운영의 명시적 테이블 권한이 빠졌다. `null`은 모든 역할에
권한이 없다는 뜻이 아니라 PostgreSQL 기본 권한을 뜻한다. `m`은 PG17에도 있는
MAINTAIN이다([PostgreSQL 17 권한 문서](https://www.postgresql.org/docs/17/ddl-priv.html)).
따라서 이번 불일치는 PG18의 NOT NULL 카탈로그 차이나 기본값 출력 차이가 아니다.

운영 ACL은 [Supabase 초기 스키마의 테이블 기본 권한](https://github.com/supabase/postgres/blob/develop/migrations/db/init-scripts/00000000000000-initial-schema.sql)과
같은 형태다. 다만 그 ACL이 실제로 언제·어떤 경로로 부여됐는지는 제공된 카탈로그로
확인할 수 없다. 기대값의 근거는 일반적인 기본 설정이 아닌 **이 운영의 실측 33줄**이다.

로컬의 새 복제 DB에만 다음 fixture를 적용하자 33줄 전체와 운영 md5가 일치했다.
운영 블록에는 이 GRANT를 넣지 않았고 지문 질의에서 권한 등 어떤 항목도 빼지 않았다.

```sql
-- Local disposable replica only. Not part of the Relay block or migration.
GRANT ALL PRIVILEGES ON TABLE public.sources TO anon, authenticated, service_role;
```

`scripts/__tests__/fixtures/t54-sources-production-fingerprint.json`은 운영 원문 33개와
0264가 추가하는 두 항목(칼럼·제약)의 PostgreSQL JSONB 텍스트를 보존한다.
정렬 후 개행으로 연결하되 끝 개행 없이 md5를 계산한다. 적용 후 항목은 35개이며
기존 33개 변경은 0이다. 이전 vanilla 재생값 `7f1153faff057989785dd7bc3c190ac4`와
`2ec5cd68ac4f0bbb9d16dc7943b078a5`는 이제 운영 가드의 기대값으로 사용하지 않는다.
기존 CI 공통 부트스트랩의 권한은 바꾸지 않는다.

제약 지문의 `contype <> 'n'`은 PG18에 추가된 NOT NULL 행만 제외한다.
NOT NULL 자체는 `pg_attribute.attnotnull`로 검사한다. 별도 질의와 블록의 지문 식은 같다.
선행 원장은 0022·0218·0223·0239·0242·0251을 확인한다. 숫자 version과 접두사 없는 name,
시각 version과 번호 포함 name 두 형식을 받는다. `created_by`는 기존 Relay 블록과 같다.
기존 sources 행 전체에서 새 칼럼만 뺀 지문과 새 표식의 빈 배열도 검사한다.

**0264는 0263과 독립이다.** 0263은 users·records의 임베딩 동의 트리거 네 개를 바꾸고,
sources와 records.system_tags 계약은 바꾸지 않는다. 0264는 그 네 함수를 호출하지 않는다.
로컬에서 0263 전후 지문 세 개가 같았고 두 순서 모두 블록이 성공했다.

이번 재생은 0001~0262의 번호 SQL 237개(0225·0226 포함, 저장소에 없는 0262는 검토된
Relay 1518 블록의 본문 md5 대조 후 추출)를 적용했다. 0263~0269는 기본 재생에서 제외했다.
로컬 pgvector 대역·HNSW/IVFFlat 생략·pg_cron opt-out을 사용했다. 이 차이는 지문 대상
객체를 바꾸지 않지만 실제 확장 기능과 운영의 객체·ACL 일치까지 입증하지는 않는다.

초기 로컬 재생에서는 Relay 실행 검사 31/31, 동시 실행 2개 중 성공 1·중복 거절 1, 기존 SQL 계약 17/17과
SQL 변이 9/9를 확인했다. 선행 누락 여섯 가지·본문 변조·스키마/권한/트리거 변경·사후
불일치는 모두 원장과 기존 상태를 남기지 않고 거절됐다. 합성 sources 2행을 포함한
public 스키마·권한·데이터는 번호 파일 직접 적용과 같았다. 이번 운영 ACL 재현 결과는
로컬 산출물 `b0264-pg/fingerprint-fix/`에 별도로 기록한다. 실제 QA·PostgREST·Relay 적용,
그 뒤 #2658 머지·웹 게시·8081 확인은 코디네이터에게 남긴다.

운영 ACL 재현 후 검사: Relay 39/39, 동시 성공 1·중복 거절 1·원장 1행, SQL 계약 17/17,
SQL 변이 9/9 차단. 이전 블록은 운영 모양에서 거절되고 새 블록은 vanilla 모양에서 거절된다.
SELECT·MAINTAIN 회수, PUBLIC 권한 추가, 적용 후 ACL 변경도 전체 rollback을 확인했다.
관련 Jest 21 suites·321 tests, 생성기 변이 12/12 차단(옛 전후 기대값 복원·ACL 검사 제거 포함),
tsc·변경 파일 ESLint·금지어·C7·긴 줄표 검사가 통과했다. 로컬 PG는 stop=0·status=3,
55574 포트 닫힘을 확인했다. 전체 verify는 최신 PR CI가 판정한다.
