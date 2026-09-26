// GitHub Pages does not support per-project response headers, so the exported
// Expo document's <meta http-equiv> policy is the production enforcement point.
// Keep vercel.json byte-for-byte aligned through html-security-policy.test.ts;
// its response headers are defence in depth only and do not protect Pages.

export const EXPO_ROUTER_HYDRATE_SCRIPT =
  "globalThis.__EXPO_ROUTER_HYDRATE__=true;";
export const EXPO_ROUTER_HYDRATE_SHA256_BASE64 =
  "67fhrP0+BkBqmgGGXTtgiVO/9EQs3QruYNU/7fnRkI8=";
export const EXPO_ROUTER_HYDRATE_CSP_SOURCE =
  `'sha256-${EXPO_ROUTER_HYDRATE_SHA256_BASE64}'`;

type Directive = readonly [name: string, ...sources: string[]];

// Origins here must correspond to a browser request made by production code.
// In particular, do not replace the fixed Supabase project with a wildcard.
// `style-src 'unsafe-inline'` is currently required by React Native Web's SSR
// output (style tags and attributes); script execution remains hash/host-bound.
export const WEB_CSP_DIRECTIVES: readonly Directive[] = [
  ["default-src", "'none'"],
  [
    "script-src",
    "'self'",
    EXPO_ROUTER_HYDRATE_CSP_SOURCE,
    "https://accounts.google.com/gsi/client",
    "https://www.googletagmanager.com",
    "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
    "https://googleads.g.doubleclick.net",
    "https://securepubads.g.doubleclick.net",
    "https://cdn.paddle.com/paddle/v2/paddle.js",
  ],
  ["script-src-attr", "'none'"],
  [
    "style-src",
    "'self'",
    "'unsafe-inline'",
    "https://accounts.google.com/gsi/style",
  ],
  [
    "img-src",
    "'self'",
    "data:",
    "blob:",
    "https://books.google.com",
    "https://commons.wikimedia.org",
    "https://upload.wikimedia.org",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://pagead2.googlesyndication.com",
    "https://googleads.g.doubleclick.net",
    "https://securepubads.g.doubleclick.net",
    "https://cdn.paddle.com",
    "https://vendors.paddle.com",
  ],
  ["font-src", "'self'", "data:"],
  [
    "connect-src",
    "'self'",
    "blob:",
    "https://zoacryukmdeivmolvyhj.supabase.co",
    "wss://zoacryukmdeivmolvyhj.supabase.co",
    "https://accounts.google.com/gsi/",
    "https://www.googleapis.com",
    "https://tasks.googleapis.com",
    "https://api.pwnedpasswords.com",
    "https://api.github.com",
    "https://oapi.koreaexim.go.kr",
    "https://apis.data.go.kr",
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
    "https://analytics.google.com",
    "https://pagead2.googlesyndication.com",
    "https://googleads.g.doubleclick.net",
    "https://securepubads.g.doubleclick.net",
    "https://www.google.com",
    "https://services.google.com",
    "https://api.paddle.com",
    "https://buy.paddle.com",
    "https://create-checkout.paddle.com",
    "https://vendors.paddle.com",
  ],
  [
    "frame-src",
    "'self'",
    "https://accounts.google.com/gsi/",
    "https://buy.paddle.com",
    "https://pagead2.googlesyndication.com",
    "https://googleads.g.doubleclick.net",
    "https://securepubads.g.doubleclick.net",
    "https://www.google.com",
  ],
  ["media-src", "'self'", "data:", "blob:"],
  ["worker-src", "'self'", "blob:"],
  ["manifest-src", "'self'"],
  ["object-src", "'none'"],
  ["base-uri", "'none'"],
  ["form-action", "'self'"],
];

export function serializeCsp(directives: readonly Directive[]): string {
  return directives.map((directive) => directive.join(" ")).join("; ");
}

// `frame-ancestors` is intentionally absent: browsers ignore it in a meta CSP.
export const GITHUB_PAGES_CSP = serializeCsp(WEB_CSP_DIRECTIVES);

export interface WebDocumentCspConfig {
  paddleEnvironment?: string;
  supabaseUrl?: string;
  paddleClientToken?: string;
}

const PRODUCTION_SUPABASE_ORIGIN = "https://zoacryukmdeivmolvyhj.supabase.co";
const BILLING_SOURCES = new Set([
  PRODUCTION_SUPABASE_ORIGIN, "wss://zoacryukmdeivmolvyhj.supabase.co",
  "https://cdn.paddle.com/paddle/v2/paddle.js", "https://cdn.paddle.com",
  "https://api.paddle.com", "https://buy.paddle.com",
  "https://create-checkout.paddle.com", "https://vendors.paddle.com",
]);

function sandboxOrigin(config: WebDocumentCspConfig): string | null {
  if (config.paddleEnvironment !== "sandbox" || !/^test_[a-zA-Z0-9]{27}$/.test(config.paddleClientToken ?? "")) return null;
  try {
    const url = new URL(config.supabaseUrl ?? "");
    if (url.protocol !== "https:" || !/^[a-z0-9]{1,63}\.supabase\.co$/.test(url.hostname) ||
      url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash ||
      url.origin === PRODUCTION_SUPABASE_ORIGIN ||
      (config.supabaseUrl !== url.origin && config.supabaseUrl !== `${url.origin}/`)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function configuredDirectives(config: WebDocumentCspConfig): readonly Directive[] {
  // Production constants and the Vercel header remain the reviewed baseline.
  // A request query can never select a CSP environment: +html passes build vars.
  if (config.paddleEnvironment === undefined || config.paddleEnvironment === "production") return WEB_CSP_DIRECTIVES;
  const origin = sandboxOrigin(config);
  return WEB_CSP_DIRECTIVES.map(([name, ...sources]): Directive => {
    const allowed = sources.filter((source) => !BILLING_SOURCES.has(source));
    // Invalid/partial sandbox configuration authorizes neither DB nor billing
    // environment. In particular, it must not silently regain production access.
    if (!origin) return [name, ...allowed];
    // Exact sandbox endpoints verified in the official CDN's environment map:
    // https://cdn.paddle.com/paddle/v2/paddle.js (2026-09-25).
    const extra: Record<string, string[]> = {
      "script-src": ["https://cdn.paddle.com/paddle/v2/paddle.js"],
      "style-src": ["https://sandbox-cdn.paddle.com/paddle/v2/assets/css/paddle.css"],
      "img-src": ["https://sandbox-cdn.paddle.com/paddle/v2/assets/images/"],
      "connect-src": [origin, origin.replace("https:", "wss:"),
        "https://sandbox-api.paddle.com", "https://sandbox-buy.paddle.com",
        "https://sandbox-create-checkout.paddle.com"],
      "frame-src": ["https://sandbox-buy.paddle.com", "https://sandbox-cdn.paddle.com/paddle/v2/error.html"],
    };
    return [name, ...allowed, ...(extra[name] ?? [])];
  });
}

/** Metro evaluates hot-update modules only in development. Never export this policy. */
export function webDocumentCsp(development: boolean, config: WebDocumentCspConfig = {}): string {
  const directives = configuredDirectives(config);
  return serializeCsp(directives.map((directive): Directive =>
    development && directive[0] === "script-src" ? [...directive, "'unsafe-eval'"] : directive,
  ));
}

// Vercel is not the production host, but a real response header can enforce the
// framing control that HTML meta cannot express.
export const VERCEL_CSP = `${GITHUB_PAGES_CSP}; frame-ancestors 'none'`;

export const WEB_REFERRER_POLICY = "strict-origin-when-cross-origin";
