// /canon - reference surface for the proto_rev2 JSON canon (dev/design aid,
// not linked from user nav). Renders the screen registry, nav tabs and
// constellation routes straight from src/lib/canon so a broken canon file is
// visible in-app, and links to the live prototype that consumes the same data.
// Read-only, no auth, no LLM, no schema work.

import { ScrollView, View, StyleSheet, Platform, Linking, Pressable } from "react-native";

import { Text } from "@/components/ui/Text";
import { semantic, spacing, radii } from "@/lib/theme/tokens";
import {
  canonCanvas,
  canonNav,
  canonScreens,
  canonStars,
  canonStats,
} from "@/lib/canon";

const PROTO_URL = "https://simon-yhkim.github.io/2nd-B/proto/";

export default function CanonReference() {
  const stats = canonStats();
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text variant="heading">프로토 캐논</Text>
      <Text variant="subtle" style={styles.gap}>
        public/proto/data - 프로토타입과 앱이 같은 JSON을 읽습니다
      </Text>

      <View style={styles.card}>
        <Text variant="caption">
          캔버스 {canonCanvas.w}x{canonCanvas.h} · 화면 {stats.screens} · 루트 {stats.roots} · 팩 {stats.packs}
        </Text>
        <Text variant="subtle">
          immersive {stats.byLayout.immersive} · museumLike {stats.byLayout.museumLike} · windowed {stats.byLayout.windowed}
        </Text>
      </View>

      <Text variant="caption" style={styles.section}>하단 탭</Text>
      <View style={styles.card}>
        {canonNav.map((t) => (
          <Text key={t.id} variant="body">
            {t.label} ({t.id} · {t.icon})
          </Text>
        ))}
      </View>

      <Text variant="caption" style={styles.section}>별자리 → 라우트</Text>
      <View style={styles.card}>
        {canonStars.map((s) => (
          <Text key={s.id} variant="body">
            {s.label ?? s.domain} → {s.route} (L{s.level ?? "-"})
          </Text>
        ))}
      </View>

      <Text variant="caption" style={styles.section}>화면 레지스트리</Text>
      <View style={styles.card}>
        {canonScreens.map((s) => (
          <Text key={s.id} variant="subtle">
            {s.id} · {s.layout}
            {s.root ? " · root" : ""}
            {s.companion ? " · companion" : ""}
            {s.title ? ` · ${s.title}` : ""}
          </Text>
        ))}
      </View>

      <Pressable
        accessibilityRole="link"
        onPress={() => Linking.openURL(PROTO_URL)}
        style={styles.linkBtn}
      >
        <Text variant="caption" color="brand">라이브 프로토타입 열기 (/proto/)</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: semantic.background },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    ...(Platform.OS === "web" ? { maxWidth: 720, width: "100%", alignSelf: "center" as const } : null),
  },
  gap: { marginTop: spacing.xs },
  section: { marginTop: spacing.lg, marginBottom: spacing.xs },
  card: {
    backgroundColor: semantic.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  linkBtn: { marginTop: spacing.lg, alignSelf: "flex-start" },
});
