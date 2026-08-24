// 세컨비가 나를 어떻게 보고 있는지 -- 생활 여섯 영역의 현재 상태.
//
// ⚠ 2026-08-24: 이 여섯은 **더 이상 별이 아니다.** 커리어·재정·성장·관계·건강·휴식은
// 홈 별자리에서 내려왔다. 별은 *나를 알아가는 자리*(시기·직장·지금)가 됐고, 이
// 여섯은 *알아낸 것을 쓰는 자리*다 -- 방향이 반대다.
//
// [Simon 결정 6 = B] *"대시보드를 진입 하려면, 별자리 화면에서 세컨비 머리를
// 터치하면 대화창에서 보여주는 걸로 하자."* 그래서 이 판은 독립 화면이 아니라
// **대화창 안**에 뜬다. 세컨비가 말을 걸기 전에 자기가 뭘 알고 있는지 펴 보이는
// 자리이고, 그래서 대화의 일부다.
//
// 여기는 요약만 보여준다. 자세히는 `/star/<id>` 가 그대로 맡는다 -- 화면 하나에
// 하나만 말한다는 규율(Simon standing rule)을 지키려면 여기서 다 펼치면 안 된다.

import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";

import { Text } from "@/components/ui/Text";
import { DOMAIN_STARS, type DomainId } from "@/lib/persona/domain-stars";
import { loadDomainLevels } from "@/lib/persona/load-domain-levels";
import type { LadderLevel } from "@/lib/persona/brightness";
import { m3 } from "@/lib/theme/m3";
import { deepSpace, spacing, withAlpha } from "@/lib/theme/tokens";

// 담아내기(collect)는 생활 영역이 아니라 **데이터가 흘러드는 통로**다. 홈에도
// 그려진 적이 없고, 여기서도 한 칸을 차지하면 나머지 여섯과 다른 것을 같은
// 줄에 세우는 셈이 된다.
const LIFE_DOMAINS = DOMAIN_STARS.filter((d) => d.id !== "collect");

/** 등급 -> 채움 비율. 홈 별의 밝기 곡선과 같은 사다리를 쓴다. */
const fillOf = (level: LadderLevel): number => 0.36 + (level / 5) * 0.64;

export function DomainDashboard({ userId, onDismiss }: { userId: string; onDismiss?: () => void }) {
  const { t, i18n } = useTranslation("home");
  const locale = i18n.language === "ko" ? "ko" : "en";
  const [levels, setLevels] = useState<Record<DomainId, LadderLevel> | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    loadDomainLevels(userId)
      .then((b) => {
        if (alive) setLevels(b.domainLevels);
      })
      // 못 읽으면 어두운 채로 둔다. 지어내지 않는다.
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId]);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t("ds.dashboard.title")}</Text>
        {onDismiss ? (
          <Pressable onPress={onDismiss} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.dismiss}>{t("ds.dashboard.dismiss")}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.sub}>{t("ds.dashboard.sub")}</Text>

      <View style={styles.rows}>
        {LIFE_DOMAINS.map((d) => {
          const level = levels?.[d.id] ?? 1;
          return (
            <Pressable
              key={d.id}
              style={styles.row}
              onPress={() => router.push(`/star/${d.id}`)}
              accessibilityRole="button"
              accessibilityLabel={locale === "ko" ? d.nameKo : d.nameEn}
            >
              <Text style={styles.name} numberOfLines={1}>
                {locale === "ko" ? d.nameKo : d.nameEn}
              </Text>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${Math.round(fillOf(level) * 100)}%`,
                      backgroundColor: withAlpha(deepSpace.accent, 0.25 + level * 0.15),
                    },
                  ]}
                />
              </View>
              <Text style={styles.level}>{`L${level}`}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: withAlpha(deepSpace.accent, 0.24),
    borderRadius: 12,
    backgroundColor: deepSpace.card,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: m3.type.titleSmall.size, lineHeight: m3.type.titleSmall.line, fontWeight: "600", color: m3.color.onSurface },
  dismiss: { fontSize: m3.type.labelSmall.size, lineHeight: m3.type.labelSmall.line, color: m3.color.onSurfaceVariant },
  sub: { fontSize: m3.type.bodySmall.size, lineHeight: m3.type.bodySmall.line, color: m3.color.onSurfaceVariant },
  rows: { marginTop: spacing.xs, gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  // 이름 칸만 고정폭이다. 막대가 남은 폭을 flex 로 나눠 가져야 좁은 화면에서 안 넘친다.
  name: { width: 68, fontSize: m3.type.bodySmall.size, lineHeight: m3.type.bodySmall.line, color: m3.color.onSurface },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: withAlpha(deepSpace.accent, 0.1), overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
  level: { width: 22, textAlign: "right", fontSize: m3.type.labelSmall.size, lineHeight: m3.type.labelSmall.line, color: m3.color.onSurfaceVariant },
});
