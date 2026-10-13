-- 0251 되돌리기: 트리거 둘과 함수를 걷는다. 그 뒤로는 기록을 지워도 제안 줄이 남는다(0092 상태).
-- 돌아오지 않는 것: 0251 이 지운 제안 줄, payload 에서 뺀 title, ratified 로 닫은 실행 상태.
DROP TRIGGER IF EXISTS purge_reasoning_proposals ON public.records;
DROP TRIGGER IF EXISTS purge_reasoning_proposals ON public.sources;
DROP FUNCTION IF EXISTS public.purge_reasoning_proposals_of_erased();
