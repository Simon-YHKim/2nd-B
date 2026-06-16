// IDEN — identity export format. Types.
//
// IDEN is the user's identity as one portable file (see docs/IDEN-SPEC.md).
// An `IdenDoc` is the single source of truth; both renderers consume it:
//   - render-html.ts  → the human-readable A4 two-column CV sheet
//   - (serialize, later) → the `.iden` text any AI reads
//
// Schema-driven: the viewer renders whatever `fields` exist, each by its `viz`
// hint, so the system can emit more/fewer fields without breaking the layout.

/** How a field is drawn. Unknown values fall back to a tag/badge render. */
export type Viz = "radar" | "bar" | "donut" | "node-graph" | "badge" | "tags" | "list" | "stat";

/** Which column the field lands in. Default is chosen per `viz` when omitted. */
export type Placement = "rail" | "main" | "both";

/**
 * Where a value came from. This is IDEN's trust layer: every rendered value
 * shows an honest source, and missing data is shown as `collecting`, never faked.
 */
export type SourceKind =
  | "measured" // psychometric/behavioral measurement (with `instrument`)
  | "instrument" // a named validated instrument, e.g. ECR-S
  | "assessment" // structured self/AI assessment
  | "self_report" // the user stated it
  | "count" // a tally from the vault
  | "derived" // computed from other data
  | "ai_summary" // AI narrative — must render visually separated
  | "collecting"; // not yet known

export interface IdenSource {
  kind: SourceKind;
  /** e.g. "BFI-44", "ECR-S". Shown next to (or as) the source tag. */
  instrument?: string;
}

/** radar/bar: named scores in 0..1. */
export type ScoreMap = Record<string, number>;
/** donut: named counts. */
export type CountMap = Record<string, number>;
/** node-graph: a center node and its surrounding nodes. */
export interface NodeGraphData {
  center: string;
  nodes: string[];
}

interface FieldBase {
  key: string;
  label: string;
  source: IdenSource;
  placement?: Placement;
}

export type IdenField =
  | (FieldBase & { viz: "radar" | "bar"; data: ScoreMap })
  | (FieldBase & { viz: "donut"; data: CountMap; topics?: string[] })
  | (FieldBase & { viz: "node-graph"; data: NodeGraphData })
  | (FieldBase & { viz: "tags" | "list"; data: string[] })
  | (FieldBase & { viz: "badge"; data: string })
  | (FieldBase & { viz: "stat"; data: number; unit?: string });

export interface IdenSummary {
  text: string;
  /** Conventionally `{ kind: "ai_summary" }`. */
  source: IdenSource;
}

export interface IdenDoc {
  /** Format version, e.g. "0.1". */
  iden: string;
  name: string;
  /** ISO date, e.g. "2026-06-16". */
  generated: string;
  oneLiner: string;
  fields: IdenField[];
  /** Optional AI narrative, rendered under an "AI-generated interpretation" label. */
  summary?: IdenSummary;
  /** Instructions to any AI reading the `.iden` file. Not shown on the CV sheet. */
  rules?: string[];
}
