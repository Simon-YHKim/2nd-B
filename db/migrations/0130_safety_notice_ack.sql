-- 0130_safety_notice_ack.sql
-- 안전 안내에 대한 별도 동의를 원장에 남긴다 (법률 검토 Q4, Simon 결정 2026-08-17).
--
-- 0129 가 임상 척도(cssrs_level)를 지웠지만, `crisis_events` 행 자체는 남는다 -
-- "이 계정에서 레드존이 판정됐다" 는 사실과 그 분류 카테고리다. 검토 의견은
-- 그 판정을 **생성·저장**하는 것 자체를 PIPA 제23조 민감정보(건강) 처리로
-- 설계해야 안전하다고 본다. 그리고 민감정보에는 §15①5호(긴급한 생명·신체
-- 이익)를 원용할 수 없으므로, 남는 근거는 §23①1호 **별도 동의**뿐이다.
--
-- 그래서 가입 시 동의 항목을 하나 신설한다. 기존 ack 컬럼들과 같은 모양으로
-- **전용 컬럼**을 두는 이유는 "별도" 동의라는 것이 나중에 증명 가능해야 하기
-- 때문이다. purposes jsonb 안에 섞어 넣으면 다른 동의와 한 덩어리로 보인다.
--
-- 기존 행은 NULL 로 남는다. false 로 채우지 않는 것이 정직하다 - 그 사람들은
-- 이 항목을 거절한 것이 아니라 **질문받은 적이 없다.** 두 상태를 같은 값으로
-- 적으면 나중에 재동의 대상을 고를 수 없다.
ALTER TABLE public.consent_records
  ADD COLUMN IF NOT EXISTS safety_notice_ack boolean;

COMMENT ON COLUMN public.consent_records.safety_notice_ack IS
  'PIPA art.23 separate consent for safety routing (crisis_events). NULL = the '
  'account signed up before 0130 and was never asked; false = asked and declined. '
  'Do not backfill NULL to false: that erases the difference and makes re-consent '
  'targeting impossible.';
