# Data Contract — Journal / Capture Shard

```ts
export type ShardSource = "journal" | "capture";
export type CaptureMode = "memo" | "link" | "clip" | "ocr" | "file";

export type SavedShard = {
  id: string;
  source: ShardSource;
  mode?: CaptureMode;
  title: string;
  previewText: string;
  createdAt: string;
  route: "/journal" | "/capture";
  tags?: string[];
  linkedNodeIds?: string[];
  suggestedDomainIds?: string[];
  suggestedPersonaIds?: string[];
  wikiSourceId?: string;
  safetyStatus?: "clear" | "soft_stop" | "blocked";
};
```

After save, the graph should be able to render this as a Tier 4 data shard.
