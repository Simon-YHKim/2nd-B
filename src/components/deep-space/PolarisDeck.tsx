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
import { cardEdges } from "@/lib/polaris/card-dismiss";

import { usePolarisCardEdgeReport } from "./polaris-card-edges";

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
  // Each card body scrolls on its own. The overlay may only dismiss on a
  // vertical swipe when the visible body rests on that edge, so tell it where
  // the visible body is whenever it scrolls, resizes, or the page changes.
  const reportEdges = usePolarisCardEdgeReport();
  const bodies = useRef<Record<string, { y: number; viewport: number; content: number }>>({});
  const reportPage = (i: number) => {
    const body = bodies.current[pages[i]?.key ?? ""];
    reportEdges(body ? cardEdges(body.y, body.viewport, body.content) : { top: true, bottom: true });
  };
  const measureBody = (key: string, next: Partial<{ y: number; viewport: number; content: number }>) => {
    const prev = bodies.current[key] ?? { y: 0, viewport: 0, content: 0 };
    bodies.current[key] = { ...prev, ...next };
    if (pages[index]?.key === key) reportPage(index);
  };

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * pageWidth, animated: true });
    setIndex(i);
    reportPage(i);
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
          <Text style={styles.deckHint} numberOfLines={2}>
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
          onMomentumScrollEnd={(e) => {
            const next = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, pageWidth));
            setIndex(next);
            reportPage(next);
          }}
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
                  scrollEventThrottle={32}
                  onScroll={(e) => measureBody(page.key, { y: e.nativeEvent.contentOffset.y })}
                  onLayout={(e) => measureBody(page.key, { viewport: e.nativeEvent.layout.height })}
                  onContentSizeChange={(_w, h) => measureBody(page.key, { content: h })}
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
            accessibilityRole="tab"
            accessibilityState={{ selected: i === index }}
            aria-selected={i === index}
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
  // Title above the swipe hint, not beside it (R2B-05, 2026-10-05). Side by
  // side, both on one line, the title shrank with the hint on web (RN-web Text
  // gets CSS flex-shrink:1) and lost its noun: "minha Es…" (pt), "mi Estrella
  // Pol…" (es), and "North Star" clipped in en as well. Stacked, the title has
  // the full row and the hint gets two lines.
  deckHeadCopy: { flex: 1, minWidth: 0, flexDirection: "column", alignItems: "flex-start", gap: 2 },
  deckTitle: {
    ...m3TextStyle("labelLarge"),
    flexShrink: 0,
    maxWidth: "100%",
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
  // 북극성 색 카드 (Simon 2026-09-30): 짙은 북극성 보라 바탕 + 북극성 테두리.
  // 그 위 글자색은 PolarisCardOverlay 가 넘기는 팔레트가 맞춘다.
  card: {
    flex: 1,
    marginHorizontal: 4,
    marginVertical: 2,
    padding: 0,
    overflow: "hidden",
    borderRadius: m3.shape.none,
    borderWidth: 2,
    borderColor: m3.polarisCard.edge,
    backgroundColor: m3.polarisCard.surface,
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
  dotHit: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
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
