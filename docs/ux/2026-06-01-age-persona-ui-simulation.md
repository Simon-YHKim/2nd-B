# 2026-06-01 Age Persona UI Simulation

## Scope

- Target: 2ndB / Cosmic Pixel Graph Village premium UI.
- Mode: SimonK/gstack `/qa` + `/design-review` style simulation, adapted in Codex with live browser inspection.
- Focus: UI, visual design, readability, touch targets, route-copy clarity, and age-band stress testing.
- Screens inspected live: `/sign-in`, `/sign-up`, `/no-such-route-for-preview`.
- Source surfaces inspected or adjusted: `PremiumButton`, auth footer links, auth locale controls, 404 destination links.

This pass does not replace full authenticated menu traversal. It is a design-centered scenario simulation pass using the unauthenticated entry surfaces and the shared premium control layer.

## Method

The local SimonK/gstack QA docs define a useful loop:

1. Orient on the live page.
2. Capture visual and interaction evidence.
3. Score visual, UX, content, accessibility, and functional risk.
4. Fix source issues when the issue is clear and low-risk.
5. Re-check the same scenario after the fix.

Codex cannot directly invoke Claude's Skill runtime in this session, so this report uses the local gstack workflow as the QA rubric and verifies with the in-app browser.

## Immediate Findings Fixed

| Issue                                                              | Before                                                                           | Change                                             | After                                                            |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| Auth footer links were too small for older users and early readers | Sign-in `계정 만들기` was 63x17, manual link 170x19. Sign-up `로그인` was 33x11. | Converted footer links to explicit link hit areas. | Links now report 44px minimum height; sign-up `로그인` is 44x44. |
| Password visibility button was too small                           | Sign-in eye button was 32x32.                                                    | Increased to 44x44.                                | Meets 44px target.                                               |
| Premium button base was below target                               | Shared `PremiumButton` min height was 42px.                                      | Increased to 44px.                                 | Shared premium buttons meet target.                              |
| Premium icon buttons were below target                             | `PixelIconButton` was 40x40.                                                     | Increased to 44x44.                                | Shared icon controls meet target.                                |
| 404 destination links were too small                               | Each route link was around 27px high.                                            | Made each destination link a full-width 44px row.  | All 404 destination links meet target.                           |
| Internal copy leaked into user-facing 404                          | `페르소나 v1` / `Persona v1`.                                                    | Changed to `나의 모습` / `Persona`.                | More human and premium-aligned.                                  |

## Follow-Up Improvements Applied

These changes reflect the age-band feedback directly in the product:

- Raised shared `caption` / `subtle` text sizes by 1px to reduce fatigue for 45+ and 75+ stress personas.
- Added a plain-language 18+ notice on sign-up so teen and guardian-assisted scenarios see the eligibility rule before entering the form.
- Increased the floating back arrow from 40px to 44px.
- Increased the bottom navigation content height and label size so primary routes are easier to tap and read.
- Increased first-run empty graph dismiss, skip, and CTA affordances to preserve 44px targets on the main graph entry surface.

## Re-Check Evidence

Live browser measurements after the fix:

| Screen                       | Interactive undersized controls |
| ---------------------------- | ------------------------------- |
| `/sign-in`                   | 0                               |
| `/sign-up`                   | 0                               |
| `/no-such-route-for-preview` | 0                               |

## Age-Band Persona Set

These are simulation personas, not target-audience claims. Under-18 personas are included because the request asked for the full readable-age range; product eligibility remains 18+ and the age gate is required.

| Age band | Persona  | Life / job context                     | UI/design stress being tested                                                |
| -------- | -------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| 5-7      | 하린, 6  | early reader, guardian beside them     | Can identify primary action from shape and color without fully reading copy. |
| 5-7      | 준, 7    | early reader, curious about characters | Character visibility, button size, visual affordance.                        |
| 5-7      | 미아, 5  | beginner Hangul reader                 | Avoid tiny inline links and dense instruction text.                          |
| 5-7      | 도윤, 7  | tablet-first child                     | Large tap targets, simple route labels.                                      |
| 5-7      | 서아, 6  | picture-led reader                     | Visual hierarchy over text-heavy explanation.                                |
| 8-12     | 민재, 10 | elementary student                     | Can distinguish decorative village art from controls.                        |
| 8-12     | 유나, 11 | student, uses learning apps            | Button labels, route names, character clarity.                               |
| 8-12     | 지호, 9  | gaming familiar                        | Pixel art excitement without noisy UI.                                       |
| 8-12     | 수빈, 12 | book club student                      | Copy comprehension and line length.                                          |
| 8-12     | 레오, 10 | bilingual learner                      | Language switch discoverability.                                             |
| 13-17    | 가은, 15 | middle school student                  | Age gate clarity and underage blocking.                                      |
| 13-17    | 태오, 17 | high school student                    | Whether premium visuals feel trustworthy, not childish.                      |
| 13-17    | 민서, 16 | exam-focused student                   | Avoid cognitive overload in auth and onboarding.                             |
| 13-17    | 현우, 14 | mobile gamer                           | Interaction feedback and route confidence.                                   |
| 13-17    | 지민, 17 | design club student                    | Visual consistency and polish.                                               |
| 18-24    | 다은, 21 | university student                     | Fast sign-up, clear first action, modern tone.                               |
| 18-24    | 현석, 24 | junior developer                       | Trust in auth, route labels, no internal jargon.                             |
| 18-24    | 리나, 22 | illustrator                            | Premium asset consistency and character clarity.                             |
| 18-24    | 보민, 19 | part-time worker                       | Mobile one-hand tap target comfort.                                          |
| 18-24    | 준호, 23 | esports coach                          | Visual energy without sacrificing readability.                               |
| 25-34    | 소연, 29 | product manager                        | Clear hierarchy, efficient auth, no decorative confusion.                    |
| 25-34    | 케빈, 32 | software engineer                      | Route copy should not expose internal version names.                         |
| 25-34    | 지아, 27 | nurse                                  | Short sessions, reliable tap areas.                                          |
| 25-34    | 민규, 34 | delivery driver                        | Outdoor mobile use, contrast and touch size.                                 |
| 25-34    | 아라, 31 | creator                                | Visual identity and premium first impression.                                |
| 35-44    | 은정, 41 | teacher                                | Clear Korean copy and safe onboarding.                                       |
| 35-44    | 태민, 38 | founder                                | Trust, polish, consistency across auth and fallback.                         |
| 35-44    | 수현, 36 | therapist                              | Non-clinical, gentle copy and readability.                                   |
| 35-44    | 도겸, 44 | sales lead                             | Quick recovery from wrong route.                                             |
| 35-44    | 혜린, 39 | parent, multitasker                    | Small links must still be tappable.                                          |
| 45-54    | 정우, 49 | accountant                             | Low ambiguity in labels and forms.                                           |
| 45-54    | 미경, 53 | librarian                              | Text clarity, route names, manual access.                                    |
| 45-54    | 성훈, 47 | restaurant owner                       | One-glance actions during short breaks.                                      |
| 45-54    | 나영, 51 | public servant                         | Trustworthy layout, no playful confusion.                                    |
| 45-54    | 승재, 46 | architect                              | Visual balance and consistent spacing.                                       |
| 55-64    | 영희, 60 | caregiver                              | Larger tap targets, fewer inline links.                                      |
| 55-64    | 민철, 58 | bus driver                             | Contrast and fast route recovery.                                            |
| 55-64    | 진숙, 63 | small business owner                   | Clear account creation and password field behavior.                          |
| 55-64    | 해준, 56 | photographer                           | Asset sharpness and premium image quality.                                   |
| 55-64    | 순영, 61 | retired teacher                        | Korean readability in pixel font.                                            |
| 65-74    | 광수, 68 | retired engineer                       | Large targets and reduced dense text.                                        |
| 65-74    | 복자, 72 | volunteer                              | Manual link clarity and route labels.                                        |
| 65-74    | 태식, 70 | farmer                                 | Brightness, contrast, and button confidence.                                 |
| 65-74    | 명희, 66 | craft instructor                       | Visual delight without losing direction.                                     |
| 65-74    | 세준, 74 | semi-retired consultant                | Trust and recovery from wrong route.                                         |
| 75-84    | 오순, 79 | retired nurse                          | Touch target size and text size.                                             |
| 75-84    | 준필, 82 | retired civil servant                  | Avoid small all-caps captions.                                               |
| 75-84    | 경자, 76 | church community leader                | Clear "go home" and manual routes.                                           |
| 75-84    | 동수, 84 | retired mechanic                       | High contrast, simplified action hierarchy.                                  |
| 75-84    | 미자, 80 | homemaker                              | Minimize hidden or icon-only controls.                                       |
| 85-94    | 인호, 88 | retired professor                      | Large type mode would help.                                                  |
| 85-94    | 옥례, 91 | assisted-living resident               | Tap accuracy and copy simplicity.                                            |
| 85-94    | 재국, 86 | retired shop owner                     | Strong primary CTA and no tiny links.                                        |
| 85-94    | 말순, 94 | family-assisted mobile user            | Caregiver-readable manual route.                                             |
| 85-94    | 찬호, 90 | retired musician                       | Motion and visual density tolerance.                                         |

## Simulation Results

### 5-12

- Visuals are attractive and the character/world metaphor is easy to recognize.
- Dense text and account/security concepts are too advanced for independent use.
- The 18+ age gate means this group should be treated as readability stress testers only.

### 13-17

- Premium visuals feel more game-like than clinical, which is good for engagement but could over-invite non-target minors.
- Sign-up age gate copy is visible and important.
- Internal terms like `v1` are especially confusing for this group, so removing `Persona v1` was the right correction.

### 18-44

- Current premium tone works well: strong first impression, clear primary CTA, recognizable auth flow.
- The main remaining risk is not visual quality, but route-copy consistency across deeper screens.
- Designers/developers in this band will notice small inconsistencies quickly, especially control sizing and internal labels.

### 45-64

- The design remains usable if touch targets are consistently 44px and route names stay plain-language.
- Pixel font is acceptable at 15px+ for body/form fields, but 11-13px captions are borderline.
- Manual and recovery routes are important. The 404 page now supports this better.

### 65-94

- The premium art direction still reads as friendly, but text scale and density become the main constraint.
- 44px targets are necessary but not sufficient for 75+ users.
- A future "large text / reduced density" accessibility mode would materially improve this band.

## Health Score

| Category                    | Before | After |
| --------------------------- | -----: | ----: |
| Visual polish               |     88 |    90 |
| UX clarity                  |     80 |    86 |
| Content clarity             |     82 |    86 |
| Accessibility               |     72 |    86 |
| Functional route confidence |     84 |    86 |
| Overall UI/design score     |     81 |    87 |

For the intended 18+ audience, the entry surfaces are now in a good state. For 75+ usage, the score is closer to 74 unless a large-text or simplified-density mode is added.

## Recommended Next QA Pass

1. Authenticated route traversal on a real device or emulator: graph, capture, SecondB, imagine, profile, village detail routes.
2. Large-text stress pass: simulate 120-140% text scaling and check clipping.
3. Reduced-motion pass: verify moving characters and speech bubbles remain comfortable.
4. Low-vision contrast pass on the starfield background.
5. Korean copy pass: remove remaining internal labels, version names, and overly abstract route names.

## Files Touched In This Pass

- `src/components/premium/surfaces.tsx`
- `src/app/(auth)/sign-in.tsx`
- `src/app/(auth)/sign-up.tsx`
- `src/app/+not-found.tsx`
- `src/components/premium/tab-bar.tsx`
- `src/components/ui/BackArrow.tsx`
- `src/app/index.tsx`
- `src/lib/theme/tokens.ts`
- `locales/en/auth.json`
- `locales/ko/auth.json`
