// Google access-token acquisition via the GIS (Google Identity Services) token
// model — the current browser-SPA way to get a short-lived OAuth access token
// WITHOUT a client secret.
// https://developers.google.com/identity/oauth2/web/guides/use-token-model
//
// Web only: GIS is a browser script (accounts.google.com/gsi/client). Native is
// gated behind G3 (EAS): it will use expo-auth-session + native client IDs then,
// so here native rejects with "native_pending" and the caller shows the right
// message. The Web client id (EXPO_PUBLIC_GOOGLE_CLIENT_ID) is public — it
// appears in the authorize flow — so nothing secret lives in the bundle. $0.

export const GOOGLE_TASKS_READONLY_SCOPE = "https://www.googleapis.com/auth/tasks.readonly";

export type GoogleTokenError = "no_client_id" | "native_pending" | "gis_unavailable" | "denied";

const GIS_SRC = "https://accounts.google.com/gsi/client";

interface TokenResponse {
  access_token?: string;
  error?: string;
}
interface TokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}
interface GisOAuth2 {
  initTokenClient: (cfg: {
    client_id: string;
    scope: string;
    callback: (resp: TokenResponse) => void;
    error_callback?: (err: { type?: string }) => void;
  }) => TokenClient;
}
type GisWindow = Window & { google?: { accounts?: { oauth2?: GisOAuth2 } } };

/** GIS is a browser API — needs both window and document. */
function isWeb(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/** Inject the GIS client script once; resolve when oauth2 is ready. */
function loadGis(): Promise<GisOAuth2> {
  return new Promise<GisOAuth2>((resolve, reject) => {
    const w = window as GisWindow;
    const ready = (): GisOAuth2 | undefined => w.google?.accounts?.oauth2;
    const existing = ready();
    if (existing) return resolve(existing);
    const onload = () => {
      const oauth2 = ready();
      if (oauth2) resolve(oauth2);
      else reject("gis_unavailable" as GoogleTokenError);
    };
    const prior = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (prior) {
      prior.addEventListener("load", onload, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", onload, { once: true });
    script.addEventListener("error", () => reject("gis_unavailable" as GoogleTokenError), { once: true });
    document.head.appendChild(script);
  });
}

/**
 * Obtain a Google access token for `scope` via the GIS token model. Web-only;
 * native rejects with "native_pending". Rejects with a GoogleTokenError string
 * ("no_client_id" before any UI, "denied" if the user cancels/consent fails).
 */
export async function getGoogleAccessToken(opts: { clientId?: string; scope: string }): Promise<string> {
  if (!opts.clientId) throw "no_client_id" as GoogleTokenError;
  if (!isWeb()) throw "native_pending" as GoogleTokenError;
  const clientId = opts.clientId;
  const oauth2 = await loadGis();
  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: opts.scope,
      callback: (resp) => {
        if (resp.access_token) resolve(resp.access_token);
        else reject("denied" as GoogleTokenError);
      },
      error_callback: () => reject("denied" as GoogleTokenError),
    });
    client.requestAccessToken();
  });
}
