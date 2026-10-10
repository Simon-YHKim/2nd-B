import { classifyInputAnyLocale } from '../../../src/lib/safety/classifier.ts';

/** Apply the app's deterministic red decision to each unescaped input string.
 * Call with the schema-projected payload, never the unselected source snapshot.
 * No lexicon copy, model classification, routing change or text transformation.
 * The current classifier covers EN/KO; UI locale must not narrow that gate. */
export function hasRedZoneInput(value: unknown): boolean {
  if (typeof value === 'string') return classifyInputAnyLocale(value, 'en').zone === 'red';
  if (Array.isArray(value)) return value.some(hasRedZoneInput);
  if (value && typeof value === 'object') return Object.values(value).some(hasRedZoneInput);
  return false;
}
