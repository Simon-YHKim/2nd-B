# Interaction Spec — Mobile Graph Village

## Gestures

- one-finger drag: pan graph
- pinch: zoom graph only
- double tap: reset to center
- page zoom: disabled / locked

## Node tap

- open bottom sheet
- highlight connections
- do not navigate immediately

## Bottom sheet

Actions:
- 살펴보기: navigate to the route or detailed node view
- 세컨비에게 묻기: open SecondB chat with selected node context

## Event characters

Use companion sprite pack v2:
- journalSaved → Momo
- captureSaved → Lulu
- connectionFound → Archi
- imagineStarted/saved → Vela
- safetySoftStop → Gadi

The graph screen itself should normally show only SecondB.

## Motion limits

- default float: 2-4px only
- event cue: 1.2s to 1.8s
- no large bounces
- use overshoot only for small "pop" moments
- support `prefers-reduced-motion`
