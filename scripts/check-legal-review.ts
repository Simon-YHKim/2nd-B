// Counsel-review cadence guard. The Analysis Lexicon
// (src/lib/safety/lexicon.ts) carries LEXICON_LAST_LEGAL_REVIEW — the
// ISO-8601 date external counsel last signed off on the vocabulary lists.
//
// This check WARNS (it never fails the build) when that date is unset
// (null), unparseable, or older than the review cadence, so a stale lexicon
// surfaces in CI output without blocking shipping. Legal review is a process
// signal, not a code defect, so the guard is intentionally non-blocking and
// always exits 0.

import { LEXICON_LAST_LEGAL_REVIEW, LEXICON_VERSION } from "../src/lib/safety/lexicon";

const REVIEW_CADENCE_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function warn(message: string): void {
  console.warn(`WARN  legal-review: ${message}`);
}

if (LEXICON_LAST_LEGAL_REVIEW === null) {
  warn(
    `LEXICON_LAST_LEGAL_REVIEW is null (lexicon v${LEXICON_VERSION}). ` +
      `No external counsel sign-off is recorded for the Analysis Lexicon. ` +
      `Set the ISO-8601 review date in src/lib/safety/lexicon.ts once reviewed. ` +
      `(non-blocking)`,
  );
} else {
  const reviewed = new Date(LEXICON_LAST_LEGAL_REVIEW);
  if (Number.isNaN(reviewed.getTime())) {
    warn(
      `LEXICON_LAST_LEGAL_REVIEW ("${LEXICON_LAST_LEGAL_REVIEW}") is not a valid ` +
        `ISO-8601 date. Expected e.g. "2026-01-31". (non-blocking)`,
    );
  } else {
    const ageDays = Math.floor((Date.now() - reviewed.getTime()) / MS_PER_DAY);
    if (ageDays > REVIEW_CADENCE_DAYS) {
      warn(
        `Analysis Lexicon legal review is ${ageDays} days old ` +
          `(cadence ${REVIEW_CADENCE_DAYS}d, last reviewed ${LEXICON_LAST_LEGAL_REVIEW}, ` +
          `v${LEXICON_VERSION}). Schedule a counsel re-review. (non-blocking)`,
      );
    } else {
      console.log(
        `legal-review PASS  lexicon v${LEXICON_VERSION} reviewed ${LEXICON_LAST_LEGAL_REVIEW} ` +
          `(${ageDays}d ago, within ${REVIEW_CADENCE_DAYS}d cadence)`,
      );
    }
  }
}

// Always succeed: this is a warning-only guard, never a build blocker.
process.exit(0);
