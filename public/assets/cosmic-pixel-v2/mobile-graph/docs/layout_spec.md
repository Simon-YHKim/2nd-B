# Mobile Graph Layout Spec

## Screen size target

Primary design reference: 390 × 844.

The layout must also support:
- 360 × 740
- 393 × 852
- 430 × 932

## Layer order

```txt
1. Background layer
2. Edge SVG layer
3. Node button layer
4. Sprite/event layer
5. HUD layer
6. Bottom sheet layer
7. FAB layer
```

## Safe areas

Use:

```css
env(safe-area-inset-top)
env(safe-area-inset-bottom)
```

for ribbon, bottom sheet, and FAB.

## Basic viewport

```txt
Top ribbon: 50-110px area
Graph viewport: 110px to bottom
FAB: bottom right, 18px margin + safe area
Bottom sheet: overlays graph only when a node is selected
```

## Coordinates

Use `layout/mobile_graph_layout_example.json` as the first implementation reference.

Core node is at:

```json
{ "x": 600, "y": 720 }
```

The app should calculate the initial transform so this appears near the visual center of the graph viewport.
