// S-03 위젯 관리(PS-DASH-001 v2.2). 2쪽 끝 '+ 위젯 추가'에서 열린다.
//
// 화면에 없는 부품을 보여 준다. 잠긴 것은 잠긴 이유 + [연동 화면], 숨긴 맞춤 위젯 · 정지한 틀은 [다시 켜기].
// 순서 바꾸기 · 숨기기는 계약이 받을 수 있다고 할 때(canReorder)만 보인다 - 저장할 곳이 없는데 버튼만 두지
// 않는다. 판단은 계약(shelf)이 하고 이 화면은 그리기만 한다. 모양은 iOS 설정식 묶음 목록(픽셀 아이폰).

import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { partsOnPage, type BoardContract, type BoardText } from "@/lib/dashboard/board/contract";
import { boardTone } from "@/lib/dashboard/board/tone";
import { phoneIos } from "@/lib/theme/phone-ios";
import { IosButton, IosGroup, IosLead, IosRow, IosSectionHeader, IosText } from "./IosParts";

export interface ShelfEvents {
  go: (route: string) => void;
  show: (id: string) => void;
  hide: (id: string) => void;
  move: (id: string, direction: "up" | "down") => void;
}

function Button({ label, glyph, onPress }: { label: string; glyph?: "expand_less" | "expand_more" | "visibility_off"; onPress: () => void }) {
  return <IosButton label={label} glyph={glyph} onPress={onPress} />;
}

export function BoardShelf({ board, events }: { board: BoardContract; events: ShelfEvents }) {
  const { t } = useTranslation("ops");
  const say = (value: BoardText) => "text" in value ? value.text : t(value.key, value.params);
  const onScreen = [...partsOnPage(board, 1), ...partsOnPage(board, 2)];
  return <View testID="board-shelf" style={styles.page}>
    {board.shelf.canReorder ? <View style={styles.section}>
      <IosSectionHeader>{t("phone.board.shelf.onScreen")}</IosSectionHeader>
      <IosGroup>
        {onScreen.map((part) => {
          const title = t(`phone.board.shelf.parts.${PART_KEYS[part.id]}`);
          return <IosRow key={part.id} title={title} trailing={<View style={styles.actions}>
            <Button label={t("phone.board.shelf.moveUp", { name: title })} glyph="expand_less" onPress={() => events.move(part.id, "up")} />
            <Button label={t("phone.board.shelf.moveDown", { name: title })} glyph="expand_more" onPress={() => events.move(part.id, "down")} />
            <Button label={t("phone.board.shelf.hide", { name: title })} glyph="visibility_off" onPress={() => events.hide(part.id)} />
          </View>} />;
        })}
      </IosGroup>
    </View> : null}
    <View style={styles.section}>
      <IosSectionHeader>{t("phone.board.shelf.offScreen")}</IosSectionHeader>
      {board.shelf.items.length ? <IosGroup>
        {board.shelf.items.map((item) => {
          const tone = boardTone(item.basis);
          return <View key={item.id} style={styles.item}>
            <IosLead color={tone.borderStyle === "dashed" ? phoneIos.label2 : phoneIos.teal} glyph={tone.borderStyle === "dashed" ? "lock" : "star"} />
            <View style={styles.flex}>
              <IosText variant="body">{say(item.title)}</IosText>
              <IosText variant="caption" style={{ color: tone.text }}>{say(item.reason)}</IosText>
            </View>
            {item.action ? <Button label={say(item.action.label)} onPress={() => events.go(item.action!.route)} /> : null}
            {item.canShow ? <Button label={t("phone.board.shelf.show")} onPress={() => events.show(item.id)} /> : null}
          </View>;
        })}
      </IosGroup> : <IosText variant="caption" style={styles.muted}>{t("phone.board.shelf.allOnScreen")}</IosText>}
    </View>
  </View>;
}

const PART_KEYS = {
  "P-01": "clock", "P-02": "note", "P-03": "reminders", "P-04": "queue", "P-06": "health", "P-07": "spend", "P-08": "changes", "P-09": "custom",
} as const;

const styles = StyleSheet.create({
  page: { gap: 14 },
  section: { gap: 4 },
  item: { minHeight: 44, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  flex: { flex: 1, minWidth: 120, gap: 2 },
  muted: { color: phoneIos.label2, paddingHorizontal: 14 },
  actions: { flexDirection: "row", gap: 2 },
});
