# Design audit — live-link screen capture

Reusable wrapper for capturing every live screen and design-reviewing it
against the canon (`docs/CONCEPT.md`, `DESIGN.md`, the Visual Tier System and
Information Density rules in `CLAUDE.md`).

## Run

```bash
npm run capture:screens
```

Outputs to this folder (`docs/design-audit/`):

- `<route>.png` — one screenshot per navigable screen
- `report.json` — machine-readable: route, final URL, redirect flag, console
  errors, visible text
- `report.md` — a status table to skim

Generated `*.png` / `report.*` are gitignored — only this README and the
script are tracked.

## Why a wrapper (the three unlocks)

The GitHub Pages build is an Expo / React-Native-Web **SPA**, and the
remote/CI network goes through a **TLS-intercepting proxy** whose CA the
browser doesn't trust. A naive screenshot fails. The wrapper bakes in:

1. **Browser path** — auto-detects the preinstalled Chromium
   (`/opt/pw-browsers/...`) and the Playwright module, so no `npm i` needed.
2. **`ignoreHTTPSErrors: true`** — bypasses the proxy's untrusted CA
   (`ERR_CERT_AUTHORITY_INVALID`), the actual reason naive screenshots break.
3. **SPA wait** — `networkidle` + a settle delay so fonts + hydration finish
   before the shot.

## Options (env vars)

| Var | Default | Purpose |
|---|---|---|
| `BASE_URL` | `https://simon-yhkim.github.io/2nd-B` | live base |
| `OUT` | `docs/design-audit` | output dir |
| `ROUTES` | full screen list | comma-separated override |
| `VIEWPORT` | `390x844` | `WxH` (phone-first) |
| `WAIT_MS` | `4000` | settle wait after networkidle |
| `PW_PATH` | auto | Playwright module path |
| `PW_CHROME` | auto | Chromium executable |

Examples:

```bash
# Just a few screens
ROUTES="/sign-in,/deepspace-home,/core-brain" npm run capture:screens

# Desktop viewport into a scratch dir
VIEWPORT=1280x800 OUT=/tmp/audit npm run capture:screens
```

Auth-gated routes redirect to `/sign-in`; the report flags those as
`redirected` so they aren't mistaken for the real screen.
