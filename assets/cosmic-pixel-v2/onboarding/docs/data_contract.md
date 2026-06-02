# Data Contract

## Onboarding preference

```ts
type OnboardingPreference = {
  version: 'cosmic-pixel-v2';
  completedAt: string | null;
  skippedAt?: string | null;
  firstShardPromptSeenAt?: string | null;
};
```

## First shard journal payload

```ts
type FirstShardPayload = {
  entry: 'firstRun';
  text: string;
  source: 'journal';
  createdAt: string;
  suggestedTags?: string[];
};
```

## Main graph handoff after first shard

```ts
type FirstShardGraphHandoff = {
  entry: 'firstShard';
  highlightRecordId: string;
  pulse?: 'recent' | 'newShard';
};
```

## Age gate state

```ts
type AgeGateState = {
  birthDate: string;
  isValidDate: boolean;
  isAtLeast18: boolean;
};
```

Enforce birth_date >= 18 in UI/auth/DB if available.
