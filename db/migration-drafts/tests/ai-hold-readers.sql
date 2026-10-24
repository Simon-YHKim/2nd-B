\set ON_ERROR_STOP on
-- Disposable CI clone only. Never run against an application database.
DO $$ BEGIN
  IF current_database() <> 't28_ai_readers_test_ci' THEN
    RAISE EXCEPTION 'T28 requires its disposable CI clone';
  END IF;
END $$;
BEGIN;
-- Functional assertions use exact scans; ANN planning is exercised separately.
SET LOCAL enable_indexscan = off;
SET LOCAL enable_bitmapscan = off;
-- Capture the deployed function contracts and pre-draft search bodies.
CREATE TEMP TABLE t28_before_catalog AS
  SELECT oid, proname, proacl, proconfig, prosecdef, provolatile
  FROM pg_proc WHERE oid IN (
    'public.match_records(uuid,vector,integer,uuid,text)'::regprocedure,
    'public.match_wiki_pages(uuid,vector,integer,uuid,text)'::regprocedure,
    'public.reserve_polaris_generation(uuid,text)'::regprocedure,
    'public.polaris_evidence_snapshot(uuid,jsonb)'::regprocedure);
DO $$ DECLARE n text; BEGIN
  FOREACH n IN ARRAY ARRAY['match_records','match_wiki_pages'] LOOP
    EXECUTE replace(pg_get_functiondef(('public.'||n||'(uuid,vector,integer,uuid,text)')::regprocedure),
      'public.'||n||'(', 'pg_temp.t28_before_'||n||'(');
  END LOOP;
END $$;
\ir ../UNNUMBERED_ai_hold_readers.sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM t28_before_catalog b JOIN pg_proc p USING(oid)
    WHERE ROW(p.proacl,p.proconfig,p.prosecdef,p.provolatile)
      IS DISTINCT FROM ROW(b.proacl,b.proconfig,b.prosecdef,b.provolatile)) THEN
    RAISE EXCEPTION 'T28 changed ACL, search_path, invoker/definer or volatility';
  END IF;
  IF NOT has_function_privilege('authenticated','public.reserve_polaris_generation(uuid,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.match_records(uuid,vector,integer,uuid,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.match_wiki_pages(uuid,vector,integer,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'T28 lost authenticated RPC access';
  END IF;
END $$;
-- Match crisis_ai_hold_regression.sql: vanilla CI PostgreSQL does not install
-- Supabase's default table grants. These fixture grants still exercise RLS;
-- they roll back and are not part of the reader draft.
GRANT SELECT ON public.records, public.sources, public.wiki_pages, public.users TO authenticated;
-- Seed synthetic stale vectors deliberately: normal 0270 writes already clear
-- them. The readers must exclude holds even when an old vector is present.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id,email) VALUES
  ('28000000-0000-4000-8000-000000000080','t28-owner@example.invalid'),
  ('28000000-0000-4000-8000-000000000081','t28-other@example.invalid');
SET LOCAL session_replication_role = origin;
-- Keep the real age-tier derivation for users; only corpus vectors are stale.
INSERT INTO public.users(id,email,birth_date,locale) VALUES
  ('28000000-0000-4000-8000-000000000080','t28-owner@example.invalid','1990-01-01','en'),
  ('28000000-0000-4000-8000-000000000081','t28-other@example.invalid','1990-01-01','en');
SET LOCAL session_replication_role = replica;
INSERT INTO public.records(id,user_id,kind,audit_period,body,system_tags,ai_hold,embedding,embedding_model) VALUES
  ('28000000-0000-4000-8000-000000000082','28000000-0000-4000-8000-000000000080','audit_response','work','ordinary interview',ARRAY['interview'],false,array_fill(1::real,ARRAY[768])::vector,'t28-fixture'),
  ('28000000-0000-4000-8000-000000000083','28000000-0000-4000-8000-000000000080','audit_response','work','held interview',ARRAY['interview'],true,array_fill(1::real,ARRAY[768])::vector,'t28-fixture'),
  ('28000000-0000-4000-8000-000000000084','28000000-0000-4000-8000-000000000081','audit_response','work','other owner',ARRAY['interview'],false,array_fill(1::real,ARRAY[768])::vector,'t28-fixture');
-- Replica-only inconsistent legacy row proves interview_ai_hold independently.
INSERT INTO public.records(id,user_id,kind,audit_period,body,system_tags,ai_hold,interview_ai_hold,embedding,embedding_model) VALUES
  ('28000000-0000-4000-8000-000000000085','28000000-0000-4000-8000-000000000080','audit_response','work','interview-only hold',ARRAY['interview'],false,true,array_fill(1::real,ARRAY[768])::vector,'t28-fixture');
INSERT INTO public.sources(id,user_id,kind,title,storage_path,ai_hold) VALUES
  ('28000000-0000-4000-8000-000000000086','28000000-0000-4000-8000-000000000080','article','held source','fixture/held.md',true);
INSERT INTO public.wiki_pages(id,user_id,slug,kind,title,body_md,source_id,ai_hold,embedding,embedding_model) VALUES
  ('28000000-0000-4000-8000-000000000087','28000000-0000-4000-8000-000000000080','t28-normal','concept','normal','ordinary page',null,false,array_fill(1::real,ARRAY[768])::vector,'t28-fixture'),
  ('28000000-0000-4000-8000-000000000088','28000000-0000-4000-8000-000000000080','t28-held','concept','held','held page',null,true,array_fill(1::real,ARRAY[768])::vector,'t28-fixture'),
  ('28000000-0000-4000-8000-000000000089','28000000-0000-4000-8000-000000000080','t28-parent','source','parent held','parent held page','28000000-0000-4000-8000-000000000086',false,array_fill(1::real,ARRAY[768])::vector,'t28-fixture'),
  ('28000000-0000-4000-8000-000000000090','28000000-0000-4000-8000-000000000081','t28-other','concept','other','other page',null,false,array_fill(1::real,ARRAY[768])::vector,'t28-fixture');
SET LOCAL session_replication_role = origin;
SET LOCAL request.jwt.claim.sub = '28000000-0000-4000-8000-000000000080';
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  u uuid := '28000000-0000-4000-8000-000000000080';
  other_u uuid := '28000000-0000-4000-8000-000000000081';
  v vector := array_fill(1::real,ARRAY[768])::vector;
BEGIN
  IF (SELECT array_agg(id) FROM public.match_records(u,v,8,null,'t28-fixture'))
      IS DISTINCT FROM ARRAY['28000000-0000-4000-8000-000000000082'::uuid] THEN
    RAISE EXCEPTION 'T28 record search exposed hold or lost ordinary row';
  END IF;
  IF (SELECT array_agg(id) FROM public.match_wiki_pages(u,v,8,null,'t28-fixture'))
      IS DISTINCT FROM ARRAY['28000000-0000-4000-8000-000000000087'::uuid] THEN
    RAISE EXCEPTION 'T28 page search exposed page/parent hold or lost ordinary row';
  END IF;
  IF EXISTS (SELECT 1 FROM public.match_records(other_u,v))
      OR EXISTS (SELECT 1 FROM public.match_wiki_pages(other_u,v)) THEN
    RAISE EXCEPTION 'T28 search crossed owner RLS';
  END IF;
  IF EXISTS (SELECT 1 FROM public.match_records(u,v,8,null,'different-model'))
      OR EXISTS (SELECT 1 FROM public.match_wiki_pages(u,v,8,null,'different-model'))
      OR EXISTS (SELECT 1 FROM public.match_records(u,v,8,'28000000-0000-4000-8000-000000000082','t28-fixture'))
      OR EXISTS (SELECT 1 FROM public.match_wiki_pages(u,v,8,'28000000-0000-4000-8000-000000000087','t28-fixture')) THEN
    RAISE EXCEPTION 'T28 search changed model or exclude-id semantics';
  END IF;
  IF (SELECT count(*) FROM public.records WHERE user_id=u) <> 3
      OR (SELECT count(*) FROM public.wiki_pages WHERE user_id=u) <> 3
      OR (SELECT count(*) FROM public.sources WHERE user_id=u) <> 1 THEN
    RAISE EXCEPTION 'T28 filtered the original user tables';
  END IF;
  RAISE NOTICE 'T28 SEARCH PASS: hold, parent, ordinary, RLS, model, exclude, originals';
END $$;
RESET ROLE;
UPDATE public.polaris_generation_config SET enabled=true;
SET LOCAL ROLE authenticated;
SELECT public.reserve_polaris_generation('28000000-0000-4000-8000-000000000080','t28-held-readers');
RESET ROLE;
DO $$
DECLARE
  u uuid := '28000000-0000-4000-8000-000000000080';
  g uuid; evidence jsonb; held jsonb; snapshot jsonb;
BEGIN
  g := (public.reserve_polaris_generation(u,'t28-held-readers')->>'generation_id')::uuid;
  SELECT p.evidence INTO evidence FROM public.polaris_generations p WHERE p.id=g;
  IF jsonb_array_length(evidence) <> 1 OR evidence->0->>'id' <> '28000000-0000-4000-8000-000000000082' THEN
    RAISE EXCEPTION 'T28 reservation exposed held interview';
  END IF;
  snapshot := public.polaris_evidence_snapshot(u,evidence);
  IF jsonb_array_length(snapshot) <> 1 OR snapshot->0->>'excerpt' <> 'ordinary interview' THEN
    RAISE EXCEPTION 'T28 snapshot lost ordinary evidence';
  END IF;
  held := jsonb_build_array(jsonb_build_object('id','28000000-0000-4000-8000-000000000083',
    'domain','work','body_hash',encode(sha256(convert_to('held interview','UTF8')),'hex')));
  BEGIN
    PERFORM public.polaris_evidence_snapshot(u,held);
    RAISE EXCEPTION 'T28 snapshot accepted held evidence';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'polaris_evidence_changed' THEN RAISE; END IF;
  END;
  held := jsonb_build_array(jsonb_build_object('id','28000000-0000-4000-8000-000000000085',
    'domain','work','body_hash',encode(sha256(convert_to('interview-only hold','UTF8')),'hex')));
  BEGIN
    PERFORM public.polaris_evidence_snapshot(u,held);
    RAISE EXCEPTION 'T28 snapshot accepted interview-only hold';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'polaris_evidence_changed' THEN RAISE; END IF;
  END;
  UPDATE public.records SET ai_hold=true WHERE id='28000000-0000-4000-8000-000000000082';
  BEGIN
    PERFORM public.polaris_evidence_snapshot(u,evidence);
    RAISE EXCEPTION 'T28 snapshot accepted evidence held after reservation';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'polaris_evidence_changed' THEN RAISE; END IF;
  END;
  PERFORM public.cancel_polaris_generation(u,g);
  BEGIN
    PERFORM public.reserve_polaris_generation(u,'t28-only-held-remains');
    RAISE EXCEPTION 'T28 reserved an all-held corpus';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'polaris_no_evidence' THEN RAISE; END IF;
  END;
  IF has_function_privilege('authenticated','public.polaris_evidence_snapshot(uuid,jsonb)','EXECUTE')
      OR has_function_privilege('anon','public.match_records(uuid,vector,integer,uuid,text)','EXECUTE')
      OR has_function_privilege('anon','public.match_wiki_pages(uuid,vector,integer,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'T28 broadened RPC grants';
  END IF;
  RAISE NOTICE 'T28 POLARIS PASS: reservation, snapshot, late hold, all-held, ACL';
END $$;
\ir ai-hold-search-plans.sql
ROLLBACK;
