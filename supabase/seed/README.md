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

- `big-five.sql` — Big Five (OCEAN), 7 rows
- `attachment.sql` — Attachment Theory, 6 rows
- `erikson.sql` — Erikson's Stages, 5 rows
- *(추가 예정)* SDT, Emerging Adulthood, SOC, Successful Aging, Growth Mindset, Self-Compassion, VIA

## 적용 순서

순서 의존성은 없다. 한 파일이 실패해도 다른 파일은 독립적으로 적재 가능.
