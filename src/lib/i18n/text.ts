import enSecondb from "../../../locales/en/secondb.json";
import koSecondb from "../../../locales/ko/secondb.json";
import type { SystemLocale } from "@/lib/i18n/locales";

type TextNamespace = "secondb";

const bundles = {
  en: { secondb: enSecondb },
  ko: { secondb: koSecondb },
} as const;

function resolveKey(bundle: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((value, part) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[part];
  }, bundle);
}

export function tLocale(locale: SystemLocale, namespace: TextNamespace, key: string): string {
  const value = resolveKey(bundles[locale][namespace], key);
  return typeof value === "string" ? value : "";
}

export function tLocaleArray(locale: SystemLocale, namespace: TextNamespace, key: string): readonly string[] {
  const value = resolveKey(bundles[locale][namespace], key);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
