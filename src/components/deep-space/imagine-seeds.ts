// The reference ImagineScreen's three divergent seeds (sb-more IMAGINE_SEEDS),
// KO canonical / EN mirrored; other locales fall back to EN like the
// 460-ternary surfaces. Static demo content by design — no dynamic generation
// (src/lib/llm/imagine.ts stays dormant; "세컨비와 더" deep-links Divergent chat).
// Kept in a .ts module (not the .tsx view) so canon tests can import it without
// dragging JSX through jest's classic transform.
// KO copy sourced from the design canon (src/lib/canon → public/proto/data)
import { canonMore } from "@/lib/canon";

// Icon glyph ids stay a literal union in code (consumers key Records off it);
// the canon pack carries the same ids — pinned by imagine-seeds-canon.test.ts.
const IMAGINE_SEED_ICONS = ["expand", "cached", "hub"] as const;
export type ImagineSeedIcon = (typeof IMAGINE_SEED_ICONS)[number];

interface ImagineSeedCopy {
  angle: string;
  title: string;
  body: string;
  steps: string[];
}

export interface ImagineSeed {
  icon: ImagineSeedIcon;
  ko: ImagineSeedCopy;
  en: ImagineSeedCopy;
}

// EN mirror stays in code, keyed by index against canonMore.imagineSeeds.
const EN_MIRROR: ImagineSeedCopy[] = [
  {
    angle: "Expand",
    title: "If you took a year off",
    body: "Erase money, work, and ties for a moment - what would you do first?",
    steps: ["Write 3 things you want to do", "Taste one with a single hour this month", "Picture who joins you on the relations star"],
  },
  {
    angle: "Reverse",
    title: "If you lived the exact opposite",
    body: "Improvise instead of plan, together instead of alone. What pulls you from the far side?",
    steps: ["Try one thing you never do this week", "Note what felt awkward with SecondB", "Capture it to the rest star and watch the pattern"],
  },
  {
    angle: "Connect",
    title: "Career × rest, combined",
    body: "Force the two stars together - what odd idea falls out?",
    steps: ["Write a one-line project from the two keywords", "Prototype it in two weekend hours", "Log it on the growth star as an experiment"],
  },
];

export const IMAGINE_SEEDS: ImagineSeed[] = canonMore.imagineSeeds.map((seed, i) => ({
  icon: IMAGINE_SEED_ICONS[i],
  ko: { angle: seed.angle, title: seed.title, body: seed.body, steps: seed.steps },
  en: EN_MIRROR[i],
}));
