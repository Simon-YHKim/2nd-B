# Supabase Seeds — Knowledge Sources

각 `.sql` 파일은 한 framework batch의 검증된 `INSERT` 문 묶음이다. 각 파일은 idempotent하지 않으므로 (DOI UNIQUE 제약 때문에) **이미 적재된 상태에서 재실행하면 충돌한다**.

## 한 batch 추가하는 흐름

1. `docs/research/batches/{framework-slug}.md`로 검증된 batch를 저장
2. 그 안의 `INSERT` SQL을 이 디렉토리에 `{framework-slug}.sql`로 추출
3. Supabase 콘솔 또는 MCP `apply_migration` / `execute_sql`로 한 번 실행
4. 적재 후 `select count(*) from public.knowledge_sources where framework = '{slug}';`로 확인

## 재실행하려면

행을 모두 지우고 다시 적재하거나, 개별 row를 갱신하려면 `update`를 직접 작성한다. UPSERT를 원하면 `insert ... on conflict (doi) do update set ...` 패턴을 추가.

## 현재 적재 대상

| 파일 | Framework slug(s) | Rows |
| --- | --- | --- |
| `big-five.sql` | `big_five` | 7 |
| `attachment.sql` | `attachment` | 6 |
| `erikson.sql` | `erikson` | 5 |
| `sdt.sql` | `sdt` | 4 |
| `emerging-adulthood.sql` | `emerging_adulthood` | 4 |
| `soc-successful-aging.sql` | `soc`, `successful_aging` | 4 |
| `growth-mindset.sql` | `growth_mindset` | 3 |
| `self-compassion.sql` | `self_compassion` | 3 |
| `via-strengths.sql` | `via` | 3 |
| `narrative-identity.sql` | `narrative_identity` | 4 |
| `assessment-landscape.sql` | `assessment_a_*`, `assessment_b_*`, `assessment_c_*` (9 slugs) | 9 |
| `interpersonal.sql` | `interpersonal` | 4 |
| `self-knowledge.sql` | `self_knowledge` | 7 |
| `values-meaning.sql` | `values_meaning` | 5 |
| `methodology-coaching.sql` | (reuses `self_knowledge`) | 1 |
| `crisis-detection.sql` | `crisis_detection` | 7 |
| `cbt-rebt.sql` | `cbt`, `rebt` | 4 |
| `computational-personality.sql` | `computational_personality` | 5 |
| `ai-mental-health-safety.sql` | `ai_mental_health` | 5 |
| `wellbeing-kpi.sql` | `wellbeing_kpi` | 4 |
| `data-ethics-consent.sql` | `data_ethics` | 1 |
| `financial-wellbeing.sql` | `finance` | 1 |
| `vocational-interests.sql` | `career` | 1 |
| `leisure-wellbeing.sql` | `recreation` | 1 |
| `relationship-maintenance.sql` | `relation` | 1 |
| `behaviour-change-design.sql` | `health` | 1 |
| `loneliness-connection.sql` | `loneliness` | 4 (3 EN + 1 KO/KCI) |
| `attraction-initiation.sql` | `attraction` | 3 |
| `highly-sensitive.sql` | `sensitivity` | 4 (3 EN + 1 KO/KCI) |
| `communication-skills.sql` | `communication` | 3 (2 EN + 1 KO/KCI) |
| `cross-cultural-global-south.sql` | `cross_cultural_global_south` | 21 (of 22; the Allwood & Berry preface excluded as non-substantive) |
| `manipulation-literacy.sql` | `manipulation` | 3 (2 EN + 1 KO/KCI) |
| `family-of-origin.sql` | `family_of_origin` | 2 (1 EN + 1 KO/KCI) |
| `chc-cognitive-abilities.sql` | `chc_cognitive` | 22 |
| `emotional-intelligence-mscit.sql` | `emotional_intelligence` | 13 |
| `dual-process-theory.sql` | `dual_process` | 20 |
| `multiple-intelligences.sql` | `multiple_intelligences` | 16 (incl. ISBN/KCI rows) |
| `metacognition-introspection.sql` | `metacognition` | 14 |
| `self-concept-clarity.sql` | `self_concept_clarity` | 15 |
| `whole-trait-density.sql` | `whole_trait` | 13 |
| `personality-change-dynamics.sql` | `personality_change` | 14 |
| `self-report-bias.sql` | `self_report_bias` | 17 |
| `cross-cultural-east-asian.sql` | `cross_cultural_east_asian` | 26 |
| `crisis-detection-global.sql` | `crisis_detection_global` | 18 |
| `habit-formation-change.sql` | `habit_formation` | 12 |

**Total**: 340 rows across 45 seed files / 51 framework slugs (row count = actual
`insert` tuples per file, verified by `grep -c "now()," supabase/seed/*.sql`; a few
rows cite an ISBN or KCI id rather than a DOI, so "rows" ≥ "verified DOI rows" in
`docs/research/batches/INDEX.md`).

> The five life-domain seeds (`finance`/`career`/`recreation`/`relation`/`health`)
> are reachable by the Advisor via `src/lib/knowledge/retrieve.ts` routing — both
> by keyword (money/leisure/relationship/habit) and by a DIM domain star pulling
> its own batch. Apply them with MCP `apply_migration` / `execute_sql`, then
> confirm with `select count(*) from public.knowledge_sources where framework in
> ('finance','career','recreation','relation','health');` (expect 5).

> AI retrieval schema for these seeds: see [`../../docs/research/CLAUDE.md`](../../docs/research/CLAUDE.md).

전체 목록과 batch markdown은 `docs/research/batches/INDEX.md` 참조.

## 적용 순서

순서 의존성은 없다. 한 파일이 실패해도 다른 파일은 독립적으로 적재 가능.
