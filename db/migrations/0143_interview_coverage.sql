-- 0143_interview_coverage.sql
-- 인터뷰가 판 자리를 세션 너머로 남긴다 — 회상 별의 등급이 여기서 나온다.
--
-- ── 왜 필요한가 ──────────────────────────────────────────────────────────────
--
-- `src/lib/interview/probe.ts` 는 (시기 × 층) 행렬로 대화의 깊이를 세고 있고,
-- `narrative-level.ts` 는 그 칸 수를 회상 별의 등급으로 옮기는 함수다. 둘 다
-- 있는데 **등급이 붙은 적이 없다.** 이유는 하나 -- 행렬이 화면 상태로만 살아서
-- 나갔다 들어오면 0으로 돌아갔다. 남길 데가 없으니 등급을 매길 수도 없었다.
--
-- 그동안 회상 별은 다른 것으로 채워지고 있었다(`star-levels.ts`):
--
--     card.patterns 에 `top_*` 키가 하나라도 있으면 L2, 아니면 L1
--
-- 그 키는 인터뷰와 아무 상관이 없다. 즉 회상 별은 **회상을 재고 있지 않았다.**
-- 7렌즈 감사에서 걸린 "행이 들어왔는가를 구인으로 착각" 과 같은 병이다.
--
-- ── 왜 새 테이블인가 ─────────────────────────────────────────────────────────
--
-- `records.structured`(jsonb)에 얹는 쪽을 먼저 봤다. 거기 안 넣은 이유는 그
-- 컬럼의 타입이 캡처 폼 전용이기 때문이다 -- `StructuredPayload` 는
-- `{form, version, fields: Record<string,string>}` 이고, 칸 수(정수)를 문자열
-- 필드에 밀어 넣으면 그 컬럼을 읽는 모든 코드가 폼이 아닌 것을 만나게 된다.
--
-- 대신 (사용자, 시기, 층) 세 열과 정수 하나. 행렬 그대로다.
--
-- ── 무엇을 저장하지 않는가 ───────────────────────────────────────────────────
--
-- **답변 원문은 여기 없다.** 대화 내용은 사용자가 저장을 택했을 때만
-- `records` 로 간다(기존 경로). 이 테이블은 "몇 칸을 팠는가" 만 센다 --
-- 등급에 필요한 것이 그것뿐이고, 필요 이상을 남기지 않는 것이 이 저장소의 규율이다.
--
-- ── 밝기의 정직성 ────────────────────────────────────────────────────────────
--
-- 칸은 **답이 실제로 그 층에 닿았을 때만** 올라간다. "모르겠다"(결정론적 판정)와
-- 모델이 "안 닿았다"고 한 답(거부권)은 올리지 않는다. 그 규율은 클라이언트에
-- 있고 여기 CHECK 로는 강제할 수 없다 -- 대신 음수만 막는다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.interview_coverage (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- `LifePeriod` (childhood … seventies | current). 값 목록을 CHECK 로 박지 않는
  -- 이유: 시기는 나이에서 만들어지고 union 이 늘어날 수 있다(2026-08-24 에 이미
  -- 5 -> 9 로 늘었다). 목록을 두 곳에 두면 한쪽만 늙는다.
  period     text        NOT NULL,
  -- `DrillLayer` (fact | feeling | meaning | belief | echo).
  layer      text        NOT NULL,
  -- 그 칸에 닿은 답의 수. 0 아래로 못 내려간다.
  answers    integer     NOT NULL DEFAULT 0 CHECK (answers >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period, layer)
);

COMMENT ON TABLE public.interview_coverage IS
  '인터뷰 (시기 x 층) 행렬. 회상 별 등급(narrative-level.ts)의 유일한 입력. 답변 원문은 담지 않는다.';

ALTER TABLE public.interview_coverage ENABLE ROW LEVEL SECURITY;

-- 자기 행만. 삭제 정책은 두지 않는다 -- 계정 삭제는 위의 ON DELETE CASCADE 가
-- 처리하고, 사용자가 밝기만 골라 지우는 경로는 만들지 않는다(그건 밝기를
-- 정직하지 않게 만드는 손잡이가 된다).
CREATE POLICY interview_coverage_select_own ON public.interview_coverage
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY interview_coverage_insert_own ON public.interview_coverage
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY interview_coverage_update_own ON public.interview_coverage
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 권한 ─────────────────────────────────────────────────────────────────────
--
-- GRANT 는 파일 끝에 모은다. `check:definer-grants` Rule A 의 정규식이 주석을
-- 걷지 않고 문장 경계를 넘어 매칭해서, GRANT 뒤에 산문이 오면 거짓 양성이 난다.
--
-- 그리고 **정책만으로는 안 된다** -- 테이블 GRANT 가 같이 있어야 한다.
-- 2026-08-23 에 0139 의 GRANT 블록이 통째로 빠져서 로그인이 전원 500 이 났다.

REVOKE ALL ON TABLE public.interview_coverage FROM PUBLIC;
REVOKE ALL ON TABLE public.interview_coverage FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.interview_coverage TO authenticated;

-- ⚠ 위 GRANT 만으로는 **좁혀지지 않는다.** Supabase 의 기본 권한(default
-- privileges)이 public 스키마의 새 테이블에 `authenticated` 로 ALL 을 이미 줘 버려서,
-- 적용 직후 실측하면 DELETE·TRUNCATE·REFERENCES·TRIGGER 까지 들어 있다. 세 개를
-- "주는" 것으로는 나머지를 빼앗지 못한다 -- 명시적으로 회수해야 한다.
-- (같은 함정을 함수 쪽에서 겪었다: 새 함수는 anon 에게 EXECUTE 가 자동으로 붙는다.)
--
-- RLS 에 DELETE 정책이 없어 실제 삭제는 어차피 막히지만, 권한과 정책이 서로
-- 다른 말을 하게 두지 않는다.
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.interview_coverage FROM authenticated;

COMMIT;
