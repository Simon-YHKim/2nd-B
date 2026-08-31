# records 의미 색인 (D5) — 동의 · 백필 · 비용

> 작성 2026-08-31 (REQ-260901-02). 코드 정본: `src/lib/records/records-embeddings.ts` ·
> 화면: `src/screens/deepspace/DeepSpaceDesignScreens.tsx` (privacy → "기록 의미 연결").

## 무엇

`records`(일지·노트 — 가장 민감한 말뭉치)를 의미 벡터로 색인해 "연결된 기록" 을 보여주는 층.
모델 호출은 전부 LLM 경계(`embedTexts`, C1/C3/C9/Cost)를 지난다.

## 동의 게이트 — 전부 여기서 갈린다

- **기본 OFF.** `records_embedding`(privacy pref, `src/lib/privacy/prefs.ts`)을 성인이 명시적으로
  켜야 한다. `recordsEmbeddingAllowed()` 가 모든 쓰기 경로의 단일 게이트.
- **미성년은 이중으로 막힌다** — 클라이언트(`isMinor` 하드블록)와 서버(0072 트리거가
  `minor_self` 의 pref 를 강제 false). **클램프에 우회·완화·특례 없음** (Simon 명시, 2026-08-31).
- **끄면 벡터 삭제.** `clearRecordEmbeddings` 가 vector 와 `embedding_model` 을 함께 지운다 —
  "끄면 삭제" 약속을 정직하게 지키는 경로이고, 백필은 이 경로를 건드리지 않는다.

## 색인을 만드는 손 — 둘

| 경로 | 언제 | 코드 |
|---|---|---|
| 쓰기 시점 | 기록을 담는 순간 (detached) | `create.ts` → `embedAndStoreRecord` |
| **동의 시점 백필** | pref 가 **false → true** 로 바뀌는 순간 (detached) | `enableEmbedding()` → `backfillAllRecordEmbeddings` |

**동의 시점 백필은 Simon 결정 (a) (2026-08-31, REQ-260901-02)** — "records 백필은 (a) 동의를
켤 때 기존 기록도 일괄 색인하는 쪽으로 간다. 0072 미성년 클램프는 그대로 지킬 것."
사용자가 토글을 켤 때 기대하는 것은 "내 기록이 연결된다"이지 "앞으로 쓸 것만"이 아니다.
동의 화면 문구도 같은 PR 에서 "지금까지 담아 둔 기록과 앞으로 담는 기록"으로 고쳤다 —
이전에 밖으로 나가지 않던 텍스트가 나가기 시작하는 변경이라, 문구가 범위를 정확히 말해야
동의가 근거로 성립한다.

## 부분 실패 · 재시도

- 백필은 **detached·best-effort** 다. 어떤 실패도 방금 저장된 동의를 되돌리지 않는다.
- 위기(red-zone) 텍스트는 C9 이 배치에서 제외한다(제로 벡터, **저장 안 함**) — 그 행은
  embedding NULL 로 남는다. 배치 전체 실패(프록시 에러 등)도 마찬가지로 NULL 로 남는다.
- 감사는 경계가 남긴다: 배치 1회 = `ai_audit_log` `embed_index` 행 1개(라이브는 프록시가 기록).
- **재시도 경로 = 토글 off → on.** NULL 행만 다시 집으므로 멱등이고, off 가 벡터를 지우니
  on 이 전량을 다시 만든다. 쓰기 시점 경로는 백필과 무관하게 항상 돈다.

## 비용 가드

- 배치 50건 = `embedTexts` 1콜. 한 번의 토글당 **최대 10라운드(500건)** 에서 멈춘다
  (`maxRounds`; 걸리면 `capped: true` 로 반환·로그 — 다음 토글이 이어서 한다).
- 각 실행은 `[records-embedding] backfill …` 로 라운드·건수를 로그에 남긴다.
- 현재 규모(2026-08-31): 전체 158건 NULL ≈ 콜 4회. **사용자가 늘면 "동의 토글 1회"가
  그 사용자의 기록 수에 비례하는 비용을 갖는다** — 임계가 보이면 서버측 배치로 옮길 것.
- 페이지네이션은 `created_at` 키셋(`before` 커서)이라, 색인 안 되는 행(red-zone·빈 텍스트)이
  최신 페이지를 점유해도 그 뒤의 오래된 행에 도달한다.
