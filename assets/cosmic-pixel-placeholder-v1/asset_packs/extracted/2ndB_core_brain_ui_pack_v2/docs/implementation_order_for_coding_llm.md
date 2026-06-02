# Implementation Order for Coding LLM — Core Brain UI v2

## 1. Add assets

Place this folder at:

```txt
public/assets/cosmic-pixel-v2/core-brain/
```

## 2. Merge CSS

Merge:

```txt
css/core-brain-v2.css
```

Map hard-coded colors to the current semantic token system if available.

## 3. Route naming

Internal route can remain:

```txt
/core-brain
```

If the previous route is `/trinity`, keep redirect or alias, but user-facing title should be:

```txt
나의 중심
```

## 4. Screen states

Implement these states:

```ts
type CoreBrainState =
  | "empty"
  | "collecting"
  | "ready"
  | "domainDetail"
  | "personaDetail"
  | "evidenceDrawer";
```

## 5. Section order

The screen should render in this order:

1. Header
2. Center mini graph / hero
3. Bright connection card
4. Domain signal section
5. Persona section
6. Evidence shard section
7. Next step / Ask SecondB CTA

This preserves the product logic: Core → 영역 → 나의 모습/가면 → 실제 조각.

## 6. Persona card details

When a persona/mask is tapped, show five fields:

- who
- for whom
- goal
- do
- fuel

Do not rename these in the data contract unless there is already a project-wide convention.
The UI label may be localized later.

## 7. Evidence drawer

The screen must not feel like the app is making unsupported claims.
Provide an evidence drawer called:

```txt
이걸 만든 조각들
```

It should show:

- record title
- record type
- date label
- route/link to open the original item

## 8. SecondB handoff

The CTA "세컨비에게 이 중심으로 묻기" should open `/jarvis` with context.

Recommended navigation payload:

```ts
navigate('/jarvis', {
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

The chat screen should display a context pill:

```txt
나의 중심에서 질문
선택된 조각과 나의 모습을 먼저 참고해요.
```

## 9. Empty state

When not enough records exist, do not show a fake center.
Use empty state copy:

```txt
아직 중심이 작아요.
오늘의 조각을 하나 남기면 세컨비가 연결을 찾아볼 수 있어요.
```

CTAs:

- 오늘의 조각 남기기
- 세컨비와 시작하기

## 10. Copy style

Avoid:

- 분석했습니다
- 진단했습니다
- 치료/치유/상담 wording
- 확정적 personality judgment

Prefer:

- 지금의 기록에서는 이렇게 보여요
- 자주 이어지는 조각이에요
- 다음 한 걸음으로 줄여볼게요
- 이 조각들이 이 연결을 만들었어요
