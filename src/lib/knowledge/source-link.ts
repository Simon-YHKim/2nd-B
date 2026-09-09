const HTTPS_URL_MAX = 2048;
const DOI_MAX = 255;

const FORBIDDEN_URL_CHAR = /[\u0000-\u0020\u007f-\u009f\\]/u;
const ENCODED_CONTROL_OR_BACKSLASH = /%(?:0[0-9a-f]|1[0-9a-f]|5c|7f|8[0-9a-f]|9[0-9a-f])/iu;
const DNS_AUTHORITY = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*$/u;
const DOI_TOKEN = /^10\.[0-9]{4,9}\/[-._;()/:A-Za-z0-9]+$/u;
const DOI_AMBIGUOUS_PATH = /(?:^|\/)\.{1,2}(?:\/|$)/u;

export interface KnowledgeSourceTarget {
  doi?: unknown;
  url?: unknown;
}

export interface SafeKnowledgeSourceLink {
  href: string;
  label: string;
}

function rawAuthority(value: string): string {
  const afterScheme = value.slice("https://".length);
  const boundary = afterScheme.search(/[/?#]/u);
  return boundary === -1 ? afterScheme : afterScheme.slice(0, boundary);
}

/**
 * Accept only an explicit, unambiguous HTTPS URL.
 *
 * This is intentionally stricter than URL(): URL() silently trims controls,
 * accepts `https:host`, rewrites backslashes, and canonicalizes Unicode hosts.
 * Stored links are untrusted, so those browser-dependent forms fail closed.
 */
export function safeHttpsHref(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > HTTPS_URL_MAX) return null;
  if (value !== value.trim() || !/^[Hh][Tt][Tt][Pp][Ss]:\/\//u.test(value)) return null;
  if (FORBIDDEN_URL_CHAR.test(value) || ENCODED_CONTROL_OR_BACKSLASH.test(value)) return null;

  const authority = rawAuthority(value);
  // Source links do not need credentials, custom ports, Unicode host aliases,
  // or percent-encoded authority bytes. Keeping a DNS-shaped authority avoids
  // display/parse disagreement while still covering every curated seed host.
  if (!DNS_AUTHORITY.test(authority)) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== "" ||
    parsed.hostname === "" ||
    parsed.hostname.endsWith(".") ||
    parsed.href.length > HTTPS_URL_MAX
  ) {
    return null;
  }

  return parsed.href;
}

function safeDoiToken(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 7 || value.length > DOI_MAX) return null;
  if (
    value !== value.trim() ||
    !DOI_TOKEN.test(value) ||
    value.includes("//") ||
    DOI_AMBIGUOUS_PATH.test(value)
  ) {
    return null;
  }
  return value;
}

/** Resolve a raw DOI identifier through the fixed HTTPS doi.org origin. */
export function safeDoiHref(value: unknown): string | null {
  const doi = safeDoiToken(value);
  return doi ? `https://doi.org/${doi}` : null;
}

/**
 * Resolve the only target that research.tsx may render or open.
 * If either populated DB field is malformed, reject the whole row rather than
 * falling back to another field and concealing poisoned stored data.
 */
export function resolveKnowledgeSourceLink(source: KnowledgeSourceTarget): SafeKnowledgeSourceLink | null {
  const hasDoi = source.doi !== null && source.doi !== undefined;
  const hasUrl = source.url !== null && source.url !== undefined;
  const doi = hasDoi ? safeDoiToken(source.doi) : null;
  const url = hasUrl ? safeHttpsHref(source.url) : null;

  if ((hasDoi && !doi) || (hasUrl && !url)) return null;
  if (doi) return { href: `https://doi.org/${doi}`, label: `doi.org/${doi}` };
  if (url) return { href: url, label: url };
  return null;
}
