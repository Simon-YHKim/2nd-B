# Implementation Order — Journal / Capture UI Pack v2

Recommended path: `public/assets/cosmic-pixel-v2/journal-capture/`.

## 1. Add assets and CSS
- Copy this package into the project.
- Merge `css/journal-capture-v2.css` into the theme/helper layer.
- Alias hardcoded colors to existing semantic tokens if the project enforces token usage.

## 2. Journal route
Update `/journal` user-facing name to **오늘의 조각**.

Mobile layout:
1. Header
2. Today shard input panel
3. Optional quick prompts
4. Save to village CTA
5. Saving event cue
6. Graph link result / success state

## 3. Capture route
Update `/capture` user-facing name to **조각 담기**.

Support the existing 5 modes:
- memo
- link
- clip
- OCR
- file

Render the mode selector first, then the relevant input panel.

## 4. Save flow
On save:
1. Validate user input.
2. Run existing safety/classification path before LLM use.
3. Create the record/source.
4. Show Momo/Lulu event cue.
5. Attach the saved item to NavGraph as Tier 4 data shard.
6. Highlight the newly connected edge in the main graph if returning to `/`.

## 5. Graph connection
After successful save, expose enough metadata for graph connection:
- recordId
- sourceRoute: journal/capture
- sourceMode if capture
- title
- preview text
- createdAt
- suggested domain/persona node ids if available

## 6. Do not over-gamify
This is not a farming or reward game. Keep streak/progress subtle.
Use “조각이 쌓여요” instead of aggressive points/levels.
