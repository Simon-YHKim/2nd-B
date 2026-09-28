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

## What the wrapper does

The GitHub Pages build is an Expo / React-Native-Web **SPA**, and most of its
screens sit behind sign-in. A naive screenshot captures the sign-in screen
dozens of times, or fails outright behind a TLS-intercepting proxy. The wrapper:

1. **Signs in once** with the committed QA account (`.env.test`, see
   `CLAUDE.md`) and captures every route in that same browser context. The
   session is never written to disk. **Signing in is the default** on a trusted
   origin (localhost or `simon-yhkim.github.io`); pass `AUTH=0` to capture
   anonymously. Signing in against the live site uses the production backend,
   so a signed-in run may cause the same server-side effects as a person
   opening those screens.
2. **Derives the route list from `src/app`** instead of a hand-kept array
   (`LIST=1` prints it and exits; 95 static routes as of 2026-09-20).
3. **Waits out the boot splash**: a screen counts as mounted only after real
   content stays on screen for `MOUNT_STABLE_MS`. A route still on the splash
   after `MOUNT_TIMEOUT` is reported as `stuckLoading`.
4. **Refuses unsafe output**: an `OUT` inside the repo must be git-ignored
   (this folder's `.gitignore` covers `*.png` and `report.*`).
5. **Keeps TLS strict off-localhost**: certificate errors are ignored only on a
   local host or with `INSECURE_TLS=1`, and `INSECURE_TLS=1` is refused while
   signing in to a non-local origin. Behind a TLS-intercepting proxy, run
   `AUTH=0 INSECURE_TLS=1 npm run capture:screens`.

## Options (env vars)

| Var | Default | Purpose |
|---|---|---|
| `BASE_URL` | `https://simon-yhkim.github.io/2nd-B` | base to capture |
| `OUT` | `docs/design-audit` | output dir (must be git-ignored if inside the repo) |
| `AUTH` | on for trusted origins | `0` skips sign-in; `1` allows it on an untrusted origin |
| `ENV_FILE` | `.env.test` | credentials file |
| `INSECURE_TLS` | off | `1` ignores cert errors off-localhost (refused while signing in) |
| `ROUTES` | derived from `src/app` | comma-separated override |
| `APP_DIR` | `src/app` | route-tree root |
| `DYNAMIC` | off | `1` also captures dynamic routes with placeholder params |
| `LIST` | off | `1` prints the route list and exits |
| `CONCURRENCY` | `2` | pages captured in parallel |
| `VIEWPORT` | `390x844` | `WxH` (phone-first) |
| `WAIT_MS` | `4000` | extra settle wait after the app mounts |
| `MOUNT_TIMEOUT` | `45000` | how long to wait for the boot splash to give way |
| `MOUNT_STABLE_MS` | `2500` | how long content must stay up to count as mounted |
| `NAV_TIMEOUT` | `90000` | per-route navigation budget (ms) |
| `PW_PATH` | auto | Playwright module path |
| `PW_CHROME` | auto | Chromium executable |

Examples:

```bash
# Just a few screens
ROUTES="/sign-in,/deepspace-home,/core-brain" npm run capture:screens

# Anonymous, behind a TLS-intercepting proxy
AUTH=0 INSECURE_TLS=1 npm run capture:screens

# Desktop viewport into a scratch dir outside the repo
VIEWPORT=1280x800 OUT=/tmp/audit npm run capture:screens
```
