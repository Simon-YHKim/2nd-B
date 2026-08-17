// The 성과 입력 form Simon specified in design/proto_rev2/reference-app/sb-careerinput.jsx.
//
// The app shipped a reduced version of it: three boxes (성과 / 역할 / 임팩트) plus a
// year. The spec has seven sections, and the ones that were dropped are the ones
// that make an entry usable later — 일터 and 역할 place the work, 성과 분해 turns a
// claim into the actions behind it, 기술 정리 names what was used. Without those a
// career timeline is a list of sentences nobody can interrogate.
//
// This module is the pure half: shape, validation, and the body composer. It has
// no React and no Supabase so the composition rules are testable directly, which
// matters because the body it writes is what the user reads back a year later and
// what the retrieval layer indexes.
//
// Deliberately NOT here: the 고용24 KPI suggestion list. That is canon content
// (data/screens/careerinput.json) read through src/lib/canon, not a constant to
// copy into code — copying it is how the canon and the screen drift apart.

export interface CareerKpi {
  /** Stable within one form session; the list is ordered, not keyed by name. */
  id: string;
  name: string;
  /** "%" / "점" / "" — carried from the suggestion, blank for custom entries. */
  unit: string;
  value: string;
}

export interface AchievementForm {
  /** ① 일터 */
  industry: string;
  company: string;
  dept: string;
  team: string;
  /** ② 역할 */
  rank: string;
  job: string;
  title: string;
  /** ③ 프로젝트 */
  project: string;
  start: string;
  end: string;
  ongoing: boolean;
  /** ④ KPI */
  kpis: CareerKpi[];
  /** ⑤ 성과 */
  summary: string;
  freeNote: string;
  /** ⑥ 성과 분해 */
  problem: string;
  productivity: string;
  communication: string;
  /** ⑦ 기술 정리 */
  tools: string[];
  skills: string[];
  theories: string[];
}

export const EMPTY_ACHIEVEMENT_FORM: AchievementForm = {
  industry: "",
  company: "",
  dept: "",
  team: "",
  rank: "",
  job: "",
  title: "",
  project: "",
  start: "",
  end: "",
  ongoing: false,
  kpis: [],
  summary: "",
  freeNote: "",
  problem: "",
  productivity: "",
  communication: "",
  tools: [],
  skills: [],
  theories: [],
};

/**
 * The one required field. Everything else is optional on purpose: a half-filled
 * achievement the user actually saved beats a complete one they abandoned at
 * section four, and the timeline row needs a headline to render.
 */
export function canSaveAchievement(form: AchievementForm): boolean {
  return form.summary.trim().length > 0;
}

/**
 * The year this achievement files under in the timeline. Taken from the project
 * START date, not the end and not today: a two-year project belongs where it
 * began, and careerYearOf() falls back to the capture date when this is absent,
 * which would file a 2019 accomplishment under this year.
 */
export function achievementYear(form: AchievementForm): string | null {
  const m = /^(\d{4})/.exec(form.start.trim());
  return m ? m[1] : null;
}

/** ISO-ish date range for the header line, or null when no start was picked. */
function periodLine(form: AchievementForm, ongoingLabel: string): string | null {
  const start = form.start.trim();
  if (!start) return null;
  if (form.ongoing) return `${start} ~ ${ongoingLabel}`;
  const end = form.end.trim();
  return end ? `${start} ~ ${end}` : start;
}

/** "산업 · 회사 · 부서 · 팀", skipping the blanks. */
function joinDot(...parts: string[]): string | null {
  const kept = parts.map((p) => p.trim()).filter((p) => p.length > 0);
  return kept.length > 0 ? kept.join(" · ") : null;
}

function kpiLine(kpi: CareerKpi): string | null {
  const name = kpi.name.trim();
  if (!name) return null;
  const value = kpi.value.trim();
  if (!value) return `- ${name}`;
  return `- ${name}: ${value}${kpi.unit.trim()}`;
}

function bulletList(items: readonly string[]): string | null {
  const kept = items.map((i) => i.trim()).filter((i) => i.length > 0);
  return kept.length > 0 ? kept.join(", ") : null;
}

interface Labels {
  workplace: string;
  role: string;
  project: string;
  ongoing: string;
  kpi: string;
  detail: string;
  breakdown: string;
  problem: string;
  productivity: string;
  communication: string;
  stack: string;
  tools: string;
  skills: string;
  theories: string;
}

const KO: Labels = {
  workplace: "일터",
  role: "역할",
  project: "프로젝트",
  ongoing: "진행 중",
  kpi: "KPI",
  detail: "기록",
  breakdown: "성과 분해",
  problem: "문제 해결",
  productivity: "생산성",
  communication: "의사소통",
  stack: "기술 정리",
  tools: "Tool",
  skills: "기술",
  theories: "이론",
};

const EN: Labels = {
  workplace: "Workplace",
  role: "Role",
  project: "Project",
  ongoing: "ongoing",
  kpi: "KPI",
  detail: "Notes",
  breakdown: "Breakdown",
  problem: "Problem solving",
  productivity: "Productivity",
  communication: "Communication",
  stack: "Stack",
  tools: "Tools",
  skills: "Skills",
  theories: "Theory",
};

/**
 * Render the form as the record body.
 *
 * Markdown headings, not a flat "key: value" list, because this body is read
 * back inside a timeline card AND fed to retrieval. Empty sections are dropped
 * entirely rather than emitted with blank values, so a three-field entry reads
 * like a three-field entry instead of a mostly-empty template.
 */
export function composeFullAchievementBody(
  form: AchievementForm,
  locale: "en" | "ko",
): string {
  const L = locale === "ko" ? KO : EN;
  const blocks: string[] = [];

  const summary = form.summary.trim();
  if (summary) blocks.push(`# ${summary}`);

  const where = joinDot(form.industry, form.company, form.dept, form.team);
  const who = joinDot(form.rank, form.job, form.title);
  const context: string[] = [];
  if (where) context.push(`${L.workplace}: ${where}`);
  if (who) context.push(`${L.role}: ${who}`);
  const project = form.project.trim();
  const period = periodLine(form, L.ongoing);
  if (project || period) {
    context.push(`${L.project}: ${[project, period].filter(Boolean).join(" (")}${project && period ? ")" : ""}`);
  }
  if (context.length > 0) blocks.push(context.join("\n"));

  const kpis = form.kpis.map(kpiLine).filter((l): l is string => l !== null);
  if (kpis.length > 0) blocks.push(`## ${L.kpi}\n${kpis.join("\n")}`);

  const note = form.freeNote.trim();
  if (note) blocks.push(`## ${L.detail}\n${note}`);

  const breakdown = [
    form.problem.trim() ? `- ${L.problem}: ${form.problem.trim()}` : null,
    form.productivity.trim() ? `- ${L.productivity}: ${form.productivity.trim()}` : null,
    form.communication.trim() ? `- ${L.communication}: ${form.communication.trim()}` : null,
  ].filter((l): l is string => l !== null);
  if (breakdown.length > 0) blocks.push(`## ${L.breakdown}\n${breakdown.join("\n")}`);

  const stack = [
    bulletList(form.tools) ? `- ${L.tools}: ${bulletList(form.tools)}` : null,
    bulletList(form.skills) ? `- ${L.skills}: ${bulletList(form.skills)}` : null,
    bulletList(form.theories) ? `- ${L.theories}: ${bulletList(form.theories)}` : null,
  ].filter((l): l is string => l !== null);
  if (stack.length > 0) blocks.push(`## ${L.stack}\n${stack.join("\n")}`);

  return blocks.join("\n\n");
}
