/**
 * Entitlements library — public entry point.
 *
 * Re-exports the pure tier model, prices, rewarded-credit constants, and the
 * deterministic helper functions from ./tiers. See ./tiers.ts for the
 * same-quality principle: tiers differ by counts / features / history only,
 * never by output quality, model, or effort.
 */
export * from './tiers';
