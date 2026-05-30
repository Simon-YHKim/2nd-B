# Implementation Order for Coding LLM — Mobile Graph UI v2

## 1. Add assets

Place this folder at:

```txt
public/assets/cosmic-pixel-v2/mobile-graph/
```

## 2. Merge CSS

Merge:

```txt
css/mobile-graph-v2.css
```

into the current theme/helper layer.

If your project already uses semantic tokens, map these tokens instead of duplicating hard-coded colors.

## 3. Graph world

Use a virtual world larger than the phone viewport.

Recommended:

```ts
const WORLD = { width: 1200, height: 1600 };
```

The mobile viewport should transform this world using:

```ts
translate(x, y) scale(scale)
```

Initial state should center the Core node.

## 4. Node display by zoom level

```ts
if (scale < 0.65) show tiers 1-2 only;
if (scale >= 0.65 && scale < 1.1) show tiers 1-3;
if (scale >= 1.1) show tiers 1-4;
```

## 5. Node sizes

- Tier 1: 88-108px visual, minimum 44px touch target
- Tier 2: 64-76px visual
- Tier 3: 48-56px visual
- Tier 4: 8-16px visual, but hitbox must be larger if tappable

## 6. Node tap flow

When a node is tapped:

1. Do not navigate immediately.
2. Open bottom sheet.
3. Highlight selected node.
4. Highlight only connected edges.
5. Dim unrelated edges/nodes.
6. Provide two actions:
   - 살펴보기
   - 세컨비에게 묻기

## 7. Edge style

Default edge:
- muted navy/slate
- low opacity

Active edge:
- signal mint
- small glow
- short pulse if reduced motion is not enabled

Recent edge:
- pixel lamp gold accent

## 8. HUD

Use:
- top ribbon: current state / current selected node
- settings button: top right
- SecondB FAB: bottom right, from SecondB sprite pack v2
- optional minimap: bottom left or hidden on small screens

## 9. Performance notes

Use SVG for first implementation.
Canvas can be considered later only if node count becomes too high.

For SVG:
- keep decorative glow simple
- batch edges in one `<svg>` layer
- render nodes as positioned buttons for accessibility

## 10. Accessibility

- graph container: `aria-label="나의 조각 그래프"`
- node buttons: `aria-label="{label} 열기"`
- FAB: `aria-label="세컨비에게 묻기"`
- decorative edges and sprites: `aria-hidden="true"`
- respect `prefers-reduced-motion`
