// The reference ImagineScreen's three divergent seeds (sb-more IMAGINE_SEEDS).
// KO is the design canon; every other language reads the home bundle under
// ds.imagine.seeds.<key>.* (Q-261005-01 = A, R2B-03). The English used to be an
// in-code mirror that es/pt/id fell back to, so /imagine painted English seeds
// under translated chrome. The en bundle values are that mirror byte for byte,
// and the ko bundle values mirror the canon (tr2-locale-copy.test.ts).
// Static demo content by design — no dynamic generation
// (src/lib/llm/imagine.ts stays dormant; "세컨비와 더" deep-links Divergent chat).
// Kept in a .ts module (not the .tsx view) so canon tests can import it without
// dragging JSX through jest's classic transform.
// KO copy sourced from the design canon (src/lib/canon → public/proto/data)
import { canonMore } from "@/lib/canon";

// Icon glyph ids stay a literal union in code (consumers key Records off it);
// the canon pack carries the same ids — pinned by imagine-seeds-canon.test.ts.
const IMAGINE_SEED_ICONS = ["expand", "cached", "hub"] as const;
export type ImagineSeedIcon = (typeof IMAGINE_SEED_ICONS)[number];

/** Bundle keys of the three seeds, index-aligned with canonMore.imagineSeeds. */
export const IMAGINE_SEED_KEYS = ["expand", "reverse", "connect"] as const;
export type ImagineSeedKey = (typeof IMAGINE_SEED_KEYS)[number];

/** Bundle keys of each seed's three next-steps, in order. */
export const IMAGINE_STEP_KEYS = ["step1", "step2", "step3"] as const;

export interface ImagineSeedCopy {
  angle: string;
  title: string;
  body: string;
  steps: string[];
}

export interface ImagineSeed {
  icon: ImagineSeedIcon;
  key: ImagineSeedKey;
  ko: ImagineSeedCopy;
}

export const IMAGINE_SEEDS: ImagineSeed[] = canonMore.imagineSeeds.map((seed, i) => ({
  icon: IMAGINE_SEED_ICONS[i],
  key: IMAGINE_SEED_KEYS[i],
  ko: { angle: seed.angle, title: seed.title, body: seed.body, steps: seed.steps },
}));

/**
 * The seed copy for the painted language: the canon on the Korean screen, the
 * home bundle (`t` bound to the "home" namespace) everywhere else.
 */
export function imagineSeedCopy(seed: ImagineSeed, ko: boolean, t: (key: string) => string): ImagineSeedCopy {
  if (ko) return seed.ko;
  const at = (field: string) => t(`ds.imagine.seeds.${seed.key}.${field}`);
  return {
    angle: at("angle"),
    title: at("title"),
    body: at("body"),
    steps: IMAGINE_STEP_KEYS.map((step) => at(step)),
  };
}
