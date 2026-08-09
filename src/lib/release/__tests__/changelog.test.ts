// CHANGELOG.md parsing.
//
// The real file wraps bullets across three to eight lines, keeps [Unreleased]
// at the top, and carries inline backticks and code anchors. A parser that
// only works on a tidy fixture would fail on the first real release, so the
// last test in this file reads the actual CHANGELOG.md rather than a sample.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  flattenMarkdown,
  latestReleased,
  parseChangelog,
  releasedBefore,
  summarizeEntry,
  unreleasedEntry,
} from "../changelog";

const SAMPLE = [
  "# Changelog",
  "",
  "Some preamble prose that is not part of any section.",
  "",
  "## [Unreleased]",
  "",
  "### Added",
  "- A bullet whose prose wraps",
  "  across two lines.",
  "- A second bullet.",
  "",
  "### Fixed",
  "- Something that used to be broken.",
  "",
  "## [1.2.0] - 2026-08-01",
  "",
  "### Added",
  "- The feature this release is named after.",
  "",
  "### Changed",
  "- A behaviour that moved.",
  "",
  "## [1.1.0] - 2026-07-01",
  "",
  "### Added",
  "- Older work.",
  "",
].join("\n");

describe("parseChangelog", () => {
  const entries = parseChangelog(SAMPLE);

  test("reads the sections in file order, newest first", () => {
    expect(entries.map((e) => e.version)).toEqual([null, "1.2.0", "1.1.0"]);
    expect(entries[0]?.isUnreleased).toBe(true);
    expect(entries[1]?.isUnreleased).toBe(false);
  });

  test("keeps the release date when the heading carries one", () => {
    expect(entries[1]?.date).toBe("2026-08-01");
    expect(entries[0]?.date).toBeNull();
  });

  test("folds a wrapped bullet into one line", () => {
    // Every real entry in CHANGELOG.md wraps. Without this a notice body would
    // be a column of sentence fragments.
    expect(entries[0]?.sections[0]?.bullets[0]).toBe("A bullet whose prose wraps across two lines.");
  });

  test("groups bullets under their sub-heading", () => {
    const unreleased = entries[0];
    expect(unreleased?.sections.map((s) => s.heading)).toEqual(["Added", "Fixed"]);
    expect(unreleased?.sections[0]?.bullets).toHaveLength(2);
    expect(unreleased?.sections[1]?.bullets).toEqual(["Something that used to be broken."]);
  });

  test("prose outside a section is not mistaken for content", () => {
    expect(entries).toHaveLength(3);
  });

  test("finds the unreleased section and the newest released one", () => {
    expect(unreleasedEntry(entries)?.isUnreleased).toBe(true);
    expect(latestReleased(entries)?.version).toBe("1.2.0");
  });

  test("releasedBefore steps past a version that has already been cut", () => {
    // Once "## [1.2.0]" exists, the bump is measured 1.1.0 -> 1.2.0, not
    // 1.2.0 -> 1.2.0.
    expect(releasedBefore(entries, "1.2.0")?.version).toBe("1.1.0");
    expect(releasedBefore(entries, "1.1.0")).toBeNull();
  });

  test("an empty or headingless file yields nothing rather than throwing", () => {
    expect(parseChangelog("")).toEqual([]);
    expect(parseChangelog("# Changelog\n\njust prose\n")).toEqual([]);
  });
});

describe("flattenMarkdown", () => {
  test("removes what the notice dialog cannot render", () => {
    // src/lib/notices/markdown.ts interprets paragraphs and "- " bullets only;
    // anything else reaches the user as literal punctuation.
    expect(flattenMarkdown("a **bold** word")).toBe("a bold word");
    expect(flattenMarkdown("see `gemini.ts` now")).toBe("see gemini.ts now");
    expect(flattenMarkdown("read [the docs](https://example.com)")).toBe("read the docs");
  });

  test("replaces em dashes, which DESIGN.md forbids in UI strings", () => {
    // The CI guard only scans locale bundles, so a body pasted into the
    // database is out of its reach.
    expect(flattenMarkdown("before — after")).toBe("before - after");
  });

  test("collapses the whitespace a folded bullet leaves behind", () => {
    expect(flattenMarkdown("  spaced   out  ")).toBe("spaced out");
  });
});

describe("summarizeEntry", () => {
  const entries = parseChangelog(SAMPLE);

  test("prefers Added and Changed, and drops Fixed", () => {
    // A release notice answers "what can I do now"; a bug-fix list reads as a
    // list of things that were broken.
    const body = summarizeEntry(entries[1]!);
    expect(body).toBe("- The feature this release is named after.\n- A behaviour that moved.");
    expect(body).not.toContain("broken");
  });

  test("honours an explicit section list", () => {
    expect(summarizeEntry(entries[0]!, { sections: ["Fixed"] })).toBe(
      "- Something that used to be broken.",
    );
  });

  test("caps the bullet count", () => {
    expect(summarizeEntry(entries[0]!, { maxBullets: 1 }).split("\n")).toHaveLength(1);
  });

  test("falls back to every bullet rather than emitting an empty body", () => {
    // notices.body_ko is NOT NULL with a non-blank CHECK, so an empty summary
    // would only fail later, in the SQL editor.
    const body = summarizeEntry(entries[1]!, { sections: ["Nonexistent"] });
    expect(body).toContain("The feature this release is named after.");
  });
});

describe("the real CHANGELOG.md", () => {
  test("parses, and its newest released section is usable as a baseline", () => {
    // A fixture-only suite would pass while the actual file was unreadable.
    const md = readFileSync(join(__dirname, "..", "..", "..", "..", "CHANGELOG.md"), "utf8").replace(
      /\r\n/g,
      "\n",
    );
    const entries = parseChangelog(md);
    expect(entries.length).toBeGreaterThan(1);
    expect(entries[0]?.isUnreleased).toBe(true);

    const released = latestReleased(entries);
    expect(released?.version).toMatch(/^\d+\.\d+\.\d+$/);

    // The [Unreleased] section is where a release is drafted from before it is
    // cut, so it has to summarise to something non-empty.
    expect(summarizeEntry(unreleasedEntry(entries)!).length).toBeGreaterThan(0);
  });
});
