-- G4-04 stage two DRAFT ONLY. Do not place in db/migrations or reserve a number.
-- Requires 0242 and the confirm-all client actually published to web AND QA APK.
-- See docs/handoff/G4IMPORT-261010.md for preflight, verification and rollback.
SET LOCAL lock_timeout = '10s';
CREATE OR REPLACE FUNCTION public.validate_profile_import_document(doc jsonb,confirmed text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE s jsonb; i jsonb; t jsonb; refs text[]; conflicts text[]; source_ids text[]:='{}'; item_ids text[]:='{}'; used_ids text[]:='{}';
BEGIN
  IF doc IS NULL OR octet_length(doc::text)>262144 THEN RAISE EXCEPTION 'profile_import_size' USING ERRCODE='22023'; END IF;
  PERFORM public.profile_import_object(doc,ARRAY['format','version','origin','coverage','sources','items']);
  IF doc->>'format' IS DISTINCT FROM 'polascope.user-context' OR doc->>'version' IS DISTINCT FROM '1.0-draft' THEN
    RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
  s:=doc->'origin'; PERFORM public.profile_import_object(s,ARRAY['service','model','exported_at']);
  IF coalesce(s->>'service','') NOT IN ('chatgpt','claude','gemini','other','unknown') THEN RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
  PERFORM public.profile_import_string(s->'model',100,true); PERFORM public.profile_import_date(s->'exported_at',true);
  s:=doc->'coverage'; PERFORM public.profile_import_object(s,ARRAY['accessed','unavailable','omissions','more_items','account_completeness']);
  refs:=public.profile_import_strings(s->'accessed',4,32);
  IF NOT refs<@ARRAY['current_chat','provided_memory','attached_records','retrieved_chats']
    OR coalesce(s->>'more_items','') NOT IN ('yes','no','unknown') OR s->>'account_completeness' IS DISTINCT FROM 'unknown'
    OR s->'unavailable' IS DISTINCT FROM '[]'::jsonb OR s->'omissions' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(doc->'sources') IS DISTINCT FROM 'array' OR jsonb_typeof(doc->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(doc->'sources')>100 OR jsonb_array_length(doc->'items') NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
  FOR s IN SELECT value FROM jsonb_array_elements(doc->'sources') LOOP
    PERFORM public.profile_import_object(s,ARRAY['id','kind','speaker','conversation_id','message_id','label','occurred_at','excerpt']);
    PERFORM public.profile_import_string(s->'id',64);
    IF (s->>'id')=ANY(source_ids) OR coalesce(s->>'kind','') NOT IN ('chat_excerpt','memory_entry')
      OR coalesce(s->>'speaker','') NOT IN ('user','assistant','unknown') THEN RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
    source_ids:=array_append(source_ids,s->>'id');
    PERFORM public.profile_import_string(s->'conversation_id',128,true); PERFORM public.profile_import_string(s->'message_id',128,true);
    PERFORM public.profile_import_string(s->'label',160,true); PERFORM public.profile_import_string(s->'excerpt',300,true);
    PERFORM public.profile_import_date(s->'occurred_at');
  END LOOP;
  IF confirmed IS NULL OR cardinality(confirmed)>50 OR array_position(confirmed,NULL) IS NOT NULL
    OR cardinality(confirmed)<>(SELECT count(DISTINCT id) FROM unnest(confirmed) id) THEN RAISE EXCEPTION 'profile_import_confirmation' USING ERRCODE='22023'; END IF;
  FOR i IN SELECT value FROM jsonb_array_elements(doc->'items') LOOP
    PERFORM public.profile_import_object(i,ARRAY['id','category','statement','reported_basis','evidence_ids','valid_time','conflicts_with']);
    PERFORM public.profile_import_string(i->'id',64); PERFORM public.profile_import_string(i->'statement',800);
    IF (i->>'id')=ANY(item_ids) OR coalesce(i->>'category','') NOT IN ('basic_fact','preference','value','goal','constraint','experience','interest','pattern')
      OR coalesce(i->>'reported_basis','') NOT IN ('user_statement','memory_summary','assistant_inference','unknown') THEN
      RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
    item_ids:=array_append(item_ids,i->>'id');
    refs:=public.profile_import_strings(i->'evidence_ids',20,64);
    IF NOT refs<@source_ids THEN RAISE EXCEPTION 'profile_import_references' USING ERRCODE='22023'; END IF;
    IF NOT (i->>'id')=ANY(confirmed) THEN
      RAISE EXCEPTION 'profile_import_confirmation' USING ERRCODE='22023'; END IF;
    used_ids:=used_ids||refs;
    PERFORM public.profile_import_strings(i->'conflicts_with',49,64);
    t:=i->'valid_time'; PERFORM public.profile_import_object(t,ARRAY['from','to','description']);
    PERFORM public.profile_import_date(t->'from'); PERFORM public.profile_import_date(t->'to');
    PERFORM public.profile_import_string(t->'description',160,true);
    IF (t->>'from')::timestamptz>(t->>'to')::timestamptz THEN RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF NOT confirmed<@item_ids OR NOT source_ids<@used_ids THEN RAISE EXCEPTION 'profile_import_references' USING ERRCODE='22023'; END IF;
  FOR i IN SELECT value FROM jsonb_array_elements(doc->'items') LOOP
    conflicts:=public.profile_import_strings(i->'conflicts_with',49,64);
    IF NOT conflicts<@item_ids OR (i->>'id')=ANY(conflicts) THEN RAISE EXCEPTION 'profile_import_references' USING ERRCODE='22023'; END IF;
  END LOOP;
END $$;

-- Internal validator only; apply RPC remains the sole authenticated entry point.
REVOKE ALL ON FUNCTION public.validate_profile_import_document(jsonb,text[])
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apply_profile_context_import(uuid,jsonb,text[],jsonb,bigint),
  public.withdraw_profile_context_import(uuid),public.save_profile_details_revision(jsonb,bigint) TO authenticated;
