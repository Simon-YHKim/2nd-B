// BackArrow — single fixed-position back affordance.
//
// Per user directive (2026-05-28): the bottom "← 네비게이터로" Button on
// every screen is gone. A small arrow icon in the top-left replaces it,
// no label — the dot constellation is the home, the arrow takes you
// back there. Mounted once at root (`_layout.tsx`) as an overlay, so
// individual screens don't need to remember to render it.

import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams, usePathname } from "expo-router";
import { useTranslation } from "react-i18next";

import { Text } from "@/components/ui/Text";
import { VILLAGE_IDS, VILLAGE_LABEL, type VillageId } from "@/lib/graph/relatedness";
import { isPrimaryTabPath } from "@/lib/nav/tabs";
import { cosmic } from "@/lib/theme/tokens";

// Landing + pre-auth routes that hide the arrow (no "back to graph" there yet).
const PRE_AUTH_PATHS = ["/sign-in", "/sign-up", "/complete-profile", "/oauth-callback"];

// Routes that hide the back arrow entirely: the pre-auth flow plus the graph
// home ("/") itself - "/" IS the back target, so it gets no arrow. Every other
// village screen keeps a top-left back-to-graph arrow, INCLUDING the tab
// destinations (그래프/담기/세컨비/나), per the 2026-06-02 directive ("every
// village needs a back button"). On a tab screen the arrow is nudged right of
// the brand chip (see below) so the two don't overlap.
const HIDDEN_PATHS = new Set<string>([...PRE_AUTH_PATHS, "/"]);

type Locale = "en" | "ko";

const ROUTE_LABELS: Record<string, { en: string; ko: string }> = {
  "/+not-found": { en: "Not found", ko: "찾을 수 없음" },
  "/account": { en: "Account", ko: "계정" },
  "/attachment": { en: "Attachment", ko: "애착" },
  "/audit": { en: "Audit", ko: "감사" },
  "/big-five": { en: "Big Five", ko: "빅파이브" },
  "/capture": { en: "Capture", ko: "담기" },
  "/core-brain": { en: "My center", ko: "나의 중심" },
  "/data": { en: "Data", ko: "데이터" },
  "/formats": { en: "Formats", ko: "형식" },
  "/import": { en: "Import", ko: "가져오기" },
  "/imagine": { en: "New angle", ko: "새 관점" },
  "/inbox": { en: "Inbox", ko: "받은편지함" },
  "/insights": { en: "Insights", ko: "인사이트" },
  "/interview": { en: "Interview", ko: "인터뷰" },
  "/secondb": { en: "SecondB", ko: "세컨비" },
  "/journal": { en: "Journal", ko: "일기" },
  "/manual": { en: "Manual", ko: "매뉴얼" },
  "/mbti": { en: "Persona", ko: "페르소나" },
  "/onboarding": { en: "Onboarding", ko: "온보딩" },
  "/permissions": { en: "Permissions", ko: "권한" },
  "/persona": { en: "Persona", ko: "페르소나" },
  "/privacy": { en: "Privacy", ko: "개인정보" },
  "/profile": { en: "Profile", ko: "프로필" },
  "/research": { en: "Research", ko: "리서치" },
  "/settings": { en: "Settings", ko: "설정" },
  "/support": { en: "Support", ko: "지원" },
  "/theme": { en: "Theme", ko: "테마" },
  "/trinity": { en: "Trinity", ko: "Trinity" },
};

function titleForRoute(pathname: string, domain: string | undefined, locale: Locale): string | null {
  if (pathname === "/records") {
    if (VILLAGE_IDS.includes(domain as VillageId)) return VILLAGE_LABEL[domain as VillageId][locale];
    return locale === "ko" ? "기록" : "Records";
  }
  if (pathname === "/wiki") return VILLAGE_LABEL.knowledge[locale];
  if (pathname.startsWith("/record/")) return VILLAGE_LABEL.records[locale];
  return ROUTE_LABELS[pathname]?.[locale] ?? null;
}

/** True when the back arrow is shown on this route (i.e. not the landing /
 *  pre-auth pages). Screens use this to reserve top-left headroom so the
 *  floating arrow never overlaps their first heading/text. */
export function backArrowVisible(pathname: string): boolean {
  return !HIDDEN_PATHS.has(pathname);
}

/** True when the route is a bottom-tab destination (brand chip top-left). */
export function isTabPath(pathname: string): boolean {
  return isPrimaryTabPath(pathname);
}

export function BackArrow() {
  const pathname = usePathname();
  const params = useLocalSearchParams<{ domain?: string }>();
  const { i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const locale = (i18n.language === "ko" ? "ko" : "en") as Locale;

  if (HIDDEN_PATHS.has(pathname)) return null;

  // On a tab screen, clear the brand chip by nudging the arrow rightward.
  const leftBase = insets.left + 12;
  const left = isPrimaryTabPath(pathname) ? leftBase + 52 : leftBase;
  const routeTitle = titleForRoute(pathname, params.domain, locale);

  return (
    <View style={[styles.wrap, { top: insets.top + 8, left }]} pointerEvents="box-none">
      <Pressable
        onPress={() => router.push("/")}
        hitSlop={16}
        accessibilityRole="button"
        accessibilityLabel={locale === "ko" ? "그래프로 돌아가기" : "Return to graph"}
        accessibilityHint={locale === "ko" ? "그래프 홈 화면으로 이동합니다." : "Opens the graph home screen."}
        style={({ pressed }) => [styles.btn, pressed ? { opacity: 0.7 } : null]}
      >
        <View
          style={styles.chevron}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={[styles.chevronStroke, styles.chevronTop]} />
          <View style={[styles.chevronStroke, styles.chevronBottom]} />
        </View>
      </Pressable>
      {routeTitle ? (
        <View style={styles.labelPill} pointerEvents="none">
          <Text variant="caption" color="text" numberOfLines={2} style={styles.labelText}>
            {routeTitle}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  btn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    // Premium glass backing so the arrow never visually merges with text.
    borderRadius: 12,
    backgroundColor: "rgba(167,139,250,0.16)",
    borderWidth: 1,
    borderColor: "rgba(114,242,199,0.42)",
    shadowColor: cosmic.signalMint,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  chevron: {
    width: 14,
    height: 18,
    justifyContent: "center",
  },
  chevronStroke: {
    position: "absolute",
    left: 2,
    width: 14,
    height: 3,
    borderRadius: 2,
    backgroundColor: cosmic.signalMint,
  },
  chevronTop: {
    transform: [{ rotate: "-42deg" }],
    top: 4,
  },
  chevronBottom: {
    transform: [{ rotate: "42deg" }],
    bottom: 4,
  },
  labelPill: {
    maxWidth: 220,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(114,242,199,0.28)",
    backgroundColor: "rgba(8,12,24,0.74)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: cosmic.signalMint,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  labelText: {
    letterSpacing: 0,
    textAlign: "center",
  },
});
