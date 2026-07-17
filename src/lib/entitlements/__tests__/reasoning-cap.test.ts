import {
  reasoningCapForTier,
  remainingReasoning,
  pricingLabel,
} from '../reasoning-cap';
import { REASONING_PER_WEEK } from '../tier-map';
import { monthBucket, weekBucket } from '../usage';

describe('reasoningCapForTier (weekly, Phase 4)', () => {
  it('maps each tier to its weekly cap', () => {
    expect(reasoningCapForTier('free')).toBe(2);
    expect(reasoningCapForTier('soma')).toBe(7);
    expect(reasoningCapForTier('cortex')).toBe(7);
    expect(reasoningCapForTier('brain')).toBeNull();
  });

  it('is the tier-map table, not a second copy', () => {
    for (const tier of ['free', 'soma', 'cortex', 'brain'] as const) {
      expect(reasoningCapForTier(tier)).toBe(REASONING_PER_WEEK[tier]);
    }
  });
});

describe('remainingReasoning (weekly base + monthly credits)', () => {
  it('returns Infinity for the unlimited (brain) tier', () => {
    expect(remainingReasoning('brain', 1000)).toBe(Infinity);
    expect(remainingReasoning('brain', 0, 50)).toBe(Infinity);
  });

  it('free: weekly base of 2, credits stretch beyond the spent base', () => {
    expect(remainingReasoning('free', 0)).toBe(2);
    expect(remainingReasoning('free', 1, 2)).toBe(3);
    expect(remainingReasoning('free', 2, 2)).toBe(2); // base gone, credits carry on
  });

  it('defaults credits to 0 and floors at 0', () => {
    expect(remainingReasoning('free', 3)).toBe(0);
    expect(remainingReasoning('cortex', 10)).toBe(0);
    expect(remainingReasoning('cortex', 3)).toBe(4);
  });
});

describe('pricingLabel', () => {
  it('returns Korean labels', () => {
    expect(pricingLabel('free', 'ko')).toBe('별바라기');
    expect(pricingLabel('cortex', 'ko')).toBe('항해자');
    expect(pricingLabel('brain', 'ko')).toBe('북극성');
    expect(pricingLabel('soma', 'ko')).toBe('평생');
  });

  it('returns English labels', () => {
    expect(pricingLabel('free', 'en')).toBe('Stargazer');
    expect(pricingLabel('cortex', 'en')).toBe('Voyager');
    expect(pricingLabel('brain', 'en')).toBe('North Star');
    expect(pricingLabel('soma', 'en')).toBe('Lifetime');
  });
});

describe('monthBucket', () => {
  it('formats as YYYY-MM', () => {
    expect(monthBucket(new Date('2026-06-22T12:00:00Z'))).toMatch(/^\d{4}-\d{2}$/);
  });

  it('uses the KST wall-clock month', () => {
    // 2026-06-30 20:00 UTC = 2026-07-01 05:00 KST -> July bucket.
    expect(monthBucket(new Date('2026-06-30T20:00:00Z'))).toBe('2026-07');
    // 2026-06-22 12:00 UTC = 2026-06-22 21:00 KST -> June bucket.
    expect(monthBucket(new Date('2026-06-22T12:00:00Z'))).toBe('2026-06');
  });

  it('zero-pads single-digit months', () => {
    expect(monthBucket(new Date('2026-01-15T00:00:00Z'))).toBe('2026-01');
  });
});

describe('weekBucket (KST ISO-8601 week, must match SQL IYYY-"W"IW)', () => {
  it('formats as IYYY-Wnn', () => {
    expect(weekBucket(new Date('2026-07-17T00:00:00Z'))).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('uses the KST wall-clock day for the week boundary', () => {
    // 2026-07-19 is a Sunday. 14:59 UTC Sunday = 23:59 KST Sunday -> still that
    // week; 15:00 UTC = 00:00 KST Monday -> next ISO week.
    expect(weekBucket(new Date('2026-07-19T14:59:00Z'))).toBe('2026-W29');
    expect(weekBucket(new Date('2026-07-19T15:00:00Z'))).toBe('2026-W30');
  });

  it('assigns year-boundary days to the ISO week-year of their Thursday', () => {
    // 2027-01-01 is a Friday; its week's Thursday is 2026-12-31 -> ISO year 2026, W53.
    expect(weekBucket(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
    // 2026-01-01 is a Thursday -> ISO year 2026, W01.
    expect(weekBucket(new Date('2026-01-01T12:00:00Z'))).toBe('2026-W01');
    // 2023-01-01 was a Sunday; its Thursday was 2022-12-29 -> 2022-W52.
    expect(weekBucket(new Date('2023-01-01T00:00:00Z'))).toBe('2022-W52');
  });

  it('zero-pads single-digit weeks', () => {
    expect(weekBucket(new Date('2026-01-07T12:00:00Z'))).toBe('2026-W02');
  });
});
