// dds-legal-doc-screen: renders a legal document snapshot (terms / refund) on
// the auth shell (U4 -- the app previously had NO legal-document render
// pattern; /privacy is a settings screen). Lives behind (auth)-group routes so
// a signed-out user mid-sign-up can read what they are agreeing to. Shows a
// draft badge while the body still carries [기입] placeholders -- the screen
// must not present an unfinished document as final (legal honesty).
import { useMemo } from "react";
import { Pressable, StyleSheet, Text as RNText, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { colors, spacing } from "@/theme/tokens";
import { Text } from "@/components/ui/Text";
import { AuthShell } from "./dds-auth-screens";
import { ddsStyles as styles } from "./dds-styles";
import { parseLegalMarkdown } from "@/lib/legal/parse-legal-markdown";
import { isDraft, type LegalDoc } from "@/lib/legal/legal-documents";

export function DeepSpaceLegalDocScreen({ doc, crossLink }: {
  doc: LegalDoc;
  /** Optional sibling document link (terms <-> refund). */
  crossLink?: { href: "/terms" | "/refund"; label: string };
}) {
  const { t } = useTranslation(["common"]);
  const blocks = useMemo(() => parseLegalMarkdown(doc.body), [doc.body]);

  return (
    <AuthShell>
      <View style={styles.titleRow}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t("common:navGraph.drilldown.back")}
        >
          <RNText style={styles.back}>‹</RNText>
        </Pressable>
        <Text variant="heading" style={styles.title} accessibilityRole="header">
          {doc.title}
        </Text>
      </View>

      {isDraft(doc) ? (
        <View style={local.draftBadge} accessibilityRole="text">
          <Text variant="caption" style={local.draftBadgeText}>{doc.draftBadge}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        {blocks.map((b, i) => {
          switch (b.type) {
            case "h1":
              return (
                <Text key={i} variant="heading" style={local.h1} accessibilityRole="header">{b.text}</Text>
              );
            case "h2":
              return (
                <Text key={i} variant="heading" style={local.h2} accessibilityRole="header">{b.text}</Text>
              );
            case "h3":
              return (
                <Text key={i} variant="heading" style={local.h3} accessibilityRole="header">{b.text}</Text>
              );
            case "li":
              return (
                <Text key={i} variant="body" style={local.body}>{"·  "}{b.text}</Text>
              );
            case "rule":
              return <View key={i} style={styles.consentDivider} />;
            default:
              return (
                <Text key={i} variant="body" style={local.body}>{b.text}</Text>
              );
          }
        })}
      </View>

      {crossLink ? (
        <Pressable
          style={styles.authLinkRow}
          onPress={() => router.push(crossLink.href)}
          accessibilityRole="link"
          accessibilityLabel={crossLink.label}
        >
          <Text variant="body" style={styles.link}>{crossLink.label}</Text>
        </Pressable>
      ) : null}
    </AuthShell>
  );
}

const local = StyleSheet.create({
  draftBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.amber,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  draftBadgeText: { color: colors.amber },
  h1: { color: colors.textTitle, fontSize: 18, marginTop: spacing.sm },
  h2: { color: colors.textTitle, fontSize: 15, marginTop: spacing.md },
  h3: { color: colors.textHi, fontSize: 13, marginTop: spacing.sm },
  body: { color: colors.textMid, fontSize: 12, lineHeight: 18 },
});
