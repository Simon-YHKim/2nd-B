# reference-app — the rev2 design canon

`CLAUDE.md` points here as the canonical reference design. This file says what
the canon is, what it is **not**, and how to change it without breaking the app.

## What this directory is

A runnable HTML prototype of 2nd-Brain (`2nd-Brain.html` + `sb-*.jsx`) plus the
JSON that drives it (`data/`). The prototype resolves each screen at runtime as
`window[component]`, so the `component` field in `data/app/screens.json` names a
real symbol **on the prototype side** — every `sb-*.jsx` exports to `window`.

## What the app actually consumes

Two very different things, and conflating them has cost sessions:

| | what it is | who reads it |
|---|---|---|
| **content packs** | KO copy, KPI chip names, museum timeline, onboarding slides, axis rows | 13 source files import them through `src/lib/canon`. **This copy ships.** |
| **screen registry** | `data/app/screens.json` — 58 screens with layout/title/root | only `src/app/canon.tsx` (a dev-facing list) |

So "the canon fixes the app" is true of the content packs and was, until
2026-08-18, **not** true of the screen registry: the registry described the
prototype and made no checkable claim about React Native at all.

## `route` — the bridge (added 2026-08-18)

Every screen now carries `route`: the expo-router path under `src/app`
(no extension), or `null` when the app has no counterpart.

```jsonc
{ "id": "me", "component": "MeScreen", "layout": "windowed",
  "title": "북극성", "route": "core-brain" }      // app has it
{ "id": "widget", "component": "WidgetScreen", "layout": "windowed",
  "title": "앱 밖에서", "route": null }            // prototype only
```

As of 2026-08-18: **46 routed · 12 prototype-only · 51 app routes uncovered.**
`src/lib/canon/__tests__/canon.test.ts` fails if a non-null `route` has no route
module, if two screens claim one route, if `route` is missing entirely, or if
either of those counts moves without the pin being updated in the same commit.

`route: null` is not a defect. It is the honest gap, kept visible on purpose.

## The mirror — read this before editing

The canon data exists **twice**:

```
design/proto_rev2/reference-app/data/   <- source of truth (this directory)
public/proto/data/                      <- what src/lib/canon imports
```

There is **no copy step and no build hook.** Editing only this directory changes
nothing in the app. Copy `data/` over `public/proto/data/` in the same commit;
`canon-mirror.test.ts` fails if the two drift.

## Changing the canon

1. Edit the JSON here.
2. Mirror it: copy `data/` → `public/proto/data/`.
3. `npm run check:canon-data` — validates the prototype side (unique ids, layout
   enum, `component` really window-exported, nav/star targets, missing assets).
4. `npx jest src/lib/canon` — validates the app side (routes resolve, mirror in
   sync, counts pinned).

## Known open error

`npm run check:canon-data` currently reports **1 error**:

```
ERROR component not window-exported anywhere: ProfileScreen (screen profile)
```

Real. The canon's seventh star is `profile` (Alkaid) and the prototype never
implemented `ProfileScreen`. That is why the check is **not** wired into
`npm run verify` yet — doing so today would fail CI on a design gap, not a code
defect. It is tied to the open decision on what the seventh star is (the app
side shipped `/profile` + `/profile-details` on 2026-08-18; the Claude Design
PRD says 커뮤니티 포탈). Resolve that, then add `check:canon-data` to `verify`.

## Not the canon

`legacy/design/*.dc.html` and `legacy/docs/ui-audit/*` are a pre-M3 snapshot
(2026-06-24) kept for history. `SCREEN_TREE_SPEC.md`'s route table in particular
is badly out of date.
