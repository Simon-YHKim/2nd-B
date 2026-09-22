import { RESIDENCE_COUNTRY_CODES } from "./residence-jurisdiction";

// Intl.DisplayNames is available in current web/native runtimes, but the
// fallback keeps the selector readable on an older embedded engine too.
const ENGLISH_REGION_NAMES: Readonly<Record<string, string>> = Object.freeze({
  AE: "United Arab Emirates",
  AR: "Argentina",
  AT: "Austria",
  AU: "Australia",
  BE: "Belgium",
  BG: "Bulgaria",
  BR: "Brazil",
  CA: "Canada",
  CH: "Switzerland",
  CL: "Chile",
  CN: "China",
  CO: "Colombia",
  CY: "Cyprus",
  CZ: "Czechia",
  DE: "Germany",
  DK: "Denmark",
  EE: "Estonia",
  EG: "Egypt",
  ES: "Spain",
  FI: "Finland",
  FR: "France",
  GB: "United Kingdom",
  GR: "Greece",
  HK: "Hong Kong",
  HR: "Croatia",
  HU: "Hungary",
  ID: "Indonesia",
  IE: "Ireland",
  IL: "Israel",
  IN: "India",
  IS: "Iceland",
  IT: "Italy",
  JP: "Japan",
  KR: "South Korea",
  LI: "Liechtenstein",
  LT: "Lithuania",
  LU: "Luxembourg",
  LV: "Latvia",
  MT: "Malta",
  MX: "Mexico",
  MY: "Malaysia",
  NG: "Nigeria",
  NL: "Netherlands",
  NO: "Norway",
  NZ: "New Zealand",
  PE: "Peru",
  PH: "Philippines",
  PL: "Poland",
  PT: "Portugal",
  RO: "Romania",
  RU: "Russia",
  SA: "Saudi Arabia",
  SE: "Sweden",
  SG: "Singapore",
  SI: "Slovenia",
  SK: "Slovakia",
  TH: "Thailand",
  TR: "Türkiye",
  TW: "Taiwan",
  UA: "Ukraine",
  US: "United States",
  VN: "Vietnam",
  ZA: "South Africa",
});

interface RegionDisplayNames {
  of(code: string): string | undefined;
}

type RegionDisplayNamesConstructor = new (
  locales: string | readonly string[],
  options: { type: "region" },
) => RegionDisplayNames;

export interface ResidenceCountryOption {
  code: string;
  label: string;
}

export function residenceCountryName(code: string, locale: string): string {
  try {
    const DisplayNames = (Intl as unknown as { DisplayNames?: RegionDisplayNamesConstructor })
      .DisplayNames;
    const localized = DisplayNames
      ? new DisplayNames(locale || "en", { type: "region" }).of(code)
      : undefined;
    if (localized && localized !== code) return localized;
  } catch {
    // Unsupported/invalid locale: the complete English map below is the safe UI fallback.
  }
  return ENGLISH_REGION_NAMES[code] ?? code;
}

export function residenceCountryOptions(locale: string): ResidenceCountryOption[] {
  return RESIDENCE_COUNTRY_CODES.map((code) => ({
    code,
    label: residenceCountryName(code, locale),
  })).sort((a, b) => a.label.localeCompare(b.label, locale || "en"));
}
