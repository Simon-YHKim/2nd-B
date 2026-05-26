// Persistent app navigation row. Used at the bottom of every signed-in
// screen so users always have one-tap access to the major surfaces.
// Per user directive: '페이지 간에 연속적이다 즉 네비게이팅이 직관적으로
// 쉽게 된다는 느낌이 없어' — the previous design only surfaced nav on
// /journal.
//
// Grouped into three rows for visual structure: Daily (capture/inbox/
// wiki/jarvis), Self-knowledge (audit/interview/persona/insights/
// trinity), Settings (manual/settings).

import { StyleSheet, View, ScrollView } from "react-native";
import { Link, usePathname } from "expo-router";

import { Text } from "@/components/ui/Text";
import { Button } from "@/components/ui/Button";
import { radii, semantic, spacing } from "@/lib/theme/tokens";

type Item = {
  href:
    | "/journal"
    | "/capture"
    | "/inbox"
    | "/wiki"
    | "/jarvis"
    | "/audit"
    | "/interview"
    | "/persona"
    | "/insights"
    | "/trinity"
    | "/manual"
    | "/settings";
  ko: string;
  en: string;
};

const DAILY: readonly Item[] = [
  { href: "/journal", ko: "일기", en: "Journal" },
  { href: "/capture", ko: "캡처", en: "Capture" },
  { href: "/inbox", ko: "받은편지함", en: "Inbox" },
  { href: "/wiki", ko: "위키", en: "Wiki" },
  { href: "/jarvis", ko: "자비스", en: "Jarvis" },
] as const;

const SELF: readonly Item[] = [
  { href: "/audit", ko: "오딧", en: "Audit" },
  { href: "/interview", ko: "스무고개", en: "Interview" },
  { href: "/persona", ko: "페르소나", en: "Persona" },
  { href: "/insights", ko: "인사이트", en: "Insights" },
  { href: "/trinity", ko: "Trinity", en: "Trinity" },
] as const;

const META: readonly Item[] = [
  { href: "/manual", ko: "안내", en: "Manual" },
  { href: "/settings", ko: "설정", en: "Settings" },
] as const;

export function AppNav({ locale }: { locale: "en" | "ko" }) {
  const pathname = usePathname();

  function row(items: readonly Item[], eyebrow: string) {
    return (
      <View style={styles.rowBlock}>
        <Text variant="subtle" color="textSubtle" style={styles.eyebrow}>
          {eyebrow}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollRow}>
          {items.map((it) => {
            const active = pathname === it.href;
            const label = locale === "ko" ? it.ko : it.en;
            return (
              <Link key={it.href} href={it.href} asChild>
                <Button label={active ? `· ${label} ·` : label} variant="secondary" />
              </Link>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {row(DAILY, locale === "ko" ? "일상" : "DAILY")}
      {row(SELF, locale === "ko" ? "자기 이해" : "SELF-KNOWLEDGE")}
      {row(META, locale === "ko" ? "관리" : "MANAGE")}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopColor: semantic.border,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  rowBlock: { gap: spacing.xs },
  eyebrow: { letterSpacing: 1.5, fontWeight: "700" },
  scrollRow: { gap: spacing.sm, paddingRight: spacing.md, paddingVertical: 2 },
});
