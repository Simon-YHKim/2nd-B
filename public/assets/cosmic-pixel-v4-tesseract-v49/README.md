# v49 Static Tesseract Asset Package

Static design handoff assets for the 2nd-B graph world.

No new animation should be implemented in this pass.

## Contents

- `source_white/`: original white-background exports
- `transparent_original/`: transparent-background cutout candidates
- `app_256/`: app-ready 256px PNG candidates
- `app_128/`: smaller Pattern Data and Log candidates
- `app_96/`: smaller Pattern Data and Log candidates
- `pattern_link/`: static Pattern Link conduit tile assets
- `manifest.json`: asset registry and category color guidance
- `docs/claude_prompt_v49_static_assets.md`: implementation prompt for Claude

## Pattern Data

Pattern Data represents a category bundle made from Tier 4 Logs.
The internal shape stays consistent: organized data cards / sorted papers.
Category identity should be selected by color:

red, orange, yellow, green, blue, indigo, violet, white, black.

Claude should match category meaning to the most suitable color.
If no semantic match is clear, use a stable deterministic fallback.
