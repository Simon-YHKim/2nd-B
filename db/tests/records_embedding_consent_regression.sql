\set ON_ERROR_STOP on
-- Full numbered schema only. All fixtures and deliberate anomalies roll back.
BEGIN;
SET LOCAL statement_timeout = '15s';
SET LOCAL request.jwt.claim.role = 'service_role';
CREATE FUNCTION pg_temp.check_embedding(ok boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'embedding contract: %', label; END IF;
END $$;
CREATE FUNCTION pg_temp.embed_vec() RETURNS public.vector
LANGUAGE sql AS $$ SELECT array_fill(0.1::real, ARRAY[768])::public.vector $$;
CREATE FUNCTION pg_temp.embed_user(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE
AS $$ SELECT ('ec026300-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid $$;
CREATE FUNCTION pg_temp.enable_embedding(n integer) RETURNS void LANGUAGE sql AS $$
  UPDATE public.users SET privacy_prefs = privacy_prefs || jsonb_build_object(
    'records_embedding',true,'records_embedding_enable_revision',
    COALESCE((privacy_prefs->>'records_embedding_revision')::bigint,0)+1)
    || CASE WHEN privacy_prefs ? 'records_embedding_recovery' THEN jsonb_build_object(
      'records_embedding_enable_recovery',privacy_prefs->'records_embedding_recovery') ELSE '{}'::jsonb END
  WHERE id = pg_temp.embed_user(n)
$$;

INSERT INTO auth.users(id, email)
SELECT pg_temp.embed_user(n), 'embed-contract-' || n || '@example.invalid' FROM generate_series(1, 5) n;
INSERT INTO public.users(id, email, birth_date, locale, privacy_prefs)
SELECT pg_temp.embed_user(n), 'embed-contract-' || n || '@example.invalid', '1990-01-01', 'en',
       '{}'::jsonb FROM generate_series(1, 5) n;
SELECT pg_temp.enable_embedding(n) FROM generate_series(1, 5) n;
-- Existing ON rows from before installation have no metadata. Preserve their
-- consent on an unrelated old-app save, but never trust a client revision.
ALTER TABLE public.users DISABLE TRIGGER zz_records_embedding_consent_cas;
UPDATE public.users SET privacy_prefs = '{"records_embedding":true}' WHERE id = pg_temp.embed_user(5);
ALTER TABLE public.users ENABLE TRIGGER zz_records_embedding_consent_cas;
UPDATE public.users SET privacy_prefs = '{"records_embedding":true,"ads":true,"records_embedding_revision":999999}'
  WHERE id = pg_temp.embed_user(5);
SELECT pg_temp.check_embedding((SELECT privacy_prefs->'records_embedding' = 'true'::jsonb
  AND privacy_prefs->'records_embedding_revision' = '0'::jsonb FROM public.users WHERE id = pg_temp.embed_user(5)),
  'legacy ON without metadata stays ON with server revision');
-- Largest incrementable safe integer is accepted; the exhausted next revision
-- recovers on withdrawal rather than making OFF impossible.
ALTER TABLE public.users DISABLE TRIGGER zz_records_embedding_consent_cas;
UPDATE public.users SET privacy_prefs = '{"records_embedding":false,"records_embedding_revision":9007199254740990}'
  WHERE id = pg_temp.embed_user(1);
ALTER TABLE public.users ENABLE TRIGGER zz_records_embedding_consent_cas;
SELECT pg_temp.enable_embedding(1);
SELECT pg_temp.check_embedding((SELECT privacy_prefs->'records_embedding' = 'true'::jsonb
  AND privacy_prefs->'records_embedding_revision' = '9007199254740991'::jsonb
  FROM public.users WHERE id = pg_temp.embed_user(1)), 'largest incrementable revision accepted');
INSERT INTO public.records(id, user_id, kind, body, embedding, embedding_model)
SELECT pg_temp.embed_user(n + 10), pg_temp.embed_user(n), 'note', 'fixture', pg_temp.embed_vec(), 'model-a'
  FROM generate_series(1, 5) n;
SELECT pg_temp.check_embedding((SELECT count(*) = 5 FROM public.records WHERE id IN
  (SELECT pg_temp.embed_user(n + 10) FROM generate_series(1,5) n) AND embedding IS NOT NULL), 'adult true writes preserved');

-- A legacy whole-user clear must not erase a new consent generation. Keeping
-- OLD's pair is a quiet no-op, while unrelated fields in the UPDATE still save.
UPDATE public.records SET embedding = NULL, embedding_model = NULL, body = 'edited'
  WHERE id = pg_temp.embed_user(11);
SELECT pg_temp.check_embedding((SELECT embedding = pg_temp.embed_vec() AND embedding_model = 'model-a'
  AND body = 'edited' FROM public.records WHERE id = pg_temp.embed_user(11)), 'ON complete pair survives direct NULL');

-- Pre-0263 JSON was client-writable. Every malformed revision must allow an
-- authenticated withdrawal, including when an attacker supplies an enable marker.
DO $$ DECLARE bad jsonb; BEGIN
  FOREACH bad IN ARRAY ARRAY['"bad"'::jsonb, '"7"'::jsonb, '1.5'::jsonb,
    '9223372036854775808'::jsonb, '9007199254740991'::jsonb, '-1'::jsonb,
    'null'::jsonb, 'true'::jsonb, '{}'::jsonb, '[]'::jsonb] LOOP
    ALTER TABLE public.users DISABLE TRIGGER zz_records_embedding_consent_cas;
    UPDATE public.users SET privacy_prefs = jsonb_build_object('records_embedding',true,
      'records_embedding_revision',bad) WHERE id = pg_temp.embed_user(1);
    ALTER TABLE public.users ENABLE TRIGGER zz_records_embedding_consent_cas;
    UPDATE public.records SET embedding = pg_temp.embed_vec(), embedding_model = 'malformed'
      WHERE id = pg_temp.embed_user(11);
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.role','authenticated',true);
    PERFORM set_config('request.jwt.claim.sub',pg_temp.embed_user(1)::text,true);
    UPDATE public.users SET privacy_prefs = '{"records_embedding":false}'
      WHERE id = pg_temp.embed_user(1);
    PERFORM pg_temp.check_embedding((SELECT privacy_prefs->'records_embedding' = 'false'::jsonb
      AND privacy_prefs->'records_embedding_revision' = '1'::jsonb
      FROM public.users WHERE id = pg_temp.embed_user(1)), 'malformed revision withdrawal normalized: ' || bad::text);
    PERFORM pg_temp.check_embedding((SELECT embedding IS NULL AND embedding_model IS NULL
      FROM public.records WHERE id = pg_temp.embed_user(11)), 'malformed revision withdrawal clears pair: ' || bad::text);
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.role','service_role',true);

    ALTER TABLE public.users DISABLE TRIGGER zz_records_embedding_consent_cas;
    UPDATE public.users SET privacy_prefs = jsonb_build_object('records_embedding',true,
      'records_embedding_revision',bad) WHERE id = pg_temp.embed_user(1);
    ALTER TABLE public.users ENABLE TRIGGER zz_records_embedding_consent_cas;
    UPDATE public.records SET embedding = pg_temp.embed_vec(), embedding_model = 'recovery'
      WHERE id = pg_temp.embed_user(11);
    UPDATE public.users SET privacy_prefs = '{"records_embedding":true,"records_embedding_enable_revision":1}'
      WHERE id = pg_temp.embed_user(1);
    PERFORM pg_temp.check_embedding((SELECT privacy_prefs->'records_embedding' = 'false'::jsonb
      AND privacy_prefs->'records_embedding_revision' = '1'::jsonb
      AND NOT (privacy_prefs ? 'records_embedding_enable_revision')
      FROM public.users WHERE id = pg_temp.embed_user(1)), 'recovery cannot enable in same update: ' || bad::text);
    PERFORM pg_temp.check_embedding((SELECT embedding IS NULL AND embedding_model IS NULL
      FROM public.records WHERE id = pg_temp.embed_user(11)), 'recovery forces withdrawal: ' || bad::text);
    BEGIN
      UPDATE public.users SET privacy_prefs = '{"records_embedding":true,"records_embedding_enable_revision":2}'
        WHERE id = pg_temp.embed_user(1);
      RAISE EXCEPTION 'old numeric CAS reused after recovery';
    EXCEPTION WHEN serialization_failure THEN NULL;
    END;
    PERFORM pg_temp.enable_embedding(1);
    PERFORM pg_temp.check_embedding((SELECT privacy_prefs->'records_embedding' = 'true'::jsonb
      AND privacy_prefs->'records_embedding_revision' = '2'::jsonb
      FROM public.users WHERE id = pg_temp.embed_user(1)), 'fresh CAS after recovery enables: ' || bad::text);
  END LOOP;
END $$;
DO $$ DECLARE previous jsonb; BEGIN
  SELECT privacy_prefs->'records_embedding_recovery' INTO previous FROM public.users WHERE id = pg_temp.embed_user(1);
  UPDATE public.users SET privacy_prefs = privacy_prefs || '{"records_embedding_recovery":"spoofed"}'
    WHERE id = pg_temp.embed_user(1);
  PERFORM pg_temp.check_embedding((SELECT privacy_prefs->'records_embedding_recovery' = previous
    FROM public.users WHERE id = pg_temp.embed_user(1)), 'client cannot replace recovery generation');
  ALTER TABLE public.users DISABLE TRIGGER zz_records_embedding_consent_cas;
  UPDATE public.users SET privacy_prefs = privacy_prefs || '{"records_embedding_revision":"bad"}'
    WHERE id = pg_temp.embed_user(1);
  ALTER TABLE public.users ENABLE TRIGGER zz_records_embedding_consent_cas;
  UPDATE public.users SET privacy_prefs = '{"records_embedding":false}' WHERE id = pg_temp.embed_user(1);
  PERFORM pg_temp.check_embedding((SELECT privacy_prefs->'records_embedding_recovery' <> previous
    FROM public.users WHERE id = pg_temp.embed_user(1)), 'each recovery mints a fresh generation');
  BEGIN
    UPDATE public.users SET privacy_prefs = jsonb_build_object('records_embedding',true,
      'records_embedding_enable_revision',2,'records_embedding_enable_recovery',previous)
      WHERE id = pg_temp.embed_user(1);
    RAISE EXCEPTION 'old recovery generation reused';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  PERFORM pg_temp.enable_embedding(1);
END $$;
-- A BEFORE-trigger recovery can change prefs on a non-prefs UPDATE too.
DO $$ DECLARE bad jsonb; BEGIN
  FOREACH bad IN ARRAY ARRAY['null'::jsonb, '7'::jsonb, '"bad"'::jsonb, '{}'::jsonb] LOOP
    ALTER TABLE public.users DISABLE TRIGGER zz_records_embedding_consent_cas;
    UPDATE public.users SET privacy_prefs = jsonb_build_object('records_embedding',true,
      'records_embedding_revision',7,'records_embedding_recovery',bad) WHERE id = pg_temp.embed_user(1);
    ALTER TABLE public.users ENABLE TRIGGER zz_records_embedding_consent_cas;
    UPDATE public.records SET embedding = pg_temp.embed_vec(), embedding_model = 'recovery'
      WHERE id = pg_temp.embed_user(11);
    UPDATE public.users SET privacy_prefs = '{"records_embedding":false}' WHERE id = pg_temp.embed_user(1);
    PERFORM pg_temp.check_embedding((SELECT privacy_prefs->'records_embedding_revision' = '1'::jsonb
      AND jsonb_typeof(privacy_prefs->'records_embedding_recovery') = 'string'
      FROM public.users WHERE id = pg_temp.embed_user(1)), 'invalid recovery metadata normalizes');
    PERFORM pg_temp.check_embedding((SELECT embedding IS NULL AND embedding_model IS NULL
      FROM public.records WHERE id = pg_temp.embed_user(11)), 'invalid recovery metadata withdrawal clears');
    PERFORM pg_temp.enable_embedding(1);
  END LOOP;
END $$;
ALTER TABLE public.users DISABLE TRIGGER zz_records_embedding_consent_cas;
UPDATE public.users SET privacy_prefs = '{"records_embedding":true,"records_embedding_revision":"bad"}'
  WHERE id = pg_temp.embed_user(1);
ALTER TABLE public.users ENABLE TRIGGER zz_records_embedding_consent_cas;
UPDATE public.records SET embedding = pg_temp.embed_vec(), embedding_model = 'recovery'
  WHERE id = pg_temp.embed_user(11);
UPDATE public.users SET display_name = 'revision recovery' WHERE id = pg_temp.embed_user(1);
SELECT pg_temp.check_embedding((SELECT embedding IS NULL AND embedding_model IS NULL
  FROM public.records WHERE id = pg_temp.embed_user(11)), 'non-prefs recovery clears pair');
SELECT pg_temp.enable_embedding(1);
UPDATE public.records SET embedding = pg_temp.embed_vec(), embedding_model = 'model-a'
  WHERE id = pg_temp.embed_user(11);

-- R2-02: omitted model over an existing model is accepted, not guessed/cleared.
UPDATE public.records SET embedding = array_fill(0.2::real, ARRAY[768])::public.vector WHERE id = pg_temp.embed_user(11);
SELECT pg_temp.check_embedding((SELECT embedding_model = 'model-a' AND embedding = array_fill(0.2::real, ARRAY[768])::public.vector
  FROM public.records WHERE id = pg_temp.embed_user(11)), 'legacy vector-only update retains existing model');
UPDATE public.records SET embedding_model = NULL WHERE id = pg_temp.embed_user(11);
SELECT pg_temp.check_embedding((SELECT embedding IS NULL AND embedding_model IS NULL FROM public.records WHERE id = pg_temp.embed_user(11)), 'vector-only result cleared');
UPDATE public.records SET embedding_model = 'model-only' WHERE id = pg_temp.embed_user(11);
SELECT pg_temp.check_embedding((SELECT embedding IS NULL AND embedding_model IS NULL FROM public.records WHERE id = pg_temp.embed_user(11)), 'model-only result cleared');
UPDATE public.records SET embedding = pg_temp.embed_vec(), embedding_model = 'model-a' WHERE id = pg_temp.embed_user(11);
UPDATE public.records SET user_id = pg_temp.embed_user(2) WHERE id = pg_temp.embed_user(11);
SELECT pg_temp.check_embedding((SELECT embedding IS NULL AND embedding_model IS NULL FROM public.records WHERE id = pg_temp.embed_user(11)), 'owner change clears even to consenting adult');
UPDATE public.records SET embedding = pg_temp.embed_vec(), embedding_model = 'model-a' WHERE id = pg_temp.embed_user(11);
UPDATE public.records SET user_id = pg_temp.embed_user(1), embedding = NULL, embedding_model = NULL WHERE id = pg_temp.embed_user(11);
SELECT pg_temp.check_embedding((SELECT embedding IS NULL AND embedding_model IS NULL FROM public.records WHERE id = pg_temp.embed_user(11)), 'owner change with explicit NULL never restores former vector');
INSERT INTO public.records(id,user_id,kind,body,embedding,embedding_model)
  VALUES(pg_temp.embed_user(31),pg_temp.embed_user(1),'note','delete',pg_temp.embed_vec(),'model-a');
DELETE FROM public.records WHERE id = pg_temp.embed_user(31);
SELECT pg_temp.check_embedding(NOT EXISTS(SELECT 1 FROM public.records WHERE id = pg_temp.embed_user(31)), 'ON single record DELETE stays valid');

-- All non-boolean states revoke. Seed historical model-only data separately.
DO $$ DECLARE prefs jsonb; BEGIN
  FOREACH prefs IN ARRAY ARRAY['{"records_embedding":false}'::jsonb, '{"records_embedding":"true"}'::jsonb,
    '{"records_embedding":1}'::jsonb, '{"records_embedding":null}'::jsonb, '{}'::jsonb] LOOP
    PERFORM pg_temp.enable_embedding(1);
    UPDATE public.records SET user_id = pg_temp.embed_user(1) WHERE id = pg_temp.embed_user(11);
    UPDATE public.records SET embedding = pg_temp.embed_vec(), embedding_model = 'model-a' WHERE id = pg_temp.embed_user(11);
    ALTER TABLE public.records DISABLE TRIGGER zz_records_embedding_write_guard;
    INSERT INTO public.records(user_id, kind, body, embedding_model) VALUES(pg_temp.embed_user(1), 'note', 'historical half', 'orphan');
    ALTER TABLE public.records ENABLE TRIGGER zz_records_embedding_write_guard;
    UPDATE public.users SET privacy_prefs = prefs WHERE id = pg_temp.embed_user(1);
    PERFORM pg_temp.check_embedding(NOT EXISTS(SELECT 1 FROM public.records WHERE user_id = pg_temp.embed_user(1)
      AND (embedding IS NOT NULL OR embedding_model IS NOT NULL)), 'revocation includes historical model-only rows: ' || prefs::text);
    INSERT INTO public.records(id, user_id, kind, body, embedding, embedding_model)
      VALUES(pg_temp.embed_user(21), pg_temp.embed_user(1), 'note', 'late insert', pg_temp.embed_vec(), 'late')
      ON CONFLICT (id) DO UPDATE SET embedding = EXCLUDED.embedding, embedding_model = EXCLUDED.embedding_model;
    UPDATE public.records SET embedding = pg_temp.embed_vec(), embedding_model = 'late' WHERE id = pg_temp.embed_user(11);
    PERFORM pg_temp.check_embedding(NOT EXISTS(SELECT 1 FROM public.records WHERE user_id = pg_temp.embed_user(1)
      AND (embedding IS NOT NULL OR embedding_model IS NOT NULL)), 'late INSERT/UPSERT/UPDATE cleared: ' || prefs::text);
  END LOOP;
END $$;
SELECT pg_temp.check_embedding((SELECT embedding IS NOT NULL AND embedding_model = 'model-a'
  FROM public.records WHERE id = pg_temp.embed_user(12)), 'other user unaffected');

UPDATE public.users SET birth_date = (CURRENT_DATE - INTERVAL '16 years')::date WHERE id = pg_temp.embed_user(2);
SELECT pg_temp.check_embedding((SELECT embedding IS NULL AND embedding_model IS NULL FROM public.records
  WHERE id = pg_temp.embed_user(12)), 'adult to minor DOB transition clears');
UPDATE public.users SET minor_tier = 'minor_guardian' WHERE id = pg_temp.embed_user(3);
SELECT pg_temp.check_embedding((SELECT embedding IS NULL AND embedding_model IS NULL FROM public.records
  WHERE id = pg_temp.embed_user(13)), 'tier-only change clears');
-- Seed historical true explicitly to test the write guard independently of
-- both the older minor clamp and the new consent CAS.
UPDATE public.users SET minor_tier = 'adult' WHERE id = pg_temp.embed_user(2);
ALTER TABLE public.users DISABLE TRIGGER trg_minor_privacy_clamp;
ALTER TABLE public.users DISABLE TRIGGER zz_records_embedding_consent_cas;
UPDATE public.users SET privacy_prefs = '{"records_embedding":true}' WHERE id = pg_temp.embed_user(2);
UPDATE public.users SET privacy_prefs = '{"records_embedding":true}' WHERE id = pg_temp.embed_user(3);
ALTER TABLE public.users ENABLE TRIGGER zz_records_embedding_consent_cas;
ALTER TABLE public.users ENABLE TRIGGER trg_minor_privacy_clamp;
UPDATE public.records SET embedding = pg_temp.embed_vec(), embedding_model = 'late' WHERE id IN (pg_temp.embed_user(12), pg_temp.embed_user(13));
INSERT INTO public.records(user_id, kind, body, embedding, embedding_model)
SELECT pg_temp.embed_user(n), 'note', 'minor late insert', pg_temp.embed_vec(), 'late' FROM generate_series(2,3) n;
SELECT pg_temp.check_embedding(NOT EXISTS(SELECT 1 FROM public.records WHERE user_id IN (pg_temp.embed_user(2), pg_temp.embed_user(3))
  AND (embedding IS NOT NULL OR embedding_model IS NOT NULL)), 'DOB and tier each independently reject stale true');

-- Impossible through ordinary signup: model historical unknown age explicitly.
ALTER TABLE public.users DISABLE TRIGGER trg_enforce_user_age_tier;
ALTER TABLE public.users ALTER COLUMN birth_date DROP NOT NULL;
UPDATE public.users SET birth_date = NULL WHERE id = pg_temp.embed_user(4);
UPDATE public.records SET embedding = pg_temp.embed_vec(), embedding_model = 'late' WHERE id = pg_temp.embed_user(14);
INSERT INTO public.records(user_id, kind, body, embedding, embedding_model)
VALUES(pg_temp.embed_user(4), 'note', 'unknown age insert', pg_temp.embed_vec(), 'late');
SELECT pg_temp.check_embedding((SELECT embedding IS NULL AND embedding_model IS NULL FROM public.records WHERE id = pg_temp.embed_user(14)), 'unknown DOB fails closed');
SELECT pg_temp.check_embedding(NOT EXISTS(SELECT 1 FROM public.records WHERE user_id = pg_temp.embed_user(4)
  AND (embedding IS NOT NULL OR embedding_model IS NOT NULL)), 'unknown DOB INSERT fails closed');
UPDATE public.users SET birth_date = '1990-01-01' WHERE id = pg_temp.embed_user(4);
ALTER TABLE public.users ALTER COLUMN birth_date SET NOT NULL;
ALTER TABLE public.users ENABLE TRIGGER trg_enforce_user_age_tier;

-- Trigger error aborts preference AND earlier record changes in the statement.
CREATE FUNCTION pg_temp.reject_embed_clear() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.user_id = pg_temp.embed_user(5) AND NEW.embedding IS NULL THEN
    RAISE EXCEPTION 'injected_clear_failure';
  END IF; RETURN NEW;
END $$;
CREATE TRIGGER zzz_test_reject_clear BEFORE UPDATE ON public.records FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_embed_clear();
DO $$ BEGIN
  BEGIN
    UPDATE public.users SET privacy_prefs = '{"records_embedding":false}' WHERE id = pg_temp.embed_user(5);
    RAISE EXCEPTION 'withdrawal_should_fail';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'injected_clear_failure' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.check_embedding((SELECT privacy_prefs -> 'records_embedding' = 'true'::jsonb FROM public.users WHERE id = pg_temp.embed_user(5)), 'failed withdrawal keeps ON');
  PERFORM pg_temp.check_embedding((SELECT embedding IS NOT NULL FROM public.records WHERE id = pg_temp.embed_user(15)), 'failed withdrawal keeps vector');
END $$;
DROP TRIGGER zzz_test_reject_clear ON public.records;

-- Actual role switching, not a JWT string pretending to be that role.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SELECT set_config('request.jwt.claim.sub', pg_temp.embed_user(5)::text, true);
UPDATE public.users SET privacy_prefs = '{"records_embedding":false}' WHERE id = pg_temp.embed_user(5);
SELECT pg_temp.check_embedding((SELECT embedding IS NULL AND embedding_model IS NULL FROM public.records WHERE id = pg_temp.embed_user(15)), 'authenticated withdrawal clears under FORCE RLS');
UPDATE public.records SET embedding = pg_temp.embed_vec(), embedding_model = 'late-client' WHERE id = pg_temp.embed_user(15);
SELECT pg_temp.check_embedding((SELECT embedding IS NULL AND embedding_model IS NULL FROM public.records WHERE id = pg_temp.embed_user(15)), 'authenticated late write clears');
-- The revision belongs to the server, not the full preference object. Replay
-- old/future client metadata without a one-use marker cannot resurrect consent.
DO $$ DECLARE previous jsonb; request jsonb; BEGIN
  SELECT privacy_prefs INTO previous FROM public.users WHERE id = pg_temp.embed_user(5);
  FOREACH request IN ARRAY ARRAY['{"records_embedding":true}'::jsonb,
    '{"records_embedding":true,"records_embedding_revision":999999}'::jsonb] LOOP
    BEGIN
      UPDATE public.users SET privacy_prefs = request WHERE id = pg_temp.embed_user(5);
      RAISE EXCEPTION 'unmarked enable reported success';
    EXCEPTION WHEN SQLSTATE '40001' THEN
      PERFORM pg_temp.check_embedding(SQLERRM = 'records_embedding_consent_conflict', 'stable unmarked enable error key');
    END;
    PERFORM pg_temp.check_embedding((SELECT privacy_prefs = previous FROM public.users
      WHERE id = pg_temp.embed_user(5)), 'unmarked enable leaves entire OFF state unchanged');
    PERFORM pg_temp.check_embedding((SELECT embedding IS NULL AND embedding_model IS NULL
      FROM public.records WHERE id = pg_temp.embed_user(15)), 'unmarked enable leaves vectors OFF');
  END LOOP;
END $$;
SELECT pg_temp.enable_embedding(5);
SELECT pg_temp.check_embedding((SELECT privacy_prefs->'records_embedding' = 'true'::jsonb
  AND NOT (privacy_prefs ? 'records_embedding_enable_revision') FROM public.users WHERE id = pg_temp.embed_user(5)), 'authenticated fresh CAS consumes marker');
UPDATE public.records SET embedding = pg_temp.embed_vec(), embedding_model = 'authenticated-new' WHERE id = pg_temp.embed_user(15);
UPDATE public.records SET embedding = NULL, embedding_model = NULL WHERE user_id = pg_temp.embed_user(5);
SELECT pg_temp.check_embedding((SELECT embedding = pg_temp.embed_vec() AND embedding_model = 'authenticated-new'
  FROM public.records WHERE id = pg_temp.embed_user(15)), 'authenticated stale NULL preserves new pair under FORCE RLS');
DO $$ DECLARE stale bigint; BEGIN
  SELECT (privacy_prefs->>'records_embedding_revision')::bigint INTO stale FROM public.users WHERE id = pg_temp.embed_user(5);
  UPDATE public.users SET privacy_prefs = '{"records_embedding":false}' WHERE id = pg_temp.embed_user(5);
  BEGIN
    UPDATE public.users SET privacy_prefs = jsonb_build_object('records_embedding',true,
      'records_embedding_enable_revision',stale+1) WHERE id = pg_temp.embed_user(5);
    RAISE EXCEPTION 'stale marker accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
  BEGIN
    UPDATE public.users SET privacy_prefs = jsonb_build_object('records_embedding',true,
      'records_embedding_enable_revision',((privacy_prefs->>'records_embedding_revision')::bigint+1)::text)
      WHERE id = pg_temp.embed_user(5);
    RAISE EXCEPTION 'string marker accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;
END $$;
SELECT pg_temp.check_embedding((SELECT privacy_prefs->'records_embedding' = 'false'::jsonb
  FROM public.users WHERE id = pg_temp.embed_user(5)), 'stale and non-number marker remain OFF');
DO $$ DECLARE n integer; BEGIN
  UPDATE public.users SET privacy_prefs = '{"records_embedding":true}' WHERE id = pg_temp.embed_user(1);
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.check_embedding(n = 0, 'foreign user update denied by RLS');
  UPDATE public.records SET embedding = pg_temp.embed_vec(), embedding_model = 'intruder' WHERE id = pg_temp.embed_user(11);
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM pg_temp.check_embedding(n = 0, 'foreign record update denied by RLS');
END $$;
RESET ROLE;

-- CI's vanilla role has no BYPASSRLS attribute by default. Reproduce the real
-- service role in this transaction only, then prove it cannot bypass the guard.
ALTER ROLE service_role BYPASSRLS;
GRANT SELECT, INSERT, UPDATE ON public.records TO service_role;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claim.role = 'service_role';
UPDATE public.records SET embedding = pg_temp.embed_vec(), embedding_model = 'service' WHERE id = pg_temp.embed_user(15);
SELECT pg_temp.check_embedding((SELECT embedding IS NULL AND embedding_model IS NULL FROM public.records WHERE id = pg_temp.embed_user(15)), 'service_role cannot bypass consent');
RESET ROLE;
SELECT pg_temp.check_embedding(NOT EXISTS(
  SELECT 1 FROM pg_proc p CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) r(name)
  WHERE p.oid IN ('public.guard_record_embedding_write()'::regprocedure, 'public.guard_record_embedding_delete()'::regprocedure, 'public.clear_record_embeddings_on_privacy_change()'::regprocedure, 'public.guard_records_embedding_consent()'::regprocedure)
    AND has_function_privilege(r.name, p.oid, 'EXECUTE')), 'no direct execution from public API roles');

-- Ordering changes neither final state nor the old trigger results.
ALTER TRIGGER zz_records_embedding_consent_changed ON public.users RENAME TO aa_test_embedding_consent;
ALTER TRIGGER zz_records_embedding_write_guard ON public.records RENAME TO aa_test_embedding_write;
SELECT pg_temp.enable_embedding(5);
UPDATE public.records SET embedding = pg_temp.embed_vec(), embedding_model = 'reordered' WHERE id = pg_temp.embed_user(15);
UPDATE public.users SET privacy_prefs = '{"records_embedding":false}' WHERE id = pg_temp.embed_user(5);
SELECT pg_temp.check_embedding((SELECT embedding IS NULL AND embedding_model IS NULL FROM public.records WHERE id = pg_temp.embed_user(15)), 'reordered triggers still clear');
ALTER TRIGGER aa_test_embedding_consent ON public.users RENAME TO zz_records_embedding_consent_changed;
ALTER TRIGGER aa_test_embedding_write ON public.records RENAME TO zz_records_embedding_write_guard;
ROLLBACK;
