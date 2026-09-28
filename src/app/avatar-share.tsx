import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";
import { Redirect, router, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import Svg, { Rect, SvgXml } from "react-native-svg";

import { AvatarPreview } from "@/components/avatar/AvatarPreview";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { PremiumLoadingState } from "@/components/premium";
import { PixelPressable, PixelSurface } from "@/components/pixel";
import { useAuth } from "@/lib/auth/AuthContext";
import { captureAccountOwnerLease } from "@/lib/auth/account-epoch";
import { DEFAULT_AVATAR_SPEC, renderAvatarSvg } from "@/lib/avatar";
import { applyAvatarShareAsset } from "@/lib/avatar-share/apply";
import {
  AVATAR_SHARE_PAGE_SIZE,
  AVATAR_SHARE_CONSENT_VERSION,
  AVATAR_SHARE_REPORT_REASONS,
  blockAvatarShareCreator,
  fetchAvatarShareAsset,
  listOwnAssets,
  listPublishedAssets,
  removeOwnAvatarShareAsset,
  reportAvatarShareAsset,
  submitAvatarShareAsset,
  type AvatarShareAsset,
  type AvatarShareReportReason,
} from "@/lib/avatar-share/api";
import {
  AVATAR_SHARE_GRID,
  AVATAR_SHARE_MAX_OPAQUE_PIXELS,
  AVATAR_SHARE_PALETTE,
  AVATAR_SHARE_SLOTS,
  EMPTY_PIXELS,
  countOpaquePixels,
  pixelsToRects,
  setPixel,
  type AvatarShareSlot,
} from "@/lib/avatar-share/pixels";
import { m3 } from "@/lib/theme/m3";

type Tab = "draw" | "gallery" | "mine";
type ReadState = "idle" | "loading" | "ready" | "error";
type Action = { kind: "report" | "creatorReport" | "block" | "remove"; asset: AvatarShareAsset };
type Origin = { x: number; y: number };
const ZOOMS = [1, 2, 4] as const;
type Zoom = typeof ZOOMS[number];

function cellWindow(zoom: Zoom): number { return AVATAR_SHARE_GRID / zoom; }
function clampOrigin(origin: Origin, zoom: Zoom): Origin {
  const max = AVATAR_SHARE_GRID - cellWindow(zoom);
  return { x: Math.max(0, Math.min(max, origin.x)), y: Math.max(0, Math.min(max, origin.y)) };
}

/** Each thumbnail uses bounded row runs; the editor alone receives touch events. */
function PixelLayer({ pixels, size, origin, cells }: {
  pixels: string; size: number; origin?: Origin; cells?: number;
}) {
  const rects = useMemo(() => pixelsToRects(pixels), [pixels]);
  const x = origin?.x ?? 0;
  const y = origin?.y ?? 0;
  const viewSize = cells ?? AVATAR_SHARE_GRID;
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

export default function AvatarShareScreen() {
  const { t } = useTranslation(["avatarShare", "common"]);
  const { width } = useWindowDimensions();
  const { userId, isMinor, hasProfile, profileProbeFailed, loading: authLoading, refresh: refreshAuth } = useAuth();
  const [tab, setTab] = useState<Tab>("draw");
  const [slot, setSlot] = useState<AvatarShareSlot>("hair");
  const [pixels, setPixels] = useState(EMPTY_PIXELS);
  const pixelsRef = useRef(EMPTY_PIXELS);
  const undoPixelsRef = useRef<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const lastCellRef = useRef(-1);
  const [colorIndex, setColorIndex] = useState<number | null>(0);
  const [zoom, setZoom] = useState<Zoom>(2);
  const [origin, setOrigin] = useState<Origin>({ x: 16, y: 0 });
  const [grid, setGrid] = useState(true);
  const [showBase, setShowBase] = useState(true);
  const [preview, setPreview] = useState(false);
  const [draftOwnerId, setDraftOwnerId] = useState<string | null>(userId);
  const [title, setTitle] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [reuseConfirmed, setReuseConfirmed] = useState(false);
  const [published, setPublished] = useState<AvatarShareAsset[]>([]);
  const [galleryPage, setGalleryPage] = useState(0);
  const [galleryHasMore, setGalleryHasMore] = useState(false);
  const [galleryLoadingMore, setGalleryLoadingMore] = useState(false);
  const [own, setOwn] = useState<AvatarShareAsset[]>([]);
  const [readState, setReadState] = useState<ReadState>("idle");
  const [readOwnerId, setReadOwnerId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<AvatarShareAsset | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [reportReason, setReportReason] = useState<AvatarShareReportReason | null>(null);
  const reportedAssetIdsRef = useRef(new Set<string>());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const currentUserRef = useRef(userId);
  currentUserRef.current = userId;

  const canvasSize = Math.max(64, Math.floor(Math.min(width - 80, 384) / 64) * 64);
  const cells = cellWindow(zoom);
  const cellSize = canvasSize / cells;
  const painted = useMemo(() => countOpaquePixels(pixels), [pixels]);
  const baseXml = useMemo(
    () => renderAvatarSvg(DEFAULT_AVATAR_SPEC, canvasSize)
      .replace('viewBox="0 0 64 64"', `viewBox="${origin.x} ${origin.y} ${cells} ${cells}"`),
    [canvasSize, origin.x, origin.y, cells],
  );
  const visibleList = tab === "gallery" ? published : own;
  const adult = isMinor === false;

  const goBack = useCallback(() => {
    if (clearConfirm) { setClearConfirm(false); return; }
    if (action) { setAction(null); return; }
    if (router.canGoBack()) router.back();
    else router.replace("/dashboard");
  }, [action, clearConfirm]);

  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { goBack(); return true; });
    return () => sub.remove();
  }, [goBack]));

  // Never show one account's draft, gallery, or selected asset in another account.
  useEffect(() => {
    pixelsRef.current = EMPTY_PIXELS;
    undoPixelsRef.current = null;
    setPixels(EMPTY_PIXELS);
    setCanUndo(false);
    setClearConfirm(false);
    setTitle("");
    setRightsConfirmed(false);
    setReuseConfirmed(false);
    setPublished([]);
    setGalleryPage(0);
    setGalleryHasMore(false);
    setGalleryLoadingMore(false);
    setOwn([]);
    setSelected(null);
    setAction(null);
    setReportReason(null);
    reportedAssetIdsRef.current.clear();
    setReadOwnerId(null);
    setReadState("idle");
    setNotice(null);
    setBusy(false);
    setDraftOwnerId(userId);
  }, [userId]);

  useFocusEffect(useCallback(() => {
    if (!userId || !adult || hasProfile !== true) return;
    let active = true;
    const owner = userId;
    setReadOwnerId(owner);
    setReadState("loading");
    void Promise.all([listPublishedAssets(), listOwnAssets()])
      .then(([nextPublished, nextOwn]) => {
        if (!active || currentUserRef.current !== owner) return;
        setPublished(nextPublished.filter((asset) => !reportedAssetIdsRef.current.has(asset.id)));
        setGalleryPage(0);
        setGalleryHasMore(nextPublished.length === AVATAR_SHARE_PAGE_SIZE);
        setGalleryLoadingMore(false);
        setOwn(nextOwn);
        setReadState("ready");
      })
      .catch(() => {
        if (!active || currentUserRef.current !== owner) return;
        setReadState("error");
      });
    return () => { active = false; };
  }, [userId, adult, hasProfile, refresh]));

  const loadMoreGallery = useCallback(async () => {
    if (!userId || !adult || readState !== "ready" || !galleryHasMore || galleryLoadingMore) return;
    const lease = captureAccountOwnerLease(userId);
    if (!lease?.isCurrent()) return;
    const nextPage = galleryPage + 1;
    setGalleryLoadingMore(true);
    try {
      const next = await listPublishedAssets(undefined, nextPage);
      if (!lease.isCurrent() || currentUserRef.current !== userId) return;
      setPublished((current) => {
        const known = new Set(current.map((asset) => asset.id));
        return [...current, ...next.filter((asset) =>
          !known.has(asset.id) && !reportedAssetIdsRef.current.has(asset.id))];
      });
      setGalleryPage(nextPage);
      setGalleryHasMore(next.length === AVATAR_SHARE_PAGE_SIZE);
    } catch {
      if (lease.isCurrent()) setNotice(t("avatarShare:readError"));
    } finally {
      if (lease.isCurrent()) setGalleryLoadingMore(false);
    }
  }, [userId, adult, readState, galleryHasMore, galleryLoadingMore, galleryPage, t]);

  const paintAt = useCallback((event: GestureResponderEvent) => {
    if (busy) return;
    const lx = event.nativeEvent.locationX;
    const ly = event.nativeEvent.locationY;
    if (lx < 0 || ly < 0 || lx >= canvasSize || ly >= canvasSize) return;
    const x = origin.x + Math.floor(lx / cellSize);
    const y = origin.y + Math.floor(ly / cellSize);
    const at = y * AVATAR_SHARE_GRID + x;
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
      setNotice(t("avatarShare:pixelLimit"));
    }
  }, [busy, canvasSize, cellSize, colorIndex, origin.x, origin.y, t]);

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

  const chooseSlot = useCallback((next: AvatarShareSlot) => {
    setSlot(next);
    setOrigin(clampOrigin(next === "garment" ? { x: 16, y: 16 } : { x: 16, y: 0 }, zoom));
  }, [zoom]);

  const submit = useCallback(async () => {
    if (!userId || !adult || busy) return;
    const lease = captureAccountOwnerLease(userId);
    if (!lease?.isCurrent()) return;
    if (title.trim().length < 1 || title.trim().length > 32) { setNotice(t("avatarShare:titleError")); return; }
    if (painted < 1) { setNotice(t("avatarShare:emptyDrawing")); return; }
    if (!rightsConfirmed || !reuseConfirmed) { setNotice(t("avatarShare:consentRequired")); return; }
    setBusy(true);
    setNotice(null);
    try {
      const created = await submitAvatarShareAsset({
        slot,
        title: title.trim(),
        pixels,
        rightsConfirmed: true,
        consentVersion: AVATAR_SHARE_CONSENT_VERSION,
      });
      if (!lease.isCurrent() || currentUserRef.current !== userId) return;
      setOwn((previous) => [created, ...previous]);
      setTab("mine");
      setSelected(created);
      setNotice(t("avatarShare:submitted"));
      pixelsRef.current = EMPTY_PIXELS;
      undoPixelsRef.current = null;
      setPixels(EMPTY_PIXELS);
      setCanUndo(false);
      setTitle("");
      setRightsConfirmed(false);
      setReuseConfirmed(false);
      setRefresh((value) => value + 1);
    } catch {
      if (lease.isCurrent()) setNotice(t("avatarShare:submitError"));
    } finally {
      if (lease.isCurrent()) setBusy(false);
    }
  }, [userId, adult, busy, title, painted, rightsConfirmed, reuseConfirmed, slot, pixels, t]);

  const openAsset = useCallback(async (asset: AvatarShareAsset) => {
    if (!userId || !adult || busy || reportedAssetIdsRef.current.has(asset.id)) return;
    const lease = captureAccountOwnerLease(userId);
    if (!lease?.isCurrent()) return;
    setBusy(true);
    setNotice(null);
    try {
      const fresh = await fetchAvatarShareAsset(asset.id);
      if (!lease.isCurrent() || currentUserRef.current !== userId) return;
      if (!fresh || reportedAssetIdsRef.current.has(asset.id)) {
        setSelected(null);
        setNotice(t("avatarShare:unavailable"));
        return;
      }
      setSelected(fresh);
      setAction(null);
    } catch {
      if (lease.isCurrent()) setNotice(t("avatarShare:readError"));
    } finally {
      if (lease.isCurrent()) setBusy(false);
    }
  }, [userId, adult, busy, t]);

  const applyAsset = useCallback(async (asset: AvatarShareAsset) => {
    if (!userId || !adult || busy) return;
    const lease = captureAccountOwnerLease(userId);
    if (!lease?.isCurrent()) return;
    setBusy(true);
    setNotice(null);
    try {
      const fresh = await fetchAvatarShareAsset(asset.id);
      if (!fresh || fresh.status !== "approved" || fresh.hiddenAt) throw new Error("Asset is unavailable");
      if (!lease.isCurrent()) return;
      await applyAvatarShareAsset(userId, fresh);
      if (lease.isCurrent() && currentUserRef.current === userId) {
        setNotice(t("avatarShare:applied"));
        setRefresh((value) => value + 1);
      }
    } catch {
      if (lease.isCurrent()) setNotice(t("avatarShare:applyError"));
    } finally {
      if (lease.isCurrent()) setBusy(false);
    }
  }, [userId, adult, busy, t]);

  const confirmAction = useCallback(async () => {
    if (!action || !userId || !adult || busy) return;
    if ((action.kind === "report" || action.kind === "creatorReport") && !reportReason) return;
    const lease = captureAccountOwnerLease(userId);
    if (!lease?.isCurrent()) return;
    const { asset, kind } = action;
    setBusy(true);
    setNotice(null);
    try {
      if (kind === "report" || kind === "creatorReport") {
        if (!reportReason) return;
        await reportAvatarShareAsset(asset.id, reportReason, kind === "creatorReport" ? "creator" : "asset");
      }
      else if (kind === "block") await blockAvatarShareCreator(asset.ownerId);
      else await removeOwnAvatarShareAsset(asset.id);
      if (!lease.isCurrent() || currentUserRef.current !== userId) return;
      if (kind === "report" || kind === "creatorReport") {
        reportedAssetIdsRef.current.add(asset.id);
        setPublished((previous) => previous.filter((item) => item.id !== asset.id));
        setSelected(null);
      } else if (kind === "block") {
        setPublished((previous) => previous.filter((item) => item.ownerId !== asset.ownerId));
        setSelected(null);
      } else if (kind === "remove") {
        setOwn((previous) => previous.filter((item) => item.id !== asset.id));
        setPublished((previous) => previous.filter((item) => item.id !== asset.id));
        setSelected(null);
      }
      setNotice(t(`avatarShare:${kind}Done`));
      setAction(null);
      setReportReason(null);
      setRefresh((value) => value + 1);
    } catch {
      if (lease.isCurrent()) setNotice(t("avatarShare:actionError"));
    } finally {
      if (lease.isCurrent()) setBusy(false);
    }
  }, [action, userId, adult, busy, reportReason, t]);

  const frame = (children: React.ReactNode) => (
    <DeepSpaceScreen active="ops" header="none" variant="windowed" title={t("avatarShare:title")} onBack={goBack}>
      {children}
    </DeepSpaceScreen>
  );

  if (authLoading) return frame(<View style={styles.center}><PremiumLoadingState message={t("avatarShare:loading")} /></View>);
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === false && profileProbeFailed) return frame(
    <View style={styles.center} accessibilityRole="alert">
      <Text style={styles.muted}>{t("avatarShare:profileError")}</Text>
      <ActionButton label={t("avatarShare:retry")} onPress={() => void refreshAuth()} />
    </View>,
  );
  if (hasProfile === false) return <Redirect href="/complete-profile" />;
  if (hasProfile !== true) return frame(<View style={styles.center}><PremiumLoadingState message={t("avatarShare:loading")} /></View>);
  if (draftOwnerId !== userId) return frame(<View style={styles.center}><PremiumLoadingState message={t("avatarShare:loading")} /></View>);
  if (!adult) return frame(
    <View style={styles.center} accessibilityRole="alert">
      <Text style={styles.muted}>{t("avatarShare:adultOnly")}</Text>
      {isMinor === null ? <ActionButton label={t("avatarShare:retry")} onPress={() => void refreshAuth()} /> : null}
    </View>,
  );

  const editor = (
    <ScrollView contentContainerStyle={styles.editor} keyboardShouldPersistTaps="handled">
      <Text style={styles.muted}>{t("avatarShare:intro")}</Text>
      <Text style={styles.label}>{t("avatarShare:slotLabel")}</Text>
      <View style={styles.row}>{AVATAR_SHARE_SLOTS.map((entry) => (
        <ActionButton key={entry} label={t(`avatarShare:slots.${entry}`)} selected={slot === entry} disabled={busy} onPress={() => chooseSlot(entry)} />
      ))}</View>
      <Text style={styles.muted}>{t(`avatarShare:slotHints.${slot}`)}</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        editable={!busy}
        maxLength={32}
        returnKeyType="done"
        placeholder={t("avatarShare:titlePlaceholder")}
        placeholderTextColor={m3.color.onSurfaceVariant}
        accessibilityLabel={t("avatarShare:assetTitle")}
        style={styles.input}
      />
      <Text style={styles.muted}>{t("avatarShare:canvasHint")}</Text>
      <View style={styles.canvasOuter}>
        <View
          style={[styles.canvas, { width: canvasSize, height: canvasSize }]}
          accessibilityLabel={t("avatarShare:canvasLabel", { size: cells })}
          accessibilityHint={t("avatarShare:canvasHint")}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
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
      <Text style={styles.muted}>{t("avatarShare:paintedCount", { count: painted, max: AVATAR_SHARE_MAX_OPAQUE_PIXELS })}</Text>
      <View style={styles.row}>
        <ActionButton label={t(grid ? "avatarShare:gridOff" : "avatarShare:gridOn")} onPress={() => setGrid((value) => !value)} />
        <ActionButton label={t(showBase ? "avatarShare:baseOff" : "avatarShare:baseOn")} onPress={() => setShowBase((value) => !value)} />
        {ZOOMS.map((entry) => <ActionButton key={entry} label={`${entry}×`} selected={zoom === entry} onPress={() => changeZoom(entry)} />)}
      </View>
      <View style={styles.row}>
        <ActionButton label={t("avatarShare:undo")} disabled={!canUndo || busy} onPress={undo} />
        <ActionButton label={t("avatarShare:clear")} disabled={painted === 0 || busy} onPress={() => setClearConfirm(true)} />
      </View>
      {clearConfirm ? <PixelSurface variant="frame" contentStyle={styles.detail}>
        <Text style={styles.body}>{t("avatarShare:clearConfirm")}</Text>
        <View style={styles.row}>
          <ActionButton label={t("avatarShare:confirm")} onPress={clearDrawing} />
          <ActionButton label={t("avatarShare:cancel")} onPress={() => setClearConfirm(false)} />
        </View>
      </PixelSurface> : null}
      {zoom > 1 ? <View style={styles.row}>
        <ActionButton label={t("avatarShare:panLeft")} onPress={() => moveCanvas(-Math.max(1, cells / 2), 0)} />
        <ActionButton label={t("avatarShare:panRight")} onPress={() => moveCanvas(Math.max(1, cells / 2), 0)} />
        <ActionButton label={t("avatarShare:panUp")} onPress={() => moveCanvas(0, -Math.max(1, cells / 2))} />
        <ActionButton label={t("avatarShare:panDown")} onPress={() => moveCanvas(0, Math.max(1, cells / 2))} />
      </View> : null}
      <Text style={styles.muted}>{t("avatarShare:viewport", { x: origin.x + 1, y: origin.y + 1, size: cells })}</Text>
      <Text style={styles.label}>{t("avatarShare:palette")}</Text>
      <View style={styles.palette}>
        {AVATAR_SHARE_PALETTE.map((color, index) => (
          <PixelPressable
            key={color}
            onPress={() => setColorIndex(index)}
            disabled={busy}
            variant={colorIndex === index ? "inset" : "bevel"}
            accessibilityLabel={t("avatarShare:color", { index: index + 1 })}
            accessibilityState={{ selected: colorIndex === index }}
            contentStyle={styles.swatchContent}
          >
            <View style={[styles.swatch, { backgroundColor: color }]} />
          </PixelPressable>
        ))}
        <ActionButton label={t("avatarShare:eraser")} selected={colorIndex === null} disabled={busy} onPress={() => setColorIndex(null)} />
      </View>
      <ActionButton label={t(preview ? "avatarShare:hidePreview" : "avatarShare:showPreview")} onPress={() => setPreview((value) => !value)} />
      {preview ? <PixelSurface variant="inset" contentStyle={styles.avatarPreview}>
        <AvatarPreview spec={DEFAULT_AVATAR_SPEC} size={128} overlays={[{ slot, pixels }]} />
        <Text style={styles.muted}>{t("avatarShare:previewHint")}</Text>
      </PixelSurface> : null}
      <PixelPressable
        onPress={() => setRightsConfirmed((value) => !value)}
        disabled={busy}
        accessibilityRole="checkbox"
        accessibilityLabel={t("avatarShare:rightsConsent")}
        accessibilityState={{ checked: rightsConfirmed }}
        contentStyle={styles.checkbox}
      >
        <Text style={styles.body}>{rightsConfirmed ? "[x]" : "[ ]"} {t("avatarShare:rightsConsent")}</Text>
      </PixelPressable>
      <PixelPressable
        onPress={() => setReuseConfirmed((value) => !value)}
        disabled={busy}
        accessibilityRole="checkbox"
        accessibilityLabel={t("avatarShare:reuseConsent")}
        accessibilityState={{ checked: reuseConfirmed }}
        contentStyle={styles.checkbox}
      >
        <Text style={styles.body}>{reuseConfirmed ? "[x]" : "[ ]"} {t("avatarShare:reuseConsent")}</Text>
      </PixelPressable>
      <Text style={styles.muted}>{t("avatarShare:reviewNote")}</Text>
      <Text style={styles.muted}>{t("avatarShare:postingRules")}</Text>
      <ActionButton label={t("avatarShare:terms")} onPress={() => router.push("/terms")} />
      <ActionButton label={t("avatarShare:support")} onPress={() => router.push("/support")} />
      <ActionButton label={busy ? t("avatarShare:working") : t("avatarShare:submit")} disabled={busy} onPress={() => void submit()} />
    </ScrollView>
  );

  const assetDetail = selected && (tab === "gallery" || tab === "mine") ? (
    <PixelSurface variant="inset" contentStyle={styles.detail}>
      <Text style={styles.heading}>{selected.title}</Text>
      <Text style={styles.muted}>{t(`avatarShare:slots.${selected.slot}`)} · {t(`avatarShare:status.${selected.status}`)}</Text>
      <PixelLayer pixels={selected.pixels} size={128} />
      {selected.status === "approved" && !selected.hiddenAt ? (
        <ActionButton label={t("avatarShare:useInProfile")} disabled={busy} onPress={() => void applyAsset(selected)} />
      ) : null}
      {selected.ownerId === userId ? (
        <ActionButton label={t("avatarShare:remove")} disabled={busy} onPress={() => setAction({ kind: "remove", asset: selected })} />
      ) : selected.status === "approved" && !selected.hiddenAt ? <View style={styles.row}>
        <ActionButton label={t("avatarShare:report")} disabled={busy} onPress={() => { setReportReason(null); setAction({ kind: "report", asset: selected }); }} />
        <ActionButton label={t("avatarShare:creatorReport")} disabled={busy} onPress={() => { setReportReason(null); setAction({ kind: "creatorReport", asset: selected }); }} />
        <ActionButton label={t("avatarShare:block")} disabled={busy} onPress={() => setAction({ kind: "block", asset: selected })} />
      </View> : null}
      <ActionButton label={t("avatarShare:closeDetail")} onPress={() => { setSelected(null); setAction(null); }} />
    </PixelSurface>
  ) : null;

  const actionPanel = action ? (
    <PixelSurface variant="frame" contentStyle={styles.detail}>
      <Text style={styles.heading}>{t(`avatarShare:${action.kind}Confirm`)}</Text>
      {action.kind === "report" || action.kind === "creatorReport" ? <View style={styles.row}>
        {AVATAR_SHARE_REPORT_REASONS.map((reason) => (
          <ActionButton key={reason} label={t(`avatarShare:reasons.${reason}`)} selected={reportReason === reason} disabled={busy} onPress={() => setReportReason(reason)} />
        ))}
      </View> : null}
      <View style={styles.row}>
        <ActionButton label={t("avatarShare:confirm")} disabled={busy || ((action.kind === "report" || action.kind === "creatorReport") && !reportReason)} onPress={() => void confirmAction()} />
        <ActionButton label={t("avatarShare:cancel")} disabled={busy} onPress={() => setAction(null)} />
      </View>
    </PixelSurface>
  ) : null;

  const assets = readOwnerId !== userId || readState === "loading" || readState === "idle" ? (
    <View style={styles.center}><Text style={styles.muted}>{t("avatarShare:loading")}</Text></View>
  ) : readState === "error" ? (
    <View style={styles.center} accessibilityRole="alert">
      <Text style={styles.muted}>{t("avatarShare:readError")}</Text>
      <ActionButton label={t("avatarShare:retry")} onPress={() => setRefresh((value) => value + 1)} />
    </View>
  ) : (
    <FlatList
      key={tab}
      data={visibleList}
      keyExtractor={(asset) => asset.id}
      initialNumToRender={2}
      maxToRenderPerBatch={2}
      windowSize={3}
      removeClippedSubviews={Platform.OS === "android"}
      contentContainerStyle={styles.list}
      ListHeaderComponent={<View style={styles.listHead}>
        <Text style={styles.muted}>{t(tab === "gallery" ? "avatarShare:galleryHint" : "avatarShare:mineHint")}</Text>
        <ActionButton label={t("avatarShare:support")} onPress={() => router.push("/support")} />
        {assetDetail}
        {actionPanel}
      </View>}
      ListEmptyComponent={<Text style={styles.muted}>{t(tab === "gallery" ? "avatarShare:galleryEmpty" : "avatarShare:mineEmpty")}</Text>}
      ListFooterComponent={tab === "gallery" && galleryHasMore ? (
        <ActionButton
          label={galleryLoadingMore ? t("avatarShare:loading") : t("avatarShare:loadMore")}
          disabled={galleryLoadingMore || busy}
          onPress={() => void loadMoreGallery()}
        />
      ) : null}
      renderItem={({ item }) => <PixelPressable
        fullWidth
        onPress={() => void openAsset(item)}
        disabled={busy}
        accessibilityLabel={t("avatarShare:openAsset", { title: item.title })}
        contentStyle={styles.assetRow}
      >
        <PixelLayer pixels={item.pixels} size={64} />
        <View style={styles.assetText}>
          <Text style={styles.body} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.muted}>{t(`avatarShare:slots.${item.slot}`)} · {t(`avatarShare:status.${item.status}`)}</Text>
        </View>
      </PixelPressable>}
    />
  );

  return frame(<View style={styles.screen}>
    <View style={styles.tabs}>{(["draw", "gallery", "mine"] as const).map((entry) => (
      <ActionButton key={entry} label={t(`avatarShare:tabs.${entry}`)} selected={tab === entry} onPress={() => {
        setTab(entry);
        setSelected(null);
        setAction(null);
        setNotice(null);
      }} />
    ))}</View>
    {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
    <View style={styles.content}>{tab === "draw" ? editor : assets}</View>
  </View>);
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, paddingHorizontal: m3.spacing.s3, paddingBottom: m3.spacing.s3, gap: m3.spacing.s2 },
  content: { flex: 1, minHeight: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: m3.spacing.s4, padding: m3.spacing.s4 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: m3.spacing.s2 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: m3.spacing.s2 },
  editor: { alignItems: "flex-start", gap: m3.spacing.s3, paddingBottom: m3.spacing.s8 },
  list: { gap: m3.spacing.s2, paddingBottom: m3.spacing.s8 },
  listHead: { gap: m3.spacing.s2 },
  heading: { color: m3.color.onSurface, fontSize: m3.type.titleMedium.size, lineHeight: m3.type.titleMedium.line, paddingBottom: m3.spacing.s1 },
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
  checkbox: { minHeight: m3.minTouch, alignItems: "flex-start", justifyContent: "center", paddingHorizontal: m3.spacing.s2 },
  avatarPreview: { flexDirection: "row", gap: m3.spacing.s3, alignItems: "center" },
  detail: { alignItems: "flex-start", gap: m3.spacing.s2, padding: m3.spacing.s2 },
  assetRow: { flexDirection: "row", alignItems: "center", gap: m3.spacing.s3, padding: m3.spacing.s2 },
  assetText: { flex: 1, gap: m3.spacing.s1 },
});
