# Android Studio local QA (run the app on an emulator / device)

For **visual + interaction QA** of the deep-space home, the M3 dock (`MdNavBar`),
Roboto chrome fonts, stadium buttons, and the 세컨비 persona head — the things a
headless web export can't show. This runs the **real native app** locally via
Android Studio.

> Different from `docs/ANDROID-BUILD.md` (that builds signed APK/AAB **in CI**).
> This doc is for **iterating locally** with hot reload / a debuggable build.

## Prerequisites (one-time)

- **Node 22** (`node -v`), **JDK 17** (`java -version`).
- **Android Studio** (Ladybug+), with SDK Platform 34/35 + Build-Tools + an
  **AVD emulator** (Pixel 7, API 34) or a physical device with USB debugging.
- `adb` on PATH (`adb devices` lists your emulator/device).

## 1. Sync + install

```bash
git fetch origin main && git pull origin main
npm ci --legacy-peer-deps
```

## 2. Point the app at real Supabase (`.env`, gitignored)

Without these the app boots on the **DEMO** Supabase placeholder (auth/data dead).
The anon key is public (same value shipped in `eas.json` / the OTA workflow):

```bash
cat > .env <<'ENV'
EXPO_PUBLIC_SUPABASE_URL=https://zoacryukmdeivmolvyhj.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvYWNyeXVrbWRlaXZtb2x2eWhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NjE0MzUsImV4cCI6MjA5NTIzNzQzNX0.neb3x_u8Vo9PaxoVpvfSHHxfpAcqxzoqGBDQV6xUYcs
# Optional: unlock paywalled features for QA (account stays free tier)
# EXPO_PUBLIC_FORCE_TIER=brain
# Optional: legacy cosmic-pixel skin instead of deep-space
# EXPO_PUBLIC_UI=legacy
ENV
```

`.env` is gitignored — never commit it. (Real secrets like `service_role` still
never go here.)

## 3. Build + run on the emulator/device

Two ways — pick one:

**A. One command (recommended for a first run)**
```bash
npx expo run:android      # expo prebuild -> gradle build -> install -> launch
```
This generates the native `android/` project, builds a debug APK, installs it on
the running emulator/device, and starts Metro. Edit JS → it hot-reloads.

**B. Open the project in Android Studio**
```bash
npx expo prebuild -p android   # generates ./android (regenerate after native/config changes)
```
Then **Android Studio → Open → select the `android/` folder** → let Gradle sync →
pick your emulator/device → **Run ▶**. Start Metro separately with `npx expo start`
(or it starts on first launch). Use Logcat for native logs.

> Re-run `expo prebuild` (or `npx expo prebuild -p android --clean`) whenever
> `app.json`, native deps, or plugins change. Pure JS edits don't need it.

## 4. Sign in with the committed QA account

`.env.test` (committed) → email/password sign-in:
- **Email**: `qa.ai.b18807@example.com`
- **Password**: in `.env.test` (`QA_TEST_PASSWORD`)

Free tier · adult · `judge_mode=false` · RLS-isolated. Reuse it — don't create another.

## 5. What to QA this cycle (rev2 M3 — P1b/P2, headless-unverified)

Walk every tab and confirm on a real screen:

- [ ] **5-tab M3 dock (`MdNavBar`)**: 별자리홈 · 담기 · 세컨비(center) · 위키 · 비서.
      Active tab shows the **pill indicator** (not colour alone) + bolder label.
      Touch targets feel ≥48dp. `나`/account reachable via profile/settings.
- [ ] **별자리 홈** renders (7 domain stars + 북극성), skeleton intact.
- [ ] **세컨비 머리** renders; personas (2nd-B / 메타비 / 트위비) tint correctly
      where wired.
- [ ] **Chrome fonts = Roboto / Roboto Mono** (labels/numerals), **body = Pretendard**
      — no pixel-font fallback, no tofu boxes.
- [ ] **Stadium buttons** (`MdButton`) are fully rounded; **chips** are 8dp (not pills).
- [ ] No crashes entering any screen; back-navigation works (BackHandler modals).
- [ ] Honour `ANDROID_QA_GUIDELINES.md` (z-index/Shine-through, SVG locks, AsyncStorage 2MB).

## 6. Or: OTA-update an existing preview build (no rebuild)

If a **preview** build (runtime **0.0.6**) is already on the phone, it can pull the
latest JS over-the-air — no Android Studio needed:

1. Latest OTA is already published to channel `preview` (see `docs/HANDOFF.md`).
2. On the phone: **fully close the app and reopen it twice** (`fallbackToCacheTimeout: 0`
   downloads on the 1st cold launch, applies on the 2nd).
3. EAS dashboard: <https://expo.dev/accounts/simon_k/projects/2nd-brain/updates>

> OTA only reaches installs at runtime **0.0.6**. A fresh `expo run:android` build
> also embeds runtime 0.0.6, so it stays on the same OTA channel.

## Troubleshooting

- **Gradle/JDK mismatch** → ensure JDK 17 (`File → Settings → Build Tools → Gradle → Gradle JDK`).
- **Metro can't connect on device** → `adb reverse tcp:8081 tcp:8081`.
- **Blank/loader forever** → check `.env` Supabase values (DEMO placeholder = dead data).
- **`node:fs` / bundle error** → should be fixed (tests excluded from the bundle);
  if it recurs, a `*.test.*` file leaked under `src/app` — move it out.
