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

// Vercel is not the production host, but a real response header can enforce the
// framing control that HTML meta cannot express.
export const VERCEL_CSP = `${GITHUB_PAGES_CSP}; frame-ancestors 'none'`;

export const WEB_REFERRER_POLICY = "strict-origin-when-cross-origin";
