import {
  TIERS,
  TIER_PRICE_KRW,
  REWARD_PER_WATCH,
  REWARD_MONTHLY_CAP,
  remainingReasoning,
  canUseReasoning,
  lensAllowed,
  historyHorizonDays,
  canExport,
  canUseIntegrations,
  earnRewardCredits,
} from '../tiers';

describe('TIERS table', () => {
  it('encodes the launch strategy for free', () => {
    expect(TIERS.free).toEqual({
      reasoningPerMonth: 8,
      lenses: 3,
      historyDays: 30,
      exportEnabled: false,
      integrations: false,
      imagineProjects: 1,
    });
  });

  it('encodes the launch strategy for plus and pro', () => {
    expect(TIERS.plus).toEqual({
      reasoningPerMonth: 60,
      lenses: 'all',
      historyDays: null,
      exportEnabled: true,
      integrations: true,
      imagineProjects: null,
    });
    expect(TIERS.pro).toEqual({
      reasoningPerMonth: null,
      lenses: 'all',
      historyDays: null,
      exportEnabled: true,
      integrations: true,
      imagineProjects: null,
    });
  });
});

describe('TIER_PRICE_KRW', () => {
  it('maps each tier to its monthly KRW price', () => {
    expect(TIER_PRICE_KRW).toEqual({ free: 0, plus: 6900, pro: 11900 });
  });

  it('keeps free at zero', () => {
    expect(TIER_PRICE_KRW.free).toBe(0);
  });
});

describe('remainingReasoning', () => {
  it('free: cap 8 plus 2x2=4 earned, 0 used -> 12', () => {
    const earned = earnRewardCredits(0, 2); // 4
    expect(remainingReasoning('free', 0, earned)).toBe(12);
  });

  it('free: subtracts usage and never goes negative', () => {
    expect(remainingReasoning('free', 3)).toBe(5);
    expect(remainingReasoning('free', 99)).toBe(0);
  });

  it('plus: limit 60', () => {
    expect(remainingReasoning('plus', 0)).toBe(60);
    expect(remainingReasoning('plus', 10)).toBe(50);
  });

  it('pro: unlimited -> Infinity regardless of usage', () => {
    expect(remainingReasoning('pro', 0)).toBe(Infinity);
    expect(remainingReasoning('pro', 100000)).toBe(Infinity);
  });
});

describe('canUseReasoning', () => {
  it('free: true while remaining, false when exhausted', () => {
    expect(canUseReasoning('free', 7)).toBe(true);
    expect(canUseReasoning('free', 8)).toBe(false);
  });

  it('free: earned credits extend availability', () => {
    expect(canUseReasoning('free', 8, 4)).toBe(true);
  });

  it('pro: always true', () => {
    expect(canUseReasoning('pro', 999999)).toBe(true);
  });
});

describe('lensAllowed', () => {
  it('free: index 2 allowed, index 3 blocked (3 lenses)', () => {
    expect(lensAllowed('free', 2)).toBe(true);
    expect(lensAllowed('free', 3)).toBe(false);
  });

  it('plus/pro: all lenses allowed', () => {
    expect(lensAllowed('plus', 99)).toBe(true);
    expect(lensAllowed('pro', 99)).toBe(true);
  });
});

describe('historyHorizonDays', () => {
  it('free: 30 days', () => {
    expect(historyHorizonDays('free')).toBe(30);
  });

  it('plus/pro: unlimited (null)', () => {
    expect(historyHorizonDays('plus')).toBeNull();
    expect(historyHorizonDays('pro')).toBeNull();
  });
});

describe('canExport / canUseIntegrations', () => {
  it('free: both disabled', () => {
    expect(canExport('free')).toBe(false);
    expect(canUseIntegrations('free')).toBe(false);
  });

  it('plus and pro: both enabled', () => {
    expect(canExport('plus')).toBe(true);
    expect(canUseIntegrations('plus')).toBe(true);
    expect(canExport('pro')).toBe(true);
    expect(canUseIntegrations('pro')).toBe(true);
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
