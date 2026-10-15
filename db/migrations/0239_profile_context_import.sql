-- Reviewed external statements are saved without an LLM call or Storage upload.
-- The ledger is the only writer of its dedicated source/page. No automatic wiki
-- expansion is allowed for these sources (the client also checks the marker).
SET LOCAL lock_timeout = '10s';

ALTER TABLE public.users ADD COLUMN profile_details_revision bigint NOT NULL DEFAULT 0
  CHECK (profile_details_revision >= 0);
CREATE FUNCTION public.bump_profile_details_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND current_user IN ('authenticated','anon')
    AND NEW.profile_details IS DISTINCT FROM OLD.profile_details THEN
    RAISE EXCEPTION 'profile_details_use_revision_rpc' USING ERRCODE='42501'; END IF;
  IF TG_OP='INSERT' THEN NEW.profile_details_revision := 0;
  ELSE NEW.profile_details_revision := OLD.profile_details_revision + 1; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profile_details_revision_writer
BEFORE INSERT OR UPDATE OF profile_details,profile_details_revision ON public.users
FOR EACH ROW EXECUTE FUNCTION public.bump_profile_details_revision();
REVOKE ALL ON FUNCTION public.bump_profile_details_revision() FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE public.profile_context_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  request_digest text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn')),
  item_count int NOT NULL CHECK (item_count BETWEEN 1 AND 50),
  profile_change_count int NOT NULL CHECK (profile_change_count BETWEEN 0 AND 7),
  source_id uuid REFERENCES public.sources(id) ON DELETE SET NULL,
  document jsonb,
  confirmed_ids text[] NOT NULL DEFAULT '{}',
  profile_before jsonb,
  profile_patch jsonb NOT NULL DEFAULT '{}',
  profile_predecessors uuid[] NOT NULL DEFAULT '{}',
  applied_revision bigint,
  profile_restored boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  UNIQUE (user_id,request_id),
  CHECK ((status='active' AND document IS NOT NULL AND withdrawn_at IS NULL)
    OR (status='withdrawn' AND document IS NULL AND profile_before IS NULL
      AND profile_patch='{}'::jsonb AND confirmed_ids='{}'::text[] AND withdrawn_at IS NOT NULL))
);
CREATE INDEX profile_context_imports_owner_time ON public.profile_context_imports(user_id,created_at DESC,id);
CREATE INDEX profile_context_imports_source ON public.profile_context_imports(source_id);
ALTER TABLE public.profile_context_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_context_imports FORCE ROW LEVEL SECURITY;
CREATE POLICY profile_context_imports_owner_read ON public.profile_context_imports
  FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
REVOKE ALL ON public.profile_context_imports FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.profile_context_imports TO authenticated;

-- Small private validators deliberately reject unknown keys and wrong types.
CREATE FUNCTION public.profile_import_object(v jsonb,keys text[]) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(v))<>cardinality(keys) OR NOT v ?& keys THEN
    RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
END $$;
CREATE FUNCTION public.profile_import_string(v jsonb,max_length int,nullable boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE s text;
BEGIN
  IF nullable AND v='null'::jsonb THEN RETURN; END IF;
  s:=v#>>'{}';
  IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR s !~ '[^[:space:]]' OR length(s)>max_length
    OR s ~ '[\x01-\x08\x0b\x0c\x0e-\x1f]' THEN
    RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
END $$;
CREATE FUNCTION public.profile_import_strings(v jsonb,max_count int,max_length int) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE entry jsonb; result text[]:='{}';
BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(v)>max_count THEN RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(v) LOOP
    PERFORM public.profile_import_string(entry,max_length);
    IF (entry#>>'{}')=ANY(result) THEN RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
    result:=array_append(result,entry#>>'{}');
  END LOOP;
  RETURN result;
END $$;
CREATE FUNCTION public.profile_import_date(v jsonb,timestamp_only boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE s text; parsed timestamptz;
BEGIN
  IF v='null'::jsonb THEN RETURN; END IF;
  PERFORM public.profile_import_string(v,35);
  s:=v#>>'{}';
  IF s !~ '^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2}))?$'
    OR (timestamp_only AND length(s)=10) THEN RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
  BEGIN
    parsed:=s::timestamptz;
    IF to_char(left(s,10)::date,'YYYY-MM-DD')<>left(s,10) THEN RAISE EXCEPTION 'invalid_date'; END IF;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END;
END $$;

CREATE FUNCTION public.validate_profile_import_document(doc jsonb,confirmed text[]) RETURNS void
LANGUAGE plpgsql SET search_path='' SET timezone='UTC' AS $$
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
    IF NOT (i->>'id')=ANY(confirmed) AND (i->>'reported_basis'<>'user_statement' OR NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(doc->'sources') evidence
      WHERE evidence->>'id'=ANY(refs) AND evidence->>'kind'='chat_excerpt' AND evidence->>'speaker'='user'
        AND jsonb_typeof(evidence->'excerpt')='string'
    )) THEN RAISE EXCEPTION 'profile_import_confirmation' USING ERRCODE='22023'; END IF;
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

CREATE FUNCTION public.validate_profile_import_details(details jsonb,birth date) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE field text; val jsonb; max_length int; cleaned jsonb:='{}';
BEGIN
  IF details IS NULL OR jsonb_typeof(details)<>'object' OR octet_length(details::text)>4096 THEN
    RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
  FOR field,val IN SELECT key,value FROM jsonb_each(details) LOOP
    max_length:=CASE field WHEN 'occupation' THEN 40 WHEN 'region' THEN 30 WHEN 'household' THEN 40
      WHEN 'gender' THEN 20 WHEN 'nationality' THEN 30 WHEN 'marital' THEN 20 WHEN 'motto' THEN 60 ELSE NULL END;
    IF max_length IS NULL THEN RAISE EXCEPTION 'profile_import_profile_field' USING ERRCODE='22023'; END IF;
    PERFORM public.profile_import_string(val,max_length);
    val:=to_jsonb(btrim(val#>>'{}'));
    IF (field='gender' AND val#>>'{}' NOT IN ('female','male','other','undisclosed'))
      OR (field='marital' AND val#>>'{}' NOT IN ('single','married','other','undisclosed')) THEN
      RAISE EXCEPTION 'profile_import_profile_value' USING ERRCODE='22023'; END IF;
    IF field='marital' AND (birth IS NULL OR birth>(current_date-interval '18 years')::date) THEN
      RAISE EXCEPTION 'profile_import_profile_age' USING ERRCODE='42501'; END IF;
    cleaned:=cleaned||jsonb_build_object(field,val);
  END LOOP;
  RETURN cleaned;
END $$;

CREATE FUNCTION public.profile_import_receipt(batch public.profile_context_imports) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('id',batch.id,'item_count',batch.item_count,'profile_change_count',batch.profile_change_count,
    'profile_patch',batch.profile_patch,'created_at',batch.created_at,'status',batch.status,
    'source_id',batch.source_id,'profile_restored',batch.profile_restored,'withdrawn_at',batch.withdrawn_at)
$$;
CREATE FUNCTION public.profile_import_account_guard(owner uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
BEGIN
  IF owner IS NULL THEN RAISE EXCEPTION 'profile_import_auth' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(owner::text,260913));
  PERFORM 1 FROM auth.users WHERE id=owner AND deleted_at IS NULL AND email_confirmed_at IS NOT NULL FOR SHARE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.account_deletion_tombstones WHERE user_id=owner) THEN
    RAISE EXCEPTION 'profile_import_account' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.users WHERE id=owner AND account_status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_import_account' USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION public.apply_profile_context_import(p_request_id uuid,p_document jsonb,p_confirmed_ids text[],p_profile_patch jsonb,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE owner uuid:=auth.uid(); batch public.profile_context_imports%ROWTYPE; u public.users%ROWTYPE;
  signature text; cleaned jsonb:='{}'; previous uuid[]; source uuid:=gen_random_uuid(); page uuid:=gen_random_uuid(); body text; i jsonb;
BEGIN
  PERFORM public.profile_import_account_guard(owner);
  IF p_request_id IS NULL OR p_profile_patch IS NULL OR jsonb_typeof(p_profile_patch)<>'object'
    OR p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
  PERFORM public.validate_profile_import_document(p_document,p_confirmed_ids);
  IF octet_length(p_profile_patch::text)>4096 THEN RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
  signature:=encode(sha256(convert_to(jsonb_build_object('document',p_document,'confirmed',p_confirmed_ids,
    'patch',p_profile_patch,'revision',p_expected_revision)::text,'UTF8')),'hex');
  SELECT * INTO batch FROM public.profile_context_imports WHERE user_id=owner AND request_id=p_request_id;
  IF FOUND THEN
    IF batch.request_digest<>signature THEN RAISE EXCEPTION 'profile_import_request_conflict' USING ERRCODE='PT409'; END IF;
    RETURN public.profile_import_receipt(batch);
  END IF;
  SELECT * INTO u FROM public.users WHERE id=owner;
  cleaned:=public.validate_profile_import_details(p_profile_patch,u.birth_date);
  SELECT coalesce(jsonb_object_agg(key,value),'{}') INTO cleaned FROM jsonb_each(cleaned)
    WHERE u.profile_details->key IS DISTINCT FROM value;
  IF cleaned<>'{}'::jsonb AND u.profile_details_revision<>p_expected_revision THEN
    RAISE EXCEPTION 'profile_import_profile_conflict' USING ERRCODE='PT409'; END IF;
  SELECT coalesce(array_agg(id),'{}') INTO previous FROM public.profile_context_imports
    WHERE user_id=owner AND status='active' AND profile_change_count>0;
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
    source_id,document,confirmed_ids,profile_before,profile_patch,profile_predecessors,applied_revision)
    VALUES(batch.id,owner,p_request_id,signature,jsonb_array_length(p_document->'items'),(SELECT count(*) FROM jsonb_object_keys(cleaned)),
      source,p_document,p_confirmed_ids,CASE WHEN cleaned<>'{}'::jsonb THEN u.profile_details ELSE NULL END,cleaned,previous,
      (SELECT profile_details_revision FROM public.users WHERE id=owner)) RETURNING * INTO batch;
  RETURN public.profile_import_receipt(batch);
END $$;

-- Manual profile editing uses the same version barrier. Older clients attempting
-- direct changed JSON writes fail closed instead of overwriting a newer import.
CREATE FUNCTION public.save_profile_details_revision(p_details jsonb,p_expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE owner uuid:=auth.uid(); u public.users%ROWTYPE; cleaned jsonb; revision bigint;
BEGIN
  PERFORM public.profile_import_account_guard(owner);
  SELECT * INTO u FROM public.users WHERE id=owner;
  IF p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION 'profile_import_contract' USING ERRCODE='22023'; END IF;
  IF u.profile_details_revision<>p_expected_revision THEN RAISE EXCEPTION 'profile_import_profile_conflict' USING ERRCODE='PT409'; END IF;
  cleaned:=public.validate_profile_import_details(p_details,u.birth_date);
  UPDATE public.users SET profile_details=cleaned WHERE id=owner RETURNING profile_details_revision INTO revision;
  RETURN jsonb_build_object('revision',revision);
END $$;

-- Any privileged source erasure (including the account/content erasure paths)
-- clears imported text and undo values. The tiny receipt prevents replay.
CREATE FUNCTION public.clear_profile_import_on_source_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
BEGIN
  UPDATE public.profile_context_imports SET status='withdrawn',document=NULL,confirmed_ids='{}',profile_before=NULL,
    profile_patch='{}',profile_predecessors='{}',withdrawn_at=coalesce(withdrawn_at,now()) WHERE source_id=OLD.id;
  RETURN OLD;
END $$;
CREATE TRIGGER zz_profile_import_source_erasure BEFORE DELETE ON public.sources
FOR EACH ROW EXECUTE FUNCTION public.clear_profile_import_on_source_delete();

-- SECURITY INVOKER is intentional: current_user is the trusted RPC owner only
-- inside a SECURITY DEFINER transaction; a caller-set GUC is never an authority.
CREATE FUNCTION public.guard_profile_import_rows() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE before_row jsonb:=CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  after_row jsonb:=CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
BEGIN
  -- Do not even plan ledger queries for service maintenance roles: the ledger
  -- intentionally grants no direct service_role table access.
  IF current_user NOT IN ('authenticated','anon') THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  -- A source invisible through RLS is not an acceptable reference. The older
  -- source_id FK is ID-only, so checking just its import marker would allow a
  -- foreign owner to attach a page and make source erasure fail its CHECK.
  IF TG_TABLE_NAME='wiki_pages' AND TG_OP<>'DELETE'
    AND after_row->>'source_id' IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM public.sources s WHERE s.id=(after_row->>'source_id')::uuid
        AND s.user_id=(after_row->>'user_id')::uuid
    ) THEN RAISE EXCEPTION 'profile_import_source_owner' USING ERRCODE='42501'; END IF;
  IF (
    (before_row->'frontmatter') ? 'profile_context_import_id' OR (after_row->'frontmatter') ? 'profile_context_import_id'
    OR (before_row->'frontmatter') ? 'profile_context_no_expansion' OR (after_row->'frontmatter') ? 'profile_context_no_expansion'
    OR EXISTS(SELECT 1 FROM public.profile_context_imports b WHERE b.source_id=coalesce(
      CASE WHEN TG_TABLE_NAME='sources' THEN before_row->>'id' ELSE before_row->>'source_id' END,
      CASE WHEN TG_TABLE_NAME='sources' THEN after_row->>'id' ELSE after_row->>'source_id' END)::uuid)
    OR EXISTS(SELECT 1 FROM public.sources s WHERE s.id=(after_row->>'source_id')::uuid
      AND s.frontmatter ? 'profile_context_import_id')
  ) THEN RAISE EXCEPTION 'profile_import_use_batch_operation' USING ERRCODE='42501'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER aa_profile_import_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.sources
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_import_rows();
CREATE TRIGGER aa_profile_import_wiki_guard BEFORE INSERT OR UPDATE OR DELETE ON public.wiki_pages
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_import_rows();

CREATE FUNCTION public.withdraw_profile_context_import(p_batch_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=off AS $$
DECLARE owner uuid:=auth.uid(); batch public.profile_context_imports%ROWTYPE; revision bigint; restored boolean:=false;
BEGIN
  PERFORM public.profile_import_account_guard(owner);
  SELECT * INTO batch FROM public.profile_context_imports WHERE id=p_batch_id AND user_id=owner FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_import_not_found' USING ERRCODE='P0002'; END IF;
  IF batch.status='withdrawn' THEN RETURN public.profile_import_receipt(batch); END IF;
  SELECT profile_details_revision INTO revision FROM public.users WHERE id=owner;
  IF batch.profile_change_count>0 AND revision=batch.applied_revision AND batch.profile_before IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM public.profile_context_imports p WHERE p.id=ANY(batch.profile_predecessors) AND p.status<>'active') THEN
    UPDATE public.users SET profile_details=batch.profile_before WHERE id=owner;
    restored:=true;
  END IF;
  -- wiki_links and page embeddings disappear with the dedicated pages. No
  -- shared entity is generated from these sources, so there is none to unlink.
  DELETE FROM public.wiki_pages WHERE source_id=batch.source_id AND user_id=owner;
  DELETE FROM public.sources WHERE id=batch.source_id AND user_id=owner;
  UPDATE public.profile_context_imports SET status='withdrawn',document=NULL,confirmed_ids='{}',profile_before=NULL,
    profile_patch='{}',profile_predecessors='{}',source_id=NULL,profile_restored=restored,withdrawn_at=now()
    WHERE id=batch.id RETURNING * INTO batch;
  RETURN public.profile_import_receipt(batch);
END $$;

REVOKE ALL ON FUNCTION public.profile_import_object(jsonb,text[]),public.profile_import_string(jsonb,int,boolean),
  public.profile_import_strings(jsonb,int,int),public.profile_import_date(jsonb,boolean),public.validate_profile_import_document(jsonb,text[]),
  public.validate_profile_import_details(jsonb,date),public.save_profile_details_revision(jsonb,bigint),
  public.profile_import_receipt(public.profile_context_imports),public.profile_import_account_guard(uuid),
  public.clear_profile_import_on_source_delete(),public.guard_profile_import_rows(),
  public.apply_profile_context_import(uuid,jsonb,text[],jsonb,bigint),public.withdraw_profile_context_import(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apply_profile_context_import(uuid,jsonb,text[],jsonb,bigint),public.withdraw_profile_context_import(uuid),
  public.save_profile_details_revision(jsonb,bigint) TO authenticated;
