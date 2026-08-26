function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function previewEnvLines(previewEnv) {
  const env = { ...previewEnv };
  if (typeof env.EXPO_PUBLIC_UI !== 'string') env.EXPO_PUBLIC_UI = 'deep-space';
  if (typeof env.EXPO_PUBLIC_ALLOW_DEV_TIER !== 'string') {
    env.EXPO_PUBLIC_ALLOW_DEV_TIER = 'true';
  }

  return Object.entries(env)
    .filter(([key, value]) => key.startsWith('EXPO_PUBLIC_') && typeof value === 'string')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`);
}

export function resolvePlaywright(load, env) {
  const candidates = env.PW_PATH
    ? [env.PW_PATH, 'playwright', 'playwright-core']
    : ['playwright', 'playwright-core'];
  for (const candidate of candidates) {
    try {
      const loaded = load(candidate);
      if (loaded?.chromium || loaded?.default?.chromium) return loaded;
    } catch {
      // Try the next local module name. Loader details may contain machine paths.
    }
  }
  throw new Error(
    'Playwright unavailable: set PW_PATH or install a local playwright/playwright-core module',
  );
}

export function browserLaunchOptions(env) {
  return env.BROWSER_PATH ? { executablePath: env.BROWSER_PATH } : {};
}

const SAFE_CAPTURE_FAILURE_CODES = new Set([
  'asset-404',
  'page-error',
  'unexpected-final-route',
  'unexpected-final-origin',
  'page-not-settled',
  'capture-failed',
]);

const SAFE_CAPTURE_FAILURE_MESSAGES = {
  'unexpected-final-route': 'unexpected final route',
  'unexpected-final-origin': 'unexpected final origin',
  'page-not-settled': 'page did not settle',
};

export class CaptureContractError extends Error {
  constructor(codes) {
    const requested = Array.isArray(codes) ? codes : [codes];
    const safeCodes = requested.filter((code) => SAFE_CAPTURE_FAILURE_CODES.has(code));
    const normalized = safeCodes.length ? safeCodes : ['capture-failed'];
    super(SAFE_CAPTURE_FAILURE_MESSAGES[normalized[0]] ?? normalized[0]);
    this.name = 'CaptureContractError';
    this.codes = normalized;
  }
}

export function captureFailureCodes(error) {
  const candidates = Array.isArray(error?.codes) ? error.codes : [error?.code];
  const safeCodes = candidates.filter((code) => SAFE_CAPTURE_FAILURE_CODES.has(code));
  return safeCodes.length ? [...new Set(safeCodes)] : ['capture-failed'];
}

export function makeCaptureInitScript(fixedTime) {
  if (!Number.isFinite(fixedTime)) throw new Error('FIXED_ISO must be a valid date');
  return `(function () {
  var FIXED = ${fixedTime};
  var RealDate = Date;
  var FakeDate = function (a, b, c, d, e, f, g) {
    if (!(this instanceof FakeDate)) return new RealDate(FIXED).toString();
    switch (arguments.length) {
      case 0: return new RealDate(FIXED);
      case 1: return new RealDate(a);
      default: return new RealDate(a, b, c, d || 0, e || 0, f || 0, g || 0);
    }
  };
  FakeDate.now = function () { return FIXED; };
  FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
  FakeDate.prototype = RealDate.prototype;
  window.Date = FakeDate;
  var seed = 42;
  Math.random = function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  try {
    var fixedIso = new RealDate(FIXED).toISOString();
    sessionStorage.setItem('secondB_intro_played_v1', '1');
    localStorage.setItem('onboarding.cosmicPixel.v2.completedAt', fixedIso);
    localStorage.setItem('onboarding.coachmarks.home.v1.seenAt', fixedIso);
  } catch (e) {}
  var freezeMotion = function () {
    if (document.querySelector('style[data-capture-motion-freeze]')) return;
    var style = document.createElement('style');
    style.setAttribute('data-capture-motion-freeze', '');
    style.textContent = '*, *::before, *::after { animation-play-state: paused !important; transition: none !important; }';
    (document.head || document.documentElement).appendChild(style);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', freezeMotion);
  else freezeMotion();
})();`;
}

function normalizedPath(pathname) {
  if (pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

export function validateFinalUrl(baseUrl, route, finalUrl) {
  const base = new URL(baseUrl);
  const actual = new URL(finalUrl);
  if (actual.origin !== base.origin) throw new CaptureContractError('unexpected-final-origin');

  const routeUrl = new URL(String(route), 'http://route.invalid');
  const suffix = routeUrl.pathname === '/' ? '/' : `/${routeUrl.pathname.replace(/^\/+/, '')}`;
  const expectedPath = normalizedPath(`/2nd-B${suffix}`);
  if (normalizedPath(actual.pathname) !== expectedPath) {
    throw new CaptureContractError('unexpected-final-route');
  }
}

export function shotFailureCodes({ baseUrl, responses, pageErrorCount }) {
  const base = new URL(baseUrl);
  const asset404 = responses.some((response) => {
    if (response.status !== 404) return false;
    try {
      const url = new URL(response.url);
      return url.origin === base.origin
        && (url.pathname === '/2nd-B' || url.pathname.startsWith('/2nd-B/'));
    } catch {
      return false;
    }
  });
  return [asset404 ? 'asset-404' : null, pageErrorCount > 0 ? 'page-error' : null].filter(Boolean);
}

export async function waitForSettledPage(
  page,
  { maxMs = 20000, pollMs = 700, now = Date.now } = {},
) {
  const started = now();
  let lastLen = -1;
  let stable = 0;
  while (now() - started < maxMs) {
    const info = await page.evaluate(() => {
      const text = document.body.innerText || '';
      return { len: text.length, loading: /영차영차|불러오는|Loading|읽는 중/.test(text) };
    });
    if (!info.loading && info.len > 40) {
      if (info.len === lastLen && ++stable >= 2) return;
    } else {
      stable = 0;
    }
    lastLen = info.len;
    await page.waitForTimeout(pollMs);
  }
  throw new CaptureContractError('page-not-settled');
}

export function digestPage(root = document.body) {
  const walk = (el, depth) => {
    if (depth > 24) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const own = [...el.childNodes]
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent.trim())
      .filter(Boolean)
      .join(' ');
    const interactive = el.matches?.('a[href], button, [role="button"], [role="link"]') === true;
    const descendantText = interactive ? (el.innerText || '').replace(/\s+/g, ' ').trim() : '';
    const text = own.slice(0, 120);
    const kids = [...el.children].map((child) => walk(child, depth + 1)).filter(Boolean);
    if (!text && kids.length === 0 && !interactive) return null;
    const rawHref = interactive ? el.getAttribute?.('href') : null;
    return {
      tag: el.tagName.toLowerCase(),
      box: [Math.round(r.width), Math.round(r.height)],
      ...(text ? { text } : {}),
      ...(interactive
        ? { interactive: true, interactiveText: descendantText.slice(0, 120), to: rawHref }
        : {}),
      ...(kids.length ? { kids } : {}),
    };
  };
  return walk(root, 0);
}
