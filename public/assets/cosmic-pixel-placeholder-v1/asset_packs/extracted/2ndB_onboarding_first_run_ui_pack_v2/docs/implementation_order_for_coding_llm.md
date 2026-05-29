# 2ndB Onboarding / First Run UI Pack v2 — Implementation Order

## Goal

Add a first-run experience for the Cosmic Pixel Graph Village direction.
The onboarding must explain the app without technical language and guide the user to the first useful action: saving one “조각”.

The existing app structure stays intact:
- NavGraph remains the main model.
- Core Brain remains the center node.
- SecondB remains the floating AI friend.
- Journal/Capture/Wiki/Imagine/Jarvis/Core Brain routes stay as-is.

## Suggested asset location

`public/assets/cosmic-pixel-v2/onboarding/`

Place the contents of this pack there.

## Phase 1 — Route and persistence

Create or update the onboarding route:

- `/onboarding`
- optional `/signup/birth-date` for age gate
- first-run redirect logic after login/signup

Persist onboarding completion:

```ts
localStorage.setItem('onboarding.cosmicPixel.v2.completedAt', new Date().toISOString())
```

For authenticated users, mirror this to profile/preferences if available.

## Phase 2 — Five-step onboarding

Implement the following steps:

1. Welcome
   - Asset: `onboarding/welcome_hero_v2.svg`
   - Copy: “내 생각 조각이 작은 지도가 돼요”

2. Graph Village
   - Asset: `onboarding/graph_village_intro_v2.svg`
   - Explain: node = place, edge = path, record = shard.

3. SecondB
   - Asset: `onboarding/secondb_intro_card_v2.svg`
   - Explain: SecondB answers with the user's saved shards.

4. Trust
   - Asset: `trust/privacy_trust_card_v2.svg`
   - Explain: answers show “참고한 조각”. Avoid heavy privacy/legal copy here.

5. First Shard
   - Asset: `onboarding/first_shard_card_v2.svg`
   - CTA: save the first shard or skip and browse.

## Phase 3 — Age gate

If birth_date is missing during account creation, show the age gate.

- Asset: `age_gate/age_gate_panel_v2.svg`
- Constraint: birth_date >= 18
- Enforce at UI, auth flow, and DB check level if already defined.

## Phase 4 — First run empty graph

When the user opens the graph before any record exists, show a first-run empty state.

- Asset: `first_run/empty_graph_state_v2.svg`
- CTA: “첫 조각 남기기” → `/journal?entry=firstRun`

After first journal save:

- Asset: `first_run/first_shard_success_v2.svg`
- Navigate to graph with highlight state:

```ts
navigate('/', {
  state: {
    entry: 'firstShard',
    highlightRecordId: recordId,
  },
});
```

## Phase 5 — Accessibility

- Onboarding image assets are decorative unless they contain necessary text.
- All copy must be rendered as HTML text in the app.
- Progress dots need aria-label or hidden state.
- Age gate input requires label and validation message.
- “Skip” must be keyboard accessible.

## Phase 6 — Do not do

- Do not expose technical terms like RAG, embedding, vector, classifier.
- Do not use clinical words or therapy/counseling language.
- Do not over-gamify with coins, levels, rewards, quests.
- Do not make the app look like a farming game.
- Do not block users from exploring unless age/account policy requires it.
