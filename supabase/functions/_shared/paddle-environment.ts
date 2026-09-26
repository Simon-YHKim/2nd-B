// Deployment-owned boundary. Request bodies, URLs, and webhook custom data
// never select a Paddle environment or a Supabase database.
export type PaddleEnvironment = 'production' | 'sandbox';
type EnvReader = (name: string) => string | undefined;

export interface PaddleDeployment {
  environment: PaddleEnvironment;
  audience: string;
  apiBase: string;
}

function origin(value: string | undefined): string | null {
  if (!value || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]', 'kong'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local))
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function readPaddleDeployment(get: EnvReader): PaddleDeployment {
  const environment = get('PADDLE_ENVIRONMENT') ?? 'production';
  if (environment !== 'production' && environment !== 'sandbox') throw new Error('invalid_paddle_environment');
  const audience = origin(get('SUPABASE_URL'));
  if (!audience) throw new Error('invalid_paddle_database');
  if (environment === 'sandbox') {
    const sandbox = origin(get('PADDLE_SANDBOX_SUPABASE_URL'));
    const live = origin(get('PADDLE_LIVE_SUPABASE_URL'));
    if (!sandbox || !live || sandbox === live || audience !== sandbox) {
      throw new Error('paddle_sandbox_database_not_isolated');
    }
  } else if (get('PADDLE_LIVE_SUPABASE_URL') !== undefined
    && origin(get('PADDLE_LIVE_SUPABASE_URL')) !== audience) {
    throw new Error('paddle_live_database_mismatch');
  }
  return {
    environment, audience,
    apiBase: environment === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com',
  };
}

export function paddleApiKeyMatches(key: string, environment: PaddleEnvironment): boolean {
  const match = /^pdl_(live|sdbx)_apikey_[a-z\d]{26}_[a-zA-Z\d]{22}_[a-zA-Z\d]{3}$/.exec(key);
  return match?.[1] === (environment === 'sandbox' ? 'sdbx' : 'live');
}

export function paddlePriceAllowed(get: EnvReader, priceId: string): boolean {
  if (!/^pri_[a-z0-9]{26}$/.test(priceId)) return false;
  const cortex = (get('PADDLE_PRICE_CORTEX') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  const brain = (get('PADDLE_PRICE_BRAIN') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  const all = [...cortex, ...brain];
  return all.every((value) => /^pri_[a-z0-9]{26}$/.test(value))
    && new Set(all).size === all.length && all.includes(priceId);
}
