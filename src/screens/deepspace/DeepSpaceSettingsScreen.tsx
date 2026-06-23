// v2 settings clone — design canon: "2nd-Brain 인증·설정화면.dc.html" (설정 frame).
// A deep-space settings HUB: greeting status header + identity card + grouped
// nav rows (account/data, plans, theme, notifications) + sign out. The legacy
// settings crammed data-deletion here; the v2 design moves that to /data and
// keeps settings a clean hub. Token-only (deepSpace.*), responsive (flex +
// scroll, >=44pt targets). This is the v2 PROOF for side-by-side comparison.

import { ScrollView, View, Pressable, StyleSheet } from "react-native";
import { router, type Href } from "expo-router";
import { useTranslation } from "react-i18next";

import { deepSpace, deepSpaceSpacing, deepSpaceRadii } from "@/lib/theme/tokens";
import { Text } from "@/components/ui/Text";
import { SecondbHead, SecondbStatusHeader } from "@/components/deepspace";

interface RowProps {
  label: string;
  value?: string;
  last?: boolean;
  onPress?: () => void;
}

function Row({ label, value, last, onPress }: RowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, last ? styles.rowLast : null, pressed ? styles.rowPressed : null]}
    >
      <Text variant="body" style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        {value ? <Text variant="caption" style={styles.rowValue}>{value}</Text> : null}
        <Text style={styles.chev}>{"›"}</Text>
      </View>
    </Pressable>
  );
}

export interface DeepSpaceSettingsScreenProps {
  name?: string;
  email?: string;
  onSignOut?: () => void;
}

export function DeepSpaceSettingsScreen({
  name = "Simon",
  email = "me@2ndbrain.app",
  onSignOut,
}: DeepSpaceSettingsScreenProps) {
  const { i18n } = useTranslation();
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? true;
  const go = (r: Href) => () => router.push(r);

  return (
    <View style={styles.screen}>
      <View style={styles.glow} pointerEvents="none" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SecondbStatusHeader
          text={ko ? "필요한 걸 여기서 맞춰요." : "Tune what you need, right here."}
          tip={ko ? "알림을 켜면 제가 더 잘 도와요." : "Turn on alerts and I can help more."}
        />
        <Text variant="heading" style={styles.title}>{ko ? "설정" : "Settings"}</Text>

        <Pressable
          accessibilityRole="button"
          onPress={go("/account")}
          style={({ pressed }) => [styles.profile, pressed ? styles.rowPressed : null]}
        >
          <View style={styles.avatar}><SecondbHead size={40} mood="neutral" /></View>
          <View style={styles.profileBody}>
            <Text variant="caption" style={styles.profileName}>{name}</Text>
            <Text variant="subtle" style={styles.profileSub}>{`${email} · Free`}</Text>
          </View>
          <Text style={styles.chev}>{"›"}</Text>
        </Pressable>

        <Text variant="caption" pixelEn style={styles.eyebrow}>{ko ? "계정 · 데이터" : "ACCOUNT · DATA"}</Text>
        <View style={styles.group}>
          <Row label={ko ? "개인정보 · 데이터" : "Privacy · data"} onPress={go("/privacy")} />
          <Row label={ko ? "IDEN 내보내기" : "Export IDEN"} last onPress={go("/iden")} />
        </View>

        <View style={styles.group}>
          <Row label={ko ? "요금제" : "Plans"} value={ko ? "Pro 보기" : "See Pro"} onPress={go("/plans")} />
          <Row label={ko ? "테마 · 글꼴" : "Theme · font"} value={ko ? "딥스페이스" : "Deep space"} onPress={go("/theme")} />
          <Row label={ko ? "알림" : "Notifications"} last onPress={go("/permissions")} />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onSignOut}
          style={({ pressed }) => [styles.signout, pressed ? styles.rowPressed : null]}
        >
          <Text variant="caption" style={styles.signoutText}>{ko ? "로그아웃" : "Sign out"}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: deepSpace.bg },
  glow: { position: "absolute", top: 0, left: 0, right: 0, height: 220, backgroundColor: deepSpace.bgGlow },
  content: { paddingBottom: 48, gap: deepSpaceSpacing.md },
  title: { fontSize: 20, color: deepSpace.textHi, marginHorizontal: deepSpaceSpacing.lg, marginTop: deepSpaceSpacing.sm },

  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: deepSpaceSpacing.lg,
    padding: deepSpaceSpacing.md,
    borderRadius: deepSpaceRadii.lg,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    alignItems: "center",
    justifyContent: "center",
  },
  profileBody: { flex: 1 },
  profileName: { fontSize: 15, color: deepSpace.textHi },
  profileSub: { fontSize: 12, color: deepSpace.textMuted, marginTop: 2 },

  eyebrow: { color: deepSpace.textMuted, marginHorizontal: deepSpaceSpacing.lg, marginTop: deepSpaceSpacing.sm, marginBottom: -2 },
  group: {
    marginHorizontal: deepSpaceSpacing.lg,
    borderRadius: deepSpaceRadii.lg,
    borderWidth: 1,
    borderColor: deepSpace.cardLine,
    backgroundColor: deepSpace.card,
    overflow: "hidden",
  },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: deepSpaceSpacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: deepSpace.cardLine,
  },
  rowLast: { borderBottomWidth: 0 },
  rowPressed: { backgroundColor: deepSpace.cardPressed },
  rowLabel: { fontSize: 15, color: deepSpace.text },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowValue: { fontSize: 13, color: deepSpace.accentBright },
  chev: { fontSize: 20, color: deepSpace.textMuted },

  signout: {
    minHeight: 48,
    marginHorizontal: deepSpaceSpacing.lg,
    marginTop: deepSpaceSpacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: deepSpaceRadii.md,
    borderWidth: 1,
    borderColor: deepSpace.cardLineStrong,
  },
  signoutText: { fontSize: 14, color: deepSpace.accentSoft },
});
