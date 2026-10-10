/** Inspect the live handset position so Back also works before the next render. */
export function createPocketPhoneBackHandler({ isExpanded, lower }: {
  isExpanded: () => boolean;
  lower: () => void;
}): () => boolean {
  return () => {
    if (!isExpanded()) return false;
    lower();
    return true;
  };
}
