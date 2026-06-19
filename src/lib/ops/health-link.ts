// Phase B Slice 1: the DETERMINISTIC health-sample → routine auto-complete
// mapping. Pure, node-testable, sits beside routineDueToday / weekStreak.
//
// There is NO LLM here: a fixed domain→metric rule table decides whether a
// given sample satisfies a given routine's domain. A logged workout (or a
// steps total over goal) ticks off exercise_routine; steps-over-goal or enough
// sleep ticks off health_routine. Every other domain (exercise_ideas and the
// remaining 11) NEVER auto-completes — only the two activity domains do.

import type { HealthMetricType, HealthSample } from "../health/HealthSource";
import type { OpsDomainId } from "./domains";

/** Steps at/above this count satisfy the activity domains. */
export const STEP_GOAL = 8000;
/** Sleep minutes at/above this satisfy health_routine. */
export const SLEEP_MIN_MINUTES = 360;

/**
 * Constant rule table: which (metric, threshold) combinations satisfy each
 * auto-completable domain. Domains absent from this table never auto-complete.
 * A rule with no `min` is a pure presence rule (any sample of that metric).
 */
interface MetricRule {
  metric: HealthMetricType;
  /** Minimum value (inclusive) the sample must reach; omitted = presence only. */
  min?: number;
}

const DOMAIN_RULES: Partial<Record<OpsDomainId, MetricRule[]>> = {
  // A workout of any size, OR a steps total over goal, counts as exercise.
  exercise_routine: [{ metric: "workout" }, { metric: "steps", min: STEP_GOAL }],
  // Steps over goal OR enough sleep counts as a health/activity day.
  health_routine: [
    { metric: "steps", min: STEP_GOAL },
    { metric: "sleep", min: SLEEP_MIN_MINUTES },
  ],
};

function satisfiesRule(sample: Pick<HealthSample, "metricType" | "value">, rule: MetricRule): boolean {
  if (sample.metricType !== rule.metric) return false;
  if (rule.min === undefined) return true;
  return typeof sample.value === "number" && sample.value >= rule.min;
}

/** Does this sample satisfy this domain's deterministic rule? */
export function sampleSatisfiesDomain(
  sample: Pick<HealthSample, "metricType" | "value">,
  domainId: OpsDomainId,
): boolean {
  const rules = DOMAIN_RULES[domainId];
  if (!rules) return false;
  return rules.some((r) => satisfiesRule(sample, r));
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Local YYYY-MM-DD completion key derived from a sample's started_at — the same
 * shape routines.localDayKey produces, so an auto-completion and a manual tick
 * for the same calendar day collapse onto the one UNIQUE(routine_id,
 * completed_on) row. Falls back to "now" when the ISO is unparseable.
 */
export function localDayKeyFromIso(startedAt: string, fallback: Date = new Date()): string {
  const d = new Date(startedAt);
  const at = Number.isNaN(d.getTime()) ? fallback : d;
  return `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}`;
}

export interface RoutineAutoHit {
  routineId: string;
  completedOn: string;
}

/** The minimal routine shape the mapping needs (id + domain). */
export interface ActiveRoutineLike {
  id: string;
  domain_id: string;
}

/**
 * Pure mapping: given one sample and the user's active routines, return the
 * (routineId, completedOn) pairs that this sample auto-completes. Only the two
 * activity domains can match; everything else returns nothing.
 */
export function routinesSatisfiedBy(
  sample: Pick<HealthSample, "metricType" | "value" | "startedAt">,
  activeRoutines: ReadonlyArray<ActiveRoutineLike>,
): RoutineAutoHit[] {
  const completedOn = localDayKeyFromIso(sample.startedAt);
  const hits: RoutineAutoHit[] = [];
  for (const routine of activeRoutines) {
    if (sampleSatisfiesDomain(sample, routine.domain_id as OpsDomainId)) {
      hits.push({ routineId: routine.id, completedOn });
    }
  }
  return hits;
}
