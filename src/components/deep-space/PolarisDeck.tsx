/**
 * 북극성 persona deck (rev2 P3a): the aggregate self, one card at a time.
 * A horizontally paged deck of M3 cards — swipe (or tap a dot) to move between
 * cards. Its hierarchy follows the Claude 10-me handoff: a compact "swipe"
 * caption and page count above one violet persona card.
 *
 * Presentational only: pages arrive as prepared nodes; data loading, empty,
 * error, and loading states stay on the screen that owns them.
 */
import { useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { MdCard, m3TextStyle } from "@/components/m3";
import { Text } from "@/components/ui/Text";

export interface PolarisDeckPage {
  key: string;
  /** Card title (M3 chrome type). */
  title: string;
  /** Left-edge accent for the title row. */
  accent?: string;
  body: ReactNode;
}

export function PolarisDeck({ pages, isKo }: { pages: PolarisDeckPage[]; isKo: boolean }) {
  const { t } = useTranslation("deepspace");
  const [pageWidth, setPageWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * pageWidth, animated: true });
    setIndex(i);
  };

  return (
    <View
      style={styles.root}
      onLayout={(e) => setPageWidth(Math.round(e.nativeEvent.layout.width))}
    >
      <View style={styles.deckHead}>
        <View style={styles.deckHeadCopy}>
          <Text style={styles.deckTitle} numberOfLines={1}>
            {pages[index]?.title}
          </Text>
          <Text style={styles.deckHint} numberOfLines={1}>
            {isKo ? "옆으로 넘겨 보기" : "Swipe to explore"}
          </Text>
        </View>
        <Text style={styles.pageCount}>{`${Math.min(index + 1, pages.length)} / ${pages.length}`}</Text>
      </View>
      {pageWidth > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          style={styles.pager}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) =>
            setIndex(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, pageWidth)))
          }
          accessibilityLabel={t("deepspace:polaris.cardDeck")}
        >
          {pages.map((page) => (
            <View key={page.key} style={[styles.page, { width: pageWidth }]}>
              <MdCard
                variant="outlined"
                style={[
                  styles.card,
                  page.accent ? { borderColor: withAlpha(page.accent, 0.48) } : null,
                ]}
              >
                <ScrollView
                  style={styles.cardBody}
                  contentContainerStyle={styles.cardContent}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {page.body}
                </ScrollView>
              </MdCard>
            </View>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.dots} accessibilityRole="tablist">
        {pages.map((page, i) => (
          <Pressable
            key={page.key}
            onPress={() => goTo(i)}
            hitSlop={12}
            accessibilityRole="tab"
            accessibilityState={{ selected: i === index }}
            accessibilityLabel={page.title}
            style={styles.dotHit}
          >
            <View style={[styles.dot, i === index ? styles.dotOn : null]} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  deckHead: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  deckHeadCopy: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  deckTitle: {
    ...m3TextStyle("labelLarge"),
    color: m3.color.tertiary,
    fontFamily: m3.font.brand,
    letterSpacing: 2,
  },
  deckHint: {
    ...m3TextStyle("bodySmall"),
    flexShrink: 1,
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.brand,
  },
  pageCount: {
    ...m3TextStyle("titleMedium"),
    color: m3.color.onSurfaceVariant,
    fontFamily: m3.font.mono,
  },
  pager: { flex: 1 },
  page: { height: "100%" },
  card: {
    flex: 1,
    marginHorizontal: 4,
    marginVertical: 2,
    padding: 0,
    overflow: "hidden",
    borderRadius: 22,
    backgroundColor: withAlpha(m3.color.tertiaryContainer, 0.22),
  },
  cardBody: { flex: 1 },
  cardContent: { padding: 18, flexGrow: 1 },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
    paddingVertical: 6,
  },
  dotHit: { minWidth: 22, minHeight: 32, alignItems: "center", justifyContent: "center" },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: withAlpha(deepSpace.accentDim, 0.4),
  },
  dotOn: {
    width: 10,
    borderRadius: 3,
    backgroundColor: m3.color.tertiary,
  },
});
