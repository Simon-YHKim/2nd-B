-- Runs after the 0239 regression on a disposable loopback database only.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE g4_checks(label text);
CREATE FUNCTION pg_temp.g4_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'G4 assertion: %',label; END IF;
  INSERT INTO pg_temp.g4_checks VALUES(label);
END $$;
CREATE FUNCTION pg_temp.g4_doc() RETURNS jsonb LANGUAGE sql AS $$
 SELECT '{"format":"polascope.user-context","version":"1.0-draft","origin":{"service":"unknown","model":null,"exported_at":null},"coverage":{"accessed":[],"unavailable":[],"omissions":[],"more_items":"unknown","account_completeness":"unknown"},"sources":[{"id":"s","kind":"chat_excerpt","speaker":"user","conversation_id":null,"message_id":null,"label":null,"occurred_at":null,"excerpt":"Hello"}],"items":[{"id":"i","category":"preference","statement":"Unrelated external claim","reported_basis":"user_statement","evidence_ids":["s"],"valid_time":{"from":null,"to":null,"description":null},"conflicts_with":[]}]}'::jsonb
$$;
CREATE FUNCTION pg_temp.g4_apply(patch jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.apply_profile_context_import(gen_random_uuid(),pg_temp.g4_doc(),'{i}',patch,
   (SELECT profile_details_revision FROM public.users WHERE id=auth.uid()))
$$;
-- Legacy active and withdrawn rows, including a destroyed predecessor snapshot.
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('26101042-0000-4000-8000-000000000001','g4@example.invalid',now());
INSERT INTO public.users(id,email,birth_date,profile_details) VALUES('26101042-0000-4000-8000-000000000001','g4@example.invalid','1990-01-01','{"occupation":"base"}');
SET LOCAL request.jwt.claim.sub='26101042-0000-4000-8000-000000000001';
SELECT pg_temp.g4_apply('{"occupation":"A"}') AS old_a \gset
SELECT pg_temp.g4_apply('{"occupation":"B"}') AS old_b \gset
SELECT public.withdraw_profile_context_import((:'old_a'::jsonb->>'id')::uuid);
-- Reproduce G4-01 before applying the forward migration.
SELECT profile_details_revision AS before_noop FROM public.users WHERE id=auth.uid() \gset
SELECT public.save_profile_details_revision('{"occupation":"B"}',:before_noop);
SELECT pg_temp.g4_assert((SELECT profile_details_revision=:before_noop+1 FROM public.users WHERE id=auth.uid()),'legacy no-op increments revision');
SELECT pg_temp.g4_apply('{"region":"Seoul"}') AS old_c \gset
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('26101042-0000-4000-8000-000000000002','g4-backfill@example.invalid',now());
INSERT INTO public.users(id,email,birth_date,profile_details) VALUES('26101042-0000-4000-8000-000000000002','g4-backfill@example.invalid','1990-01-01','{"occupation":"base"}');
SET LOCAL request.jwt.claim.sub='26101042-0000-4000-8000-000000000002';
SELECT pg_temp.g4_apply('{"occupation":"A"}') AS legacy_active_a \gset
SELECT pg_temp.g4_apply('{"occupation":"B"}') AS legacy_active_b \gset
\ir ../migrations/0242_profile_context_import_integrity.sql
SELECT public.withdraw_profile_context_import((:'legacy_active_a'::jsonb->>'id')::uuid);
SELECT public.withdraw_profile_context_import((:'legacy_active_b'::jsonb->>'id')::uuid);
SELECT pg_temp.g4_assert((SELECT profile_details='{"occupation":"base"}' FROM public.users WHERE id=auth.uid()),'legacy active chain backfill restores base');
DELETE FROM auth.users WHERE id=auth.uid();
SET LOCAL request.jwt.claim.sub='26101042-0000-4000-8000-000000000001';
SELECT pg_temp.g4_assert((SELECT field_undo ? 'occupation' FROM public.profile_context_imports WHERE id=(:'old_b'::jsonb->>'id')::uuid),'active backfill');
SELECT pg_temp.g4_assert((SELECT field_undo='{}' FROM public.profile_context_imports WHERE id=(:'old_a'::jsonb->>'id')::uuid),'destroyed undo is not invented');
SELECT public.withdraw_profile_context_import((:'old_b'::jsonb->>'id')::uuid);
SELECT pg_temp.g4_assert((SELECT profile_details->>'occupation'='B' FROM public.users WHERE id=auth.uid()),'unknown legacy before is conservatively preserved');
DELETE FROM auth.users WHERE id=auth.uid();
COMMIT;

BEGIN;
SET LOCAL statement_timeout='20s';
SELECT pg_temp.g4_assert(NOT has_function_privilege('authenticated','public.withdraw_profile_import_internal(uuid,boolean)','EXECUTE'),'internal withdrawal ACL');
SELECT pg_temp.g4_assert(NOT has_function_privilege('anon','public.apply_profile_context_import(uuid,jsonb,text[],jsonb,bigint)','EXECUTE'),'anonymous ACL');
SELECT pg_temp.g4_assert(NOT has_column_privilege('authenticated','public.users','profile_import_attempt_count','UPDATE'),'counter cannot be reset by client');
SELECT pg_temp.g4_assert((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.profile_context_imports'::regclass),'FORCE RLS');

DO $$
DECLARE owner uuid; a jsonb; b jsonb; c jsonb; result jsonb; revision bigint; field_b text; reverse_order boolean;
BEGIN
  -- Both cancellation orders, same/different fields, without revision coupling.
  FOREACH field_b IN ARRAY ARRAY['occupation','region'] LOOP
    FOREACH reverse_order IN ARRAY ARRAY[false,true] LOOP
      owner:=gen_random_uuid();
      INSERT INTO auth.users VALUES(owner,'g4-order@example.invalid',now(),NULL);
      INSERT INTO public.users(id,email,birth_date,profile_details) VALUES(owner,'g4-order@example.invalid','1990-01-01','{"occupation":"base"}');
      PERFORM set_config('request.jwt.claim.sub',owner::text,true);
      a:=pg_temp.g4_apply('{"occupation":"A"}'); b:=pg_temp.g4_apply(jsonb_build_object(field_b,'B'));
      IF reverse_order THEN
        PERFORM public.withdraw_profile_context_import((b->>'id')::uuid);
        PERFORM pg_temp.g4_assert((SELECT profile_details->>'occupation'='A' FROM public.users WHERE id=owner),'B first preserves active A');
        PERFORM public.withdraw_profile_context_import((a->>'id')::uuid);
      ELSE
        PERFORM public.withdraw_profile_context_import((a->>'id')::uuid);
        PERFORM pg_temp.g4_assert((SELECT profile_details->>field_b='B' FROM public.users WHERE id=owner),'A first preserves active B');
        IF field_b='occupation' THEN
          PERFORM pg_temp.g4_assert((SELECT field_undo<>'{}' FROM public.profile_context_imports WHERE id=(a->>'id')::uuid),'ancestor undo stays until B withdrawal');
        END IF;
        PERFORM public.withdraw_profile_context_import((b->>'id')::uuid);
      END IF;
      PERFORM pg_temp.g4_assert((SELECT profile_details='{"occupation":"base"}' FROM public.users WHERE id=owner),'both orders restore original fields');
      PERFORM pg_temp.g4_assert(NOT EXISTS(SELECT 1 FROM public.profile_context_imports WHERE user_id=owner AND field_undo<>'{}'),'last withdrawal clears undo');
      DELETE FROM auth.users WHERE id=owner;
    END LOOP;
  END LOOP;

  owner:=gen_random_uuid();
  INSERT INTO auth.users VALUES(owner,'g4-repeat@example.invalid',now(),NULL);
  INSERT INTO public.users(id,email,birth_date,profile_details) VALUES(owner,'g4-repeat@example.invalid','1990-01-01','{"occupation":"base"}');
  PERFORM set_config('request.jwt.claim.sub',owner::text,true);
  a:=pg_temp.g4_apply('{"occupation":"A"}'); b:=pg_temp.g4_apply('{"occupation":"B"}'); c:=pg_temp.g4_apply('{"occupation":"A"}');
  PERFORM public.withdraw_profile_context_import((a->>'id')::uuid);
  PERFORM pg_temp.g4_assert((SELECT profile_details->>'occupation'='A' FROM public.users WHERE id=owner),'newest writer owns repeated A value');
  PERFORM public.withdraw_profile_context_import((c->>'id')::uuid);
  PERFORM pg_temp.g4_assert((SELECT profile_details->>'occupation'='B' FROM public.users WHERE id=owner),'C restores still-active B');
  PERFORM public.withdraw_profile_context_import((b->>'id')::uuid);
  PERFORM pg_temp.g4_assert((SELECT profile_details->>'occupation'='base' FROM public.users WHERE id=owner),'B skips withdrawn A to original');
  DELETE FROM auth.users WHERE id=owner;

  owner:=gen_random_uuid();
  INSERT INTO auth.users VALUES(owner,'g4-manual@example.invalid',now(),NULL);
  INSERT INTO public.users(id,email,birth_date,profile_details) VALUES(owner,'g4-manual@example.invalid','1990-01-01','{"occupation":"base"}');
  PERFORM set_config('request.jwt.claim.sub',owner::text,true);
  a:=pg_temp.g4_apply('{"occupation":"A","region":"Seoul"}');
  SELECT profile_details_revision INTO revision FROM public.users WHERE id=owner;
  PERFORM public.save_profile_details_revision('{"occupation":"A","region":"Seoul"}',revision);
  PERFORM pg_temp.g4_assert((SELECT profile_details_revision=revision FROM public.users WHERE id=owner),'no-op keeps revision');
  PERFORM public.withdraw_profile_context_import((a->>'id')::uuid);
  PERFORM pg_temp.g4_assert((SELECT profile_details='{"occupation":"base"}' FROM public.users WHERE id=owner),'no-op then cancel restores all imported fields');
  a:=pg_temp.g4_apply('{"occupation":"A","region":"Seoul"}');
  SELECT profile_details_revision INTO revision FROM public.users WHERE id=owner;
  PERFORM public.save_profile_details_revision('{"occupation":"manual","region":"Seoul"}',revision);
  PERFORM public.withdraw_profile_context_import((a->>'id')::uuid);
  PERFORM pg_temp.g4_assert((SELECT profile_details='{"occupation":"manual"}' FROM public.users WHERE id=owner),'manual field stays while imported other field restores');
  a:=pg_temp.g4_apply('{"occupation":"A"}'); b:=pg_temp.g4_apply('{"occupation":"B"}');
  SELECT profile_details_revision INTO revision FROM public.users WHERE id=owner;
  PERFORM public.save_profile_details_revision('{"occupation":"A"}',revision);
  PERFORM public.withdraw_profile_context_import((b->>'id')::uuid);
  PERFORM public.withdraw_profile_context_import((a->>'id')::uuid);
  PERFORM pg_temp.g4_assert((SELECT profile_details='{"occupation":"A"}' FROM public.users WHERE id=owner),'manual edit equal to older import keeps ownership');
  a:=pg_temp.g4_apply('{"occupation":"C"}');
  PERFORM public.withdraw_profile_context_import((a->>'id')::uuid);
  PERFORM pg_temp.g4_assert((SELECT profile_details='{"occupation":"A"}' FROM public.users WHERE id=owner),'new import restores manual baseline');
  SELECT profile_details_revision INTO revision FROM public.users WHERE id=owner;
  PERFORM public.save_profile_details_revision('{"occupation":"manual"}',revision);
  UPDATE public.users SET profile_import_attempt_count=0 WHERE id=owner;
  a:=pg_temp.g4_apply('{"occupation":"External"}');
  UPDATE public.users SET profile_details='{"occupation":"service-edited"}' WHERE id=owner;
  PERFORM public.withdraw_profile_context_import((a->>'id')::uuid);
  PERFORM pg_temp.g4_assert((SELECT profile_details->>'occupation'='service-edited' FROM public.users WHERE id=owner),'current value mismatch is never overwritten');
  SELECT profile_details_revision INTO revision FROM public.users WHERE id=owner;
  PERFORM public.save_profile_details_revision('{"occupation":"manual"}',revision);
  a:=pg_temp.g4_apply('{"occupation":"A"}');
  -- G4-02: source deletion alone must remove its page and derived profile field.
  DELETE FROM public.sources WHERE id=(a->>'source_id')::uuid;
  PERFORM pg_temp.g4_assert((SELECT profile_details->>'occupation'='manual' FROM public.users WHERE id=owner),'source-only deletion restores profile');
  PERFORM pg_temp.g4_assert(NOT EXISTS(SELECT 1 FROM public.wiki_pages WHERE user_id=owner),'source-only deletion removes dedicated page');
  PERFORM pg_temp.g4_assert((SELECT status='withdrawn' AND document IS NULL AND field_undo='{}' AND source_id IS NULL FROM public.profile_context_imports WHERE id=(a->>'id')::uuid),'source-only deletion clears text and ledger');
  a:=pg_temp.g4_apply('{"occupation":"C"}');
  -- A tombstone is not permission to skip content restoration.
  INSERT INTO public.account_deletion_tombstones VALUES(owner,gen_random_uuid());
  DELETE FROM public.sources WHERE id=(a->>'source_id')::uuid;
  PERFORM pg_temp.g4_assert((SELECT profile_details->>'occupation'='manual' FROM public.users WHERE id=owner),'tombstone alone does not skip restoration');
  DELETE FROM public.account_deletion_tombstones WHERE user_id=owner;
  a:=pg_temp.g4_apply('{"occupation":"D"}');
  DELETE FROM auth.users WHERE id=owner;
  PERFORM pg_temp.g4_assert(NOT EXISTS(SELECT 1 FROM public.profile_context_imports WHERE user_id=owner),'account cascade removes receipts and undo');
END $$;

DO $$
DECLARE owner uuid:=gen_random_uuid(); result jsonb; n integer;
BEGIN
  INSERT INTO auth.users VALUES(owner,'g4-quota@example.invalid',now(),NULL);
  INSERT INTO public.users(id,email,birth_date) VALUES(owner,'g4-quota@example.invalid','1990-01-01');
  PERFORM set_config('request.jwt.claim.sub',owner::text,true);
  FOR n IN 1..10 LOOP
    result:=public.apply_profile_context_import(gen_random_uuid(),pg_temp.g4_doc(),'{}','{}',0);
    PERFORM pg_temp.g4_assert(result->>'code'='22023' AND result->>'message'='profile_import_confirmation','self-reported user statement requires explicit confirmation');
  END LOOP;
  PERFORM pg_temp.g4_assert((SELECT profile_import_attempt_count=10 FROM public.users WHERE id=owner),'rejected attempts remain counted');
  result:=pg_temp.g4_apply();
  PERFORM pg_temp.g4_assert(result->>'code'='PT429' AND current_setting('response.status')='429','daily attempt cap returns HTTP 429');
  PERFORM pg_temp.g4_assert(NOT EXISTS(SELECT 1 FROM public.sources WHERE user_id=owner),'rejected attempts create no content');
  UPDATE public.users SET profile_import_attempt_day=current_date-1 WHERE id=owner;
  result:=pg_temp.g4_apply();
  PERFORM pg_temp.g4_assert(result->>'status'='active','next UTC day accepts a request');
  PERFORM pg_temp.g4_assert((SELECT profile_import_attempt_count=1 FROM public.users WHERE id=owner),'next day counter restarts');
END $$;
SELECT 'G4 integrity assertions passed: '||count(*) FROM pg_temp.g4_checks;
ROLLBACK;
\echo G4 integrity regression passed: backfill, no-op, manual edits, 4 undo orders, erasure, confirmation, attempts and ACLs
