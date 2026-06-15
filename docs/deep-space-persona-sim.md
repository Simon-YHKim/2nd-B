# Deep-space UI — Persona-sim findings (O-23 Stage④)

> Walks the deep-space first-run (the home shell: character + bubble + 4-primary
> menu + head icons + bottom tab bar) across CLAUDE.md §20's four axes. Only the
> deep-space track (`EXPO_PUBLIC_UI=deep-space`); legacy is unaffected.

## Axis walk

**연령 (age).** Elderly / motor: the head-right icons were **38×38px**, under the
44px touch-target floor — easy to mis-tap. Menu items (~120×48px) and bubble
(14px) are fine. Young children: the character is appealing, but the menu labels
are abstract text they can't read — the character + bubble carry the first action.

**직업/상황 (job/situation).** New users hit abstract labels: 그래프/담기/나 read
from context, but **세컨비 / secondb** is opaque on first run. The bubble ("무엇을
기록해볼까?") is the real CTA and does most of the onboarding work.

**소득 (income).** Not exercised by the shell first-run (pricing lives in /plans).
No finding here.

**문화/국가 (culture).** The shell strings were **hardcoded Korean** (bubble + the
dev note), and the menu always showed Korean primary + English sub regardless of
locale. A non-Korean user (US/JP/EU/SEA/…) can't read the primary CTA. This is the
biggest first-run trust/clarity gap for global users.

## Findings (prioritized)

| # | Pri | Finding | Fix |
|---|---|---|---|
| F1 | P1 | Head icons 38px < 44px touch target | Enlarge to 44px (+ hitSlop) |
| F2 | P1 | Bubble + note hardcoded Korean — global users can't read the CTA | Locale-switch bubble; remove the dev note |
| F3 | P2 | Menu always shows Korean primary regardless of locale | Locale-aware label (ko: ko+en sub; non-ko: en) |
| F4 | P2 | Dev note "deep-space · 정적 캐릭터" visible in production (jargon → distrust) | Remove from the shipped shell |
| F5 | P2 | Center menu + bottom tab bar duplicate the 4 primaries (which to use?) | Dedup in a later polish pass (out of connection scope) |
| F6 | P3 | 세컨비/secondb label opaque on first run | A first-run hint, later (character+bubble mitigate) |

## This-cycle fixes (Stage⑤)

F1, F2, F3, F4 are bounded and shipped this cycle (touch target + locale-aware
strings + remove dev note). F5 (nav dedup) and F6 (label clarity) are tracked for
the deep-space polish pass alongside re-theming and the O-24/25 background.
