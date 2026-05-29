# Interaction Spec — Core Brain / 나의 중심 v2

## Entry points

- Main Graph Tier 1 Core node tap → bottom sheet → 살펴보기 → `/core-brain`
- Main Graph top ribbon tap → `/core-brain`
- Chat answer reference → linked Core Brain context

## Primary interactions

### 1. Persona chip tap

- highlight selected chip
- show 5-field card
- optionally highlight related evidence shards

### 2. Domain card tap

- open domain detail state
- show connected personas and evidence shards

### 3. Evidence row tap

- open original record/wiki/imagine item
- if long press supported, show quick menu: open, ask SecondB, pin to wiki

### 4. Evidence drawer

- opens from "조각 더 보기"
- bottom sheet semantics
- does not cover FAB if chat CTA exists

### 5. Ask SecondB CTA

- hands current CoreBrainSummary context to `/jarvis`
- chat must display a context pill

## Motion

- hero core: subtle breathing only
- card entrance: small opacity/translate
- no elastic bounce
- respect `prefers-reduced-motion`
