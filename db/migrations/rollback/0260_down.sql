-- Rollback of 0260: the cleaning function goes back to 0254's text (numbers crisis_term:1 to 19), with 0254's
-- privileges. Rows stored meanwhile are left as they are.

CREATE OR REPLACE FUNCTION public.normalize_client_crisis_categories(p_categories text[])
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  -- The app's closed list without 'unlisted' (crisis-event-categories.ts), in the same order.
  v_names constant text[] := ARRAY[
    'input_red',
    'input_semantic_red',
    'interview_input_red',
    'record_save_red',
    'proxy_input_red',
    'proxy_input_red_unconfirmed',
    'output_swap',
    'crisis',
    'forbidden_lexicon',
    'lexicon_match',
    'passive_ideation',
    'active_ideation_no_method',
    'active_ideation_with_method',
    'intent_no_plan',
    'intent_with_plan',
    'behavior_past',
    'behavior_preparation',
    'behavior_recent',
    'self_harm_non_suicidal'
  ];
  -- The fixed numbers of the Korean gate terms. Spelled out so that nothing but these
  -- nineteen exact strings can pass (no pattern, no collation question).
  v_numbers constant text[] := ARRAY[
    'crisis_term:1', 'crisis_term:2', 'crisis_term:3', 'crisis_term:4', 'crisis_term:5',
    'crisis_term:6', 'crisis_term:7', 'crisis_term:8', 'crisis_term:9', 'crisis_term:10',
    'crisis_term:11', 'crisis_term:12', 'crisis_term:13', 'crisis_term:14', 'crisis_term:15',
    'crisis_term:16', 'crisis_term:17', 'crisis_term:18', 'crisis_term:19'
  ];
  v_unlisted constant text := 'unlisted';
  v_is_reply boolean;
  v_entry text;
  v_kept text;
  v_out text[] := '{}'::text[];
BEGIN
  IF p_categories IS NULL THEN
    RETURN v_out;
  END IF;
  -- Only a record that names 'output_swap' is a record of a swapped AI reply.
  v_is_reply := COALESCE('output_swap' = ANY (p_categories), false);

  FOREACH v_entry IN ARRAY p_categories LOOP
    IF v_entry IS NOT NULL AND v_entry = ANY (v_names) THEN
      v_kept := v_entry;
    ELSIF NOT v_is_reply THEN
      -- A record from user input keeps the list's names and nothing else.
      CONTINUE;
    ELSIF v_entry IS NOT NULL AND v_entry = ANY (v_numbers) THEN
      v_kept := v_entry;
    ELSE
      v_kept := v_unlisted;
    END IF;
    IF NOT (v_kept = ANY (v_out)) THEN
      v_out := v_out || v_kept;
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_client_crisis_categories(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_client_crisis_categories(text[]) FROM anon;
REVOKE ALL ON FUNCTION public.normalize_client_crisis_categories(text[]) FROM authenticated;
REVOKE ALL ON FUNCTION public.normalize_client_crisis_categories(text[]) FROM service_role;
