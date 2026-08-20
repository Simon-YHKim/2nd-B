-- 0140_lens_ids.sql
-- 렌즈층 확정 (Simon 2026-08-21: "b 로 진행하고, 마지막 7은 사용자 프로필을 띄울꺼야").
--
-- `star_tier_history.star_id` 가 들고 있던 **폐기된 심리 구인 7종**
-- (now|recall|seen|rhythm|relational|possible|values, 0045 주석 참조)을 렌즈 id 로
-- 재매핑한다. 폐기가 아니라 재매핑이다 -- Simon 2026-08-15: "어차피 테스트로
-- 임의로 만든 것".
--
-- 스키마 변경이 없다. 그 컬럼은 CHECK 도 FK 도 enum 도 없는 그냥 `text` 라
-- (0045) 바뀌는 것은 **값과 주석뿐**이다. 그래서 이 마이그레이션은 되돌리기도
-- 쉽다(rollback/0140_down.sql).
--
-- ⚠ 매핑표의 정본은 `src/lib/lenses/registry.ts` 의 `LEGACY_STAR_TO_LENS` 이고,
-- `registry.test.ts` 가 옛 유니온을 `src/lib/persona/stars.ts` 에서 **읽어서**
-- 대조한다. 여기 CASE 를 고치려면 그쪽도 같이 고쳐야 한다.
--
-- ⚠ 그리고 이 대응은 **의미 대응이 아니다.** 원본 행이 임의 테스트 데이터라
-- 대응시킬 의미가 없다. 넷은 그나마 결이 닿아서 그렇게 뒀고(rhythm→때,
-- possible→크기, recall→꺼내기, seen→프로필) 나머지 셋은 선언 순서대로 채웠다.
-- 이 표를 근거로 "옛 구인이 곧 이 렌즈였다"고 말하지 말 것.

UPDATE star_tier_history
SET star_id = CASE star_id
  WHEN 'rhythm'     THEN 'when'
  WHEN 'possible'   THEN 'size'
  WHEN 'now'        THEN 'return'
  WHEN 'values'     THEN 'ask'
  WHEN 'relational' THEN 'file'
  WHEN 'recall'     THEN 'resurface'
  WHEN 'seen'       THEN 'profile'
  ELSE star_id
END
WHERE star_id IN ('rhythm', 'possible', 'now', 'values', 'relational', 'recall', 'seen');

COMMENT ON COLUMN star_tier_history.star_id IS
  'LensId: when|size|return|ask|file|resurface|profile. 0140 에서 폐기된 심리 구인 7종에서 재매핑. 정본: src/lib/lenses/registry.ts';
