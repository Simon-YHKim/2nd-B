-- rollback/0216_down.sql
--
-- NOT part of the numbered apply sequence. `db/migrations/*.sql` is a
-- non-recursive glob, so this file in a subdirectory is never picked up.
-- Run it BY HAND and only deliberately.
--
-- ⚠ 순서를 지킬 것. 이 파일은 마지막 단계다.
--   1. main 판 peer-respond 는 무엇보다 먼저 consume_peer_response_rate_limit 를
--      부르고, 그 함수가 없으면 503 rate_limit_unavailable 로 닫힌다(fail closed).
--      이 파일을 먼저 돌리면 무계정 응답이 전부 멈춘다. 그래서 먼저 이 limiter 를
--      부르지 않는 peer-respond 판으로 되돌려 배포한다(또는 그 사이 503 을 감수한다).
--   2. 그다음에 이 파일을 돌린다.
--
-- 이 표는 키 해시와 분 단위 카운터만 담는다(계정 · 원본 네트워크 정보 없음).
-- 지워도 사용자 데이터는 잃지 않는다.

DROP FUNCTION IF EXISTS public.consume_peer_response_rate_limit(text, text);
DROP TABLE IF EXISTS public.peer_response_rate_limits;
