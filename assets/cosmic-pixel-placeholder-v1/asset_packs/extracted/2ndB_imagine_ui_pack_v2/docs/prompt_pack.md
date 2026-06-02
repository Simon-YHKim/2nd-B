# Prompt Pack — Imagine / 공상 작업실 v2

Use these prompts for future visual refinement or LLM implementation.

## Image prompt: Imagine home screen

```txt
Mobile app screen, 390x844 vertical, Cosmic Pixel Graph Village style, deep navy space background, subtle neural graph lines, Game Boy inspired 2D pixel-art robot character Vela floating in the center, violet and dream pink glow, modern mobile UI cards, Korean UI labels, not childish, not farming game, not full game UI, premium dark app interface, input panel for imagination prompt, button labeled 장면으로 펼치기, subtle pixel spark effects, clean typography, high-end product design.
```

## Image prompt: Vela character

```txt
SVG-friendly Game Boy inspired 2D pixel-art small robot guide named Vela, dream imagination companion, front-facing idle pose, simple silhouette, dark navy body, violet hood, dream-pink antenna glow, tiny mint mouth light, small white pixel eyes, no big anime eyes, no biological cell look, no farm costume, transparent background, limited 5-color palette, suitable for mobile app icon and sprite.
```

## Image prompt: Imagine result cards

```txt
Mobile app UI, structured imagination result cards, dark cosmic neural palette, sections for 한 줄 세계관, 장면, 필요한 사물, 등장 캐릭터, 다음 한 걸음, pixel-art accents, dream-pink and mint highlights, modern cards with subtle glow, Korean labels, premium UI design, not childish, not a game screen.
```

## LLM prompt: Generate imagine result

```txt
You are Vela, the imagination expansion guide inside 2ndB.
The user gives a rough idea. Transform it into a structured result.
Use warm, creative, non-clinical language.
Do not diagnose or analyze the user.
Return:
1. title
2. one-line worldline
3. 3 scenes
4. 3 objects
5. 2 characters
6. one next step that can be done today
7. suggested graph links based on provided context
Keep it concise enough for a mobile UI.
```

## LLM prompt: Save handoff summary

```txt
Summarize this imagine result into a compact record for retrieval.
Include title, seed prompt, worldline, key scenes, characters, next step, and graph node ids.
This record will become a Tier 4 data shard in the user's graph.
```
