import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";
import { PlainText as Text } from "@/components/ui/PlainText";
import { Redirect, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useTranslation } from "react-i18next";
import Svg, { Rect, SvgXml } from "react-native-svg";

import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PremiumLoadingState } from "@/components/premium";
import { PixelPressable, PixelSurface } from "@/components/pixel";
import { useAuth } from "@/lib/auth/AuthContext";
import { useAppRouter, useHardwareBack, usePhoneEmbed } from "@/lib/nav/phone-embed";
import { useGoHomeStop } from "@/lib/nav/go-home";
import { captureAccountOwnerLease } from "@/lib/auth/account-epoch";
import { DEFAULT_AVATAR_SPEC, renderAvatarSvg } from "@/lib/avatar";
import {
  AVATAR_PALETTE_GALLERY_LIMIT,
  deleteAvatarPaletteItem,
  listAvatarPaletteItems,
  saveAvatarPaletteItem,
  type AvatarPaletteItem,
} from "@/lib/avatar-palette/gallery";
import {
  AVATAR_PALETTE_GRID,
  AVATAR_PALETTE_MAX_OPAQUE_PIXELS,
  AVATAR_PALETTE,
  AVATAR_PALETTE_SLOTS,
  EMPTY_PIXELS,
  countOpaquePixels,
  pixelsToRects,
  setPixel,
  type AvatarPaletteSlot,
} from "@/lib/avatar-palette/pixels";
import { m3 } from "@/lib/theme/m3";

type Origin = { x: number; y: number };
type Snapshot = { slot: AvatarPaletteSlot; title: string; pixels: string };
type PendingTransition = { kind: "new" } | { kind: "open"; id: string } | { kind: "gallery" } | { kind: "exit" };
type ViewMode = "gallery" | "editor";
type ReadState = "idle" | "loading" | "ready" | "error";
const ZOOMS = [1, 2, 4] as const;
type Zoom = typeof ZOOMS[number];

function cellWindow(zoom: Zoom): number { return AVATAR_PALETTE_GRID / zoom; }
function clampOrigin(origin: Origin, zoom: Zoom): Origin {
  const max = AVATAR_PALETTE_GRID - cellWindow(zoom);
  return { x: Math.max(0, Math.min(max, origin.x)), y: Math.max(0, Math.min(max, origin.y)) };
}

/** Bounded row runs keep the editor's SVG tree small while drawing. */
function PixelLayer({ pixels, size, origin, cells }: {
  pixels: string; size: number; origin?: Origin; cells?: number;
}) {
  const rects = useMemo(() => pixelsToRects(pixels), [pixels]);
  const x = origin?.x ?? 0;
  const y = origin?.y ?? 0;
  const viewSize = cells ?? AVATAR_PALETTE_GRID;
  const visibleRects = useMemo(
    () => rects.filter(([rx, ry, width, height]) =>
      rx < x + viewSize && ry < y + viewSize && rx + width > x && ry + height > y),
    [rects, x, y, viewSize],
  );
  return (
    <Svg width={size} height={size} viewBox={`${x} ${y} ${viewSize} ${viewSize}`} pointerEvents="none">
      {visibleRects.map(([rx, ry, width, height, color], index) => (
        <Rect key={`${ry}:${rx}:${index}`} x={rx} y={ry} width={width} height={height} fill={color} />
      ))}
    </Svg>
  );
}

function ActionButton({ label, onPress, disabled = false, selected = false }: {
  label: string; onPress: () => void; disabled?: boolean; selected?: boolean;
}) {
  return (
    <PixelPressable
      onPress={onPress}
      disabled={disabled}
      variant={selected ? "inset" : "bevel"}
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      contentStyle={styles.buttonContent}
    >
      <Text style={[styles.buttonText, selected && styles.accent]}>{label}</Text>
    </PixelPressable>
  );
}

export default function AvatarPaletteScreen() {
  const { t, i18n } = useTranslation(["avatarPalette", "common"]);
  // Inside the dashboard phone: navigate the phone, and size the canvas to
  // the phone's display, not the window (the shell there has no side gutter).
  const router = useAppRouter();
  const embed = usePhoneEmbed();
  const { width: windowWidth } = useWindowDimensions();
  const width = embed?.displayWidth ?? windowWidth;
  const navigation = useNavigation();
  const { userId, hasProfile, profileProbeFailed, loading: authLoading, refresh: refreshAuth } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [items, setItems] = useState<AvatarPaletteItem[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [slot, setSlot] = useState<AvatarPaletteSlot>("hair");
  const [pixels, setPixels] = useState(EMPTY_PIXELS);
  const pixelsRef = useRef(EMPTY_PIXELS);
  const undoPixelsRef = useRef<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<AvatarPaletteItem | null>(null);
  const lastCellRef = useRef(-1);
  const [colorIndex, setColorIndex] = useState<number | null>(0);
  const [zoom, setZoom] = useState<Zoom>(2);
  const [origin, setOrigin] = useState<Origin>({ x: 16, y: 0 });
  const [grid, setGrid] = useState(true);
  const [showBase, setShowBase] = useState(true);
  const [preview, setPreview] = useState(false);
  const [title, setTitle] = useState("");
  const [saved, setSaved] = useState<Snapshot>({ slot: "hair", title: "", pixels: EMPTY_PIXELS });
  const [readOwnerId, setReadOwnerId] = useState<string | null>(null);
  const [readState, setReadState] = useState<ReadState>("idle");
  const [readRetry, setReadRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingTransition, setPendingTransition] = useState<PendingTransition | null>(null);
  const [allowExit, setAllowExit] = useState(false);
  const [exitOwnerId, setExitOwnerId] = useState<string | null>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);
  const exitTriggeredRef = useRef(false);
  const currentUserRef = useRef(userId);
  currentUserRef.current = userId;

  const ready = readState === "ready" && readOwnerId === userId;
  const dirty = hasProfile === true && ready && viewMode === "editor" &&
    (slot !== saved.slot || title !== saved.title || pixels !== saved.pixels);
  const canvasSize = Math.max(64, Math.floor(Math.min(width - (embed ? 40 : 80), 384) / 64) * 64);
  const cells = cellWindow(zoom);
  const cellSize = canvasSize / cells;
  const painted = useMemo(() => countOpaquePixels(pixels), [pixels]);
  const baseXml = useMemo(
    () => renderAvatarSvg(DEFAULT_AVATAR_SPEC, canvasSize)
      .replace('viewBox="0 0 64 64"', `viewBox="${origin.x} ${origin.y} ${cells} ${cells}"`),
    [canvasSize, origin.x, origin.y, cells],
  );

  // A device or navigation gesture may remove this route without using our header.
  usePreventRemove(dirty && !allowExit, useCallback(({ data }) => {
    pendingActionRef.current = () => navigation.dispatch(data.action);
    setPendingTransition({ kind: "exit" });
  }, [navigation]));
  // Its exit prompt is drawn in this screen, so a home jump from above must
  // stop here rather than prompt out of sight (gate NS-02).
  useGoHomeStop(() => dirty && !allowExit);

  // The editor's back action returns to the personal gallery. Native swipe-back
  // would remove the route instead, so keep the visible Back control authoritative.
  // Inside the phone `navigation` is the dashboard's: leave its options alone.
  useEffect(() => {
    if (embed) return;
    navigation.setOptions({
      gestureEnabled: viewMode !== "editor",
      headerBackButtonMenuEnabled: false,
    });
  }, [embed, navigation, viewMode]);

  const navigateBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/dashboard");
  }, [router]);

  const goBack = useCallback(() => {
    if (busy) return;
    if (clearConfirm) { setClearConfirm(false); return; }
    if (deleteCandidate) { setDeleteCandidate(null); return; }
    if (pendingTransition) { setPendingTransition(null); pendingActionRef.current = null; return; }
    if (viewMode === "editor") {
      if (dirty) setPendingTransition({ kind: "gallery" });
      else setViewMode("gallery");
      return;
    }
    navigateBack();
  }, [busy, clearConfirm, deleteCandidate, pendingTransition, viewMode, dirty, navigateBack]);

  // Through the phone's claim stack inside the dashboard phone (see useHardwareBack).
  useHardwareBack(useCallback(() => { goBack(); return true; }, [goBack]));

  useEffect(() => {
    setPendingTransition(null);
    setAllowExit(false);
    setExitOwnerId(null);
    setEditingItemId(null);
    setSlot("hair");
    setTitle("");
    pixelsRef.current = EMPTY_PIXELS;
    undoPixelsRef.current = null;
    setPixels(EMPTY_PIXELS);
    setSaved({ slot: "hair", title: "", pixels: EMPTY_PIXELS });
    setCanUndo(false);
    setBusy(false);
    pendingActionRef.current = null;
    exitTriggeredRef.current = false;
  }, [userId]);

  useEffect(() => {
    if (!allowExit || exitOwnerId !== userId || pendingTransition?.kind !== "exit" || exitTriggeredRef.current) return;
    exitTriggeredRef.current = true;
    const action = pendingActionRef.current;
    if (action) action();
    else navigateBack();
  }, [allowExit, exitOwnerId, userId, pendingTransition, navigateBack]);

  useEffect(() => {
    if (!userId || hasProfile !== true) return;
    const owner = userId;
    let active = true;
    setReadOwnerId(owner);
    setReadState("loading");
    setNotice(null);
    setClearConfirm(false);
    setDeleteCandidate(null);
    setItems([]);
    setViewMode("gallery");
    void listAvatarPaletteItems(owner)
      .then((nextItems) => {
        if (!active || currentUserRef.current !== owner) return;
        setItems(nextItems);
        setReadState("ready");
      })
      .catch(() => {
        if (active && currentUserRef.current === owner) setReadState("error");
      });
    return () => { active = false; };
  }, [userId, hasProfile, readRetry]);

  const paintAt = useCallback((event: GestureResponderEvent) => {
    if (busy || !ready || pendingTransition) return;
    const lx = event.nativeEvent.locationX;
    const ly = event.nativeEvent.locationY;
    if (lx < 0 || ly < 0 || lx >= canvasSize || ly >= canvasSize) return;
    const x = origin.x + Math.floor(lx / cellSize);
    const y = origin.y + Math.floor(ly / cellSize);
    const at = y * AVATAR_PALETTE_GRID + x;
    if (at === lastCellRef.current) return;
    lastCellRef.current = at;
    try {
      const next = setPixel(pixelsRef.current, x, y, colorIndex);
      if (next !== pixelsRef.current) {
        pixelsRef.current = next;
        setPixels(next);
      }
      setNotice(null);
    } catch {
      setNotice(t("avatarPalette:pixelLimit"));
    }
  }, [busy, ready, pendingTransition, canvasSize, cellSize, colorIndex, origin.x, origin.y, t]);

  const onPaintStart = useCallback((event: GestureResponderEvent) => {
    lastCellRef.current = -1;
    undoPixelsRef.current = pixelsRef.current;
    setCanUndo(true);
    paintAt(event);
  }, [paintAt]);

  const undo = useCallback(() => {
    const previous = undoPixelsRef.current;
    if (previous === null) return;
    pixelsRef.current = previous;
    setPixels(previous);
    undoPixelsRef.current = null;
    setCanUndo(false);
    setNotice(null);
  }, []);

  const clearDrawing = useCallback(() => {
    undoPixelsRef.current = pixelsRef.current;
    setCanUndo(true);
    pixelsRef.current = EMPTY_PIXELS;
    setPixels(EMPTY_PIXELS);
    setClearConfirm(false);
    setNotice(null);
  }, []);

  const moveCanvas = useCallback((dx: number, dy: number) => {
    setOrigin((previous) => clampOrigin({ x: previous.x + dx, y: previous.y + dy }, zoom));
  }, [zoom]);

  const changeZoom = useCallback((next: Zoom) => {
    setOrigin((previous) => clampOrigin(previous, next));
    setZoom(next);
  }, []);

  const chooseSlot = useCallback((next: AvatarPaletteSlot) => {
    if (next === slot || busy) return;
    setSlot(next);
    setOrigin(clampOrigin(next === "garment" ? { x: 16, y: 16 } : { x: 16, y: 0 }, zoom));
    setNotice(null);
  }, [slot, busy, zoom]);

  const showEditor = useCallback((item: AvatarPaletteItem | null) => {
    const next: Snapshot = item
      ? { slot: item.slot, title: item.title, pixels: item.pixels }
      : { slot: "hair", title: "", pixels: EMPTY_PIXELS };
    setEditingItemId(item?.id ?? null);
    setSlot(next.slot);
    setTitle(next.title);
    pixelsRef.current = next.pixels;
    undoPixelsRef.current = null;
    setPixels(next.pixels);
    setSaved(next);
    setCanUndo(false);
    setClearConfirm(false);
    setOrigin(clampOrigin(next.slot === "garment" ? { x: 16, y: 16 } : { x: 16, y: 0 }, zoom));
    setNotice(null);
    setViewMode("editor");
  }, [zoom]);

  const applyTransition = useCallback((next: PendingTransition) => {
    if (next.kind === "gallery") { setViewMode("gallery"); return; }
    if (next.kind === "new") { showEditor(null); return; }
    if (next.kind === "open") {
      const item = items.find((entry) => entry.id === next.id);
      if (item) showEditor(item);
      else setNotice(t("avatarPalette:unavailable"));
    }
  }, [items, showEditor, t]);

  const requestTransition = useCallback((next: PendingTransition) => {
    if (busy || pendingTransition) return;
    if (next.kind === "new" && items.length >= AVATAR_PALETTE_GALLERY_LIMIT) {
      setNotice(t("avatarPalette:limitReached", { max: AVATAR_PALETTE_GALLERY_LIMIT }));
      return;
    }
    if (dirty) { setPendingTransition(next); return; }
    applyTransition(next);
  }, [busy, pendingTransition, items.length, dirty, applyTransition, t]);

  const saveCurrent = useCallback(async (): Promise<boolean> => {
    if (!userId || !ready || viewMode !== "editor" || busy) return false;
    if (!editingItemId && items.length >= AVATAR_PALETTE_GALLERY_LIMIT) {
      setNotice(t("avatarPalette:limitReached", { max: AVATAR_PALETTE_GALLERY_LIMIT }));
      return false;
    }
    const lease = captureAccountOwnerLease(userId);
    if (!lease?.isCurrent()) return false;
    const snapshot = { slot, title: title.trim(), pixels };
    setBusy(true);
    setNotice(null);
    try {
      const item = await saveAvatarPaletteItem(userId, { id: editingItemId ?? undefined, ...snapshot });
      if (!lease.isCurrent() || currentUserRef.current !== userId) return false;
      setEditingItemId(item.id);
      setTitle(item.title);
      setSaved({ slot: item.slot, title: item.title, pixels: item.pixels });
      setItems((previous) => [item, ...previous.filter((entry) => entry.id !== item.id)]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setNotice(t("avatarPalette:saved"));
      return true;
    } catch {
      if (lease.isCurrent()) setNotice(t("avatarPalette:saveError"));
      return false;
    } finally {
      if (lease.isCurrent()) setBusy(false);
    }
  }, [userId, ready, viewMode, busy, editingItemId, items.length, title, pixels, slot, t]);

  const finishTransition = useCallback(async (save: boolean) => {
    const next = pendingTransition;
    if (!next || busy) return;
    if (save && !(await saveCurrent())) return;
    if (next.kind === "exit") {
      setExitOwnerId(userId);
      setAllowExit(true);
    } else {
      setPendingTransition(null);
      pendingActionRef.current = null;
      applyTransition(next);
    }
  }, [pendingTransition, busy, saveCurrent, applyTransition, userId]);

  const deleteItem = useCallback(async () => {
    if (!userId || !ready || busy || !deleteCandidate) return;
    const lease = captureAccountOwnerLease(userId);
    if (!lease?.isCurrent()) return;
    const id = deleteCandidate.id;
    setBusy(true);
    setNotice(null);
    try {
      await deleteAvatarPaletteItem(userId, id);
      if (!lease.isCurrent() || currentUserRef.current !== userId) return;
      setItems((previous) => previous.filter((entry) => entry.id !== id));
      setDeleteCandidate(null);
      setNotice(t("avatarPalette:deleted"));
    } catch {
      if (lease.isCurrent()) setNotice(t("avatarPalette:deleteError"));
    } finally {
      if (lease.isCurrent()) setBusy(false);
    }
  }, [userId, ready, busy, deleteCandidate, t]);

  const frame = (children: ReactNode) => (
    <DeepSpaceScreen active="ops" header="none" variant="windowed" title={t("avatarPalette:title")} onBack={goBack}>
      {children}
    </DeepSpaceScreen>
  );

  if (authLoading) return frame(<View style={styles.center}><PremiumLoadingState message={t("avatarPalette:loading")} /></View>);
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false && profileProbeFailed) return frame(
    <View style={styles.center} accessibilityRole="alert">
      <Text style={styles.muted}>{t("avatarPalette:profileError")}</Text>
      <ActionButton label={t("avatarPalette:retry")} onPress={() => void refreshAuth()} />
    </View>,
  );
  if (hasProfile === false) return <Redirect href="/complete-profile" />;
  if (hasProfile !== true || readOwnerId !== userId || readState === "idle" || readState === "loading") {
    return frame(<View style={styles.center}><PremiumLoadingState message={t("avatarPalette:loading")} /></View>);
  }
  if (readState === "error") return frame(
    <View style={styles.center} accessibilityRole="alert">
      <Text style={styles.muted}>{t("avatarPalette:loadError")}</Text>
      <ActionButton label={t("avatarPalette:retry")} onPress={() => setReadRetry((value) => value + 1)} />
    </View>,
  );

  return frame(<View style={styles.screen}>
    {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
    {pendingTransition ? <PixelSurface variant="frame" contentStyle={styles.detail}>
      <Text style={styles.body}>{t("avatarPalette:unsavedChanges")}</Text>
      <View style={styles.row}>
        <ActionButton label={t("avatarPalette:saveAndContinue")} disabled={busy} onPress={() => void finishTransition(true)} />
        <ActionButton label={t("avatarPalette:discardAndContinue")} disabled={busy} onPress={() => void finishTransition(false)} />
        <ActionButton label={t("avatarPalette:cancel")} disabled={busy} onPress={() => { setPendingTransition(null); pendingActionRef.current = null; }} />
      </View>
    </PixelSurface> : null}
    {deleteCandidate ? <PixelSurface variant="frame" contentStyle={styles.detail}>
      <Text style={styles.body}>{t("avatarPalette:deleteConfirm", { title: deleteCandidate.title || t("avatarPalette:untitled") })}</Text>
      <View style={styles.row}>
        <ActionButton label={t("avatarPalette:confirm")} disabled={busy} onPress={() => void deleteItem()} />
        <ActionButton label={t("avatarPalette:cancel")} disabled={busy} onPress={() => setDeleteCandidate(null)} />
      </View>
    </PixelSurface> : null}
    {viewMode === "gallery" ? <FlatList
      style={styles.scroll}
      data={items}
      keyExtractor={(item) => item.id}
      initialNumToRender={2}
      maxToRenderPerBatch={2}
      windowSize={3}
      removeClippedSubviews={Platform.OS === "android"}
      contentContainerStyle={styles.galleryList}
      pointerEvents={deleteCandidate ? "none" : "auto"}
      accessibilityElementsHidden={!!deleteCandidate}
      importantForAccessibility={deleteCandidate ? "no-hide-descendants" : "auto"}
      ListHeaderComponent={<View style={styles.galleryHeader}>
        <Text style={styles.label}>{t("avatarPalette:galleryTitle")}</Text>
        <Text style={styles.muted}>{t("avatarPalette:localOnly")}</Text>
        <Text style={styles.muted}>{t("avatarPalette:galleryCount", { count: items.length, max: AVATAR_PALETTE_GALLERY_LIMIT })}</Text>
        {items.length >= AVATAR_PALETTE_GALLERY_LIMIT ? <Text style={styles.muted}>
          {t("avatarPalette:limitReached", { max: AVATAR_PALETTE_GALLERY_LIMIT })}
        </Text> : null}
        <ActionButton label={t("avatarPalette:newDrawing")} disabled={busy || items.length >= AVATAR_PALETTE_GALLERY_LIMIT} onPress={() => requestTransition({ kind: "new" })} />
      </View>}
      ListEmptyComponent={<Text style={styles.muted}>{t("avatarPalette:galleryEmpty")}</Text>}
      renderItem={({ item }) => <PixelSurface variant="inset" contentStyle={styles.galleryCard}>
        <View style={styles.thumbnail}><PixelLayer pixels={item.pixels} size={64} /></View>
        <View style={styles.galleryCardText}>
          <Text style={styles.body} numberOfLines={2}>{item.title || t("avatarPalette:untitled")}</Text>
          <Text style={styles.muted}>{t(`avatarPalette:slots.${item.slot}`)}</Text>
          <Text style={styles.muted}>{t("avatarPalette:editedOn", { date: new Date(item.updatedAt).toLocaleDateString(i18n.resolvedLanguage ?? i18n.language) })}</Text>
          <View style={styles.row}>
            <ActionButton label={t("avatarPalette:openDrawing")} disabled={busy} onPress={() => requestTransition({ kind: "open", id: item.id })} />
            <ActionButton label={t("avatarPalette:deleteItem")} disabled={busy} onPress={() => setDeleteCandidate(item)} />
          </View>
        </View>
      </PixelSurface>}
    /> : <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.editor}
      keyboardShouldPersistTaps="handled"
      pointerEvents={pendingTransition ? "none" : "auto"}
      accessibilityElementsHidden={!!pendingTransition}
      importantForAccessibility={pendingTransition ? "no-hide-descendants" : "auto"}
    >
      <View style={styles.row}>
        <Text style={styles.label}>{t(editingItemId ? "avatarPalette:editingDrawing" : "avatarPalette:newDrawing")}</Text>
        <ActionButton label={t("avatarPalette:myGallery")} disabled={busy} onPress={() => requestTransition({ kind: "gallery" })} />
      </View>
      <Text style={styles.muted}>{t("avatarPalette:intro")}</Text>
      <Text style={styles.muted}>{t("avatarPalette:localOnly")}</Text>
      <Text style={styles.label}>{t("avatarPalette:slotLabel")}</Text>
      <View style={styles.row}>{AVATAR_PALETTE_SLOTS.map((entry) => (
        <ActionButton key={entry} label={t(`avatarPalette:slots.${entry}`)} selected={slot === entry} disabled={busy || !!pendingTransition} onPress={() => chooseSlot(entry)} />
      ))}</View>
      <Text style={styles.muted}>{t(`avatarPalette:slotHints.${slot}`)}</Text>
      <TextInput
        value={title}
        onChangeText={(value) => { setTitle(value); setNotice(null); }}
        editable={!busy && !pendingTransition}
        maxLength={32}
        returnKeyType="done"
        placeholder={t("avatarPalette:titlePlaceholder")}
        placeholderTextColor={m3.color.onSurfaceVariant}
        accessibilityLabel={t("avatarPalette:draftTitle")}
        style={styles.input}
      />
      <Text style={styles.muted}>{t("avatarPalette:canvasHint")}</Text>
      <View style={styles.canvasOuter}>
        <View
          style={[styles.canvas, { width: canvasSize, height: canvasSize }]}
          accessibilityLabel={t("avatarPalette:canvasLabel", { size: cells })}
          accessibilityHint={t("avatarPalette:canvasHint")}
          onStartShouldSetResponder={() => !busy && !pendingTransition}
          onMoveShouldSetResponder={() => !busy && !pendingTransition}
          onResponderGrant={onPaintStart}
          onResponderMove={paintAt}
          onResponderRelease={() => { lastCellRef.current = -1; }}
          onResponderTerminate={() => { lastCellRef.current = -1; }}
        >
          {showBase ? <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <SvgXml xml={baseXml} width={canvasSize} height={canvasSize} />
          </View> : null}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <PixelLayer pixels={pixels} size={canvasSize} origin={origin} cells={cells} />
          </View>
          {grid ? <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {Array.from({ length: cells - 1 }, (_, index) => (
              <View key={`x${index}`} style={[styles.gridVertical, { left: (index + 1) * cellSize }]} />
            ))}
            {Array.from({ length: cells - 1 }, (_, index) => (
              <View key={`y${index}`} style={[styles.gridHorizontal, { top: (index + 1) * cellSize }]} />
            ))}
          </View> : null}
        </View>
      </View>
      <Text style={styles.muted}>{t("avatarPalette:paintedCount", { count: painted, max: AVATAR_PALETTE_MAX_OPAQUE_PIXELS })}</Text>
      <View style={styles.row}>
        <ActionButton label={t(grid ? "avatarPalette:gridOff" : "avatarPalette:gridOn")} onPress={() => setGrid((value) => !value)} />
        <ActionButton label={t(showBase ? "avatarPalette:baseOff" : "avatarPalette:baseOn")} onPress={() => setShowBase((value) => !value)} />
        {ZOOMS.map((entry) => <ActionButton key={entry} label={`${entry}×`} selected={zoom === entry} onPress={() => changeZoom(entry)} />)}
      </View>
      <View style={styles.row}>
        <ActionButton label={t("avatarPalette:undo")} disabled={!canUndo || busy} onPress={undo} />
        <ActionButton label={t("avatarPalette:clear")} disabled={painted === 0 || busy} onPress={() => setClearConfirm(true)} />
      </View>
      {clearConfirm ? <PixelSurface variant="frame" contentStyle={styles.detail}>
        <Text style={styles.body}>{t("avatarPalette:clearConfirm")}</Text>
        <View style={styles.row}>
          <ActionButton label={t("avatarPalette:confirm")} onPress={clearDrawing} />
          <ActionButton label={t("avatarPalette:cancel")} onPress={() => setClearConfirm(false)} />
        </View>
      </PixelSurface> : null}
      {zoom > 1 ? <View style={styles.row}>
        <ActionButton label={t("avatarPalette:panLeft")} onPress={() => moveCanvas(-Math.max(1, cells / 2), 0)} />
        <ActionButton label={t("avatarPalette:panRight")} onPress={() => moveCanvas(Math.max(1, cells / 2), 0)} />
        <ActionButton label={t("avatarPalette:panUp")} onPress={() => moveCanvas(0, -Math.max(1, cells / 2))} />
        <ActionButton label={t("avatarPalette:panDown")} onPress={() => moveCanvas(0, Math.max(1, cells / 2))} />
      </View> : null}
      <Text style={styles.muted}>{t("avatarPalette:viewport", { x: origin.x + 1, y: origin.y + 1, size: cells })}</Text>
      <Text style={styles.label}>{t("avatarPalette:palette")}</Text>
      <View style={styles.palette}>
        {AVATAR_PALETTE.map((color, index) => (
          <PixelPressable
            key={color}
            onPress={() => setColorIndex(index)}
            disabled={busy}
            variant={colorIndex === index ? "inset" : "bevel"}
            accessibilityLabel={t("avatarPalette:color", { index: index + 1 })}
            accessibilityState={{ selected: colorIndex === index }}
            contentStyle={styles.swatchContent}
          >
            <View style={[styles.swatch, { backgroundColor: color }]} />
          </PixelPressable>
        ))}
        <ActionButton label={t("avatarPalette:eraser")} selected={colorIndex === null} disabled={busy} onPress={() => setColorIndex(null)} />
      </View>
      <ActionButton label={t(preview ? "avatarPalette:hidePreview" : "avatarPalette:showPreview")} onPress={() => setPreview((value) => !value)} />
      {preview ? <PixelSurface variant="inset" contentStyle={styles.avatarPreview}>
        <AvatarPreview spec={DEFAULT_AVATAR_SPEC} size={128} overlays={[{ slot, pixels }]} />
        <Text style={styles.muted}>{t("avatarPalette:previewHint")}</Text>
      </PixelSurface> : null}
      <ActionButton label={busy ? t("avatarPalette:saving") : t("avatarPalette:save")} disabled={busy || !!pendingTransition} onPress={() => void saveCurrent()} />
    </ScrollView>}
  </View>);
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, paddingHorizontal: m3.spacing.s3, paddingBottom: m3.spacing.s3, gap: m3.spacing.s2 },
  scroll: { flex: 1, minHeight: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: m3.spacing.s4, padding: m3.spacing.s4 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: m3.spacing.s2 },
  editor: { alignItems: "flex-start", gap: m3.spacing.s3, paddingBottom: m3.spacing.s8 },
  galleryList: { gap: m3.spacing.s2, paddingBottom: m3.spacing.s8 },
  galleryHeader: { alignItems: "flex-start", gap: m3.spacing.s2, paddingBottom: m3.spacing.s2 },
  galleryCard: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s3, padding: m3.spacing.s2 },
  galleryCardText: { flex: 1, gap: m3.spacing.s1 },
  thumbnail: { width: 64, height: 64, backgroundColor: m3.color.surfaceContainer },
  label: { color: m3.color.onSurface, fontSize: m3.type.labelLarge.size, lineHeight: m3.type.labelLarge.line, paddingBottom: m3.spacing.s1 },
  body: { color: m3.color.onSurface, fontSize: m3.type.bodyMedium.size, lineHeight: m3.type.bodyMedium.line, paddingBottom: m3.spacing.s1 },
  muted: { color: m3.color.onSurfaceVariant, fontSize: m3.type.bodySmall.size, lineHeight: m3.type.bodySmall.line, paddingBottom: m3.spacing.s1 },
  notice: { color: m3.color.primary, fontSize: m3.type.bodySmall.size, lineHeight: m3.type.bodySmall.line, paddingBottom: m3.spacing.s1 },
  accent: { color: m3.color.primary },
  buttonContent: { minHeight: m3.minTouch, paddingHorizontal: m3.spacing.s2, alignItems: "center", justifyContent: "center" },
  buttonText: { color: m3.color.onSurface, fontSize: m3.type.labelMedium.size, lineHeight: m3.type.labelMedium.line, paddingBottom: m3.spacing.s1 },
  input: { alignSelf: "stretch", minHeight: m3.minTouch, color: m3.color.onSurface, backgroundColor: m3.color.surfaceContainer, borderWidth: 1, borderColor: m3.color.outlineVariant, paddingHorizontal: m3.spacing.s3, fontSize: m3.type.bodyMedium.size },
  canvasOuter: { alignSelf: "stretch", alignItems: "center" },
  canvas: { backgroundColor: m3.color.surface, borderWidth: 1, borderColor: m3.color.outlineVariant },
  gridVertical: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: m3.color.outlineVariant },
  gridHorizontal: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: m3.color.outlineVariant },
  palette: { flexDirection: "row", flexWrap: "wrap", gap: m3.spacing.s1 },
  swatchContent: { minWidth: m3.minTouch, minHeight: m3.minTouch, alignItems: "center", justifyContent: "center" },
  swatch: { width: 24, height: 24, borderWidth: 1, borderColor: m3.color.outlineVariant },
  avatarPreview: { flexDirection: "row", gap: m3.spacing.s3, alignItems: "center" },
  detail: { alignItems: "flex-start", gap: m3.spacing.s2, padding: m3.spacing.s2 },
});
