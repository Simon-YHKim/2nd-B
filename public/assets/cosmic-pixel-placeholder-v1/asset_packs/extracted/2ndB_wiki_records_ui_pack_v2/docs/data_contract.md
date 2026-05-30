# Data contract

Suggested data shapes for `/wiki` and records browser.

```ts
type KnowledgeItemType =
  | "wiki_page"
  | "record"
  | "journal"
  | "capture"
  | "imagine"
  | "interview"
  | "audit";

type WikiPageSummary = {
  id: string;
  title: string;
  summary?: string;
  updatedAt: string;
  recordIds: string[];
  linkedNodeIds: string[];
  tags?: string[];
};

type RecordSummary = {
  id: string;
  type: KnowledgeItemType;
  title: string;
  previewText?: string;
  route: string;
  createdAt: string;
  sourceMode?: "memo" | "link" | "clip" | "ocr" | "file";
  linkedWikiPageIds?: string[];
  linkedNodeIds?: string[];
  tags?: string[];
  safetyStatus?: "clear" | "soft_stop" | "blocked";
};

type WikiRecordsHandoff = {
  entry: "wiki" | "record" | "search";
  wikiPageId?: string;
  recordId?: string;
  referenceRecordIds?: string[];
  linkedNodeIds?: string[];
};
```
