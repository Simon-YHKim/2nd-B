// S-03 위젯 관리(PS-DASH-001 v2.2). 2쪽 끝 '+ 위젯 추가'에서 열린다.
//
// 화면에 없는 부품을 보여 준다. 잠긴 것은 점선 + 잠긴 이유 + [연동 화면], 숨긴 맞춤 위젯 · 정지한 틀은
// [다시 켜기]. 순서 바꾸기 · 숨기기는 계약이 받을 수 있다고 할 때(canReorder)만 보인다 - 저장할 곳이
// 없는데 버튼만 두지 않는다. 판단은 계약(shelf)이 하고 이 화면은 그리기만 한다.

import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { Text as BaseText, type TextProps } from "@/components/ui/Text";
import { partsOnPage, type BoardContract, type BoardText } from "@/lib/dashboard/board/contract";
import { boardTone } from "@/lib/dashboard/board/tone";
import { m3 } from "@/lib/theme/m3";

export interface ShelfEvents {
  go: (route: string) => void;
  show: (id: string) => void;
  hide: (id: string) => void;
  move: (id: string, direction: "up" | "down") => void;
}

function Text({ style, ...rest }: TextProps) {
  return <BaseText {...rest} style={[styles.text, style]} />;
}

function Button({ label, glyph, onPress }: { label: string; glyph?: "expand_less" | "expand_more" | "visibility_off"; onPress: () => void }) {
  return <PixelPressable onPress={onPress} accessibilityLabel={label} contentStyle={styles.button}>
    {glyph ? <PixelGlyph name={glyph} size={16} color={m3.color.onSurface} /> : null}
    <Text variant="caption">{label}</Text>
  </PixelPressable>;
}

export function BoardShelf({ board, events }: { board: BoardContract; events: ShelfEvents }) {
  const { t } = useTranslation("ops");
  const say = (value: BoardText) => "text" in value ? value.text : t(value.key, value.params);
  const onScreen = [...partsOnPage(board, 1), ...partsOnPage(board, 2)];
  return <View testID="board-shelf" style={styles.page}>
    {board.shelf.canReorder ? <View style={styles.section}>
      <Text variant="body" accessibilityRole="header">{t("phone.board.shelf.onScreen")}</Text>
      {onScreen.map((part) => {
        const title = t(`phone.board.shelf.parts.${PART_KEYS[part.id]}`);
        return <View key={part.id} style={[styles.item, { borderColor: boardTone(part.basis).border, borderStyle: boardTone(part.basis).borderStyle }]}>
          <Text variant="body" style={styles.flex}>{title}</Text>
          <View style={styles.actions}>
            <Button label={t("phone.board.shelf.moveUp", { name: title })} glyph="expand_less" onPress={() => events.move(part.id, "up")} />
            <Button label={t("phone.board.shelf.moveDown", { name: title })} glyph="expand_more" onPress={() => events.move(part.id, "down")} />
            <Button label={t("phone.board.shelf.hide", { name: title })} glyph="visibility_off" onPress={() => events.hide(part.id)} />
          </View>
        </View>;
      })}
    </View> : null}
    <View style={styles.section}>
      <Text variant="body" accessibilityRole="header">{t("phone.board.shelf.offScreen")}</Text>
      {board.shelf.items.length ? board.shelf.items.map((item) => {
        const tone = boardTone(item.basis);
        return <View key={item.id} style={[styles.item, { borderColor: tone.border, borderStyle: tone.borderStyle }]}>
          <View style={styles.flex}>
            <Text variant="body">{say(item.title)}</Text>
            <Text variant="caption" style={{ color: tone.text }}>{say(item.reason)}</Text>
          </View>
          {item.action ? <Button label={say(item.action.label)} onPress={() => events.go(item.action!.route)} /> : null}
          {item.canShow ? <Button label={t("phone.board.shelf.show")} onPress={() => events.show(item.id)} /> : null}
        </View>;
      }) : <Text variant="caption" style={styles.muted}>{t("phone.board.shelf.allOnScreen")}</Text>}
    </View>
  </View>;
}

const PART_KEYS = {
  "P-01": "clock", "P-02": "note", "P-03": "reminders", "P-04": "queue", "P-06": "health", "P-07": "spend", "P-08": "changes", "P-09": "custom",
} as const;

const styles = StyleSheet.create({
  text: { color: m3.color.onSurface },
  page: { gap: 14 },
  section: { gap: 8 },
  item: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, borderWidth: 1, padding: 10, backgroundColor: m3.color.surfaceContainer },
  flex: { flex: 1, minWidth: 120, gap: 2 },
  muted: { color: m3.color.onSurfaceVariant },
  actions: { flexDirection: "row", gap: 6 },
  button: { minHeight: 44, minWidth: 44, flexDirection: "row", gap: 4, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
});
