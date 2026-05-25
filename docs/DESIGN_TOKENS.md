# Design Tokens — Phytoncide (Option C)

The phytoncide design system. "5월 아침 편백 숲의 그린" — the same world as
the logo (hill, brain-tree, sky). All UI color, spacing, radius, type scale
and font pairing come from here. **Never hardcode a hex literal in a component.**

## Where the tokens live

- `src/theme/tokens.ts` — `colors`, `spacing`, `radius`, `fontSize`
- `src/theme/typography.ts` — `fontFamilies`, `fontWeights`, `fontAssets`
- `src/theme/index.ts` — single import entry point (`@/theme`)
- `tailwind.config.ts` — registers the same tokens as NativeWind classes

## Palette

| Group | Token | Hex | Use |
|-------|-------|-----|-----|
| Base | `paper` | `#F2EFE5` | App background (birch) |
| Base | `paper2` / `paper3` | `#E8E4D6` / `#DAD5C3` | Raised surfaces |
| Base | `mist` | `#EDF0EA` | Soft tinted panels |
| Base | `rule` / `ruleSoft` | `#C9C2AB` / `#DAD5C3` | Borders, dividers |
| Ink | `ink` / `ink2` / `ink3` | `#2A2418` / `#4F4633` / `#7A715B` | Text, primary → subtle |
| Brand | `pine` | `#2D4A3A` | Primary brand (pine needle) |
| Brand | `pineDeep` / `pineSoft` / `pineTint` | `#1A3025` / `#4E6F5C` / `#A8BFAE` | Brand range |
| Accent | `leaf` / `leafSoft` | `#8FAA5E` / `#B5CB85` | Spring growth accent |
| Accent | `sun` / `earth` | `#D4B463` / `#8B6F47` | Warmth, grounding |
| Accent | `sky` / `skyDeep` | `#C5D5DC` / `#9DB4C0` | Calm, air |
| Safety | `sage` / `amber` / `clay` | `#7B9A82` / `#C68B3D` / `#A14D33` | Green / yellow / red zones |

`spacing` `xs..4xl` (4–64), `radius` `sm..full` (4–9999), `fontSize` `xs..4xl` (10–48).

## Typography

| Family | Token | Font |
|--------|-------|------|
| KO serif | `fontFamilies.serifKo` / `font-serif-ko` | Nanum Myeongjo |
| EN serif | `fontFamilies.serifEn` / `font-serif-en` | Source Serif 4 |
| UI sans | `fontFamilies.sans` / `font-sans` | Pretendard |
| Mono | `fontFamilies.mono` / `font-mono` | system monospace |

Display text and quotes use the serif; body and UI use the sans; trait
numbers use mono. Fonts load in `src/app/_layout.tsx` via `expo-font`.

## How to use

**NativeWind classes (preferred for new components):**

```tsx
<View className="bg-pine rounded-lg p-lg">
  <Text className="text-paper font-serif-ko text-2xl">두번째 뇌</Text>
</View>
```

**Direct token import (StyleSheet, computed values):**

```ts
import { colors, spacing } from "@/theme";

const styles = StyleSheet.create({
  card: { backgroundColor: colors.paper2, padding: spacing.lg },
});
```

## Do / Don't

- ✅ `className="bg-pine"` or `colors.pine`
- ✅ `font-serif-ko` for Korean display text
- ❌ `style={{ backgroundColor: "#2D4A3A" }}` — no hex literals
- ❌ inventing spacing values — use the `spacing` scale

## Migration note

`src/lib/theme/tokens.ts` (the previous dark token set) still exists so the
current screens keep working. Components migrate to `src/theme/` in a later
PR; that legacy file is removed once migration completes.
