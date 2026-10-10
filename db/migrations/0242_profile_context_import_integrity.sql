-- G4-01/02/03/04: forward-only repair of 0239/0240. RPC signatures stay stable.
-- Simon 2026-10-10: enforce all item confirmations here, then merge the client.
-- Partial-confirmation requests from the old client are intentionally rejected.
SET LOCAL lock_timeout = '10s';

-- Per-field undo: {field: {before, after, predecessor}}. JSON null means absent.
-- Withdrawn ancestors retain this only while an active descendant needs it.
ALTER TABLE public.profile_context_imports ADD COLUMN field_undo jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.users ADD COLUMN profile_import_attempt_day date;
ALTER TABLE public.users ADD COLUMN profile_import_attempt_count integer NOT NULL DEFAULT 0
  CHECK (profile_import_attempt_count >= 0);

-- Active legacy rows still have their before/after data. Already-cleared withdrawn
-- rows cannot be reconstructed. Never manufacture their missing before values.
UPDATE public.profile_context_imports b SET field_undo=(
  SELECT coalesce(jsonb_object_agg(f.key,jsonb_build_object(
    'before',b.profile_before->f.key,'after',f.value,
    'before_known',NOT EXISTS(SELECT 1 FROM public.profile_context_imports lost
      WHERE lost.id=ANY(b.profile_predecessors) AND lost.status='withdrawn' AND lost.profile_change_count>0),
    'predecessor',(
      SELECT p.id FROM public.profile_context_imports p
      WHERE p.user_id=b.user_id AND p.id=ANY(b.profile_predecessors)
        AND p.profile_patch ? f.key AND p.profile_patch->f.key=b.profile_before->f.key
      ORDER BY p.applied_revision DESC,p.id DESC LIMIT 1
    ))),'{}') FROM jsonb_each(b.profile_patch) f
) WHERE b.status='active';

WITH quota_day AS MATERIALIZED (
  SELECT (statement_timestamp() AT TIME ZONE 'UTC')::date AS utc_day
)
UPDATE public.users u SET profile_import_attempt_day=quota_day.utc_day,
  profile_import_attempt_count=(SELECT count(*) FROM public.profile_context_imports b
    WHERE b.user_id=u.id AND (b.created_at AT TIME ZONE 'UTC')::date=quota_day.utc_day)
FROM quota_day
WHERE EXISTS(SELECT 1 FROM public.profile_context_imports b WHERE b.user_id=u.id);

CREATE OR REPLACE FUNCTION public.save_profile_details_revision(p_details jsonb,p_expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE owner uuid:=auth.uid(); u public.users%ROWTYPE; cleaned jsonb; revision bigint; changed_fields text[];
BEGIN
  PERFORM public.profile_import_account_guard(owner);
  SELECT * INTO u FROM public.users WHERE id=owner;
  IF p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
  IF u.profile_details_revision<>p_expected_revision THEN RAISE EXCEPTION 'profile_import_profile_conflict' USING ERRCODE='PT409'; END IF;
  cleaned:=public.validate_profile_import_details(p_details,u.birth_date);
  revision:=u.profile_details_revision;
  IF cleaned IS DISTINCT FROM u.profile_details THEN
    SELECT array_agg(field) INTO changed_fields FROM (
      SELECT jsonb_object_keys(cleaned||u.profile_details) AS field
    ) fields WHERE cleaned->field IS DISTINCT FROM u.profile_details->field;
    -- Manual edits own only their changed fields, even if they happen to equal an
    -- older import's value. A later cancellation must not undo that choice.
    UPDATE public.profile_context_imports SET field_undo=field_undo-changed_fields
      WHERE user_id=owner AND field_undo ?| changed_fields;
    UPDATE public.users SET profile_details=cleaned WHERE id=owner RETURNING profile_details_revision INTO revision;
  END IF;
  RETURN jsonb_build_object('revision',revision);
END $$;

-- One internal withdrawal path for the RPC and every source DELETE. The trigger
-- already deleting the source passes false to avoid deleting that tuple twice.
CREATE FUNCTION public.withdraw_profile_import_internal(p_batch_id uuid,p_delete_source boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE batch public.profile_context_imports%ROWTYPE; details jsonb; original jsonb;
  field text; undo jsonb; ancestor public.profile_context_imports%ROWTYPE; previous uuid;
  account_gone boolean; restored boolean:=false; seen uuid[];
BEGIN
  SELECT * INTO batch FROM public.profile_context_imports WHERE id=p_batch_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Source DELETE already holds its source tuple; never wait in the inverse
  -- order of the RPC's owner->source locks. 55P03 rolls back the delete to retry.
  SELECT profile_details INTO details FROM public.users WHERE id=batch.user_id FOR UPDATE NOWAIT;
  -- Only the actual account cascade (parent row gone) skips profile restoration.
  -- A caller-set setting or a deletion tombstone alone is not that authority.
  account_gone:=NOT FOUND;
  SELECT * INTO batch FROM public.profile_context_imports WHERE id=p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF account_gone THEN
    -- The users cascade may visit sources before receipts. Updating a receipt
    -- whose FK parent has gone would recheck that FK for newly inserted rows.
    DELETE FROM public.wiki_pages WHERE source_id=batch.source_id AND user_id=batch.user_id;
    DELETE FROM public.profile_context_imports WHERE id=batch.id;
    RETURN NULL;
  END IF;
  IF batch.status='withdrawn' THEN RETURN public.profile_import_receipt(batch); END IF;
  original:=details;
  IF NOT account_gone THEN
    FOR field,undo IN SELECT key,value FROM jsonb_each(batch.field_undo) LOOP
      -- Equal text does not establish ownership: A -> B -> A has a newer writer.
      IF EXISTS(SELECT 1 FROM public.profile_context_imports newer
        WHERE newer.user_id=batch.user_id AND newer.status='active' AND newer.field_undo ? field
          AND (newer.applied_revision,newer.id)>(batch.applied_revision,batch.id)) THEN CONTINUE; END IF;
      IF details->field IS DISTINCT FROM undo->'after' THEN CONTINUE; END IF;
      seen:=ARRAY[batch.id];
      LOOP
        previous:=(undo->>'predecessor')::uuid;
        EXIT WHEN previous IS NULL;
        IF previous=ANY(seen) THEN RAISE EXCEPTION 'profile_import_undo_cycle'; END IF;
        seen:=array_append(seen,previous);
        SELECT * INTO ancestor FROM public.profile_context_imports
          WHERE id=previous AND user_id=batch.user_id;
        EXIT WHEN NOT FOUND OR ancestor.status='active' OR NOT ancestor.field_undo ? field;
        undo:=ancestor.field_undo->field;
      END LOOP;
      IF undo->>'before_known'='false' THEN CONTINUE; END IF;
      IF undo->'before'='null'::jsonb THEN details:=details-field;
      ELSE details:=jsonb_set(details,ARRAY[field],undo->'before'); END IF;
    END LOOP;
    restored:=details IS DISTINCT FROM original;
    IF restored THEN UPDATE public.users SET profile_details=details WHERE id=batch.user_id; END IF;
  END IF;
  -- Mark first: recursive source trigger returns the same receipt without work.
  UPDATE public.profile_context_imports SET status='withdrawn',document=NULL,confirmed_ids='{}',
    profile_before=NULL,profile_patch='{}',profile_predecessors='{}',profile_restored=restored,withdrawn_at=now()
    WHERE id=batch.id;
  DELETE FROM public.wiki_pages WHERE source_id=batch.source_id AND user_id=batch.user_id;
  IF p_delete_source THEN DELETE FROM public.sources WHERE id=batch.source_id AND user_id=batch.user_id; END IF;
  UPDATE public.profile_context_imports SET source_id=NULL WHERE id=batch.id;
  -- Keep only undo still reachable from active batches, including through a
  -- withdrawn intermediate batch. Content erasure eventually clears every undo.
  WITH RECURSIVE needed(id) AS (
    SELECT id FROM public.profile_context_imports WHERE user_id=batch.user_id AND status='active'
    UNION
    SELECT (f.value->>'predecessor')::uuid FROM needed n
      JOIN public.profile_context_imports b ON b.id=n.id AND b.user_id=batch.user_id
      CROSS JOIN LATERAL jsonb_each(b.field_undo) f WHERE f.value->>'predecessor' IS NOT NULL
  ) UPDATE public.profile_context_imports b SET field_undo='{}'
    WHERE b.user_id=batch.user_id AND b.status='withdrawn' AND NOT EXISTS(SELECT 1 FROM needed n WHERE n.id=b.id);
  SELECT * INTO batch FROM public.profile_context_imports WHERE id=p_batch_id;
  RETURN public.profile_import_receipt(batch);
END $$;

CREATE OR REPLACE FUNCTION public.clear_profile_import_on_source_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE batch_id uuid;
BEGIN
  FOR batch_id IN SELECT id FROM public.profile_context_imports WHERE source_id=OLD.id LOOP
    PERFORM public.withdraw_profile_import_internal(batch_id,false);
  END LOOP;
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.withdraw_profile_context_import(p_batch_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE owner uuid:=auth.uid();
BEGIN
  PERFORM public.profile_import_account_guard(owner);
  IF NOT EXISTS(SELECT 1 FROM public.profile_context_imports WHERE id=p_batch_id AND user_id=owner) THEN
    RAISE EXCEPTION 'profile_import_not_found' USING ERRCODE='P0002'; END IF;
  RETURN public.withdraw_profile_import_internal(p_batch_id,true);
END $$;

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


CREATE OR REPLACE FUNCTION public.apply_profile_context_import(p_request_id uuid,p_document jsonb,p_confirmed_ids text[],p_profile_patch jsonb,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE owner uuid:=auth.uid(); batch public.profile_context_imports%ROWTYPE; u public.users%ROWTYPE;
  signature text; cleaned jsonb:='{}'; previous uuid[]; source uuid:=gen_random_uuid(); page uuid:=gen_random_uuid(); body text; i jsonb; undo jsonb; attempt_day date; attempts integer;
  -- Simon confirmed 2026-10-10: edit these three constants together with tests.
  daily_attempt_limit CONSTANT integer:=10;
  active_batch_limit CONSTANT integer:=20;
  retained_byte_limit CONSTANT bigint:=2097152; -- 2 MiB of canonical retained data
  retained_bytes bigint; error_code text; error_message text;
BEGIN
  PERFORM public.profile_import_account_guard(owner);
  -- The owner row is locked before attempts, idempotency and all capacity reads.
  attempt_day:=(clock_timestamp() AT TIME ZONE 'UTC')::date;
  SELECT CASE WHEN profile_import_attempt_day=attempt_day THEN profile_import_attempt_count ELSE 0 END
    INTO attempts FROM public.users WHERE id=owner;
  -- Every call, including an identical receipt retry, consumes an attempt.
  -- Check the cap before serializing or hashing any caller-controlled payload.
  IF attempts>=daily_attempt_limit THEN
    PERFORM set_config('response.status','429',true);
    RETURN jsonb_build_object('code','PT429','message','profile_import_daily_limit','details',NULL,'hint',NULL);
  END IF;
  UPDATE public.users SET profile_import_attempt_day=attempt_day,profile_import_attempt_count=attempts+1 WHERE id=owner;
  -- Catch input/CAS/capacity errors inside the attempt transaction, so they do not
  -- roll back its counter. PostgREST returns the existing code/message error shape.
  BEGIN
  IF p_request_id IS NULL OR p_profile_patch IS NULL OR jsonb_typeof(p_profile_patch)<>'object'
    OR p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
  -- Bound document, patch and arrays before the combined JSON/digest allocation.
  IF p_document IS NULL OR octet_length(p_document::text)>262144 THEN
    RAISE EXCEPTION 'profile_import_size' USING ERRCODE='22023'; END IF;
  IF octet_length(p_profile_patch::text)>4096 THEN RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_document) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_document->'sources') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_document->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(p_document->'sources')>100 OR jsonb_array_length(p_document->'items') NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
  IF p_confirmed_ids IS NULL OR cardinality(p_confirmed_ids)>50 OR coalesce(array_ndims(p_confirmed_ids),1)<>1
    OR EXISTS(SELECT 1 FROM unnest(p_confirmed_ids) id WHERE id IS NULL OR char_length(id)>64) THEN
    RAISE EXCEPTION 'profile_import_confirmation' USING ERRCODE='22023'; END IF;
  signature:=encode(sha256(convert_to(jsonb_build_object('document',p_document,'confirmed',p_confirmed_ids,
    'patch',p_profile_patch,'revision',p_expected_revision)::text,'UTF8')),'hex');
  SELECT * INTO batch FROM public.profile_context_imports WHERE user_id=owner AND request_id=p_request_id;
  -- Retries consume attempts, but no extra storage and cannot revive withdrawals.
  IF FOUND AND batch.request_digest=signature THEN RETURN public.profile_import_receipt(batch); END IF;
  IF batch.id IS NOT NULL THEN RAISE EXCEPTION 'profile_import_request_conflict' USING ERRCODE='PT409'; END IF;
  PERFORM public.validate_profile_import_document(p_document,p_confirmed_ids);
  IF (SELECT count(*) FROM public.profile_context_imports WHERE user_id=owner AND status='active')>=active_batch_limit THEN
    RAISE EXCEPTION 'profile_import_active_limit' USING ERRCODE='PT429'; END IF;
  SELECT * INTO u FROM public.users WHERE id=owner;
  cleaned:=public.validate_profile_import_details(p_profile_patch,u.birth_date);
  SELECT coalesce(jsonb_object_agg(key,value),'{}') INTO cleaned FROM jsonb_each(cleaned)
    WHERE u.profile_details->key IS DISTINCT FROM value;
  IF cleaned<>'{}'::jsonb AND u.profile_details_revision<>p_expected_revision THEN
    RAISE EXCEPTION 'profile_import_profile_conflict' USING ERRCODE='PT409'; END IF;
  SELECT coalesce(array_agg(id),'{}') INTO previous FROM public.profile_context_imports
    WHERE user_id=owner AND status='active' AND profile_change_count>0;
  SELECT coalesce(jsonb_object_agg(f.key,jsonb_build_object(
    'before',u.profile_details->f.key,'after',f.value,'before_known',true,'predecessor',(
      SELECT b.id FROM public.profile_context_imports b
        WHERE b.user_id=owner AND b.status='active' AND b.field_undo->f.key->'after'=u.profile_details->f.key
        ORDER BY b.applied_revision DESC,b.id DESC LIMIT 1
    ))),'{}') INTO undo FROM jsonb_each(cleaned) f;
  -- Canonical document + undo + bounded receipt allowance. Source/page are fixed
  -- renderings of this same document, not separately accepted unbounded inputs.
  -- Count withdrawn receipts too; repeated import/withdraw cannot grow forever.
  SELECT coalesce(sum(coalesce(octet_length(document::text),0)+octet_length(field_undo::text)+512),0)
    INTO retained_bytes FROM public.profile_context_imports WHERE user_id=owner;
  IF retained_bytes+octet_length(p_document::text)+octet_length(undo::text)+512>retained_byte_limit THEN
    RAISE EXCEPTION 'profile_import_storage_limit' USING ERRCODE='PT429'; END IF;
  body:=E'# AI conversation import\n\nSelected statements, reviewed by the account owner. External source claims are not independently verified.\n';
  FOR i IN SELECT value FROM jsonb_array_elements(p_document->'items') LOOP
    body:=body||E'\n    '||replace(i->>'statement',E'\n',E'\n    ')||E'\n    '||
      replace(jsonb_build_object('category',i->'category','reported_basis',i->'reported_basis','valid_time',i->'valid_time',
        'evidence_ids',i->'evidence_ids','confirmed_by_user',(i->>'id')=ANY(p_confirmed_ids))::text,E'\n',E'\n    ')||E'\n';
  END LOOP;
  body:=body||E'\n## External provenance\n\n    '||replace(jsonb_pretty(p_document-'items'),E'\n',E'\n    ');
  batch.id:=gen_random_uuid();
  INSERT INTO public.sources(id,user_id,kind,title,storage_path,frontmatter,ingested,ingested_at)
    VALUES(source,owner,'self_knowledge','AI conversation import','',
      jsonb_build_object('profile_context_import_id',batch.id,'_body_fallback',body,'profile_context_no_expansion',true),true,now());
  INSERT INTO public.wiki_pages(id,user_id,slug,kind,title,body_md,source_id,frontmatter)
    VALUES(page,owner,'profile-context-'||batch.id::text,'source','AI conversation import',body,source,
      jsonb_build_object('profile_context_import_id',batch.id,'profile_context_no_expansion',true));
  IF cleaned<>'{}'::jsonb THEN
    UPDATE public.users SET profile_details=coalesce(profile_details,'{}')||cleaned WHERE id=owner;
  END IF;
  INSERT INTO public.profile_context_imports(id,user_id,request_id,request_digest,item_count,profile_change_count,
    source_id,document,confirmed_ids,profile_before,profile_patch,profile_predecessors,applied_revision,field_undo)
    VALUES(batch.id,owner,p_request_id,signature,jsonb_array_length(p_document->'items'),(SELECT count(*) FROM jsonb_object_keys(cleaned)),
      source,p_document,p_confirmed_ids,CASE WHEN cleaned<>'{}'::jsonb THEN u.profile_details ELSE NULL END,cleaned,previous,
      (SELECT profile_details_revision FROM public.users WHERE id=owner),undo) RETURNING * INTO batch;
  RETURN public.profile_import_receipt(batch);
  EXCEPTION WHEN SQLSTATE '22023' OR SQLSTATE '42501' OR SQLSTATE 'PT409' OR SQLSTATE 'PT429' THEN
    GET STACKED DIAGNOSTICS error_code=RETURNED_SQLSTATE,error_message=MESSAGE_TEXT;
    PERFORM set_config('response.status',CASE error_code WHEN 'PT429' THEN '429' WHEN 'PT409' THEN '409'
      WHEN '42501' THEN '403' ELSE '400' END,true);
    RETURN jsonb_build_object('code',error_code,'message',error_message,'details',NULL,'hint',NULL);
  END;
END $$;


-- 0240 already registers this same retained owner table; no new table or erasure
-- class is introduced. Column-specific rules also live in the service-contract
-- erasure sidecar. Keep the historical registry-only migrations replayable.
COMMENT ON COLUMN public.profile_context_imports.field_undo IS
  'Per-field import undo; retained only while an active descendant needs it, cleared after last withdrawal, cascaded with account.';
COMMENT ON COLUMN public.users.profile_import_attempt_day IS
  'UTC quota day; content deletion does not reset this counter; removed with account.';
COMMENT ON COLUMN public.users.profile_import_attempt_count IS
  'Bounded daily attempt count, including rejected input; removed with account.';

ALTER TABLE public.profile_context_imports FORCE ROW LEVEL SECURITY;
REVOKE ALL ON FUNCTION public.withdraw_profile_import_internal(uuid,boolean),
  public.clear_profile_import_on_source_delete(),public.validate_profile_import_document(jsonb,text[]),
  public.apply_profile_context_import(uuid,jsonb,text[],jsonb,bigint),public.withdraw_profile_context_import(uuid),
  public.save_profile_details_revision(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apply_profile_context_import(uuid,jsonb,text[],jsonb,bigint),
  public.withdraw_profile_context_import(uuid),public.save_profile_details_revision(jsonb,bigint) TO authenticated;
