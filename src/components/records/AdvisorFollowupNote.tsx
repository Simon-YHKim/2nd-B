import { useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Text } from "@/components/ui/Text";
import { advisorFollowupViewModel } from "@/lib/records/followup";
import { cosmic, radii, semantic, spacing, withAlpha } from "@/lib/theme/tokens";

interface AdvisorFollowupLabels {
  heading: string;
  sources: string;
  whyThis: string;
  evidenceFallback: string;
}

interface AdvisorFollowupNoteProps {
  followup: unknown;
  labels: AdvisorFollowupLabels;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function AdvisorFollowupNote({ followup, labels, style, testID }: AdvisorFollowupNoteProps) {
  const model = useMemo(() => advisorFollowupViewModel(followup), [followup]);
  const [expanded, setExpanded] = useState(false);
  if (!model) return null;

  const evidence = model.zone === "red" || model.fixedTemplate ? [] : model.evidence;
  const hasEvidence = evidence.length > 0;

  return (
    <View style={[styles.root, style]} testID={testID}>
      <Text variant="caption" color="brand" style={styles.heading}>
        {labels.heading}
      </Text>
      <Text variant="body" color="textMuted" style={styles.body}>
        {model.text}
      </Text>
      {hasEvidence ? (
        <>
          <Pressable
            onPress={() => setExpanded((next) => !next)}
            style={styles.disclosure}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={labels.whyThis}
            testID={testID ? `${testID}-disclosure` : undefined}
          >
            <Text variant="caption" color="brand">
              {labels.whyThis}
            </Text>
          </Pressable>
          {expanded ? (
            <View style={styles.evidenceList} testID={testID ? `${testID}-evidence` : undefined}>
              <Text variant="caption" color="textMuted" style={styles.sourcesLabel}>
                {labels.sources}
              </Text>
              {evidence.map((item, index) => (
                <View key={`${item.title}-${item.doi ?? index}`} style={styles.evidenceRow}>
                  <View style={styles.dot} />
                  <View style={{ flex: 1, gap: spacing.xs }}>
                    <Text variant="subtle" color="textMuted" numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text variant="subtle" color="textSubtle" numberOfLines={2}>
                      {item.summary ?? labels.evidenceFallback}
                    </Text>
                    {item.doi ? (
                      <Pressable
                        accessibilityRole="link"
                        onPress={() => {
                          void Linking.openURL(doiUrl(item.doi as string));
                        }}
                      >
                        <Text variant="subtle" color="brand" numberOfLines={1}>
                          {item.doi}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function doiUrl(doi: string): string {
  if (/^https?:\/\//i.test(doi)) return doi;
  return `https://doi.org/${encodeURIComponent(doi)}`;
}

const styles = StyleSheet.create({
  root: {
    borderLeftWidth: 3,
    borderLeftColor: semantic.brand,
    borderRadius: radii.md,
    backgroundColor: withAlpha(cosmic.signalMint, 0.06),
    padding: spacing.md,
    gap: spacing.xs,
  },
  heading: { fontWeight: "700", letterSpacing: 0 },
  body: { lineHeight: 22 },
  disclosure: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
    paddingVertical: spacing.xs,
    paddingRight: spacing.md,
  },
  evidenceList: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: semantic.border,
    paddingTop: spacing.sm,
  },
  sourcesLabel: { fontWeight: "700", letterSpacing: 0 },
  evidenceRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: semantic.brand,
    marginTop: 7,
  },
});
