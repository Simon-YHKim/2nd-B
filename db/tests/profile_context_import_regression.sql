-- 0239 regression. Every synthetic row is rolled back; tests run real RPC/RLS.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='20s';
CREATE FUNCTION pg_temp.profile_import_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.profile_import_error(statement text,code text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE; END;
  IF actual IS DISTINCT FROM code THEN RAISE EXCEPTION 'expected %, got %: %',code,actual,statement; END IF;
END $$;
CREATE FUNCTION pg_temp.profile_import_doc(basis text DEFAULT 'user_statement') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('format','polascope.user-context','version','1.0-draft',
    'origin',jsonb_build_object('service','unknown','model',NULL,'exported_at',NULL),
    'coverage',jsonb_build_object('accessed',ARRAY['current_chat'],'unavailable','[]'::jsonb,'omissions','[]'::jsonb,'more_items','unknown','account_completeness','unknown'),
    'sources',jsonb_build_array(jsonb_build_object('id','s1','kind','chat_excerpt','speaker','user','conversation_id',NULL,'message_id',NULL,'label',NULL,'occurred_at',NULL,'excerpt','I enjoy walking.')),
    'items',jsonb_build_array(jsonb_build_object('id','i1','category','preference','statement','I enjoy walking.','reported_basis',basis,
      'evidence_ids',ARRAY['s1'],'valid_time',jsonb_build_object('from',NULL,'to',NULL,'description',NULL),'conflicts_with','[]'::jsonb)))
$$;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('26100939-0000-4000-8000-000000000001','profile-owner@example.invalid',now()),
 ('26100939-0000-4000-8000-000000000002','profile-other@example.invalid',now()),
 ('26100939-0000-4000-8000-000000000003','profile-minor@example.invalid',now());
INSERT INTO public.users(id,email,birth_date,profile_details) VALUES
 ('26100939-0000-4000-8000-000000000001','profile-owner@example.invalid','1990-01-01','{"occupation":"Writer","region":"Seoul"}'),
 ('26100939-0000-4000-8000-000000000002','profile-other@example.invalid','1990-01-01','{}'),
 ('26100939-0000-4000-8000-000000000003','profile-minor@example.invalid',(current_date-interval '16 years')::date,'{}');

SELECT pg_temp.profile_import_assert(NOT has_function_privilege('anon','public.apply_profile_context_import(uuid,jsonb,text[],jsonb,bigint)','EXECUTE'),'anonymous cannot apply');
SELECT pg_temp.profile_import_assert(NOT has_function_privilege('authenticated','public.validate_profile_import_document(jsonb,text[])','EXECUTE'),'private helper ACL');
SELECT pg_temp.profile_import_assert(NOT has_table_privilege('authenticated','public.profile_context_imports','INSERT'),'ledger is server written');
SELECT pg_temp.profile_import_assert(NOT has_column_privilege('authenticated','public.users','profile_details_revision','UPDATE'),'revision is server written');

-- Existing server maintenance still works without direct ledger privileges.
SET LOCAL ROLE service_role;
INSERT INTO public.sources(id,user_id,kind,title,storage_path) VALUES('26100939-3000-4000-8000-000000000001','26100939-0000-4000-8000-000000000001','inbox','Ordinary source','');
UPDATE public.sources SET title='Ordinary source updated' WHERE id='26100939-3000-4000-8000-000000000001';
DELETE FROM public.sources WHERE id='26100939-3000-4000-8000-000000000001';
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='26100939-0000-4000-8000-000000000001';
SELECT pg_temp.profile_import_error($q$SELECT public.apply_profile_context_import(gen_random_uuid(),pg_temp.profile_import_doc('assistant_inference'),'{}','{}',0)$q$,'22023');
SELECT pg_temp.profile_import_error($q$SELECT public.apply_profile_context_import(gen_random_uuid(),pg_temp.profile_import_doc('unknown'),'{}','{}',0)$q$,'22023');
SELECT pg_temp.profile_import_error($q$SELECT public.apply_profile_context_import(gen_random_uuid(),pg_temp.profile_import_doc('memory_summary'),'{}','{}',0)$q$,'22023');
SELECT pg_temp.profile_import_error($q$SELECT public.apply_profile_context_import(gen_random_uuid(),jsonb_set(pg_temp.profile_import_doc(),'{sources,0,excerpt}','null'),'{}','{}',0)$q$,'22023');
SELECT pg_temp.profile_import_error($q$SELECT public.apply_profile_context_import(gen_random_uuid(),pg_temp.profile_import_doc()||'{"owner_id":"forged"}','{}','{}',0)$q$,'22023');
SELECT pg_temp.profile_import_error($q$SELECT public.apply_profile_context_import(gen_random_uuid(),jsonb_set(pg_temp.profile_import_doc(),'{items,0,evidence_ids}','["missing"]'),'{}','{}',0)$q$,'22023');
SELECT pg_temp.profile_import_error($q$SELECT public.apply_profile_context_import(gen_random_uuid(),jsonb_set(pg_temp.profile_import_doc(),'{items,0,valid_time,from}','"2026-02-30"'),'{}','{}',0)$q$,'22023');
SELECT pg_temp.profile_import_error($q$SELECT public.apply_profile_context_import(gen_random_uuid(),jsonb_set(pg_temp.profile_import_doc(),'{items,0,statement}',to_jsonb(repeat('a',801))),'{}','{}',0)$q$,'22023');
SELECT pg_temp.profile_import_error($q$SELECT public.apply_profile_context_import(gen_random_uuid(),jsonb_set(pg_temp.profile_import_doc(),'{items,0,statement}','"\n\t"'),'{}','{}',0)$q$,'22023');
SELECT pg_temp.profile_import_error($q$SELECT public.apply_profile_context_import(gen_random_uuid(),jsonb_set(pg_temp.profile_import_doc(),'{items,0,valid_time}','{"from":"2026-01-01","to":"2025-12-31T16:00:00Z","description":null}'),'{}','{}',0)$q$,'22023');
SELECT pg_temp.profile_import_error($q$SELECT public.apply_profile_context_import(gen_random_uuid(),jsonb_set(pg_temp.profile_import_doc(),'{items,0,evidence_ids}','[]'),'{}','{}',0)$q$,'22023');
SELECT pg_temp.profile_import_error($q$SELECT public.apply_profile_context_import(gen_random_uuid(),pg_temp.profile_import_doc(),ARRAY['i1','i1'],'{}',0)$q$,'22023');
SELECT pg_temp.profile_import_error($q$SELECT public.apply_profile_context_import(gen_random_uuid(),pg_temp.profile_import_doc(),'{}','{"display_name":"Forbidden"}',0)$q$,'22023');
SELECT pg_temp.profile_import_error($q$SELECT public.apply_profile_context_import(gen_random_uuid(),pg_temp.profile_import_doc(),'{}','{"gender":"invalid"}',0)$q$,'22023');
SELECT pg_temp.profile_import_error($q$SELECT public.apply_profile_context_import(gen_random_uuid(),pg_temp.profile_import_doc(),'{}','{"occupation":"Designer"}',100)$q$,'PT409');
SELECT pg_temp.profile_import_assert((SELECT count(*)=0 FROM public.profile_context_imports),'rejections leave no ledger');
SELECT pg_temp.profile_import_assert((SELECT count(*)=0 FROM public.sources),'rejections leave no source');

-- Atomic save, actual user confirmation, original provenance, retry and RLS.
SELECT public.apply_profile_context_import('26100939-1000-4000-8000-000000000001',pg_temp.profile_import_doc('assistant_inference'),ARRAY['i1'],'{"occupation":"Designer"}',0) AS first_receipt \gset
SELECT pg_temp.profile_import_assert((SELECT profile_details->>'occupation'='Designer' AND profile_details->>'region'='Seoul' AND profile_details_revision=1 FROM public.users WHERE id=auth.uid()),'patch preserves unrelated fields and increments revision');
SELECT pg_temp.profile_import_assert((SELECT count(*)=1 FROM public.sources WHERE ingested AND frontmatter ? '_body_fallback' AND frontmatter ? 'profile_context_import_id'),'one source inline and ingested');
SELECT pg_temp.profile_import_assert((SELECT count(*)=1 FROM public.wiki_pages WHERE kind='source' AND body_md LIKE '%assistant_inference%'),'dedicated page preserves original basis');
SELECT pg_temp.profile_import_assert(public.apply_profile_context_import('26100939-1000-4000-8000-000000000001',pg_temp.profile_import_doc('assistant_inference'),ARRAY['i1'],'{"occupation":"Designer"}',0)=:'first_receipt'::jsonb,'same key retry returns receipt');
SELECT pg_temp.profile_import_error($q$SELECT public.apply_profile_context_import('26100939-1000-4000-8000-000000000001',pg_temp.profile_import_doc(),ARRAY['i1'],'{"occupation":"Designer"}',0)$q$,'PT409');
SELECT pg_temp.profile_import_error($q$UPDATE public.sources SET frontmatter='{}' WHERE user_id=auth.uid()$q$,'42501');
SELECT pg_temp.profile_import_error($q$DELETE FROM public.wiki_pages WHERE user_id=auth.uid()$q$,'42501');
SELECT pg_temp.profile_import_error($q$DELETE FROM public.sources WHERE user_id=auth.uid()$q$,'42501');
SELECT pg_temp.profile_import_error($q$INSERT INTO public.sources(user_id,kind,title,storage_path,frontmatter) VALUES(auth.uid(),'self_knowledge','forge','','{"profile_context_import_id":"forged"}')$q$,'42501');
SELECT pg_temp.profile_import_error($q$INSERT INTO public.wiki_pages(user_id,slug,kind,title,source_id) SELECT auth.uid(),'forge','source','forge',source_id FROM public.profile_context_imports$q$,'42501');
SET LOCAL request.jwt.claim.sub='26100939-0000-4000-8000-000000000002';
SELECT pg_temp.profile_import_assert((SELECT count(*)=0 FROM public.profile_context_imports),'other owner history hidden');
SELECT pg_temp.profile_import_error(format('SELECT public.withdraw_profile_context_import(%L)',(:'first_receipt'::jsonb->>'id')),'P0002');
SELECT pg_temp.profile_import_error(format($q$INSERT INTO public.wiki_pages(user_id,slug,kind,title,source_id) VALUES(auth.uid(),'foreign-import','source','Foreign',%L)$q$,(:'first_receipt'::jsonb->>'source_id')),'42501');
INSERT INTO public.wiki_pages(user_id,slug,kind,title) VALUES(auth.uid(),'own-entity','entity','Own page');
SELECT pg_temp.profile_import_error(format($q$UPDATE public.wiki_pages SET kind='source',source_id=%L WHERE user_id=auth.uid() AND slug='own-entity'$q$,(:'first_receipt'::jsonb->>'source_id')),'42501');
DELETE FROM public.wiki_pages WHERE user_id=auth.uid() AND slug='own-entity';
SET LOCAL request.jwt.claim.sub='26100939-0000-4000-8000-000000000003';
SELECT pg_temp.profile_import_error($q$SELECT public.apply_profile_context_import(gen_random_uuid(),pg_temp.profile_import_doc(),'{}','{"marital":"single"}',0)$q$,'42501');
SET LOCAL request.jwt.claim.sub='26100939-0000-4000-8000-000000000001';

-- Unchanged revision restores the previous profile; repeated withdrawal is safe.
SELECT public.withdraw_profile_context_import((:'first_receipt'::jsonb->>'id')::uuid) AS withdrawn_receipt \gset
SELECT pg_temp.profile_import_assert((:'withdrawn_receipt'::jsonb->>'profile_restored')::boolean,'unchanged profile restored');
SELECT pg_temp.profile_import_assert((SELECT profile_details->>'occupation'='Writer' AND profile_details_revision=2 FROM public.users WHERE id=auth.uid()),'restoration preserves other fields');
SELECT pg_temp.profile_import_assert((SELECT count(*)=0 FROM public.sources),'withdrawal removes source');
SELECT pg_temp.profile_import_assert((SELECT count(*)=0 FROM public.wiki_pages),'withdrawal removes page');
SELECT pg_temp.profile_import_assert((SELECT document IS NULL AND profile_before IS NULL AND profile_patch='{}' AND confirmed_ids='{}' AND item_count=1 AND profile_change_count=1 FROM public.profile_context_imports),'withdrawal clears imported text and keeps counts');
SELECT pg_temp.profile_import_assert(public.withdraw_profile_context_import((:'first_receipt'::jsonb->>'id')::uuid)=:'withdrawn_receipt'::jsonb,'withdraw retry');
SELECT pg_temp.profile_import_assert(public.apply_profile_context_import('26100939-1000-4000-8000-000000000001',pg_temp.profile_import_doc('assistant_inference'),ARRAY['i1'],'{"occupation":"Designer"}',0)->>'status'='withdrawn','apply retry cannot resurrect');

-- Old direct writers fail closed; manual editing requires a current revision.
SELECT public.apply_profile_context_import('26100939-1000-4000-8000-000000000002',pg_temp.profile_import_doc(),'{}','{"occupation":"Maker"}',2) AS second_receipt \gset
SELECT pg_temp.profile_import_error($q$UPDATE public.users SET profile_details=profile_details||'{"region":"Busan"}' WHERE id=auth.uid()$q$,'42501');
SELECT pg_temp.profile_import_error($q$SELECT public.save_profile_details_revision('{"occupation":"Old client"}',2)$q$,'PT409');
SELECT pg_temp.profile_import_error($q$SELECT public.save_profile_details_revision('{"unknown":"bad"}',3)$q$,'22023');
SELECT pg_temp.profile_import_assert(public.save_profile_details_revision('{"occupation":"Maker","region":"Busan"}',3)='{"revision":4}'::jsonb,'manual CAS save');
SELECT pg_temp.profile_import_assert(NOT (public.withdraw_profile_context_import((:'second_receipt'::jsonb->>'id')::uuid)->>'profile_restored')::boolean,'later manual edit not restored');
SELECT pg_temp.profile_import_assert((SELECT profile_details->>'occupation'='Maker' AND profile_details->>'region'='Busan' FROM public.users WHERE id=auth.uid()),'later edit preserved');

-- A withdrawn predecessor must never come back through a later batch undo.
SELECT profile_details_revision AS revision FROM public.users WHERE id=auth.uid() \gset
SELECT public.apply_profile_context_import('26100939-1000-4000-8000-000000000003',pg_temp.profile_import_doc(),'{}','{"occupation":"A"}',:revision) AS a_receipt \gset
SELECT profile_details_revision AS revision FROM public.users WHERE id=auth.uid() \gset
SELECT public.apply_profile_context_import('26100939-1000-4000-8000-000000000004',pg_temp.profile_import_doc(),'{}','{"occupation":"B"}',:revision) AS b_receipt \gset
SELECT public.withdraw_profile_context_import((:'a_receipt'::jsonb->>'id')::uuid);
SELECT pg_temp.profile_import_assert(NOT (public.withdraw_profile_context_import((:'b_receipt'::jsonb->>'id')::uuid)->>'profile_restored')::boolean,'withdrawn predecessor not restored');
SELECT pg_temp.profile_import_assert((SELECT profile_details->>'occupation'='B' FROM public.users WHERE id=auth.uid()),'predecessor value remains absent');
SELECT profile_details_revision AS revision FROM public.users WHERE id=auth.uid() \gset
SELECT public.save_profile_details_revision('{}',:revision);
SELECT pg_temp.profile_import_assert((SELECT profile_details='{}'::jsonb FROM public.users WHERE id=auth.uid()),'manual clear profile');

-- No profile patch can save records despite a stale profile revision.
SELECT public.apply_profile_context_import('26100939-1000-4000-8000-000000000005',pg_temp.profile_import_doc(),'{}','{}',0) AS no_patch_receipt \gset
RESET ROLE;
-- Privileged content erasure follows existing wiki-before-source ordering.
DELETE FROM public.wiki_pages WHERE source_id=(:'no_patch_receipt'::jsonb->>'source_id')::uuid;
DELETE FROM public.sources WHERE id=(:'no_patch_receipt'::jsonb->>'source_id')::uuid;
SELECT pg_temp.profile_import_assert((SELECT status='withdrawn' AND document IS NULL AND profile_before IS NULL FROM public.profile_context_imports WHERE id=(:'no_patch_receipt'::jsonb->>'id')::uuid),'content erasure clears ledger text');
INSERT INTO public.account_deletion_tombstones VALUES('26100939-0000-4000-8000-000000000001',gen_random_uuid());
SET LOCAL ROLE authenticated;
SELECT pg_temp.profile_import_error($q$SELECT public.apply_profile_context_import(gen_random_uuid(),pg_temp.profile_import_doc(),'{}','{}',0)$q$,'42501');
RESET ROLE;
DELETE FROM auth.users WHERE id='26100939-0000-4000-8000-000000000001';
SELECT pg_temp.profile_import_assert((SELECT count(*)=0 FROM public.profile_context_imports),'account deletion cascades receipts');
ROLLBACK;
\echo profile_context_import regression passed
