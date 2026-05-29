# Interaction spec

## Search behavior

- Search bar is visible at the top of `/wiki`.
- Search should support title, body preview, tags, route, and source type.
- Search result cards can represent wiki pages or records.

## Filter behavior

Initial filters:

- 전체
- 위키
- 오늘의 조각
- 조각 담기
- 공상
- 최근
- 연결 많음

## Card tap

- Wiki page card tap → wiki page detail.
- Record row tap → record detail.
- Related node tap → graph with highlight.

## Bottom drawer

Use bottom drawer for:

- linked records list
- source trace
- related graph nodes
- save/pin actions

## Animation

- Cards should fade/slide softly.
- New record highlight may pulse in Pixel Lamp.
- Mini graph connection can pulse in Signal Mint.
- No excessive bounce; only short overshoot for important pop moments.
