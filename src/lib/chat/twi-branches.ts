// 트위비 3-branch (rev2 P5f): parse the Divergent-mode reply's trailing
// next-step candidates. The mode instruction asks 트위비 to END with up to
// three short candidates, each on its own line starting with "→ ". This
// parser lifts them out of the display text so the UI can render them as
// tappable chips (prefill the composer / hand off to 담기). Pure + tested;
// a reply with no branch lines passes through untouched (never breaks chat).

export interface TwiBranchParse {
  /** Reply text with the trailing branch lines removed (trimmed). */
  display: string;
  /** Up to three branch candidates, in reply order. */
  branches: string[];
}

const BRANCH_PREFIX = /^→\s+/;
const MAX_BRANCHES = 3;

export function parseTwiBranches(text: string): TwiBranchParse {
  const lines = text.split("\n");

  // Walk up from the bottom collecting EVERY consecutive branch line (blank lines
  // between them are tolerated). Anything above the run stays display text. The cap
  // is applied after collection, not inside the loop: if 트위비 emits 4+ candidates
  // (violating the "up to three" instruction), stopping the walk at three would leave
  // the topmost arrow line stranded in `display` as raw text and keep the LAST three
  // instead of the first. Collect all so `cut` clears them all, then slice.
  const branchesReversed: string[] = [];
  let cut = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.length === 0) {
      cut = i;
      continue;
    }
    if (BRANCH_PREFIX.test(line)) {
      branchesReversed.push(line.replace(BRANCH_PREFIX, "").trim());
      cut = i;
      continue;
    }
    break;
  }

  if (branchesReversed.length === 0) {
    return { display: text.trim(), branches: [] };
  }
  return {
    display: lines.slice(0, cut).join("\n").trim(),
    branches: branchesReversed
      .reverse()
      .filter((b) => b.length > 0)
      .slice(0, MAX_BRANCHES),
  };
}
