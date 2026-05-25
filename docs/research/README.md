# Psychology Research — Workflow

심리학 프레임워크 큐레이션은 **외부 Deep Research 도구**에서 진행하고, 결과물만 이 레포에 적재한다. 이 디렉토리는 그 single source of truth.

## 파일

- **`psychology-handoff.md`** — Gemini Deep Research / Claude Research / 새 ChatGPT 세션의 **첫 메시지**로 그대로 붙여넣는 마스터 프롬프트. 수정 금지(필요하면 PR로 별도 논의).
- **`batches/_template.md`** — 한 batch 산출물의 마크다운 템플릿. 빈 헤더만 있음.
- **`batches/{framework-slug}.md`** — 검증된 batch 결과물. 예: `big-five.md`, `attachment-adult.md`, `erikson.md`.

## 한 사이클 (배치 1건 기준)

1. **세션 시작**: 새 Deep Research 세션을 열고 `psychology-handoff.md` 전문을 첫 메시지로 붙여넣는다. 모델은 한국어로 acknowledge하고 "어떤 프레임워크부터 시작할까요?"로 응답한다.
2. **요청**: 한 batch만 요청한다. 예) "Research Big Five for me. Output one full markdown batch."
3. **수신 & 정리**: 응답을 `batches/{framework-slug}.md`로 저장. 형식이 어긋나면 `_template.md`에 맞춰 정렬.
4. **검증 (5분)**: 모든 DOI를 doi.org에서 열어 실재 확인. 단일 fabrication이라도 발견되면 batch 전체 reject — 응답에 "DOI fabricated — redo with stricter sourcing" 회신 후 재요청.
5. **승인 → DB 적재**: 통과한 batch 하단의 `INSERT INTO knowledge_sources …` SQL을 Supabase 콘솔 또는 마이그레이션 파일로 실행. `verified_at = now()` 세팅 잊지 말 것.
6. **커밋**: batch .md + (필요 시) 시드 SQL을 같은 커밋에 묶어 push.

## 거부 사유 체크리스트

- DOI 미존재 / 검색 결과 없음
- Wikipedia, 블로그, 유튜브 같은 비학술 출처
- MBTI / Enneagram / 5 Love Languages 등 검증 미흡 프레임워크
- 한국 cultural context를 essentialize하거나 romanticize하는 서술
- Clinical 진단/치료 권고
- "evidence-based" 강도를 모호하게 표시

거부 시 무엇이 문제였는지 한 줄로 정리해 같은 세션에 재요청 — 새 세션은 컨텍스트 손실 비용이 큼.

## DB

스키마: `supabase/migrations/20260525000000_create_knowledge_sources.sql`.
필드와 제약은 `psychology-handoff.md`의 "Project Context" 섹션 스펙을 따른다.
