/**
 * O-31 Stage③ — deep-space second-tier nav (nav-contract §3 wiring table).
 *
 * A small, deep-space-tokened list of router links injected into each primary
 * screen (graph / capture / profile / settings) so EVERY app route is reachable
 * from inside its parent primary screen when EXPO_PUBLIC_UI=deep-space.
 *
 * The caller gates rendering on isDeepSpaceUI() so the legacy (gameboy) path is
 * byte-identical — this component never renders in legacy mode. It only routes
 * (router.push("/<route>")); Back returns to the parent / the shell via the
 * router's own back stack (nav-contract §4). Re-theming the destination screens
 * is OUT OF SCOPE (nav-contract §6) — this is reachability + working nav only.
 *
 * Uses only deepSpace.* tokens (no hex literals) per CLAUDE.md / DESIGN.md.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, type Href } from "expo-router";

import { deepSpace } from "@/lib/theme/tokens";

export interface DeepSpaceLinkGroup {
  /** Section heading (already locale-resolved by the caller). */
  title: string;
  items: { key: string; label: string; route: Href }[];
}

/** Pressed-state tints expressed against the deepSpace accent token so no
 *  component carries a raw hex/rgba literal (the token file owns the values). */
const styles = StyleSheet.create({
  root: { gap: 18, paddingHorizontal: 4 },
  group: { gap: 8 },
  groupTitle: {
    color: deepSpace.textMuted,
    fontSize: 11,
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  item: {
    minWidth: 104,
    flexGrow: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44, // >= 44px touch target (a11y)
  },
  itemPressed: { borderColor: deepSpace.accent, backgroundColor: deepSpace.cardPressed },
  itemLabel: { color: deepSpace.text, fontSize: 14, textAlign: "center" },
});

export function DeepSpaceLinks({ groups }: { groups: DeepSpaceLinkGroup[] }) {
  return (
    <View style={styles.root}>
      {groups.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          <View style={styles.grid}>
            {group.items.map((item) => (
              <Pressable
                key={item.key}
                style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                onPress={() => router.push(item.route)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <Text style={styles.itemLabel}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
