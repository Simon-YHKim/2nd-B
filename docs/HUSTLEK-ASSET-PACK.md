# HustleK Asset Pack Contract

Status: design working material, approved direction 2026-08-15 KST

This document defines the reproducible migration of the user-supplied
PIXEL-CLAY export into a standalone HustleK-style pixel asset pack. The pack is
not wired into the canonical deep-space UI. App adoption requires a separate
design decision and Android integration review.

## 1. Deliverables

| Artifact | Contract |
|---|---|
| `design/hustlek-assets-v1/hustlek-assets-16-64-v1.zip` | 803 concepts, 4 native tiers, 3,212 transparent RGBA PNG files |
| `design/hustlek-assets-v1/hustlek-assets-contact-sheet.png` | Representative visual QA board rendered with nearest-neighbour zoom |
| `scripts/build-hustlek-asset-pack.py` | Offline deterministic builder and validation gate |

Approved tier set:

- `16×16`: silhouette first, minimal internal marks, no forced outside outline
- `32×32`: face, garment and main prop separation
- `48×48`: refined stepped contours, material split and small highlight clusters
- `64×64`: strongest outline hierarchy, eye and footwear detail, restrained rim light

The former 96px and 128px proposals are intentionally absent.

## 2. Style lock

The approved HustleK opening atlas remains the visual reference. The pack uses:

- large-head, small-body chibi proportions for avatars
- selective dark outlines
- warm upper-left light and stepped lower-right shade
- limited color stages
- sturdy lower-body and footwear construction for human avatars
- semantic color families for icons
- transparent backgrounds

The following are prohibited:

- using one tier as a nearest-neighbour export source for every other tier
- bilinear, bicubic or LANCZOS resampling
- antialiasing, blur, gradients or dithering
- fractional coordinates or partially transparent edge pixels
- prompt-only replacement of the supplied concepts
- Pixy files, tooling or metadata

## 3. Source and provenance

Source archive SHA-256:

```text
2a5a6a14d81ca22dafd87b9b5f0547312cfac7682b95d74ae263c132b299238e
```

HustleK atlas decoded RGBA SHA-256:

```text
b077a2d1a4c77c320e92a18b92a722f4a2905340e7b1ba27c47d6a0cf2c8cc49
```

The source archive was supplied by the user on 2026-08-15. Its README calls it
an internal design-system export but does not include a standalone
redistribution license. For that reason the generated pack remains under
`design/` as working material and must not be bundled or redistributed until
the owner confirms the applicable rights.

Three source identifiers were normalized to product-safe names. The original
descriptions are not copied into the generated manifest.

## 4. Deterministic build

Requirements:

- Python 3.11 or newer
- Pillow 12.2.0
- the source ZIP supplied as `--source`
- no network access after dependencies are installed

Run from the repository root:

```powershell
python scripts/build-hustlek-asset-pack.py `
  --source "C:\path\to\PIXEL-CLAY Design System.zip"
```

The builder writes only the ZIP and contact sheet under
`design/hustlek-assets-v1/`. Every ZIP entry receives a fixed timestamp, stable
ordering and stable compression settings.

Current deterministic hashes:

```text
Pack ZIP:      d9f7e995d19937c0637f009af728a4a3ca3f83575f7392cec87ccacc935c040d
Contact sheet: 6648b00664163469c1cf0f5a039481651565cfc6ee37123940bd73c88b02e9b2
```

## 5. ZIP layout

```text
hustlek-assets/
  avatars/<group>/<id>/16.png
  avatars/<group>/<id>/32.png
  avatars/<group>/<id>/48.png
  avatars/<group>/<id>/64.png
  icons/<category>/<id>/16.png
  icons/<category>/<id>/32.png
  icons/<category>/<id>/48.png
  icons/<category>/<id>/64.png
  manifest.json
  validation.json
  README.txt
```

The manifest records labels, output paths, PNG hashes, color counts and the
changed-pixel fraction of each larger tier compared with a nearest-neighbour
16px enlargement.

## 6. Validation gate

The build fails unless all of the following hold:

- exactly 803 concepts and 3,212 PNG files
- only 16px, 32px, 48px and 64px tiers
- exact square dimensions and RGBA mode
- binary alpha only
- at least one transparent corner and non-empty subject pixels
- every larger tier differs materially from a nearest-neighbour 16px export
- all representative contact-sheet samples are present
- output identifier normalization is complete

Current result:

```text
status: PASS
minimum changed-pixel fraction from 16px enlargement: 0.083008
simple nearest-neighbour scale assets: 0
```

Visual QA covers chef, developer, astronaut, cat, heart, telescope, AI chip
and tree across all four native sizes.
