/** Inspect the live handset position so Back also works before the next render. */
export function createPocketPhoneBackHandler({ isExpanded, lower, isCoachmarkVisible = () => false }: {
  isExpanded: () => boolean;
  lower: () => void;
  isCoachmarkVisible?: () => boolean;
}): () => boolean {
  return () => {
    if (isCoachmarkVisible() || !isExpanded()) return false;
    lower();
    return true;
  };
}
