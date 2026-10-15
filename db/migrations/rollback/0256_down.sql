-- 0256 되돌리기: 되돌릴 것이 없다. 0256 은 스키마를 바꾸지 않고, 대상이 이미 지워진 제안 줄을 한 번 지우고
-- 검토 대기 줄이 안 남은 실행을 ratified 로 닫았을 뿐이다. 지운 줄과 닫은 실행 상태는 돌아오지 않는다.
-- 함수(complete_reasoning_run)를 0092 의 본문으로 되돌리는 것은 rollback/0253_down.sql 이다.
DO $down0256$
BEGIN
  RAISE NOTICE '0256 has nothing to undo: it removed rows and changed no schema';
END
$down0256$;
