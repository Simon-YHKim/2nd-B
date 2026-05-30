# Interaction Spec — Journal / Capture

## Journal save
- Text collapses into a shard.
- Momo appears for 1.2–1.8 seconds.
- Success message: “조각을 잘 보관했어요.”
- Optional CTA: “그래프 보기”, “하나 더 남기기”.

## Capture import
- Lulu appears carrying a shard.
- If link/file/OCR needs processing, show a neutral processing panel.
- Success message: “새 조각을 가져왔어요.”

## Graph handoff
- When the user taps “그래프 보기”, navigate to main graph with `highlightRecordId`.
- Main graph should highlight the new Tier 4 shard and its connected edge.

## Empty states
- Do not invent insights when records are missing.
- Encourage one small input.

## Accessibility
- Textarea: `aria-label="오늘의 조각 입력"`
- Capture mode buttons should have selected state.
- Event characters are `aria-hidden` unless they communicate unique content.
