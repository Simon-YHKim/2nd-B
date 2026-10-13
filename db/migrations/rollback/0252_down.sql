-- 0252 되돌리기: 환불 함수만 걷는다(완전한 되돌리기가 아니라 기능 끄기다). 이미 돌려준 횟수는 그대로 둔다.
-- chat_turn_refunds 표는 일부러 남긴다. 표를 같이 걷으면 "이미 쓴 감사 줄"의 기록이 사라져,
-- 0252 를 다시 적용했을 때 10분 안의 줄이 한 번 더 쓰인다. 표는 함수 없이는 아무도 읽거나 쓰지 못한다.
DROP FUNCTION IF EXISTS public.refund_chat_turn_after_output_swap(date);
