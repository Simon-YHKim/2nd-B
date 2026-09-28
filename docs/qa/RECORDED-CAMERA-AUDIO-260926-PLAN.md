# Recorded observatory sounds

- Replace camera-motion whoosh and procedural cues with licensed field recordings: quiet regular ratchet during actual pan/tilt/zoom, a camera focus double beep, and a real shutter click.
- Retain current motion, compact controls and navigation. Shared web/native audio must stop on no movement, cancellation, route blur, background and unmount; ignore pending asynchronous starts after stop.
- Discover suitable recordings before processing; preserve original source, author, public preview URL, CC0 evidence, edit recipe and file hashes. No synthetic fallback, paid service or new dependencies.
- Test continuous hold, zoom easing after release, dead zone, simultaneous pan/zoom, repeated target, boundaries, direction reversal, automatic aim/zoom/return, focus and shutter sequencing, reduced motion and lifecycle cleanup.
- Validate with deterministic tests, localhost browser audio events, existing motion regression, full verify (serial, known temporary-probe file race) and Android Hermes export. No backend data changes, commit/push or deployment.

## Completed 2026-09-26

- Public CC0 preview recordings acquired, three PCM WAV derivatives shipped with exact provenance and hashes. No new dependency, paid API or synthesis.
- Actual motion owns a 160 ms loop, including zoom easing. Camera focus lock and exposure use recorded beep/shutter. Lifecycle cancellation and late seek protection implemented for shared web/native code.
- Fixed initial camera audio request loss: Expo Router defers its focus effect, so initial focus must be read synchronously from navigation.
- Full verify: 797 Jest suites / 10,073 tests plus 76 UI work0 tests passed. Existing 72 lint warnings unchanged. Final targeted lint and typecheck passed; 6 targeted suites / 50 tests passed after the last code edit.
- Edge + Playwright localhost checks passed: 320/425/768px, continuous looping without fresh input, exact 160 ms media duration, zoom easing after release, dead zone/endpoints, input cancel/blur, records and fixture-backed wiki, camera continuity, focus/shutter phase timing, flash before navigation, duplicate/cancel/route exit/reduced motion. No page errors.
- Android Hermes export includes all three WAV files. APK installation and physical-device listening not performed.
- Self-contained audio audition and evidence report: `docs/qa/RECORDED-CAMERA-AUDIO-260926.html`.
