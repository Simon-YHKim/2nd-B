# Approved HustleK opening

The cold-start opening uses the user's approved 2026-10-02 sequence and settings. It runs once per JavaScript runtime, before either sign-in or the authenticated app. Navigation within the same running app does not replay it; a reload or cold launch does.

The previous v1 production contract is retained in [the historical archive](handoff/HUSTLEK-OPENING-v1-ARCHIVE.md). It describes the retired renderer and does not override this approval.

## Runtime

- `src/components/ui/LoadingScreen.tsx` renders local PNG poses with `expo-image` and an active-time clock. Background time is excluded. There is no pose tween or SVG reconstruction.
- `src/lib/opening/hustlek-approved.ts` supplies the timeline, viewport layout, camera, Polaris twinkle and sound cues. The approved 10,119.52 ms sequence and action speeds remain unchanged.
- The background fills the entire viewport. Character/telescope placement adapts to narrow and wide screens using the same layout as the approved fullscreen review. Controls respect safe-area insets.
- `src/lib/audio/use-opening-sounds.ts` uses six Expo audio players. The web variant uses local HTML audio and starts silent until the sound button is pressed. Playback rates stay at 1; action speed changes cue timing rather than pitch.
- The existing `IntroGate` readiness, profile and encrypted-storage gates remain authoritative. The opening cannot make an unresolved app ready. Skip is enabled only when the app is ready.
- Reduced motion displays the final static scene for 1.2 seconds. Failed image preparation offers a localized retry button. Leaving the foreground or unmounting cancels sound playback.

## Assets and approval

`assets/opening/hustlek-approved-261002/` contains 22 PNG files, four WAV files, the original submitted JSON, an effective manifest, validation and source comparison reports, and `CREDITS.md`. Files preserve the approved source bytes. The retired v2 atlas remains for provenance tests and is not loaded by the opening.

Verify the shipped pack without needing the local HTML review folder:

```sh
node scripts/build-hustlek-approved-opening.cjs --verify-only
npm run verify
```

To rebuild from the local approval source, pass that folder explicitly:

```sh
node scripts/build-hustlek-approved-opening.cjs --source-dir <approved-review-folder>
```

## Local server policy

Port 8081 follows clean `origin/main` through `npm run localhost`. An unmerged feature must not be put there by bypassing app parity. After the feature reaches main, the normal supervisor applies it.

Ports 8082 and 8083 are separate development worktrees. Apply only the opening files and new `loadingGate` locale keys, preserving the worktrees' existing changes. The older 8083 worktree uses React Native `Text`; current main and 8082 use `PlainText`.

## Manual QA

Cold-load the app, enable sound, and watch walk → turn → telescope adjustment → eyepiece → sky pan → centered Polaris and high ping. Confirm there are no empty edges or missing poses. Skip should lead to the existing sign-in or profile route. Navigate inside the app and confirm the opening does not replay. Background during walking, then resume: the clock should continue from the paused time without a burst of old sounds.

Automated geometry comparison covers 14 viewport sizes and 716 timeline samples. Bundle exports do not replace listening on a real device or an Android installation test.
