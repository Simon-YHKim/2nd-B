\set ON_ERROR_STOP on

-- Run only on the CI scratch database after numbered 0254, from the repository root.
-- Q-261013-66: crisis_events.trigger_categories holds names from the closed list only.
-- Nothing a person or a model wrote may reach the row, the error text, or a notice.
\set cases `cat db/tests/fixtures/crisis-category-cases.json`

BEGIN;

CREATE FUNCTION pg_temp.q66_assert(p_ok boolean, p_what text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'q66 regression failed: %', p_what;
  END IF;
END
$$;

-- The categories of the one row written under a routing tag, as text. 'none' when no row has
-- the tag and 'many' when more than one does.
CREATE FUNCTION pg_temp.q66_row(p_tag text) RETURNS text
LANGUAGE sql AS $$
  SELECT CASE count(*) WHEN 0 THEN 'none' WHEN 1 THEN min(trigger_categories::text) ELSE 'many' END
    FROM public.crisis_events WHERE routing_template_version = p_tag
$$;

-- 1. The shared cases, straight through the function that both write paths call.
CREATE TEMP TABLE q66_cases ON COMMIT DROP AS
SELECT c.value->>'name' AS name,
       ARRAY(SELECT e.v FROM jsonb_array_elements_text(c.value->'in') WITH ORDINALITY AS e(v, i) ORDER BY e.i) AS given,
       ARRAY(SELECT e.v FROM jsonb_array_elements_text(c.value->'out') WITH ORDINALITY AS e(v, i) ORDER BY e.i) AS wanted
  FROM jsonb_array_elements((:'cases'::jsonb)->'cases') AS c(value);

SELECT pg_temp.q66_assert((SELECT count(*) >= 16 AND count(*) = count(DISTINCT name) FROM q66_cases),
                          'the shared cases did not load (fewer than 16, or a repeated name)');
SELECT pg_temp.q66_assert(
  NOT EXISTS (SELECT 1 FROM q66_cases
               WHERE public.normalize_client_crisis_categories(given) IS DISTINCT FROM wanted),
  'shared case: ' || COALESCE((SELECT min(name) FROM q66_cases
                                WHERE public.normalize_client_crisis_categories(given) IS DISTINCT FROM wanted), ''));
-- Applying it to its own result changes nothing (what a stored row compares as).
SELECT pg_temp.q66_assert(
  NOT EXISTS (SELECT 1 FROM q66_cases
               WHERE public.normalize_client_crisis_categories(wanted) IS DISTINCT FROM wanted),
  'the function changes a list it has already cleaned');
SELECT pg_temp.q66_assert(public.normalize_client_crisis_categories(NULL) = '{}'::text[]
                          AND public.normalize_client_crisis_categories(ARRAY[NULL, 'crisis', NULL]::text[]) = ARRAY['crisis']
                          AND public.normalize_client_crisis_categories(ARRAY['output_swap', NULL]::text[]) = ARRAY['output_swap', 'unlisted'],
                          'NULL input or a NULL entry is not handled');

-- 2. Who may call what. The cleaning function is internal; the two write functions are 0181's.
SELECT pg_temp.q66_assert(
  NOT has_function_privilege('anon', 'public.normalize_client_crisis_categories(text[])', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.normalize_client_crisis_categories(text[])', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.normalize_client_crisis_categories(text[])', 'EXECUTE'),
  'a client role may call the cleaning function directly');
SELECT pg_temp.q66_assert(
  has_function_privilege('authenticated', 'public.log_crisis_event(numeric, text[], integer, text, text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.log_crisis_event(numeric, text[], integer, text, text)', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.log_crisis_event(numeric, text[], integer, text, text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.log_crisis_event_once(text, numeric, text[], integer, text, text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.log_crisis_event_once(text, numeric, text[], integer, text, text)', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'public.log_crisis_event_once(text, numeric, text[], integer, text, text)', 'EXECUTE'),
  'the EXECUTE grants of the two write functions changed');

-- A row an older build stored before 0254, as it was sent. It is never rewritten.
INSERT INTO public.crisis_events (user_id_hash, zone, classifier_confidence, trigger_categories,
                                  routing_template_version, locale, outbox_event_id, event_source)
VALUES (md5('26101366-0000-4000-8000-00000000000a'), 'red', 0.9,
        ARRAY['input_red', 'unlisted', 'crisis_term:2', 'a sentence an older build stored'],
        'q66-old', 'ko', 'q66-old-1', 'client_unverified');

-- 3. Through the two write functions, as a signed-in user.
SET LOCAL request.jwt.claim.sub = '26101366-0000-4000-8000-00000000000a';
SET LOCAL ROLE authenticated;
DO $calls$
DECLARE
  v_long constant text := repeat('x', 65);
  v_text text;
  v_state text;
BEGIN
  -- A swapped AI reply: the sentence becomes 'unlisted', the number stays.
  PERFORM public.log_crisis_event(0.9, ARRAY['output_swap', 'a sentence a model wrote', 'crisis_term:3'], NULL, 'q66-reply', 'ko');
  -- From user input: names only.
  PERFORM public.log_crisis_event(0.9, ARRAY['input_red', 'a sentence a model wrote', 'crisis_term:3', 'unlisted'], NULL, 'q66-input', 'ko');
  -- Nothing on the list: the record is still written, with an empty list.
  PERFORM public.log_crisis_event(0.9, ARRAY['a sentence a model wrote', 'unlisted'], NULL, 'q66-empty', 'en');

  -- Once: the same request again, and a request that differs only in what is thrown away, are the same request.
  PERFORM public.log_crisis_event_once('q66-once-1', 0.9, ARRAY['output_swap', 'first sentence', 'crisis'], NULL, 'q66-once', 'ko');
  PERFORM public.log_crisis_event_once('q66-once-1', 0.9, ARRAY['output_swap', 'first sentence', 'crisis'], NULL, 'q66-once', 'ko');
  PERFORM public.log_crisis_event_once('q66-once-1', 0.9, ARRAY['output_swap', 'a different sentence', 'crisis'], NULL, 'q66-once', 'ko');
  PERFORM public.log_crisis_event_once('q66-once-2', 0.9, ARRAY['record_save_red', 'crisis_term:9', 'unlisted'], NULL, 'q66-once-input', 'ko');
  PERFORM public.log_crisis_event_once('q66-once-2', 0.9, ARRAY['record_save_red'], NULL, 'q66-once-input', 'ko');
  -- The row from before 0254: the request that made it is still the same request.
  PERFORM public.log_crisis_event_once('q66-old-1', 0.9, ARRAY['input_red', 'unlisted', 'crisis_term:2', 'a sentence an older build stored'], NULL, 'q66-old', 'ko');

  -- A different name under the same key is still a conflict, and the text says nothing of the values.
  BEGIN
    PERFORM public.log_crisis_event_once('q66-once-1', 0.9, ARRAY['output_swap', 'SECRET-SENTENCE', 'lexicon_match'], NULL, 'q66-once', 'ko');
    RAISE EXCEPTION 'q66 regression failed: a different list under the same key was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    GET STACKED DIAGNOSTICS v_text = MESSAGE_TEXT, v_state = PG_EXCEPTION_DETAIL;
    IF v_text <> 'crisis_outbox_idempotency_conflict' OR COALESCE(v_state, '') <> '' THEN
      RAISE EXCEPTION 'q66 regression failed: the conflict error carries more than its fixed text';
    END IF;
  END;

  -- The shape refusals of 0181 are unchanged, and their text is fixed too.
  BEGIN
    PERFORM public.log_crisis_event(0.9, ARRAY['output_swap', v_long], NULL, 'q66-refused', 'ko');
    RAISE EXCEPTION 'q66 regression failed: a 65 character entry was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    GET STACKED DIAGNOSTICS v_text = MESSAGE_TEXT, v_state = PG_EXCEPTION_DETAIL;
    IF v_text <> 'client_crisis_event_payload_invalid' OR COALESCE(v_state, '') <> '' THEN
      RAISE EXCEPTION 'q66 regression failed: the shape error carries more than its fixed text';
    END IF;
  END;
  BEGIN
    PERFORM public.log_crisis_event(0.9, ARRAY['output_swap', E'SECRET\nSENTENCE'], NULL, 'q66-refused', 'ko');
    RAISE EXCEPTION 'q66 regression failed: an entry with a control character was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    GET STACKED DIAGNOSTICS v_text = MESSAGE_TEXT;
    IF v_text <> 'client_crisis_event_payload_invalid' THEN
      RAISE EXCEPTION 'q66 regression failed: the control character error carries more than its fixed text';
    END IF;
  END;
  BEGIN
    PERFORM public.log_crisis_event(0.9, ARRAY['output_swap', NULL]::text[], NULL, 'q66-refused', 'ko');
    RAISE EXCEPTION 'q66 regression failed: a NULL entry was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.log_crisis_event_once('q66-once-3', 0.9,
      ARRAY(SELECT 'crisis_term:' || g FROM generate_series(1, 17) AS g), NULL, 'q66-refused', 'ko');
    RAISE EXCEPTION 'q66 regression failed: seventeen entries were accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- The cleaning function is not a client's to call.
  BEGIN
    PERFORM public.normalize_client_crisis_categories(ARRAY['crisis']);
    RAISE EXCEPTION 'q66 regression failed: a signed-in user called the cleaning function';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$calls$;
RESET ROLE;

-- Not signed in: refused before anything is read.
SET LOCAL request.jwt.claim.sub = '';
SET LOCAL ROLE authenticated;
DO $anon$
BEGIN
  BEGIN
    PERFORM public.log_crisis_event(0.9, ARRAY['output_swap'], NULL, 'q66-refused', 'ko');
    RAISE EXCEPTION 'q66 regression failed: a call without a signed-in user was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$anon$;
RESET ROLE;

SELECT pg_temp.q66_assert(pg_temp.q66_row('q66-reply') = '{output_swap,unlisted,crisis_term:3}',
                          'a swapped reply was not stored as names, numbers and one unlisted: ' || pg_temp.q66_row('q66-reply'));
SELECT pg_temp.q66_assert(pg_temp.q66_row('q66-input') = '{input_red}',
                          'a record from user input kept more than its names: ' || pg_temp.q66_row('q66-input'));
SELECT pg_temp.q66_assert(pg_temp.q66_row('q66-empty') = '{}',
                          'a record with nothing on the list was not written with an empty list: ' || pg_temp.q66_row('q66-empty'));
SELECT pg_temp.q66_assert(pg_temp.q66_row('q66-once') = '{output_swap,unlisted,crisis}',
                          'the once path did not store one cleaned row: ' || pg_temp.q66_row('q66-once'));
SELECT pg_temp.q66_assert(pg_temp.q66_row('q66-once-input') = '{record_save_red}',
                          'the once path kept a number or unlisted for user input: ' || pg_temp.q66_row('q66-once-input'));
SELECT pg_temp.q66_assert(pg_temp.q66_row('q66-old') = '{input_red,unlisted,crisis_term:2,"a sentence an older build stored"}',
                          'a row stored before 0254 was rewritten or repeated');
SELECT pg_temp.q66_assert(pg_temp.q66_row('q66-refused') = 'none', 'a refused call left a row');
-- Every row these calls wrote holds list values only, and only a reply row holds a number or unlisted.
SELECT pg_temp.q66_assert(
  NOT EXISTS (
    SELECT 1 FROM public.crisis_events AS e, unnest(e.trigger_categories) AS u(v)
     WHERE e.routing_template_version LIKE 'q66-%' AND e.routing_template_version <> 'q66-old'
       AND (u.v LIKE '%sentence%' OR u.v LIKE '%SECRET%'
            OR ((u.v = 'unlisted' OR u.v LIKE 'crisis_term:%') AND NOT ('output_swap' = ANY (e.trigger_categories))))),
  'a written row holds a sentence, or a user-input row holds a number or unlisted');
SELECT pg_temp.q66_assert((SELECT count(*) = 6 FROM public.crisis_events WHERE routing_template_version LIKE 'q66-%'),
                          'the calls did not leave exactly six rows');

-- 4. The limiter of 0181 still stands in front of both write functions: thirty in ten minutes.
SET LOCAL request.jwt.claim.sub = '26101366-0000-4000-8000-00000000000b';
SET LOCAL ROLE authenticated;
DO $rate$
BEGIN
  FOR i IN 1..30 LOOP
    PERFORM public.log_crisis_event(0.9, ARRAY['input_red'], NULL, 'q66-rate', 'ko');
  END LOOP;
  BEGIN
    PERFORM public.log_crisis_event(0.9, ARRAY['input_red'], NULL, 'q66-rate', 'ko');
    RAISE EXCEPTION 'q66 regression failed: a thirty-first record in ten minutes was accepted';
  EXCEPTION WHEN program_limit_exceeded THEN NULL;
  END;
  BEGIN
    PERFORM public.log_crisis_event_once('q66-rate-1', 0.9, ARRAY['input_red'], NULL, 'q66-rate', 'ko');
    RAISE EXCEPTION 'q66 regression failed: the once path let a thirty-first record through';
  EXCEPTION WHEN program_limit_exceeded THEN NULL;
  END;
END
$rate$;
RESET ROLE;
SELECT pg_temp.q66_assert((SELECT count(*) = 30 FROM public.crisis_events WHERE routing_template_version = 'q66-rate'),
                          'the limiter did not stop at thirty rows');

-- 5. Rollback round trip: the down file brings back 0181's behaviour, applying again removes it.
\ir ../migrations/rollback/0254_down.sql
SELECT pg_temp.q66_assert(to_regprocedure('public.normalize_client_crisis_categories(text[])') IS NULL,
                          'the down file left the cleaning function');
SET LOCAL request.jwt.claim.sub = '26101366-0000-4000-8000-00000000000a';
SET LOCAL ROLE authenticated;
SELECT public.log_crisis_event(0.9, ARRAY['input_red', 'kept as sent'], NULL, 'q66-down', 'ko');
RESET ROLE;
SELECT pg_temp.q66_assert(pg_temp.q66_row('q66-down') = '{input_red,"kept as sent"}',
                          'after the down file the write function is not 0181''s: ' || pg_temp.q66_row('q66-down'));
\ir ../migrations/0254_crisis_category_closed_list.sql
\ir ../migrations/0254_crisis_category_closed_list.sql
SET LOCAL ROLE authenticated;
SELECT public.log_crisis_event(0.9, ARRAY['input_red', 'not kept'], NULL, 'q66-again', 'ko');
RESET ROLE;
SELECT pg_temp.q66_assert(pg_temp.q66_row('q66-again') = '{input_red}',
                          'applying 0254 again did not bring the closed list back: ' || pg_temp.q66_row('q66-again'));
SELECT pg_temp.q66_assert(
  NOT has_function_privilege('authenticated', 'public.normalize_client_crisis_categories(text[])', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.log_crisis_event(numeric, text[], integer, text, text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.log_crisis_event_once(text, numeric, text[], integer, text, text)', 'EXECUTE'),
  'applying again changed who may call the functions');

ROLLBACK;
