// 하루 관리판(PS-DASH-001 v2.2) 부품 화면.
//
// 이 파일은 계약(src/lib/dashboard/board/contract.ts)을 그리기만 한다. 표시 여부 · 순서 · 색은
// 계약 값(visible · order · basis)만 읽고 여기서 정하지 않는다(완료조건 5). LLM 이나 서버
// 프롬프트를 부르지 않는다(완료조건 6). 위젯은 보기 + 바로가기만 한다.
//
// 버튼(했어요 · 나중에 · 추가 · 무시 · 넣기 · 만들기 …)은 화면 상태만 바꾸고 그 사실을 부모에게
// 알린다. 저장은 W0 계약이 붙을 때 그쪽이 한다.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PanResponder, Pressable, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelRoundRect } from "@/components/pixel/PixelRoundRect";
import { Text as BaseText, type TextProps } from "@/components/ui/Text";
import {
  partsOnPage, type BoardAction, type BoardBasis, type BoardContract, type BoardPage, type BoardPart, type BoardText,
  type ChangesPart, type ClockPart, type CustomPart, type CustomWidget, type HealthPart, type NotePart, type QueuePart,
  type RemindersPart, type SpendPart,
} from "@/lib/dashboard/board/contract";
import { boardTone } from "@/lib/dashboard/board/tone";
import { phoneIos } from "@/lib/theme/phone-ios";
import { IosButton } from "./IosParts";
import { WeatherGlyph, WeatherPin } from "./WeatherGlyph";

/** 부모(DashboardPhone)가 받는 사건. 이동은 폰 안에서 한다. */
export interface BoardEvents {
  weather?: (mode: "consent" | "settings" | "source") => void;
  go: (route: string) => void;
  /** P-02 를 누르면 S-01(하루 요약). */
  openSummary: () => void;
  suggestion: (id: string, choice: "add" | "dismiss") => void;
  queue: (id: string, choice: "done" | "later" | "notImportant") => void;
  spend: (id: string, choice: "add" | "reject") => void;
  custom: (id: string, choice: "make" | "skip" | "hide") => void;
}

// 폰 화면은 픽셀 아이폰(iOS 밝은 기본, Simon 2026-10-07)이다. 앱 테마의 글자색을 물려받지 않는다.
function Text({ style, ...rest }: TextProps) {
  return <BaseText {...rest} style={[styles.text, style]} />;
}

function useBoardText() {
  const { t } = useTranslation("ops");
  return (value: BoardText) => "text" in value ? value.text : t(value.key, value.params);
}

/** iOS 위젯: 계단 모서리 칸. 잠김은 회색 칸 안에 점선 테두리. */
function Frame({ basis, shape, children, label }: { basis: BoardBasis; shape: "row" | "card"; children: ReactNode; label?: string }) {
  const tone = boardTone(basis);
  return <PixelRoundRect fill={tone.fill} accessibilityLabel={label} style={[styles.frame, shape === "card" ? styles.card : styles.row]}>
    {tone.borderStyle === "dashed" ? <View pointerEvents="none" style={[styles.dashed, { borderColor: tone.border }]} /> : null}
    {children}
  </PixelRoundRect>;
}

function ActionButton({ action, onPress }: { action: BoardAction; onPress: (route: string) => void }) {
  const say = useBoardText();
  return <IosButton label={say(action.label)} onPress={() => onPress(action.route)} />;
}

function ChoiceButton({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return <IosButton label={label} onPress={onPress} primary={primary} />;
}

/** 빈 상태 · 잠김: 문장 하나 + 버튼 하나. */
function Note({ part, go }: { part: BoardPart; go: (route: string) => void }) {
  const say = useBoardText();
  const tone = boardTone(part.basis);
  if (!part.note) return null;
  return <View style={styles.noteRow}>
    {part.basis === "locked" ? <PixelGlyph name="lock" size={16} color={tone.text} /> : null}
    <Text variant="caption" style={[styles.flex, { color: tone.text }]}>{say(part.note)}</Text>
    {part.action ? <ActionButton action={part.action} onPress={go} /> : null}
  </View>;
}

/** AI 문장 옆의 근거 링크(누르면 원문). */
function Evidence({ route, basis, go }: { route: string | null; basis: BoardBasis; go: (route: string) => void }) {
  const { t } = useTranslation("ops");
  if (!route) return null;
  return <Pressable accessibilityRole="link" accessibilityLabel={t("phone.board.evidence")} onPress={() => go(route)} style={styles.evidence}>
    <PixelGlyph name="description" size={16} color={boardTone(basis).text} />
  </Pressable>;
}

function ClockRow({ part, go, openWeather }: { part: ClockPart; go: (route: string) => void; openWeather?: BoardEvents["weather"] }) {
  const { t, i18n } = useTranslation("ops");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const time = now.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit", hour12: false });
  const day = now.toLocaleDateString(i18n.language, { month: "long", day: "numeric", weekday: "long" });
  // 날씨는 그림 하나 + 기온 하나. 설명 문구 없이, 읽기 이름만 "맑음, 18도" 처럼 짧게.
  const weather = part.weather;
  const temp = weather?.tempC != null ? Math.round(weather.tempC) : null;
  const sky = weather ? [t(`phone.board.clock.sky.${weather.sky}`), temp != null ? t("phone.board.clock.temp", { temp }) : null].filter(Boolean).join(", ") : null;
  const line = [time, day].join(" · ");
  const body = <View style={styles.clockRow}>
    <Text variant="body" style={[styles.clock, styles.flex]}>{line}</Text>
    {part.weatherAction ? <Pressable style={styles.weatherTap} accessibilityRole="button" accessibilityLabel={t("phone.board.weather.title")} onPress={() => openWeather?.(part.weatherAction!)}>
      <WeatherPin />
    </Pressable> : null}
    {weather ? <Pressable accessible accessibilityRole="button" accessibilityLabel={sky ?? undefined} style={[styles.sky, styles.weatherTap]} onPress={() => openWeather?.("source")}>
      <WeatherGlyph sky={weather.sky} size={24} />
      {temp != null ? <Text variant="body" style={styles.clock}>{`${temp}°`}</Text> : null}
    </Pressable> : null}
  </View>;
  return <Frame basis={part.basis} shape={part.shape}>
    {part.forecastRoute ? <Pressable accessibilityRole="button" accessibilityLabel={[line, sky].filter(Boolean).join(" · ")} onPress={() => go(part.forecastRoute!)} style={styles.tapRow}>{body}</Pressable> : body}
    <Note part={part} go={go} />
  </Frame>;
}

function NoteRow({ part, events }: { part: NotePart; events: BoardEvents }) {
  const { t } = useTranslation("ops");
  const say = useBoardText();
  const tone = boardTone(part.basis);
  return <Frame basis={part.basis} shape={part.shape}>
    <Pressable testID="board-note-open" accessibilityRole="button" accessibilityLabel={t("phone.board.summary.titleDefault")}
      onPress={events.openSummary} style={styles.inline}>
      <PixelGlyph name="chat" size={16} color={part.line ? tone.text : phoneIos.blue} />
      <Text variant="caption" style={[styles.flex, styles.sectionTitle]}>{t("phone.board.shelf.parts.note")}</Text>
      <PixelGlyph name="chevron_right" size={16} color={phoneIos.blue} />
    </Pressable>
    {part.line ? <View style={styles.inline}>
      <Pressable accessibilityRole="button" accessibilityHint={t("phone.board.note.tapHint")} onPress={events.openSummary} style={[styles.flex, styles.tapRow]}>
        <Text variant="caption" style={styles.muted}>{t(`phone.board.note.slot.${part.slot}`)}</Text>
        <Text variant="body" style={{ color: tone.text }}>{say(part.line)}</Text>
      </Pressable>
      <Evidence route={part.evidenceRoute} basis={part.basis} go={events.go} />
    </View> : null}
    <Note part={part} go={events.go} />
  </Frame>;
}

const DAY_KEYS = { [-1]: "yesterday", 0: "today", 1: "tomorrow", 2: "dayAfter" } as const;

function RemindersCard({ part, events }: { part: RemindersPart; events: BoardEvents }) {
  const { t } = useTranslation("ops");
  const say = useBoardText();
  const [index, setIndex] = useState<number>(part.startDay);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const last = Math.max(0, part.days.length - 1);
  const step = (delta: number) => setIndex((current) => Math.min(last, Math.max(0, current + delta)));
  // 카드 안의 좌우 넘김은 이 카드가 가진다(바깥의 쪽 넘김보다 먼저 묻는다).
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 20 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: (_event, gesture) => { if (Math.abs(gesture.dx) > 40) step(gesture.dx < 0 ? 1 : -1); },
  }), [last]);
  const day = part.days[index];
  if (!day) return <Frame basis={part.basis} shape={part.shape}><Note part={part} go={events.go} /></Frame>;
  const dayName = t(`phone.board.reminders.days.${DAY_KEYS[day.offset]}`);
  const suggestions = part.suggestions.filter((item) => !dismissed.includes(item.id));
  return <Frame basis={part.basis} shape={part.shape}>
    <View {...swipe.panHandlers} testID="board-reminders" style={styles.stack}>
      <View style={styles.dayHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("phone.board.reminders.previous")} disabled={index === 0} onPress={() => step(-1)} style={styles.dayArrow}>
          {index > 0 ? <PixelGlyph name="arrow_back" size={16} color={phoneIos.blue} /> : null}
        </Pressable>
        <Text variant="body" accessibilityRole="header" style={[styles.flexCenter, styles.remindersTitle]}>{`${t("phone.board.reminders.title")} · ${dayName}`}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t("phone.board.reminders.next")} disabled={index === last} onPress={() => step(1)} style={styles.dayArrow}>
          {index < last ? <PixelGlyph name="arrow_forward" size={16} color={phoneIos.blue} /> : null}
        </Pressable>
      </View>
      {day.items.length ? day.items.map((item) => <Pressable key={item.id} disabled={!item.route} accessibilityRole="button"
        accessibilityLabel={[item.time, item.title, t(`phone.board.reminders.status.${item.status}`)].filter(Boolean).join(", ")}
        onPress={() => item.route && events.go(item.route)} style={styles.item}>
        <View style={styles.inline}>
          <View style={[styles.ring, item.status === "done" && styles.ringDone]} />
          <Text variant="caption" style={item.status === "upcoming" ? styles.time : styles.muted}>{item.time ?? t("phone.board.reminders.anytime")}</Text>
          <Text variant="body" style={[styles.flex, item.status !== "upcoming" && styles.muted]}>{item.title}</Text>
          {item.status !== "upcoming" ? <Text variant="caption" style={styles.muted}>{t(`phone.board.reminders.status.${item.status}`)}</Text> : null}
        </View>
        {item.reason ? <Text variant="caption" numberOfLines={1} style={styles.muted}>{item.reason}</Text> : null}
        {item.alarmAt ? <Text variant="caption" style={styles.muted}>{t("phone.board.reminders.alarm", { time: item.alarmAt })}</Text> : null}
      </Pressable>) : <Text variant="caption" style={styles.muted}>{say(day.empty)}</Text>}
      {suggestions.slice(0, 2).map((item) => <PixelRoundRect key={item.id} corner="small" fill={boardTone(item.basis).fill} border={boardTone(item.basis).border} style={styles.suggestion}>
        <View style={styles.inline}>
          <Text variant="caption" style={[styles.flex, { color: boardTone(item.basis).text }]}>{say(item.line)}</Text>
          <Evidence route={item.evidenceRoute} basis={item.basis} go={events.go} />
        </View>
        <View style={styles.actions}>
          <ChoiceButton primary label={t("phone.board.reminders.add")} onPress={() => events.suggestion(item.id, "add")} />
          <ChoiceButton label={t("phone.board.reminders.dismiss")} onPress={() => { setDismissed((ids) => [...ids, item.id]); events.suggestion(item.id, "dismiss"); }} />
        </View>
      </PixelRoundRect>)}
    </View>
  </Frame>;
}

function QueueRow({ part, events }: { part: QueuePart; events: BoardEvents }) {
  const { t } = useTranslation("ops");
  const say = useBoardText();
  const [handled, setHandled] = useState<string[]>([]);
  const items = part.items.slice(0, 3);
  const current = items.find((item) => !handled.includes(item.id));
  const handle = (choice: "done" | "later" | "notImportant") => {
    if (!current) return;
    setHandled((ids) => [...ids, current.id]);
    events.queue(current.id, choice);
  };
  return <Frame basis={part.basis} shape={part.shape}>
    {!current && !items.length ? <View style={styles.inline}>
      <PixelGlyph name="check_circle" size={16} color={phoneIos.blue} />
      <Text variant="caption" style={styles.sectionTitle}>{t("phone.board.shelf.parts.queue")}</Text>
    </View> : null}
    {current ? <View style={styles.stack}>
      <View style={styles.inline}>
        <Text variant="caption" style={styles.muted}>{t("phone.board.queue.title", { index: handled.length + 1, total: items.length })}</Text>
        <PixelRoundRect corner="small" fill={phoneIos.fill} style={styles.chip}><Text variant="caption" style={styles.muted}>{t(`phone.board.queue.sources.${current.source}`)}</Text></PixelRoundRect>
      </View>
      <View style={styles.inline}>
        <Text variant="body" style={[styles.flex, { color: boardTone(current.basis).text }]}>{say(current.line)}</Text>
        <Evidence route={current.evidenceRoute} basis={current.basis} go={events.go} />
      </View>
      <View style={styles.actions}>
        <ChoiceButton label={t("phone.board.queue.done")} onPress={() => handle("done")} />
        <ChoiceButton label={t("phone.board.queue.later")} onPress={() => handle("later")} />
        <ChoiceButton label={t("phone.board.queue.notImportant")} onPress={() => handle("notImportant")} />
      </View>
    </View> : items.length ? <Text variant="caption" style={styles.muted}>{t("phone.board.queue.empty")}</Text> : null}
    <Note part={part} go={events.go} />
  </Frame>;
}

function HealthCard({ part, go }: { part: HealthPart; go: (route: string) => void }) {
  const { t, i18n } = useTranslation("ops");
  const say = useBoardText();
  const syncedAt = part.source ? new Date(part.source.syncedAt) : null;
  return <Frame basis={part.basis} shape={part.shape}>
    <Text variant="body" accessibilityRole="header">{t("phone.board.health.title")}</Text>
    {part.metrics.length ? <View style={styles.metrics}>{part.metrics.map((item) => <View key={item.metric} style={styles.metric}>
      <Text variant="caption" style={styles.muted}>{t(`phone.board.health.metrics.${item.metric}`)}</Text>
      <Text variant="body" style={styles.figure}>{item.unit === "count" ? item.value.toLocaleString(i18n.language) : t("phone.board.health.minutes", { value: item.value.toLocaleString(i18n.language) })}</Text>
    </View>)}</View> : null}
    {part.comparison ? <Text variant="caption" style={{ color: boardTone(part.basis).text }}>{say(part.comparison)}</Text> : null}
    <Note part={part} go={go} />
    {part.source && syncedAt && Number.isFinite(syncedAt.getTime()) ? <Text variant="caption" style={styles.muted}>
      {t("phone.board.health.synced", { source: say(part.source.name), time: syncedAt.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit", hour12: false }) })}
    </Text> : null}
  </Frame>;
}

function SpendRow({ part, events }: { part: SpendPart; events: BoardEvents }) {
  const { t } = useTranslation("ops");
  const say = useBoardText();
  const [answered, setAnswered] = useState(false);
  return <Frame basis={part.basis} shape={part.shape}>
    {part.monthTotal ? <Pressable accessibilityRole="button" onPress={() => events.go("/ledger")} style={styles.tapRow}>
      <Text variant="caption" style={styles.muted}>{t("phone.board.spend.title")}</Text>
      <Text variant="body">{say(part.monthTotal)}</Text>
    </Pressable> : null}
    {part.pending && !answered ? <View style={styles.stack}>
      <Text variant="caption" style={{ color: boardTone(part.basis).text }}>{say(part.pending.line)}</Text>
      <View style={styles.actions}>
        <ChoiceButton label={t("phone.board.spend.add")} onPress={() => { setAnswered(true); events.spend(part.pending!.id, "add"); }} />
        <ChoiceButton label={t("phone.board.spend.reject")} onPress={() => { setAnswered(true); events.spend(part.pending!.id, "reject"); }} />
      </View>
    </View> : null}
    <Note part={part} go={events.go} />
  </Frame>;
}

function ChangesCard({ part, go }: { part: ChangesPart; go: (route: string) => void }) {
  const { t } = useTranslation("ops");
  const say = useBoardText();
  return <Frame basis={part.basis} shape={part.shape}>
    <Text variant="body" accessibilityRole="header">{t("phone.board.changes.title")}</Text>
    {part.lines.slice(0, 3).map((line, index) => <Text key={index} variant="caption" style={{ color: boardTone(part.basis).text }}>{say(line)}</Text>)}
    <Note part={part} go={go} />
  </Frame>;
}

function WidgetTile({ widget, events, onLongPress }: { widget: CustomWidget; events: BoardEvents; onLongPress?: () => void }) {
  const say = useBoardText();
  const title = say(widget.title);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${say(widget.line)}`} onPress={() => events.go(widget.route)}
    onLongPress={onLongPress} delayLongPress={500} style={styles.tapRow}>
    <Text variant="body">{title}</Text>
    <Text variant="caption" style={styles.muted}>{say(widget.line)}</Text>
  </Pressable>;
}

function CustomRow({ part, events }: { part: CustomPart; events: BoardEvents }) {
  const { t } = useTranslation("ops");
  const say = useBoardText();
  const [index, setIndex] = useState(0);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [suggestionDone, setSuggestionDone] = useState(false);
  const widgets = part.widgets.filter((widget) => !hiddenIds.includes(widget.id));
  const at = Math.min(index, Math.max(0, widgets.length - 1));
  const widget = widgets[at];
  return <Frame basis={part.basis} shape={part.shape}>
    {widget ? <View style={styles.inline}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("phone.board.custom.previous")} disabled={at === 0} onPress={() => setIndex(at - 1)} style={styles.dayArrow}>
        {at > 0 ? <PixelGlyph name="arrow_back" size={16} color={phoneIos.blue} /> : null}
      </Pressable>
      <View style={styles.flex}><WidgetTile widget={widget} events={events} onLongPress={() => { setHiddenIds((ids) => [...ids, widget.id]); events.custom(widget.id, "hide"); }} /></View>
      <Pressable accessibilityRole="button" accessibilityLabel={t("phone.board.custom.next")} disabled={at >= widgets.length - 1} onPress={() => setIndex(at + 1)} style={styles.dayArrow}>
        {at < widgets.length - 1 ? <PixelGlyph name="arrow_forward" size={16} color={phoneIos.blue} /> : null}
      </Pressable>
    </View> : null}
    {part.suggestion && !suggestionDone ? <PixelRoundRect corner="small" fill={boardTone(part.suggestion.basis).fill} border={boardTone(part.suggestion.basis).border} style={styles.suggestion}>
      <Text variant="caption" style={{ color: boardTone(part.suggestion.basis).text }}>{say(part.suggestion.line)}</Text>
      <View style={styles.actions}>
        <ChoiceButton primary label={t("phone.board.custom.make")} onPress={() => { setSuggestionDone(true); events.custom(part.suggestion!.id, "make"); }} />
        <ChoiceButton label={t("phone.board.custom.skip")} onPress={() => { setSuggestionDone(true); events.custom(part.suggestion!.id, "skip"); }} />
      </View>
    </PixelRoundRect> : null}
    <Note part={part} go={events.go} />
  </Frame>;
}

function PartView({ part, events }: { part: BoardPart; events: BoardEvents }) {
  switch (part.id) {
    case "P-01": return <ClockRow part={part} go={events.go} openWeather={events.weather} />;
    case "P-02": return <NoteRow part={part} events={events} />;
    case "P-03": return <RemindersCard part={part} events={events} />;
    case "P-04": return <QueueRow part={part} events={events} />;
    case "P-06": return <HealthCard part={part} go={events.go} />;
    case "P-07": return <SpendRow part={part} events={events} />;
    case "P-08": return <ChangesCard part={part} go={events.go} />;
    case "P-09": return <CustomRow part={part} events={events} />;
  }
}

/** 한 쪽. 1쪽 = 오늘 처리할 것, 2쪽 = 상태 + 승인한 맞춤 위젯 + '+ 위젯 추가'. */
export function BoardPageView({ board, page, events }: { board: BoardContract; page: BoardPage; events: BoardEvents }) {
  const { t } = useTranslation("ops");
  // '+ 위젯 추가' 는 늘 점선(잠김 모양)이다.
  const addTone = boardTone("locked");
  return <View testID={`board-page-${page}`} style={styles.page}>
    {partsOnPage(board, page).map((part) => <PartView key={part.id} part={part} events={events} />)}
    {page === 2 ? <>
      {board.approved.map((widget) => <Frame key={widget.id} basis={widget.basis} shape="card"><WidgetTile widget={widget} events={events} /></Frame>)}
      <Pressable accessibilityRole="button" accessibilityLabel={t("phone.board.addWidget")} onPress={() => events.go(board.addWidgetRoute)}>
        <PixelRoundRect fill={addTone.fill} style={[styles.frame, styles.row, styles.addSlot]}>
          <View pointerEvents="none" style={[styles.dashed, { borderColor: addTone.border }]} />
          <PixelGlyph name="add" size={18} color={addTone.text} />
          <Text variant="body" style={styles.muted}>{t("phone.board.addWidget")}</Text>
        </PixelRoundRect>
      </Pressable>
    </> : null}
  </View>;
}


const styles = StyleSheet.create({
  sectionTitle: { fontFamily: "Galmuri11Bold", color: phoneIos.label },
  weatherTap: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  text: { color: phoneIos.label },
  page: { gap: 10 },
  frame: { paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  row: { minHeight: 56 },
  card: { minHeight: 112 },
  dashed: { position: "absolute", top: 4, right: 4, bottom: 4, left: 4, borderWidth: 2, borderStyle: "dashed" },
  stack: { gap: 6 },
  inline: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1, flexShrink: 1 },
  flexCenter: { flex: 1, flexShrink: 1, textAlign: "center" },
  muted: { color: phoneIos.label2 },
  time: { color: phoneIos.label, minWidth: 40 },
  clock: { fontVariant: ["tabular-nums"], fontFamily: "Galmuri11Bold" },
  clockRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sky: { flexDirection: "row", alignItems: "center", gap: 4 },
  figure: { fontFamily: "Galmuri11Bold" },
  remindersTitle: { color: phoneIos.orange, fontFamily: "Galmuri11Bold" },
  tapRow: { minHeight: 44, justifyContent: "center", gap: 2 },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  actions: { flexDirection: "row", flexWrap: "wrap", columnGap: 6 },
  evidence: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  dayHeader: { flexDirection: "row", alignItems: "center" },
  dayArrow: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  item: { minHeight: 44, justifyContent: "center", gap: 2, paddingVertical: 2 },
  ring: { width: 12, height: 12, borderWidth: 2, borderColor: phoneIos.gray3 },
  ringDone: { borderColor: phoneIos.blue, backgroundColor: phoneIos.blue },
  suggestion: { paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  chip: { paddingHorizontal: 8, paddingVertical: 1 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metric: { minWidth: 64, gap: 2 },
  addSlot: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 56 },
});
