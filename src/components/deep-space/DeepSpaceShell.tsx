/**
 * O-23 Stage② — deep-space home shell skeleton (D-23 architecture C).
 *
 * Rendered only when EXPO_PUBLIC_UI=deep-space; the legacy gameboy track is
 * untouched. This is the VISUAL skeleton: the character (static fallback image
 * per D-23 — r3f/expo-gl is a later, perf-gated upgrade) on the deep-space body,
 * a speech bubble, and the four primary menu entries (D-22 IA). Real routing into
 * the existing 40 expo-router screens is wired in Stage③ (the deep-space shell
 * becomes the router home + the nav contract / deeplinks get documented + E2E'd);
 * for now the menu gives honest "coming next" feedback so nothing reads as broken.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, type Href } from "expo-router";

import { deepSpace } from "@/lib/theme/tokens";
import { isCharacterFallback } from "@/lib/ui-mode";

const CHARACTER = require("../../../assets/deep-space/character-front.png");

// O-23 Stage③: the 4 primaries route into the existing screens (graph -> the
// shared /graph route; the rest to their own routes). See nav contract.
const PRIMARY: { key: string; ko: string; en: string; route: Href }[] = [
  { key: "graph", ko: "그래프", en: "graph", route: "/graph" },
  { key: "capture", ko: "담기", en: "capture", route: "/capture" },
  { key: "secondb", ko: "세컨비", en: "secondb", route: "/secondb" },
  { key: "profile", ko: "나", en: "profile", route: "/profile" },
];

export function DeepSpaceShell() {
  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.stage}>
        <Image
          source={CHARACTER}
          style={styles.character}
          contentFit="contain"
          // expo-image (not RN Image) + memory-disk cache keeps the 860KB hero off
          // the OOM path the QA backlog flagged for hi-res RN Image.
          cachePolicy="memory-disk"
          accessibilityLabel="세컨드 브레인 캐릭터"
        />

        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>무엇을 기록해볼까?</Text>
        </View>

        <View style={styles.menu}>
          {PRIMARY.map((item) => (
            <Pressable
              key={item.key}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              onPress={() => router.push(item.route)}
              accessibilityRole="button"
              accessibilityLabel={item.ko}
            >
              <Text style={styles.itemKo}>{item.ko}</Text>
              <Text style={styles.itemEn}>{item.en}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.note}>
          {isCharacterFallback() ? "deep-space · 정적 캐릭터" : "deep-space"}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: deepSpace.bg },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  character: { width: 260, height: 260, marginBottom: 18 },
  bubble: {
    maxWidth: 320,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
    marginBottom: 26,
  },
  bubbleText: { color: deepSpace.text, fontSize: 14, textAlign: "center" },
  menu: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  item: {
    minWidth: 120,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
    alignItems: "center",
  },
  itemPressed: { borderColor: deepSpace.accent, backgroundColor: "rgba(70,182,255,0.12)" },
  itemKo: { color: deepSpace.text, fontSize: 15, marginBottom: 2 },
  itemEn: { color: deepSpace.textMuted, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase" },
  note: { color: deepSpace.textMuted, fontSize: 11, marginTop: 22 },
});
