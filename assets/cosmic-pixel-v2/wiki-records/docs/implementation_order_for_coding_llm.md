# Implementation order for coding LLM

Add `2ndB_wiki_records_ui_pack_v2.zip` to the project.

Recommended path:

```txt
public/assets/cosmic-pixel-v2/wiki-records/
```

This pack is for `/wiki` and records browsing. It should connect Journal/Capture saved shards to readable wiki pages and record details.

## 1. Merge CSS

Merge `css/wiki-records-v2.css` into the current theme/helper layer. If the project already has semantic tokens, alias hardcoded colors to existing tokens.

## 2. Route and naming

Keep route `/wiki`. User-facing name should be `지식 창고`.

If a separate records browser exists, user-facing name should be `조각 기록`.

## 3. Main states

Implement these states:

```ts
type WikiRecordsMode =
  | "wikiHome"
  | "wikiPage"
  | "records"
  | "recordDetail"
  | "search"
  | "empty";
```

## 4. Main screen

Screen structure:

1. Header
2. Search bar
3. Filter chips
4. Wiki page cards
5. Recent record rows
6. Mini graph map
7. Optional bottom drawer

## 5. Record detail

Record detail must show:

- record title
- record type
- original route
- preview / body text
- created or updated date
- linked graph nodes
- graph handoff CTA
- ask SecondB CTA

## 6. Wiki page detail

Wiki page detail must show:

- title
- summary
- linked records
- related graph nodes
- edit CTA
- graph CTA
- ask SecondB CTA

## 7. Search

Search should query wiki_pages, records, journal records, capture sources, and imagine records if available. The first version can use local filtering while backend search is wired.

## 8. Handoff to graph

When user taps "그래프에서 보기", navigate to the main graph with a highlight payload.

```ts
navigate("/", {
  state: {
    entry: "knowledgeItem",
    highlightRecordId: recordId,
    highlightWikiPageId: wikiPageId,
    linkedNodeIds,
  },
});
```

## 9. Handoff to SecondB

When user taps "세컨비에게 묻기", navigate to `/jarvis` with context.

```ts
navigate("/jarvis", {
  state: {
    entry: "wiki",
    wikiPageId,
    recordId,
    referenceRecordIds,
    linkedNodeIds,
  },
});
```

The chat screen should show a context pill such as:

- `지식 창고에서 질문`
- `선택한 조각을 먼저 참고해요.`

## 10. Empty state

Do not fabricate pages or records when there is insufficient data.

Copy:

```txt
아직 창고가 조용해요.
오늘의 조각이나 링크를 저장하면 여기서 다시 찾아볼 수 있어요.
```

CTAs:

- 오늘의 조각 남기기
- 조각 담기

## 11. Important restrictions

- Do not make this look like a document management system only.
- It should feel like stored shards inside the 밤빛 조각마을 world.
- Do not use clinical/therapy vocabulary.
- Avoid technical terms like RAG in user-facing UI.
- Do not overuse pixel effects.
