# Data Contract — Core Brain / 나의 중심 v2

```ts
export type CoreBrainSummary = {
  id: string;
  updatedAt: string;
  headline: string;
  subline: string;
  phase: 'preDawn' | 'dawn' | 'sunrise' | 'dayGarden' | 'twilight' | 'deepNight';
  brightConnection: string;
  domains: CoreDomain[];
  personas: CorePersona[];
  evidence: CoreEvidenceShard[];
  nextStep?: CoreNextStep;
};

export type CoreDomain = {
  id: string;
  label: string;
  intensity: number; // 0..1
  shardCount: number;
  summary: string;
  connectedPersonaIds: string[];
  evidenceIds: string[];
};

export type CorePersona = {
  id: string;
  label: string;
  summary: string;
  who: string;
  forWhom: string;
  goal: string;
  do: string;
  fuel: string;
  shardCount: number;
  evidenceIds: string[];
};

export type CoreEvidenceShard = {
  id: string;
  type: 'journal' | 'capture' | 'wiki' | 'interview' | 'audit' | 'imagine';
  title: string;
  dateLabel: string;
  route: string;
  nodeId?: string;
};

export type CoreNextStep = {
  label: string;
  route: string;
  payload?: unknown;
};
```

## Important

Do not render unsupported descriptions without evidence ids.
If a card has no evidence, show a collecting/empty state instead of overconfident text.
