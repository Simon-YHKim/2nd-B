-- rollback/0140_down.sql
--
-- NOT part of the numbered apply sequence. The dry-run and the prod apply both
-- iterate `db/migrations/*.sql`, a non-recursive glob, so this file in a
-- subdirectory is never picked up. Run it BY HAND and only deliberately.
--
-- 0140 은 데이터만 바꿨다(스키마 변경 없음). 되돌리는 것도 데이터만 바꾼다.
--
-- ⚠ 되돌리면 `star_id` 가 **코드에 더 이상 존재하지 않는 id** 로 돌아간다.
-- `src/lib/lenses/registry.ts` 의 `LensId` 에 now/recall/seen/... 는 없으므로,
-- 되돌린 뒤에는 그 행을 읽는 화면(/ratifications · /growth)이 알 수 없는 id 를
-- 만나게 된다. 코드를 함께 되돌릴 때만 의미가 있다.
--
-- ⚠ 그리고 이 되돌림은 **완전하지 않다.** 0140 이후에 새로 들어온 렌즈 id 행도
-- 옛 구인 id 로 바뀐다 -- 매핑이 일대일이라 방향만 뒤집었기 때문이고, 그 행들은
-- 애초에 옛 id 였던 적이 없다. 0140 적용 시점 이후 행이 있다면 손으로 볼 것.

UPDATE star_tier_history
SET star_id = CASE star_id
  WHEN 'when'      THEN 'rhythm'
  WHEN 'size'      THEN 'possible'
  WHEN 'return'    THEN 'now'
  WHEN 'ask'       THEN 'values'
  WHEN 'file'      THEN 'relational'
  WHEN 'resurface' THEN 'recall'
  WHEN 'profile'   THEN 'seen'
  ELSE star_id
END
WHERE star_id IN ('when', 'size', 'return', 'ask', 'file', 'resurface', 'profile');

COMMENT ON COLUMN star_tier_history.star_id IS
  'StarId: now|recall|seen|rhythm|relational|possible|values';
