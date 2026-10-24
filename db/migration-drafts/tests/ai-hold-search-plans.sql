-- Included by ai-hold-readers.sql inside its disposable fixture transaction.
DO $$ BEGIN
  IF current_database() <> 't28_ai_readers_test_ci' THEN
    RAISE EXCEPTION 'T28 requires its disposable CI clone';
  END IF;
END $$;
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id,email) VALUES
  ('28000000-0000-4000-8000-000000000100','t28-plan@example.invalid');
SET LOCAL session_replication_role = origin;
INSERT INTO public.users(id,email,birth_date,locale) VALUES
  ('28000000-0000-4000-8000-000000000100','t28-plan@example.invalid','1990-01-01','en');
SET LOCAL session_replication_role = replica;
INSERT INTO public.sources(id,user_id,kind,title,storage_path,ai_hold) VALUES
  ('28000000-0000-4000-8000-000000000101','28000000-0000-4000-8000-000000000100','article','ordinary parent','fixture/ordinary.md',false);
INSERT INTO public.records(id,user_id,kind,body,topic,ai_hold,embedding,embedding_model)
SELECT md5('t28-record-'||i)::uuid, '28000000-0000-4000-8000-000000000100', 'note', 'ordinary '||i, 'topic '||i, false,
  (ARRAY[1::real, i::real/3000]||array_fill(0::real,ARRAY[766]))::vector,
  CASE WHEN i%2=0 THEN 't28-plan' ELSE NULL END
FROM generate_series(1,3000) i;
INSERT INTO public.wiki_pages(id,user_id,slug,kind,title,body_md,source_id,ai_hold,embedding,embedding_model)
SELECT md5('t28-page-'||i)::uuid, '28000000-0000-4000-8000-000000000100', 't28-plan-'||i,
  CASE WHEN i%3=0 THEN 'source' ELSE 'concept' END, 'page '||i, 'ordinary '||i,
  CASE WHEN i%3=0 THEN '28000000-0000-4000-8000-000000000101'::uuid ELSE NULL END, false,
  (ARRAY[1::real, i::real/3000]||array_fill(0::real,ARRAY[766]))::vector,
  CASE WHEN i%2=0 THEN 't28-plan' ELSE NULL END
FROM generate_series(1,3000) i;
SET LOCAL session_replication_role = origin;
ANALYZE public.records;
ANALYZE public.wiki_pages;
ANALYZE public.sources;
GRANT SELECT ON public.records, public.wiki_pages, public.sources, public.users TO service_role;
ALTER ROLE service_role BYPASSRLS;
SET LOCAL request.jwt.claim.sub = '28000000-0000-4000-8000-000000000100';

-- Exact plans make row/similarity/order equivalence deterministic; HNSW is
-- approximate, so its accessibility is a separate plan assertion below.
SET LOCAL enable_indexscan = off;
SET LOCAL enable_bitmapscan = off;
DO $$
DECLARE role_name text; n text; u uuid; v vector; lim int; model text; excluded uuid;
  before_rows jsonb; after_rows jsonb; comparisons int := 0;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['authenticated','service_role'] LOOP
    EXECUTE format('SET LOCAL ROLE %I', role_name);
    FOREACH n IN ARRAY ARRAY['match_records','match_wiki_pages'] LOOP
      FOREACH u IN ARRAY ARRAY['28000000-0000-4000-8000-000000000100'::uuid,'28000000-0000-4000-8000-000000000081'::uuid] LOOP
        FOREACH v IN ARRAY ARRAY[
          (ARRAY[1::real,0::real]||array_fill(0::real,ARRAY[766]))::vector,
          (ARRAY[0::real,1::real]||array_fill(0::real,ARRAY[766]))::vector] LOOP
          FOREACH lim IN ARRAY ARRAY[0,1,8,30] LOOP
            FOREACH model IN ARRAY ARRAY[NULL,'t28-plan','different-model'] LOOP
              FOREACH excluded IN ARRAY ARRAY[NULL::uuid,md5(CASE WHEN n='match_records' THEN 't28-record-1' ELSE 't28-page-1' END)::uuid] LOOP
                EXECUTE format('SELECT jsonb_agg(to_jsonb(t)) FROM pg_temp.t28_before_%I($1,$2,$3,$4,$5) t',n)
                  INTO before_rows USING u,v,lim,excluded,model;
                EXECUTE format('SELECT jsonb_agg(to_jsonb(t)) FROM public.%I($1,$2,$3,$4,$5) t',n)
                  INTO after_rows USING u,v,lim,excluded,model;
                IF before_rows IS DISTINCT FROM after_rows THEN
                  RAISE EXCEPTION 'T28 ordinary-row differential failed: %, %, %, %, %',role_name,n,lim,model,excluded;
                END IF;
                comparisons := comparisons+1;
              END LOOP;
            END LOOP;
          END LOOP;
        END LOOP;
      END LOOP;
    END LOOP;
    RESET ROLE;
  END LOOP;
  RAISE NOTICE 'T28 DIFFERENTIAL PASS: % comparisons, 0 mismatches (rows, columns, similarity, order)',comparisons;
END $$;
SET LOCAL enable_indexscan = on;
SET LOCAL enable_bitmapscan = on;

-- EXPLAIN the actual installed SQL body (not a hand-copied lookalike). The
-- function SET search_path prevents SQL inlining in an outer EXPLAIN call.
SET LOCAL ROLE authenticated;
DO $$
DECLARE n text; body text; plan json; expected_index text;
BEGIN
  FOREACH n IN ARRAY ARRAY['match_records','match_wiki_pages'] LOOP
    SELECT prosrc INTO body FROM pg_proc WHERE oid=('public.'||n||'(uuid,vector,integer,uuid,text)')::regprocedure;
    body := replace(body,'p_user_id',quote_literal('28000000-0000-4000-8000-000000000100')||'::uuid');
    body := replace(body,'query_embedding',quote_literal((ARRAY[1::real,0::real]||array_fill(0::real,ARRAY[766]))::vector::text)||'::vector');
    body := replace(body,'match_count','8');
    body := replace(body,'exclude_id','NULL::uuid');
    body := replace(body,'p_embedding_model','NULL::text');
    EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '||body INTO plan;
    expected_index := CASE WHEN n='match_records' THEN 'records_embedding_hnsw' ELSE 'wiki_pages_embedding_idx' END;
    IF plan::text NOT LIKE '%"Index Name": "'||expected_index||'"%'
      OR plan::text NOT LIKE '%"Order By":%<=>%'
      OR (plan->0->'Plan'->>'Actual Rows')::numeric <> 8 THEN
      RAISE EXCEPTION 'T28 HNSW ordering unavailable: %, %', n, plan;
    END IF;
    RAISE NOTICE 'T28 HNSW PASS: % %', n, plan;
  END LOOP;
END $$;
RESET ROLE;

-- 0270 rollback is view-only. Inline RPC predicates survive; never restore
-- pre-hold readers. The app's view-dependent readers still fail closed.
SET LOCAL enable_indexscan = off;
SET LOCAL enable_bitmapscan = off;
\ir ../../migrations/rollback/0270_down.sql
SET LOCAL request.jwt.claim.sub = '28000000-0000-4000-8000-000000000080';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.match_records('28000000-0000-4000-8000-000000000080',array_fill(1::real,ARRAY[768])::vector))
    OR EXISTS (SELECT 1 FROM public.match_wiki_pages('28000000-0000-4000-8000-000000000080',array_fill(1::real,ARRAY[768])::vector)
      WHERE id IN ('28000000-0000-4000-8000-000000000088','28000000-0000-4000-8000-000000000089')) THEN
    RAISE EXCEPTION 'T28 view rollback reopened held rows';
  END IF;
  RAISE NOTICE 'T28 ROLLBACK PASS: RPC hold predicates survive 0270 view removal';
END $$;
RESET ROLE;
