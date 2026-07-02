# Call Recording — Scoping / Legal-Safe Design Note (v0)

> Status: **design note only** (Simon lifted the legal gate 2026-07-03; implementation
> is native-cycle work and does NOT ship with this doc). Owner: Simon + legal.
> Sibling of T5-PEER-REVIEW-SPEC.md — same shape: frame the law first, then the
> narrowest useful product inside it.

## 1. What it is

Let the user capture their OWN phone conversations as self-understanding
material: a call ends → transcript (STT) lands in capture as a record, feeding
the same wiki/persona pipelines as every other piece. The value is the
transcript, not the audio.

## 2. Legal frame (KR first)

- 통신비밀보호법 §3/§14: recording a conversation **you are a party to** is
  lawful (one-party consent). Recording a conversation **between others** is a
  crime. → The feature must be structurally incapable of the latter: recording
  can only attach to the device owner's own calls, never ambient audio.
- Civil exposure: even a lawful one-party recording can create 인격권/privacy
  liability when DISCLOSED. → v1 stores the transcript privately in the user's
  own account, no sharing surface, no export of the counterpart's words as a
  standalone artifact.
- Global: several US states (CA, WA, …) and some EU regimes require ALL-party
  consent. → v1 launches **KR-locale only** (feature-flagged by region);
  worldwide requires a per-jurisdiction consent matrix — separate legal pass.
- Minor (C10): under-18 accounts do not see the feature in v1.

## 3. Product principles (non-negotiable, mirrors T5 §3)

1. **Own calls only.** No ambient/mic-spy mode. The capture entry point exists
   only inside a call context the OS attributes to this device.
2. **Counterpart dignity.** Onboarding copy tells the user recording others
   without telling them can be lawful yet still corrosive; a one-tap "I told
   them" acknowledgment is logged with the record (not enforced — honesty over
   theater — but recorded).
3. **Transcript over audio.** STT runs, the record stores text; raw audio is
   deleted after transcription (or retained max 7 days for re-run, then purged
   via the E family — add `purge_call_audio()` when implemented).
4. **No third-party profiling.** Counterpart speech is never used to build a
   profile of the counterpart (no people-map auto-writes, no persona rows about
   others). It only contextualizes the USER's own reflection.
5. **Safety.** Transcripts run the same C9 classify path as every capture; red
   zone routes identically.

## 4. Technical reality (why this is native-cycle)

- Android: `AccessibilityService`-based call recording is Play-policy hostile;
  the sanctioned path is limited and OEM-dependent (many OEMs block third-party
  call audio entirely). Realistic v1: **in-call speakerphone capture is NOT
  attempted**; instead offer a **"통화 직후 회고" flow** — the OS call-log
  permission detects a call just ended and prompts a voice-memo reflection
  (existing `voice` capture mode). That ships value with ZERO call-audio law
  surface and no OEM fights.
- iOS: call audio recording is not available to third-party apps at all —
  the post-call reflection flow is the only cross-platform shape.
- True in-call recording (Android-only, OEM-limited) stays a v2 investigation
  behind its own legal pass.

## 5. Recommendation

Ship the **post-call reflection** (v1) in the next native cycle: call-log
permission + end-of-call prompt + existing voice capture + a `call_reflection`
tag (+ structured payload `{form:"call_reflection", fields:{who_label, gist,
feeling, followup}}` riding 0066). It delivers the actual user value (call →
self-understanding material) with a fraction of the legal surface. Revisit raw
call-audio capture only if post-call reflection proves insufficient.

## 6. Out of scope / never

- Recording conversations the user is not part of.
- Any surface that shows the counterpart's words to anyone but the user.
- Auto-recording defaults; everything is per-call opt-in.
- Building profiles of non-users.
