/**
 * 북극성 persona deck (rev2 P3a): the aggregate self, one card at a time.
 * A horizontally paged deck of M3 cards — swipe (or tap a dot) to move between
 * cards. Replaces the stacked-section wall on the deep-space 북극성 screen, per
 * the info-density rule: ONE message per screenful, detail behind a gesture.
 *
 * Presentational only: pages arrive as prepared nodes; data loading, empty,
 * error, and loading states stay on the screen that owns them.
 */
import { useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/Text";
import { deepSpace, withAlpha } from "@/lib/theme/tokens";
import { m3 } from "@/lib/theme/m3";
import { MdCard, m3TextStyle, robotoFor } from "@/components/m3";

export interface PolarisDeckPage {
  key: string;
  /** Card title (M3 chrome type). */
  title: string;
  /** Left-edge accent for the title row. */
  accent?: string;
  body: ReactNode;
}

export function PolarisDeck({ pages, isKo }: { pages: PolarisDeckPage[]; isKo: boolean }) {
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
          accessibilityLabel={isKo ? "북극성 카드 덱" : "Polaris card deck"}
        >
          {pages.map((page) => (
            <View key={page.key} style={[styles.page, { width: pageWidth }]}>
              <MdCard variant="outlined" style={styles.card}>
                <View style={styles.titleRow}>
                  {page.accent ? <View style={[styles.titleTick, { backgroundColor: page.accent }]} /> : null}
                  <Text style={styles.title} numberOfLines={1}>
                    {page.title}
                  </Text>
                </View>
                <ScrollView
                  style={styles.cardBody}
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
  pager: { flex: 1 },
  page: { height: "100%" },
  card: {
    flex: 1,
    marginHorizontal: 4,
    marginVertical: 2,
    padding: 16,
  },
  cardBody: { flex: 1 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  titleTick: { width: 3, height: 14, borderRadius: 2 },
  title: {
    ...m3TextStyle("titleSmall"),
    fontFamily: robotoFor("500"),
    color: m3.color.onSurface,
    flex: 1,
  },
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
    width: 16,
    borderRadius: 3,
    backgroundColor: m3.accent.starCore,
  },
});
