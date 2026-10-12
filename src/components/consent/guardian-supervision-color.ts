/** Color token name only: the notice never changes registration eligibility. */
export function guardianSupervisionColor(
  emphasized = false,
): "onSurface" | "onSurfaceVariant" {
  return emphasized ? "onSurface" : "onSurfaceVariant";
}
