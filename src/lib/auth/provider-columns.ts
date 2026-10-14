// Z122 (Simon 2026-10-14, Q-261014-01): the social sign-in buttons sit one per line only on very
// narrow screens. From this viewport width they stay in two columns, as before.
export const PROVIDER_ONE_COLUMN_BELOW = 354;

export function providerColumns(viewportWidth: number): 1 | 2 {
  return viewportWidth < PROVIDER_ONE_COLUMN_BELOW ? 1 : 2;
}
