// A reader for CHANGELOG.md, so the release script does not have to be a pile
// of regexes.
//
// This is the first parser of that file in the repo, so the shape it accepts is
// defined by what the file already contains rather than by Keep a Changelog in
// general:
//
//   ## [Unreleased]              <- always first, may be empty
//   ## [0.0.3] - 2026-06-23      <- released sections, newest first
//   ### Added / Changed / Fixed / Removed
//   - a bullet whose prose wraps
//     across several indented or plain continuation lines
//
// Entries in the real file wrap across three to eight lines and carry inline
// backticks and parenthetical code anchors, so folding continuations and
// stripping markdown is not optional polish - it is the difference between a
// notice body a user can read and a paste of source notes.

/** One `## [...]` section. */
export interface ChangelogSection {
  /** The `### X` heading this group of bullets sat under, or "" when the
   *  section had bullets before any sub-heading. */
  heading: string;
  bullets: string[];
}

export interface ChangelogEntry {
  /** null for `[Unreleased]`. */
  version: string | null;
  isUnreleased: boolean;
  /** The `- YYYY-MM-DD` suffix, when the heading carried one. */
  date: string | null;
  sections: ChangelogSection[];
}

const HEADING = /^##\s+\[([^\]]+)\]\s*(?:-\s*(\d{4}-\d{2}-\d{2}))?\s*$/;
const SUB_HEADING = /^###\s+(.+?)\s*$/;
const BULLET = /^[-*]\s+(.*)$/;

/**
 * Which sections make it into a user-facing notice, in the order they appear.
 *
 * `Fixed` and `Removed` are excluded by default: a release notice answers "what
 * can I do now that I could not before", and a bug-fix list reads as a list of
 * things that were broken. They are still in the CHANGELOG for developers, and
 * --sections on the script overrides this.
 */
export const DEFAULT_NOTICE_SECTIONS = ["Added", "Changed"] as const;

/** Parse the whole file, newest section first (the file's own order). */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let entry: ChangelogEntry | null = null;
  let section: ChangelogSection | null = null;
  // A bullet stays open until the next bullet, heading or blank line, so its
  // wrapped continuation lines can be folded into it.
  let open: string[] | null = null;

  const closeBullet = () => {
    if (entry && section && open && open.length > 0) {
      section.bullets.push(open.join(" ").replace(/\s+/g, " ").trim());
    }
    open = null;
  };

  const openSection = (heading: string) => {
    closeBullet();
    if (!entry) return;
    section = { heading, bullets: [] };
    entry.sections.push(section);
  };

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trimEnd();

    const heading = HEADING.exec(line);
    if (heading) {
      closeBullet();
      const token = heading[1] ?? "";
      const isUnreleased = token.toLowerCase() === "unreleased";
      entry = {
        version: isUnreleased ? null : token.replace(/^v/i, ""),
        isUnreleased,
        date: heading[2] ?? null,
        sections: [],
      };
      section = null;
      entries.push(entry);
      continue;
    }

    if (!entry) continue;

    const sub = SUB_HEADING.exec(line);
    if (sub) {
      openSection(sub[1] ?? "");
      continue;
    }

    const trimmed = line.trim();
    if (trimmed === "") {
      closeBullet();
      continue;
    }

    const bullet = BULLET.exec(trimmed);
    if (bullet) {
      closeBullet();
      // Bullets before any "### X" belong to an unnamed group rather than being
      // dropped on the floor.
      if (!section) openSection("");
      open = [bullet[1] ?? ""];
      continue;
    }

    // A continuation line of the bullet above. Anything else at this level is
    // prose the notice has no use for, so it is ignored rather than guessed at.
    if (open) open.push(trimmed);
  }

  closeBullet();
  return entries;
}

/** The `[Unreleased]` section, or null when the file has none. */
export function unreleasedEntry(entries: readonly ChangelogEntry[]): ChangelogEntry | null {
  return entries.find((e) => e.isUnreleased) ?? null;
}

/** The newest released section, i.e. the version this repo last cut. */
export function latestReleased(entries: readonly ChangelogEntry[]): ChangelogEntry | null {
  return entries.find((e) => !e.isUnreleased && e.version !== null) ?? null;
}

/** The newest released section strictly below `version`, which is what a bump
 *  is measured against once `version` itself has been cut into the file. */
export function releasedBefore(
  entries: readonly ChangelogEntry[],
  version: string,
): ChangelogEntry | null {
  let seen = false;
  for (const candidate of entries) {
    if (candidate.isUnreleased || candidate.version === null) continue;
    if (candidate.version === version) {
      seen = true;
      continue;
    }
    if (seen) return candidate;
  }
  return null;
}

/**
 * Strip the markdown the notice dialog cannot render.
 *
 * The dialog interprets paragraphs and "- " bullets and nothing else
 * (src/lib/notices/markdown.ts), so `**bold**`, `[text](url)` and `code` would
 * reach the user as literal punctuation. Em dashes go too: DESIGN.md forbids
 * them in UI strings and the CI guard only scans locale bundles, so a body
 * pasted into the database would slip past it.
 */
export function flattenMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/—/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Turn an entry into a notice body: bullet lines in the subset the dialog
 * renders.
 *
 * This is a starting draft, not a finished announcement. CHANGELOG prose is
 * written for whoever maintains the code ("wrap auth.uid() in a subquery"), and
 * the script prints the result for a human to rewrite before publishing. Doing
 * less than this would hand the operator a blank page; doing more would be a
 * translation the tool is not qualified to make.
 */
export function summarizeEntry(
  entry: ChangelogEntry,
  options: { sections?: readonly string[]; maxBullets?: number } = {},
): string {
  const wanted = options.sections ?? DEFAULT_NOTICE_SECTIONS;
  const limit = options.maxBullets ?? 5;
  const picked: string[] = [];

  for (const name of wanted) {
    for (const section of entry.sections) {
      if (section.heading.toLowerCase() !== name.toLowerCase()) continue;
      for (const bullet of section.bullets) picked.push(bullet);
    }
  }

  // No matching sub-heading (or a section list that misses everything): fall
  // back to every bullet rather than emitting an empty body, which the NOT NULL
  // + non-blank CHECK on notices.body_ko would reject anyway.
  if (picked.length === 0) {
    for (const section of entry.sections) picked.push(...section.bullets);
  }

  return picked
    .slice(0, limit)
    .map((bullet) => `- ${flattenMarkdown(bullet)}`)
    .filter((line) => line !== "- ")
    .join("\n");
}
