// A sample IdenDoc — the dummy identity used by tests and as a render preview.
// Mirrors the locked design mock docs/iden-mocks/iden-E-twocol.html.
// Lexicon-clean: no clinical terms. Big Five's Neuroticism axis is surfaced as
// the non-clinical "Sensitivity" (the raw key stays standard internally).

import type { IdenDoc } from "./types";

export const SAMPLE_IDEN: IdenDoc = {
  iden: "0.1",
  name: "Simon",
  generated: "2026-06-16",
  oneLiner: "INFP, mediator. Driven by autonomy.",
  fields: [
    {
      key: "traits",
      label: "Traits",
      viz: "radar",
      placement: "both",
      source: { kind: "measured", instrument: "BFI-44" },
      data: {
        Openness: 0.82,
        Conscientiousness: 0.68,
        Extraversion: 0.35,
        Agreeableness: 0.74,
        Sensitivity: 0.41,
      },
    },
    {
      key: "patterns",
      label: "Patterns",
      viz: "tags",
      placement: "main",
      source: { kind: "measured", instrument: "BFI-44" },
      data: ["Inquisitive", "Diligent", "Warm"],
    },
    {
      key: "type",
      label: "Type",
      viz: "badge",
      placement: "main",
      source: { kind: "assessment" },
      data: "INFP",
    },
    {
      key: "attachment",
      label: "Attachment",
      viz: "badge",
      placement: "main",
      source: { kind: "instrument", instrument: "ECR-S" },
      data: "Secure",
    },
    {
      key: "drivers",
      label: "Drivers",
      viz: "list",
      placement: "rail",
      source: { kind: "self_report" },
      data: ["Autonomy", "Growth", "Authenticity"],
    },
    {
      key: "cores",
      label: "Cores",
      viz: "node-graph",
      placement: "rail",
      source: { kind: "derived" },
      data: { center: "Soul", nodes: ["Growth", "Wisdom", "Bond", "Muse", "Record"] },
    },
    {
      key: "contents",
      label: "Contents",
      viz: "donut",
      placement: "main",
      source: { kind: "count" },
      data: { Sources: 48, Records: 30, Concepts: 12 },
      topics: ["habits", "psychology", "writing"],
    },
  ],
  summary: {
    text: "A consistent self-documenter, open to new ideas and reflective by habit. Values warmth in relationships and works with the most energy when moving on a direction he set himself.",
    source: { kind: "ai_summary" },
  },
  rules: [
    "Answer grounded in this file. Do not invent facts not present here.",
    "Treat the person as a thinking partner, not an evaluation subject.",
    "The live request, if any, is at the very bottom.",
  ],
};
