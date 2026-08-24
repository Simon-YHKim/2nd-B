-- 0145: 꺼내기 채점 원장 (resurface_ledger) — 개인화의 선행 작업.
--
-- ── 왜 새 테이블인가 (실측 2026-08-25) ──────────────────────────────────────
--
-- 꺼내기 슬롯(/digest 의 planResurface)은 live 지만 규칙이 전원 동일하다.
-- 사람별 감쇠·순서를 데이터에서 배우려면 채점(적중/빗나감/방치)이 필요한데,
-- 지금은 셋 다 관측이 안 된다:
--
--   승인  wiki_links.relation_type='ratified' 로 남긴 남는데 "언제, 몇 번째
--         노출에서" 가 없다
--   거절  rejectInferredLink 가 행을 DELETE 한다 — 흔적 0
--   노출  plan.shown 이 클라이언트 메모리에만 있다 — 무시(보고도 안 누름)를
--         정의할 방법 자체가 없다
--
-- 게다가 wiki_links 의 PK 가 (from_page, to_page) 라 거절 후 재추론되면 같은
-- 키로 행이 다시 생긴다 — "몇 번째 재제안인가" 는 그 테이블로 구조적으로 표현
-- 불가. 그래서 이벤트 원장이 필요하다.
--
-- ── 설계 규율 ────────────────────────────────────────────────────────────────
--
-- * append-only: INSERT + SELECT 만. 이벤트는 정정하지 않는다 — 잘못 보였으면
--   그 사실도 데이터다. (interview_coverage 는 카운터라 UPDATE 가 필요했지만
--   원장은 아니다.)
-- * wiki_links 로 FK 를 걸지 않는다 — 거절이 원본 행을 지우므로 FK 는 그
--   순간 깨진다. 페이지 uuid 쌍을 값으로 복사한다.
-- * '무시' 는 이벤트가 아니다 — (shown 이후 판정 없음) 으로 파생한다. 관측
--   불가능한 것을 쓰는 척 하지 않는다(밝기 정직성과 같은 규율).
-- * RLS 식은 (select auth.uid()) — 0144 가 고친 initplan WARN 을 새 테이블이
--   처음부터 안 만든다.

BEGIN;

CREATE TABLE public.resurface_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_page uuid NOT NULL,
  to_page uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('shown', 'ratified', 'rejected')),
  -- 노출 순위 (0 = 맨 위). shown 이벤트에만 의미가 있다.
  shown_rank integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.resurface_ledger IS
  '꺼내기(/digest) 노출과 판정의 append-only 이벤트 원장. 무시는 파생값(shown 이후 무판정). wiki_links FK 없음 - 거절이 원본을 지우기 때문.';

CREATE INDEX resurface_ledger_user_pair_idx
  ON public.resurface_ledger (user_id, from_page, to_page, created_at);

ALTER TABLE public.resurface_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY resurface_ledger_select_own ON public.resurface_ledger
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY resurface_ledger_insert_own ON public.resurface_ledger
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- GRANT 블록은 파일 끝에 모은다 (check:definer-grants Rule A 거짓양성 회피).
-- default privileges 가 미리 준 것들을 명시적으로 걷는다 — REVOKE FROM public
-- 만으로는 부족하다는 실측(2026-08-21)이 있다.
REVOKE ALL ON public.resurface_ledger FROM public;
REVOKE ALL ON public.resurface_ledger FROM anon;
GRANT SELECT, INSERT ON public.resurface_ledger TO authenticated;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.resurface_ledger FROM authenticated;

COMMIT;
