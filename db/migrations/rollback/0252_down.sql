-- 0252 되돌리기: 환불 함수와 쓴 감사 줄 id 를 적던 칸을 걷는다. 이미 돌려준 횟수는 그대로 둔다.
-- 칸을 걷으면 "이미 쓴 줄"의 기록이 사라지므로, 다시 적용하면 10분 안의 줄은 한 번 더 쓰일 수 있다.
DROP FUNCTION IF EXISTS public.refund_chat_turn_after_output_swap(date);
ALTER TABLE public.chat_usage DROP COLUMN IF EXISTS refunded_audit_ids;
