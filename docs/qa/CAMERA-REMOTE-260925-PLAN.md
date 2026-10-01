# Camera remote controls

Source: Simon's `Downloads/camera_remote_control_uiux_prompt.md`, read in full on 2026-09-25.

## Scope

- Replace the discrete jog/rotary dial with a radial velocity joystick and an absolute W–T zoom slider in the shared TelescopeControls component. Home, records (Wiki dock), and the detailed WikiGraph all use it.
- Retain current camera limits (home 1–3, graphs 1–2.6), passed explicitly to the controls. Zoom uses logarithmic lens spacing, supplied major stops and minor ticks. No physical camera/network integration is implied.
- Radial 10% dead zone, exponent 1.7 response, simultaneous diagonal axes, short velocity/zoom smoothing. Release stops motion immediately and returns only the joystick thumb. The zoom thumb shows actual applied zoom and stays there.
- Stop on touch/pointer cancellation, browser blur/hidden state, app background, route blur, disable and unmount. Keep the previous continuous star approach/return and audio.
- Mechanical controls retain the app's pixel palette and stepped circular outlines. User-directed continuous input is not quantized into the previous jog steps.

## Completion checks

1. Pure tests: range mapping, dead zone and diagonal speed, continuous hold, frame-rate independence, stop/cancel and zoom retention.
2. Live browser: slider endpoints/retention, slow vs fast and diagonal holds, release/cancel/blur safety, keyboard control; home and records. Wiki data fixture is allowed only as a browser-local intercepted response, never persisted user records.
3. Existing star-camera browser regression, full verify and Android JS export. Preserve existing workspace changes and report native-device limitations.

## Results

- Completed shared controls and all three viewport adapters; no dependencies or server/data changes.
- Full `npm run verify`: 793 suites / 10,055 tests passed. Final scoped lint and 36 related tests passed; typecheck passed.
- Edge localhost QA passed at 320/425/768px, including absolute zoom retention, joystick precision/fast/diagonal hold, touch, keyboard, release, pointer cancellation and window blur. Records and browser-fixtured WikiGraph passed, page errors 0.
- Existing star-camera motion/audio/cancel/reduced-motion browser regression passed at all three widths. Android Hermes export passed (`.expo/camera-remote-android`). Native-device gesture QA remains unexecuted.
- Found and fixed web-only runtime issues: Android AppState blur is now subscribed only on Android; web controls suppress native text selection/scroll interference and expose keyboard tab stops. Selected record descriptions clear the measured controller height.
- Existing Expo precheck remains non-green: 20 package mismatches; doctor 19/22 (Hermes advisory, package maintenance/metadata, version alignment). No unrequested SDK upgrade.
- QA scripts: `observatory-260925/remote-control-check.cjs`, `observatory-260925/star-camera-check.cjs`. Local logs are ignored under `.expo/remote-*.log`. Report: `CAMERA-REMOTE-260925.html`.
