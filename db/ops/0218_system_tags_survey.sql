-- db/ops/0218_system_tags_survey.sql — 0218 손 이행 전후의 읽기 전용 집계.
--
-- ⚠ 운영 적용 단계에서만 돌린다(설계 docs/design/system-tags-261006.md 6.2 의 2 · 6단계).
--   저장소 CI 는 이 파일을 운영에 돌리지 않는다. 코디네이터가 묶음 GO 아래에서 돌린다.
-- ⚠ 출력에는 행 번호 · 계정 · 이메일 · 태그가 나온다. 출력은 저장소 밖 보고서 폴더에만 둔다.
--   DECISIONS 에는 개수와 목록 해시만 적는다.
--
-- 언제.
--   2단계 (0218 적용 직전): 후보 행 수 · 계정별 행 수를 보고, 계정 주인(Simon)이 QA ·
--     제작자 계정인지 확인한다. 확인된 계정의 행만 손 이행 목록에 넣는다. 실사용자 행은
--     목록에 넣지 않고 그대로 둔다(Q2). entry-ui:* 도 옮길 표식이다(Q3).
--   6단계 (웹 게시 + QA APK 교체 뒤): 같은 집계를 다시 본다. 0218 적용 뒤에 만들어졌는데
--     표식이 아직 tags 에 있는 행 = 옛 판이 쓴 행이다. 주인 확인 뒤 손 이행을 한 번 더 하거나
--     그대로 둔다.
--
-- 읽기만 한다. 첫 문장이 이 트랜잭션을 읽기 전용으로 만든다. 실행:
--   psql -X -v ON_ERROR_STOP=1 --single-transaction -f db/ops/0218_system_tags_survey.sql
-- 0218 적용 전 · 뒤 어느 쪽에서도 돈다. system_tags 칸을 이름으로 부르지 않고 행을 jsonb 로
-- 바꿔 읽는다(칸이 없으면 빈 배열).
--
-- 무엇을 후보로 보나. tags 에 두 작성자의 표식 문자열이 하나라도 있는 note · audit_response
-- 행이다. 이 집계는 모양으로 출처를 정하지 않는다(설계 P3). "제안 표식" 칸은 그 행의 tags 에서
-- 작성자 표식 문자열을 처음 나온 순서대로 고른 것일 뿐이고, 옮길지는 사람이 행마다 정한다.

SET TRANSACTION READ ONLY;
-- records 는 FORCE ROW LEVEL SECURITY(0178)다. 우회하지 못하는 역할로 돌리면 아래 질의가
-- 0행을 보고 끝나는 대신 오류가 난다.
SET LOCAL row_security = off;

-- 1. 계정별 (맨 위 user_id 가 빈 줄이 합계). 이 표로 QA · 제작자 계정인지 정한다.
WITH markers(kind, marker) AS (
  VALUES
    ('note', 'first_light'), ('note', 'first_light:affirm'), ('note', 'first_light:soft'),
    ('audit_response', 'interview'), ('audit_response', 'recall'), ('audit_response', 'screener'),
    ('audit_response', 'entry-ui:ko'), ('audit_response', 'entry-ui:en')
), candidates AS (
  SELECT r.id, r.user_id, r.kind::text AS kind, r.created_at, r.tags,
         COALESCE(
           (SELECT array_agg(s.x ORDER BY s.o)
              FROM jsonb_array_elements_text(to_jsonb(r) -> 'system_tags') WITH ORDINALITY AS s(x, o)),
           ARRAY[]::text[]
         ) AS system_tags,
         (to_jsonb(r) ? 'system_tags') AS column_present
    FROM public.records AS r
   WHERE r.kind::text IN ('note', 'audit_response')
     AND r.tags && ARRAY(SELECT m.marker FROM markers AS m)
)
SELECT c.user_id,
       u.email,
       u.created_at AS account_created_at,
       count(*) AS rows,
       count(*) FILTER (WHERE c.kind = 'note') AS ttfv_shaped,
       count(*) FILTER (WHERE c.kind = 'audit_response') AS interview_shaped,
       count(*) FILTER (WHERE cardinality(c.system_tags) > 0) AS already_have_system_tags,
       bool_and(c.column_present) AS column_present,
       min(c.created_at) AS first_row_at,
       max(c.created_at) AS last_row_at
  FROM candidates AS c
  LEFT JOIN public.users AS u ON u.id = c.user_id
 GROUP BY ROLLUP ((c.user_id, u.email, u.created_at))
 ORDER BY c.user_id NULLS FIRST;

-- 2. 행별. 확인된 계정의 행만 골라 손 이행 목록 파일(저장소 밖)에 옮긴다. 목록 한 줄 =
--    (id, user_id, 지금 tags, 옮길 표식). 옮길 표식은 proposed_markers 를 보고 사람이 정한다.
WITH markers(kind, marker) AS (
  VALUES
    ('note', 'first_light'), ('note', 'first_light:affirm'), ('note', 'first_light:soft'),
    ('audit_response', 'interview'), ('audit_response', 'recall'), ('audit_response', 'screener'),
    ('audit_response', 'entry-ui:ko'), ('audit_response', 'entry-ui:en')
), candidates AS (
  SELECT r.id, r.user_id, r.kind::text AS kind, r.created_at, r.tags,
         COALESCE(
           (SELECT array_agg(s.x ORDER BY s.o)
              FROM jsonb_array_elements_text(to_jsonb(r) -> 'system_tags') WITH ORDINALITY AS s(x, o)),
           ARRAY[]::text[]
         ) AS system_tags,
         (to_jsonb(r) ? 'system_tags') AS column_present
    FROM public.records AS r
   WHERE r.kind::text IN ('note', 'audit_response')
     AND r.tags && ARRAY(SELECT m.marker FROM markers AS m)
)
SELECT c.user_id, c.id, c.kind, c.created_at, c.tags, c.system_tags,
       ARRAY(
         SELECT f.t
           FROM (SELECT u.t, min(u.o) AS o
                   FROM unnest(c.tags) WITH ORDINALITY AS u(t, o)
                  WHERE (c.kind, u.t) IN (SELECT m.kind, m.marker FROM markers AS m)
                  GROUP BY u.t) AS f
          ORDER BY f.o
       ) AS proposed_markers
  FROM candidates AS c
 ORDER BY c.user_id, c.created_at, c.id;
