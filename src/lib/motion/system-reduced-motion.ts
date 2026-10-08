const QUERY = "(prefers-reduced-motion: reduce)";

function media(): MediaQueryList | null {
  try { return typeof matchMedia === "function" ? matchMedia(QUERY) : null; }
  catch { return null; }
}

export function getSystemReducedMotion(): boolean {
  return media()?.matches ?? false;
}

export function subscribeSystemReducedMotion(onChange: () => void): () => void {
  const query = media();
  if (!query) return () => undefined;
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }
  // Older embedded browsers expose the original MediaQueryList API.
  query.addListener?.(onChange);
  return () => query.removeListener?.(onChange);
}
