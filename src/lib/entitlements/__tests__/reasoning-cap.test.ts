import {
  reasoningCapForTier,
  remainingReasoning,
  pricingLabel,
} from '../reasoning-cap';
import { monthBucket } from '../usage';

describe('reasoningCapForTier', () => {
  it('maps each tier to its monthly cap', () => {
    expect(reasoningCapForTier('free')).toBe(30);
    expect(reasoningCapForTier('soma')).toBe(60);
    expect(reasoningCapForTier('cortex')).toBe(60);
    expect(reasoningCapForTier('brain')).toBeNull();
  });
});

describe('remainingReasoning', () => {
  it('returns Infinity for the unlimited (brain) tier', () => {
    expect(remainingReasoning('brain', 1000)).toBe(Infinity);
    expect(remainingReasoning('brain', 0, 50)).toBe(Infinity);
  });

  it('adds reward credits to the cap before subtracting usage', () => {
    // free cap 30 + 2 credits - 5 used = 27
    expect(remainingReasoning('free', 5, 2)).toBe(27);
  });

  it('defaults reward credits to 0', () => {
    expect(remainingReasoning('free', 3)).toBe(27);
    expect(remainingReasoning('cortex', 10)).toBe(50);
  });

  it('floors at 0 and never goes negative', () => {
    expect(remainingReasoning('free', 40)).toBe(0);
    expect(remainingReasoning('free', 40, 2)).toBe(0);
    expect(remainingReasoning('cortex', 100)).toBe(0);
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
