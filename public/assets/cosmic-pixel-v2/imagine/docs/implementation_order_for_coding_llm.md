# Implementation Order for Coding LLM — Imagine UI v2

## 1. Add assets

Place this folder at:

```txt
public/assets/cosmic-pixel-v2/imagine/
```

## 2. Merge CSS

Merge:

```txt
css/imagine-v2.css
```

Map hard-coded colors to existing semantic tokens where possible.
Keep the Cosmic Pixel Graph Village palette.

## 3. Route

Use the existing `/imagine` route if it exists.
If not implemented yet, create it.
User-facing title:

```txt
공상 작업실
```

## 4. Screen states

Implement:

```ts
type ImagineScreenState =
  | 'empty'
  | 'input'
  | 'seededFromGraph'
  | 'generating'
  | 'result'
  | 'saveFlow'
  | 'saved';
```

## 5. Result structure

The result should render as:

1. 한 줄 세계관
2. 장면 cards
3. 필요한 사물 cards
4. 등장 캐릭터 / 친구 cards
5. 다음 한 걸음 card
6. 저장 CTA

Do not only output a long text block.
The UI should visually separate the result into cards.

## 6. Save to village

When the user taps:

```txt
마을에 공상 조각으로 저장
```

Create an imagine record and connect it to the graph.
Recommended route/data:

```ts
type ImagineRecord = {
  id: string;
  userId: string;
  title: string;
  seedPrompt: string;
  worldline: string;
  scenes: ImagineScene[];
  objects: ImagineObject[];
  characters: ImagineCharacter[];
  nextStep: ImagineNextStep;
  sourceContext?: ImagineSeedContext;
  createdAt: string;
  graphNodeIds: string[];
};
```

## 7. Entry from graph node

From Main Graph bottom sheet, add optional action:

```txt
공상으로 펼치기
```

Navigate:

```ts
navigate('/imagine', {
  state: {
    entry: 'graphNode',
    nodeId,
    nodeLabel,
    nodeType,
    connectedRecordIds,
  },
});
```

Imagine screen should show a seed context pill:

```txt
{nodeLabel}에서 시작
선택한 노드와 연결된 조각을 먼저 참고해요.
```

## 8. Entry from Core Brain

From `/core-brain`, allow:

```txt
공상 작업실에서 펼치기
```

Payload:

```ts
navigate('/imagine', {
  state: {
    entry: 'coreBrain',
    coreSummaryId,
    brightConnection,
    personaIds,
    domainIds,
    evidenceRecordIds,
  },
});
```

## 9. Entry from SecondB chat

From chat quick action:

```txt
공상으로 펼치기
```

Payload:

```ts
navigate('/imagine', {
  state: {
    entry: 'chat',
    messageId,
    referenceRecordIds,
  },
});
```

## 10. Copy tone

Avoid:

- 분석했습니다
- 진단/치료/상담/정신건강 wording
- 아이디어를 평가하는 tone

Prefer:

- 아직 말이 안 되어도 괜찮아요
- 장면으로 펼쳐볼게요
- 오늘 할 수 있는 한 걸음으로 접어볼게요
- 마을에 공상 조각으로 저장할까요?

## 11. Motion

Use Vela as an event guide only.
Do not overload screen with characters.

- input idle: Vela subtle float
- generating: small spark/progress
- result: cards appear in sequence
- saved: dream shard travels to graph line

Respect `prefers-reduced-motion`.
