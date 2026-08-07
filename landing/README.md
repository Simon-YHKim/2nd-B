# landing-clone

A **structure / interaction study** of the landing page at
[johwska.com](https://johwska.com), rebuilt from scratch — but with a **floating
character mascot** as the centrepiece instead of the original 3D head.

It keeps the *design language* of the reference:

- a single glowing centrepiece dead-centre on a deep-space background
- **bloom + radial chromatic aberration + a touch of soft-focus** post-processing
- the body stays fixed while the **face — both eyes and the mouth — tracks the
  cursor** (the baked-in face is hidden by a patch and replaced with movable,
  glowing eye/mouth sprites)
- a minimal monospace floating widget (bottom-left) that toggles between a
  collapsed name, a **WORK** thumbnail grid, and an **INFO** bio — and can be
  dragged around the screen

## The centrepiece image

The mascot is just a PNG on a billboard at **`assets/character.png`**. The scene
samples a corner pixel of that image and paints the background the same colour,
so the image's own dark backdrop blends seamlessly into the page — no visible
square, no cut-out needed.

> The bundled `assets/character.png` is a **stand-in**: a front pose cropped from
> your character sheet. To use a different render (e.g. the head close-up), just
> **overwrite `assets/character.png`** with your file and reload. Square-ish
> images on a dark background work best.
>
> The cursor-tracking eyes/mouth are positioned with the `FACE` coordinates in
> `main.js`, measured against this exact image. If you swap in a different
> render, re-measure those (or set them so the synthetic eyes sit over the
> baked ones).

Placeholder **name / bio / contact** ("Elian Voss") are fictional — swap them in
`index.html`.

## Run

ES modules + an import map, so it must be served over HTTP (not `file://`):

```bash
python -m http.server 8777      # -> http://127.0.0.1:8777/index.html
# or:  npx serve .
```

No build step. Three.js (r160) loads from a CDN; everything else is local.

## Customise

The whole look lives in the `LOOK` object at the top of `main.js`:

```js
const LOOK = {
  exposure,                 // overall brightness
  bloom: {strength,radius,threshold}, // glow on the bright pixels
  blur,                     // soft-focus (0 = perfectly crisp)
  aberration,               // chromatic-aberration strength
  tilt, ease, bob,          // parallax + float feel
  charHeight,               // how big the mascot is on screen
};
```

- **Centrepiece** → replace `assets/character.png` (or point `CHARACTER_URL`
  elsewhere). If it fails to load, a glowing placeholder orb is shown instead.
- **Name / bio / contact** → `index.html`.
- **Thumbnails** → `TILE_GRADIENTS` in `main.js` (or swap the `<li>`s for `<img>`s).
- **Colours / typography** → CSS custom properties at the top of `styles.css`.

## Stack

- [three.js](https://threejs.org) r160 — WebGL billboard + `EffectComposer`
  post-processing (bloom, chromatic aberration, blur).
- Fonts: **Space Mono** (UI) + system serif (bio).
- Vanilla JS, no framework, no bundler.

## Notes

- **Mascot** — your own project asset; not third-party artwork.
- **Design reference** — johwska.com, studied for layout and interaction only.
