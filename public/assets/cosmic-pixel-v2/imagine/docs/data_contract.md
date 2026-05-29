# Data Contract — Imagine / 공상 작업실 v2

```ts
export type ImagineSeedContext = {
  entry: 'direct' | 'graphNode' | 'coreBrain' | 'chat';
  nodeId?: string;
  nodeLabel?: string;
  nodeType?: 'core' | 'domain' | 'persona' | 'record' | 'wiki';
  connectedRecordIds?: string[];
  coreSummaryId?: string;
  brightConnection?: string;
  personaIds?: string[];
  domainIds?: string[];
  evidenceRecordIds?: string[];
  messageId?: string;
  referenceRecordIds?: string[];
};

export type ImagineRecord = {
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
  updatedAt: string;
  graphNodeIds: string[];
};

export type ImagineScene = {
  id: string;
  title: string;
  description: string;
  visualPrompt?: string;
};

export type ImagineObject = {
  id: string;
  name: string;
  description: string;
  visualPrompt?: string;
};

export type ImagineCharacter = {
  id: string;
  name: string;
  role: string;
  personality?: string;
  visualPrompt?: string;
};

export type ImagineNextStep = {
  label: string;
  reason?: string;
  route?: string;
  payload?: unknown;
};
```

## Persistence rule

Saved imagine records should be retrievable by the RAG layer and visible as Tier 4 graph data shards.
