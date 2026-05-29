# Interaction Spec — Imagine / 공상 작업실 v2

## Primary flow

1. User enters seed prompt
2. Tap `장면으로 펼치기`
3. Generating state shows Vela
4. Result returns structured cards
5. User saves result
6. New imagine record appears as graph data shard

## Secondary entry points

### From graph node

- Main Graph node bottom sheet → `공상으로 펼치기`
- Imagine screen starts with node context pill

### From Core Brain

- Next step card → `공상 작업실에서 펼쳐보기`
- Imagine screen starts with Core Brain context

### From SecondB chat

- Quick chip → `공상으로 펼치기`
- Imagine screen receives chat answer/reference context

## Result interactions

- Tab between 장면 / 사물 / 친구 / 한 걸음
- Save to village
- Ask SecondB about this result
- Regenerate lightly
- Expand more

## Motion

- Use short card reveal sequence: 60ms stagger
- Vela float: 2 to 4px
- Save animation: dream shard travels toward graph line
- Avoid elastic/bouncy UI except small approved “뽁” style on save success
