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
import { subscribeFontStyle } from "@/lib/settings/readable-font";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";

import { deepSpace } from "@/lib/theme/tokens";
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
  const { t } = useTranslation(["deepspace", "core-brain"]);
  void isKo;
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
            {t("core-brain:swipeCards")}
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
                  page.accent ? { borderColor: page.accent } : null,
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

// 이 시트는 본문 역할(`m3TextStyle("body…")`)을 들고 있다. `StyleSheet.create`
// 는 모듈이 로드될 때 **한 번만** 평가되므로, 그대로 두면 저시력 옵션(읽는 글)
// 을 켜도 이 화면만 예전 얼굴로 남는다 -- 네이티브는 값 하이드레이션이 비동기라
// 영영 안 바뀐다. 그래서 시트를 **다시 만들 수 있게** 하고 설정이 바뀔 때
// 갈아끼운다. 화면이 다시 그려지는 것은 공유 셸(`DeepSpaceScreen`)이
// `useFontStyle()` 을 구독하기 때문이다.
const makeStyles = () => StyleSheet.create({
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
    letterSpacing: 2,
  },
  deckHint: {
    ...m3TextStyle("bodySmall"),
    flexShrink: 1,
    color: m3.color.onSurfaceVariant,
  },
  pageCount: {
    // 쪽수는 자리폭이 고정된 mono 가 맞다. 다만 GalmuriMono11 은 12px 배수에서만
    // 선명해서 titleMedium(15px)에 얹으면 1.25배로 흐려진다 -- 역할을 12px 로
    // 내려 얼굴을 지킨다.
    ...m3TextStyle("bodyMedium"),
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
    borderRadius: m3.shape.none,
    backgroundColor: m3.color.surfaceContainerHighest,
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
    borderRadius: m3.shape.none,
    backgroundColor: deepSpace.accentDim,
  },
  dotOn: {
    width: 10,
    borderRadius: m3.shape.none,
    backgroundColor: m3.color.tertiary,
  },
});

let styles = makeStyles();
subscribeFontStyle(() => {
  styles = makeStyles();
});
