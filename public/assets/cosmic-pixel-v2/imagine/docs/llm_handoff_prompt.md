# Handoff Prompt for Coding LLM — Imagine UI v2

You are continuing the 2ndB app build.
Apply the attached `2ndB_imagine_ui_pack_v2` as the visual and interaction basis for the `/imagine` screen.

Hard requirements:

1. Build or update `/imagine` with user-facing name `공상 작업실`.
2. This screen represents the third pillar: 공상 → 구체화.
3. Do not make the output a long chat response. Render structured cards:
   - 한 줄 세계관
   - 장면
   - 필요한 사물
   - 등장 캐릭터 / 친구
   - 다음 한 걸음
4. Support entry from:
   - direct `/imagine`
   - Main Graph node bottom sheet
   - Core Brain `/core-brain`
   - SecondB chat quick action
5. When saved, create an ImagineRecord and attach it as a Tier 4 graph data shard.
6. Show the seed context pill when entered from a graph node or Core Brain.
7. Use Vela as the guide character; do not show too many characters at once.
8. Avoid clinical/therapy/diagnosis language.
9. Preserve Cosmic Pixel Graph Village palette.

Start by integrating:

- `css/imagine-v2.css`
- `components/ImagineScreenSkeleton.tsx` as structural reference
- `mockups/mobile_imagine_home_390x844.svg` as target visual reference
- `layout/imagine_layout_example.json` for data and state flow
- `docs/data_contract.md` for persistence model
