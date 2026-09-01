// dds-legal-doc-screen: renders a legal document snapshot (terms / refund) on
// the auth shell (U4 -- the app previously had NO legal-document render
// pattern; /privacy is a settings screen). Lives behind (auth)-group routes so
// a signed-out user mid-sign-up can read what they are agreeing to. Shows a
// draft badge while the body still carries [기입] placeholders -- the screen
// must not present an unfinished document as final (legal honesty).
import { useCallback, useMemo, useState } from "react";
import { BackHandler, Pressable, StyleSheet, Text as RNText, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";

import { colors, spacing } from "@/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { SegBtn } from "@/components/m3/SegBtn";
import { Text } from "@/components/ui/Text";
import { AuthShell } from "./dds-auth-screens";
import { ddsStyles as styles } from "./dds-styles";
import {
  parseLegalMarkdown,
  splitLegalLanguageSections,
  stripLegalDocumentIntro,
  type LegalDocumentLanguage,
} from "@/lib/legal/parse-legal-markdown";
import { isDraft, type LegalDoc } from "@/lib/legal/legal-documents";
import { systemLocaleFor } from "@/lib/i18n/locales";
import { registerOwnBack } from "@/lib/nav/own-back";

export function DeepSpaceLegalDocScreen({
  doc,
  crossLinks,
}: {
  doc: LegalDoc;
  /** Optional sibling document links (terms / refund / privacy policy). */
  crossLinks?: Array<{ href: "/terms" | "/refund" | "/privacy-policy"; label: string }>;
}) {
  const { t, i18n } = useTranslation(["common"]);
  const [documentLanguage, setDocumentLanguage] = useState<LegalDocumentLanguage>(() =>
    systemLocaleFor(i18n.resolvedLanguage ?? i18n.language),
  );
  const { blocks, meta } = useMemo(
    () => stripLegalDocumentIntro(parseLegalMarkdown(doc.body), doc.title),
    [doc.body, doc.title],
  );
  const languageSections = useMemo(() => splitLegalLanguageSections(blocks), [blocks]);
  const visibleBlocks = languageSections
    ? [...languageSections.preamble, ...languageSections.sections[documentLanguage]]
    : blocks;
  const requestBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    // replace, not push: a cold deep-link/web entry has no history, and push
    // would leave THIS screen mounted underneath — its own-back registration
    // would keep suppressing the global chip on the home it just opened.
    else router.replace("/");
    return true;
  }, []);

  // Focus-scoped, not mount-scoped: the native stack keeps buried screens
  // MOUNTED, so a mount-scoped registration would keep suppressing the global
  // BackArrow (own-back.ts is one global counter) and keep a hardware-back
  // handler alive underneath whatever is pushed on top. One effect owns both
  // registrations so blur releases them together.
  useFocusEffect(
    useCallback(() => {
      const unregister = registerOwnBack();
      const sub = BackHandler.addEventListener("hardwareBackPress", requestBack);
      return () => {
        sub.remove();
        unregister();
      };
    }, [requestBack]),
  );

  return (
    <AuthShell>
      <View style={styles.titleRow}>
        <Pressable
          onPress={requestBack}
          hitSlop={12}
          style={local.backTarget}
          accessibilityRole="button"
          accessibilityLabel={t("common:navGraph.drilldown.back")}
        >
          <RNText style={styles.back}>‹</RNText>
        </Pressable>
        <Text variant="heading" style={styles.title} accessibilityRole="header">
          {doc.title}
        </Text>
      </View>

      {meta ? (
        <Text variant="caption" style={local.meta}>{meta}</Text>
      ) : null}

      {languageSections ? (
        <SegBtn
          segments={[
            { key: "ko", label: t("common:locale.ko") },
            { key: "en", label: t("common:locale.en") },
          ]}
          selected={[documentLanguage]}
          onSelect={(key) => setDocumentLanguage(key === "en" ? "en" : "ko")}
        />
      ) : null}

      {isDraft(doc) ? (
        <View style={local.draftBadge} accessibilityRole="text">
          <Text variant="caption" style={local.draftBadgeText}>{doc.draftBadge}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        {visibleBlocks.map((b, i) => {
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

      {(crossLinks ?? []).map((link) => (
        <Pressable
          key={link.href}
          style={styles.authLinkRow}
          onPress={() => router.push(link.href)}
          accessibilityRole="link"
          accessibilityLabel={link.label}
        >
          <Text variant="body" style={styles.link}>{link.label}</Text>
        </Pressable>
      ))}
    </AuthShell>
  );
}

const local = StyleSheet.create({
  // The floating chip this screen replaces was a 44x44 target; the in-content
  // chevron must not shrink below it (hitSlop stays as extra margin on top).
  backTarget: {
    minWidth: m3.minTouch,
    minHeight: m3.minTouch,
    alignItems: "center",
    justifyContent: "center",
  },
  draftBadge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.amber,
    borderRadius: m3.shape.none,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  draftBadgeText: { color: colors.amber },
  meta: { color: colors.textMid },
  h1: { color: colors.textTitle, fontSize: 18, marginTop: spacing.sm },
  h2: { color: colors.textTitle, fontSize: 15, marginTop: spacing.md },
  h3: { color: colors.textHi, fontSize: 13, marginTop: spacing.sm },
  body: { color: colors.textMid, fontSize: 12, lineHeight: 18 },
});
