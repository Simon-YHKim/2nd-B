import { TIER_PRICING } from '../../progression/pricing';
import {
  TIERS,
  TIER_PRICE_KRW,
  REWARD_PER_WATCH,
  REWARD_MONTHLY_CAP,
  remainingReasoning,
  canUseReasoning,
  personaAllowed,
  earnRewardCredits,
} from '../tiers';
import { DB_TIER_BY_PUBLIC, PUBLIC_TIER_BY_DB, REASONING_PER_WEEK } from '../tier-map';

describe('TIERS table (Phase 4 boundary, Simon 확정 2026-07-17)', () => {
  it('encodes the free tier: 주 2회 reasoning, no paid personas', () => {
    expect(TIERS.free).toEqual({
      reasoningPerWeek: 2,
      metabPersona: false,
      twibPersona: false,
    });
  });

  it('encodes plus (메타비, 주 7회) and pro (메타비+트위비, unlimited)', () => {
    expect(TIERS.plus).toEqual({
      reasoningPerWeek: 7,
      metabPersona: true,
      twibPersona: false,
    });
    expect(TIERS.pro).toEqual({
      reasoningPerWeek: null,
      metabPersona: true,
      twibPersona: true,
    });
  });

  it('carries NO lens/history/export/integration gates — those are free for everyone', () => {
    // Phase 4 removed the gates outright; a resurfaced field here means a
    // paywall crept back onto a surface Simon declared free-open.
    for (const limits of Object.values(TIERS)) {
      const keys = Object.keys(limits);
      expect(keys).not.toContain('lenses');
      expect(keys).not.toContain('historyDays');
      expect(keys).not.toContain('exportEnabled');
      expect(keys).not.toContain('integrations');
      expect(keys).not.toContain('imagineProjects');
    }
  });
});

describe('tier-map (등급명 단일화)', () => {
  it('maps public tiers to DB tiers and back', () => {
    expect(DB_TIER_BY_PUBLIC).toEqual({ free: 'free', plus: 'cortex', pro: 'brain' });
    expect(PUBLIC_TIER_BY_DB).toEqual({ free: 'free', soma: 'plus', cortex: 'plus', brain: 'pro' });
  });

  it('holds the single weekly reasoning cap table', () => {
    expect(REASONING_PER_WEEK).toEqual({ free: 2, soma: 7, cortex: 7, brain: null });
  });

  it('TIERS reasoning values derive from the single table', () => {
    expect(TIERS.free.reasoningPerWeek).toBe(REASONING_PER_WEEK.free);
    expect(TIERS.plus.reasoningPerWeek).toBe(REASONING_PER_WEEK.cortex);
    expect(TIERS.pro.reasoningPerWeek).toBe(REASONING_PER_WEEK.brain);
  });
});

describe('TIER_PRICE_KRW', () => {
  it('derives monthly KRW from the pricing SoT via tier-map (plus=cortex, pro=brain)', () => {
    expect(TIER_PRICE_KRW).toEqual({
      free: 0,
      plus: TIER_PRICING.cortex.krwMonthly,
      pro: TIER_PRICING.brain.krwMonthly,
    });
  });

  it('matches the launch sticker prices', () => {
    expect(TIER_PRICE_KRW.free).toBe(0);
    expect(TIER_PRICE_KRW.plus).toBe(9_900);
    expect(TIER_PRICE_KRW.pro).toBe(19_900);
  });
});

describe('remainingReasoning / canUseReasoning (weekly)', () => {
  it('unlimited pro is never gated', () => {
    expect(remainingReasoning('pro', 0)).toBe(Infinity);
    expect(remainingReasoning('pro', 100000)).toBe(Infinity);
    expect(canUseReasoning('pro', 999999)).toBe(true);
  });

  it('free: base 2/week, then credits stretch the allowance', () => {
    expect(remainingReasoning('free', 0)).toBe(2);
    expect(remainingReasoning('free', 1)).toBe(1);
    expect(remainingReasoning('free', 2)).toBe(0);
    expect(remainingReasoning('free', 2, 3)).toBe(3); // base spent, credits remain
    expect(canUseReasoning('free', 2)).toBe(false);
    expect(canUseReasoning('free', 2, 1)).toBe(true);
  });

  it('plus: base 7/week', () => {
    expect(remainingReasoning('plus', 0)).toBe(7);
    expect(remainingReasoning('plus', 5)).toBe(2);
  });

  it('never goes negative', () => {
    expect(remainingReasoning('free', 99)).toBe(0);
    expect(remainingReasoning('plus', 99)).toBe(0);
  });
});

describe('personaAllowed', () => {
  it('메타비 unlocks at plus, 트위비 at pro (2nd-B is free for everyone)', () => {
    expect(personaAllowed('free', 'metab')).toBe(false);
    expect(personaAllowed('free', 'twib')).toBe(false);
    expect(personaAllowed('plus', 'metab')).toBe(true);
    expect(personaAllowed('plus', 'twib')).toBe(false);
    expect(personaAllowed('pro', 'metab')).toBe(true);
    expect(personaAllowed('pro', 'twib')).toBe(true);
  });
});

describe('earnRewardCredits', () => {
  it('grants REWARD_PER_WATCH per watch', () => {
    expect(earnRewardCredits(0, 1)).toBe(REWARD_PER_WATCH);
    expect(earnRewardCredits(0, 2)).toBe(4);
  });

  it('respects the monthly cap (watch 15x -> capped at 20)', () => {
    expect(earnRewardCredits(0, 15)).toBe(REWARD_MONTHLY_CAP);
    expect(REWARD_MONTHLY_CAP).toBe(20);
  });

  it('caps when accumulating onto an existing balance', () => {
    expect(earnRewardCredits(18, 3)).toBe(REWARD_MONTHLY_CAP);
  });
});
