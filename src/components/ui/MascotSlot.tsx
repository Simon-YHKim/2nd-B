// Mascot v1.1 placeholder slot.
//
// Brain Stack v1.1 ships 9 mascots (see docs/ux/2026-05-27-mascot-
// compatibility.html + external Final Spec). Vector PNGs are being
// generated in a separate session; until they land, every mounted
// mascot renders as a color orb + initial so the layout slots can
// be wired into screens right now without waiting on assets.
//
// When the PNGs arrive, drop them under assets/mascot/<name>.png and
// extend this component to <Image source={MASCOT_SOURCES[name]} />
// when available, falling back to the orb otherwise.
//
// Patterns supported (per the Placement Map's 7-pattern vocabulary):
//   - "avatar"        — header avatar, 32-64px. Default.
//   - "illustration"  — main illustration, 128-256px, with nickname.
//   - "icon"          — signature-item slot, 16-24px, color square.

import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { darkSky, mascot, type MascotName } from "@/lib/theme/tokens";

export type MascotVariant = "avatar" | "illustration" | "icon";

interface Props {
  name: MascotName;
  variant?: MascotVariant;
  size?: number;
  /** Override the auto-pulled i18n label (rare — useful for tests). */
  labelOverride?: string;
}

const DEFAULT_SIZE: Record<MascotVariant, number> = {
  avatar: 64,
  illustration: 256,
  icon: 20,
};

export function MascotSlot({ name, variant = "avatar", size, labelOverride }: Props) {
  const { t } = useTranslation("mascot");
  const color = mascot[name];
  const dim = size ?? DEFAULT_SIZE[variant];
  const name_ = labelOverride ?? t(`${name}.name`);
  const nick = t(`${name}.nick`);
  const initial = name_.charAt(0);
  const showLabel = variant === "illustration";
  const isIcon = variant === "icon";

  return (
    <View accessibilityLabel={name_} style={styles.wrap}>
      <View
        style={[
          isIcon ? styles.square : styles.orb,
          { width: dim, height: dim, borderRadius: isIcon ? 4 : dim / 2, backgroundColor: color },
        ]}
      >
        {!isIcon ? (
          <Text style={[styles.initial, { fontSize: dim * 0.4 }]}>{initial}</Text>
        ) : null}
      </View>
      {showLabel ? (
        <View style={styles.labelWrap}>
          <Text style={styles.name}>{name_}</Text>
          <Text style={styles.nick}>{nick}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  orb: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  square: { alignItems: "center", justifyContent: "center" },
  initial: { color: "rgba(0,0,0,0.65)", fontWeight: "800", letterSpacing: -0.5 },
  labelWrap: { alignItems: "center", marginTop: 10 },
  name: { color: darkSky.text, fontSize: 14, fontWeight: "700", letterSpacing: -0.2 },
  nick: { color: darkSky.textMuted, fontSize: 11, fontWeight: "500", marginTop: 2 },
});
