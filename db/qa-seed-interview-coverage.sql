-- QA 계정 인터뷰 커버리지 시드 — **운영에 적용됨(2026-08-30)**, 되돌릴 수 있음.
--
-- ── 왜 있나 ────────────────────────────────────────────────────────────────
--
-- 레퍼런스 대조에서 me-star·review 의 수치가 낮았는데, 그 원인이 "설계가 다르다"인지
-- "데이터가 없다"인지 가를 방법이 없었다. QA 계정에 `interview_coverage` 가 0행이라
-- '판 만큼' 줄도, 시기 별 비준 후보도 뜰 수가 없었기 때문이다.
--
-- 시드를 넣고 **같은 번들을 서빙한 채 DB 만 바꿔** 다시 재니 이렇게 나왔다:
--
--   me-star  75% → 88%   ('지금까지 담은 것' 섹션이 뜬다)
--   review   69% → 92%   ('시기 별 후보' 라벨 + 학창시절·지금 후보가 뜬다)
--
-- 즉 그 격차는 데이터 탓이었다. 이제 이후 대조에서 "데이터가 없어 안 뜬 것"과
-- "설계가 달라 안 뜬 것"을 가를 수 있다.
--
-- ── 규율 ───────────────────────────────────────────────────────────────────
--
-- * **QA 계정 한정.** 아래 DO 블록이 uuid 와 이메일을 함께 확인하고, 아니면 예외를
--   던져 아무것도 쓰지 않는다. 실행 후 다른 사용자 행이 0인지 반드시 확인할 것.
-- * **`interview_coverage` 한 테이블이면 충분하다.** 화면이 읽는 곳이 여기다.
--   `star_tier_history` 에 손대지 말 것 — 그쪽은 `seven:` 접두사 규율이 걸려 있고
--   비준 원장이라 시드로 채우면 "확인한 적 없는 L5" 를 만들어낸다.
-- * 한 칸은 (별 id × 층)이 아니라 **(LifePeriod × DrillLayer)** 다. 프로필을 뺀
--   여섯 별의 id 와 LifePeriod 값이 글자까지 같아 별 1:1 로 읽힌다.
-- * 시드 직전 이 테이블은 **전체 0행**이었다. 그래서 아래 롤백은 시드 이전 상태와
--   완전히 같아진다.
--
-- 적용/롤백은 service_role 로 한다(0143 의 RLS 는 본인 행만 허용한다).

-- ── 적용 ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = 'fcd4dec5-4fce-4e41-af40-ebff2640d163'::uuid
      AND email = 'qa.ai.b18807@example.com'
  ) THEN
    RAISE EXCEPTION 'guard: target uuid is not the QA account, aborting';
  END IF;
END $$;

INSERT INTO public.interview_coverage (user_id, period, layer, answers)
SELECT u.id, v.period, v.layer, v.answers
FROM auth.users u
CROSS JOIN (VALUES
  -- 학창시절: 세 층(사실·감정·의미) = 비준 문턱(2칸) 초과 → /review 후보로 뜬다
  ('school', 'fact',    2),
  ('school', 'feeling', 2),
  ('school', 'meaning', 1),
  -- 지금: 두 층 = 문턱 정확히 충족 → 후보 둘을 만들어 그룹 라벨이 보이게 한다
  ('now',    'fact',    2),
  ('now',    'feeling', 1)
) AS v(period, layer, answers)
WHERE u.id = 'fcd4dec5-4fce-4e41-af40-ebff2640d163'::uuid
ON CONFLICT (user_id, period, layer) DO NOTHING;

-- 확인: 다른 사용자 행은 0이어야 한다.
-- select count(*) from public.interview_coverage
--  where user_id <> 'fcd4dec5-4fce-4e41-af40-ebff2640d163'::uuid;

-- ── 롤백 ───────────────────────────────────────────────────────────────────
-- DELETE FROM public.interview_coverage
--  WHERE user_id = 'fcd4dec5-4fce-4e41-af40-ebff2640d163'::uuid;
-- 확인: select count(*) from public.interview_coverage;  -- 시드 전 값 = 0
