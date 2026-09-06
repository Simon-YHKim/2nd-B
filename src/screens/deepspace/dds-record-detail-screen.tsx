import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from "react-native";
import { Redirect, router, useLocalSearchParams, type Href } from "expo-router";
import { useTranslation } from "react-i18next";

import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { DeepSpaceLoader } from "@/components/deepspace";
import { m3TextStyle } from "@/components/m3";
import { PremiumModal } from "@/components/premium";
import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { PixelPressable } from "@/components/pixel/PixelPressable";
import { PixelSurface } from "@/components/pixel/PixelSurface";
import type { AnyGlyphName } from "@/components/pixel/pixel-glyphs";
import { parseStructured, structuredFieldLabel } from "@/lib/capture/structured";
import { useAuth } from "@/lib/auth/AuthContext";
import {
  DOMAIN_TAG_PREFIX,
  DOMAIN_STARS,
  domainTagFor,
  getDomainStar,
  isDomainId,
  isDomainTag,
  stripDomainTags,
  type DomainId,
} from "@/lib/persona/domain-stars";
import { evidenceDateLabel } from "@/lib/persona/evidence";
import { resolvePrivacyPrefs } from "@/lib/privacy/prefs";
import {
  deleteRecord,
  listRecentRecords,
  updateRecord,
  updateRecordTags,
} from "@/lib/records/create";
import { getPieceById, SOURCE_ID_PREFIX, type PieceDetail } from "@/lib/records/get-piece";
import {
  recordsEmbeddingAllowed,
  relatedRecordsByEmbedding,
  type RelatedRecord,
} from "@/lib/records/records-embeddings";
import { getSupabaseClient } from "@/lib/supabase/client";
import { m3 } from "@/lib/theme/m3";
import { reactExpression } from "@/lib/companion/expression";
import { generateSourcePage } from "@/lib/wiki/phase2";
import { promotePendingUploads } from "@/lib/wiki/promote-pending";

import { relatedByTag, type TimelineRecord } from "./records-timeline";

const READ_TIMEOUT_MS = 12_000;

type RelatedReadStatus = "idle" | "loading" | "timeout" | "error" | "ready" | "disabled";

type DetailPiece = PieceDetail & { structured?: unknown };

type PrimaryState =
  | { status: "idle"; identity: null }
  | { status: "loading"; identity: string }
  | { status: "timeout"; identity: string }
  | { status: "error"; identity: string }
  | { status: "missing"; identity: string | null }
  | { status: "ready"; identity: string; piece: DetailPiece };

interface RelatedState {
  tagStatus: RelatedReadStatus;
  tagRows: TimelineRecord[];
  semanticStatus: RelatedReadStatus;
  semanticRows: RelatedRecord[];
}

interface RelatedItem {
  id: string;
  kind: string;
  title: string;
  semantic: boolean;
}

interface AssessmentInfo {
  isAssessment: boolean;
  route: string | null;
}

class ReadTimeoutError extends Error {
  constructor() {
    super("record-detail-read-timeout");
    this.name = "ReadTimeoutError";
  }
}

function withReadTimeout<T>(
  promise: Promise<T>,
  timeoutMs = READ_TIMEOUT_MS,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new ReadTimeoutError());
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function failureStatus(error: unknown): "timeout" | "error" {
  return error instanceof ReadTimeoutError ? "timeout" : "error";
}

async function readEmbeddingPreference(userId: string): Promise<boolean> {
  const { data, error } = await getSupabaseClient()
    .from("users")
    .select("privacy_prefs")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  const stored = (data?.privacy_prefs as Record<string, unknown> | null | undefined) ?? null;
  return resolvePrivacyPrefs(stored).records_embedding;
}

async function loadSemanticRows(
  userId: string,
  recordId: string,
  isMinor: boolean | null,
  isActive: () => boolean,
): Promise<{ status: "disabled" | "ready"; rows: RelatedRecord[] }> {
  // Unknown age is not adult. Fail closed until AuthContext has a real answer.
  if (isMinor !== false || !isActive()) return { status: "disabled", rows: [] };
  const preference = await readEmbeddingPreference(userId);
  if (!isActive() || !recordsEmbeddingAllowed(isMinor, preference)) {
    return { status: "disabled", rows: [] };
  }
  const rows = await relatedRecordsByEmbedding(userId, recordId, 6);
  return { status: "ready", rows };
}

const ASSESSMENT_ROUTES: Readonly<Record<string, string>> = {
  motivation: "/motivation",
  strengths: "/strengths",
  values: "/values",
  big_five: "/big-five",
  bfi: "/big-five",
  attachment: "/attachment",
  ecr: "/attachment",
};

function assessmentInfo(piece: DetailPiece): AssessmentInfo {
  const tags = (piece.tags ?? []).map((tag) => tag.toLowerCase());
  if (!tags.includes("assessment")) return { isAssessment: false, route: null };
  const body = piece.body?.trim() ?? "";
  if (!body.startsWith("{")) return { isAssessment: false, route: null };
  try {
    JSON.parse(body);
  } catch {
    return { isAssessment: false, route: null };
  }
  const route = tags.map((tag) => ASSESSMENT_ROUTES[tag]).find(Boolean) ?? null;
  return { isAssessment: true, route };
}

function titleOf(
  piece: Pick<DetailPiece, "summary" | "topic" | "body">,
  fallback: string,
  bodyIsDisplayable: boolean,
): string {
  const stored = piece.summary?.trim() || piece.topic?.trim();
  if (stored) return stored;
  if (!bodyIsDisplayable) return fallback;
  const firstLine = piece.body
    ?.split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return fallback;
  return firstLine.length > 80 ? `${firstLine.slice(0, 80).trimEnd()}…` : firstLine;
}

function relatedTitle(
  row: Pick<TimelineRecord, "summary" | "topic"> | Pick<RelatedRecord, "summary" | "topic">,
  fallback: string,
): string {
  return row.summary?.trim() || row.topic?.trim() || fallback;
}

type PresentationType = "text" | "link" | "voice" | "photo" | "todo";

function presentationType(
  piece: Pick<DetailPiece, "kind" | "topic" | "summary" | "body" | "tags">,
): PresentationType {
  const tags = (piece.tags ?? []).map((tag) => tag.toLowerCase());
  const has = (...keys: string[]) => keys.some((key) => tags.includes(key));
  const kind = piece.kind.toLowerCase();
  if (kind === "audit_response" || kind === "todo") return "todo";
  if (["article", "video", "paper", "reddit", "code", "ai_tool"].includes(kind)) {
    return "link";
  }
  if (kind === "voice" || kind === "audio") return "voice";
  if (kind === "photo" || kind === "image") return "photo";
  const haystack = `${piece.topic ?? ""} ${piece.summary ?? ""} ${piece.body ?? ""}`;
  if (has("link", "링크", "url") || /https?:\/\//.test(haystack)) return "link";
  if (has("voice", "음성") || /\(\d+:\d{2}\)/.test(haystack)) return "voice";
  if (has("photo", "사진", "image", "이미지")) return "photo";
  return "text";
}

const TYPE_GLYPH: Readonly<Record<PresentationType, AnyGlyphName>> = {
  text: "editNote",
  link: "link",
  voice: "mic",
  photo: "camera",
  todo: "taskAlt",
};

function typeLabelKey(
  piece: Pick<DetailPiece, "kind" | "topic" | "summary" | "body" | "tags">,
): string {
  if (piece.kind === "journal") return "deepspace:recordDetail.kindJournal";
  if (piece.kind === "note") return "deepspace:recordDetail.kindNote";
  if (piece.kind === "audit_response") return "deepspace:recordDetail.kindAudit";
  const type = presentationType(piece);
  if (type === "link") return "deepspace:records.typeLink";
  if (type === "voice") return "deepspace:records.typeVoice";
  if (type === "photo") return "deepspace:records.typePhoto";
  return "deepspace:records.typeText";
}

function canonicalDomain(tags: readonly string[]): DomainId | null {
  for (const tag of tags) {
    if (!isDomainTag(tag)) continue;
    const candidate = tag.slice(DOMAIN_TAG_PREFIX.length).toLowerCase();
    if (isDomainId(candidate)) return candidate;
  }
  return null;
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function movedTags(tags: readonly string[], target: DomainId): string[] {
  return [...stripDomainTags(tags), domainTagFor(target)];
}

function mergedRelated(piece: DetailPiece, related: RelatedState, fallback: string): RelatedItem[] {
  const byTag = relatedByTag(piece.id, piece.tags, related.tagRows, 5);
  const used = new Set(byTag.map((row) => row.id));
  const items: RelatedItem[] = byTag.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: relatedTitle(row, fallback),
    semantic: false,
  }));
  for (const row of related.semanticRows) {
    if (row.id === piece.id || used.has(row.id) || items.length >= 5) continue;
    used.add(row.id);
    items.push({
      id: row.id,
      kind: row.kind,
      title: relatedTitle(row, fallback),
      semantic: true,
    });
  }
  return items;
}

function relationFailed(state: RelatedState): boolean {
  return [state.tagStatus, state.semanticStatus].some(
    (status) => status === "timeout" || status === "error",
  );
}

function relationBusy(state: RelatedState): boolean {
  return state.tagStatus === "loading" || state.semanticStatus === "loading";
}

function relationSettled(state: RelatedState): boolean {
  return [state.tagStatus, state.semanticStatus].every(
    (status) => status === "ready" || status === "disabled",
  );
}

const EMPTY_RELATED: RelatedState = {
  tagStatus: "idle",
  tagRows: [],
  semanticStatus: "idle",
  semanticRows: [],
};

function stateShell(
  title: string,
  body: string | null,
  actionLabel: string,
  onPress: () => void,
  icon: AnyGlyphName,
) {
  return (
    <View style={styles.centerState}>
      <PixelSurface variant="inset" contentStyle={styles.stateContent}>
        <PixelGlyph name={icon} color={m3.color.primary} size={48} />
        <RNText accessibilityRole="header" style={[m3TextStyle("titleLarge"), styles.stateTitle]}>
          {title}
        </RNText>
        {body ? (
          <RNText style={[m3TextStyle("bodyMedium"), styles.stateBody]}>{body}</RNText>
        ) : null}
        <PixelPressable
          onPress={onPress}
          accessibilityLabel={actionLabel}
          fullWidth
          background={m3.color.primary}
          contentStyle={styles.centerButton}
        >
          <RNText style={[m3TextStyle("labelLarge"), styles.primaryLabel]}>{actionLabel}</RNText>
        </PixelPressable>
      </PixelSurface>
    </View>
  );
}

export function DeepSpaceRecordDetailScreen() {
  const { t, i18n } = useTranslation(["deepspace", "recordDetail", "common"]);
  const {
    userId,
    loading: authLoading,
    hasProfile,
    profileProbeFailed,
    isMinor,
    refresh,
  } = useAuth();
  const params = useLocalSearchParams<{ id?: string | string[]; origin?: string | string[] }>();
  const recordId = Array.isArray(params.id) ? params.id[0] : params.id;
  const originValue = Array.isArray(params.origin) ? params.origin[0] : params.origin;
  const requestedOrigin = originValue === "source" ? "source" : null;
  const identity =
    userId && recordId ? `${userId}\u0000${recordId}\u0000${requestedOrigin ?? "auto"}` : null;

  const mountedRef = useRef(true);
  const identityRef = useRef<string | null>(identity);
  identityRef.current = identity;
  const locksRef = useRef<{
    edit: string | null;
    tags: string | null;
    delete: string | null;
    promote: string | null;
  }>({ edit: null, tags: null, delete: null, promote: null });

  const [primary, setPrimary] = useState<PrimaryState>({ status: "idle", identity: null });
  const [related, setRelated] = useState<RelatedState>(EMPTY_RELATED);
  const [primaryRetry, setPrimaryRetry] = useState(0);
  const [relatedRetry, setRelatedRetry] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [bodyDraft, setBodyDraft] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [moving, setMoving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [tagsBusy, setTagsBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [promoted, setPromoted] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isCurrent = useCallback(
    (key: string | null) => Boolean(key && mountedRef.current && identityRef.current === key),
    [],
  );

  const announceActionError = useCallback(() => {
    const message = t("deepspace:recordDetail.actionFailed");
    setActionError(message);
    AccessibilityInfo.announceForAccessibility(message);
  }, [t]);

  useEffect(() => {
    locksRef.current = { edit: null, tags: null, delete: null, promote: null };
    setRelated(EMPTY_RELATED);
    setActionError(null);
    setEditing(false);
    setAddingTag(false);
    setMoving(false);
    setConfirmingDelete(false);
    setEditBusy(false);
    setTagsBusy(false);
    setDeleting(false);
    setPromoting(false);
    setPromoted(false);

    if (!userId || hasProfile !== true) {
      setPrimary({ status: "idle", identity: null });
      return;
    }
    if (!recordId || !identity) {
      setPrimary({ status: "missing", identity: null });
      return;
    }

    let alive = true;
    setPrimary({ status: "loading", identity });
    void withReadTimeout(getPieceById(userId, recordId, requestedOrigin))
      .then((piece) => {
        if (!alive || !isCurrent(identity)) return;
        setPrimary(
          piece
            ? { status: "ready", identity, piece: piece as DetailPiece }
            : { status: "missing", identity },
        );
      })
      .catch((error: unknown) => {
        if (!alive || !isCurrent(identity)) return;
        setPrimary({ status: failureStatus(error), identity });
      });
    return () => {
      alive = false;
    };
  }, [hasProfile, identity, isCurrent, primaryRetry, recordId, requestedOrigin, userId]);

  const readyOrigin =
    primary.status === "ready" && primary.identity === identity ? primary.piece.origin : null;

  useEffect(() => {
    if (
      primary.status !== "ready" ||
      primary.identity !== identity ||
      !userId ||
      !recordId ||
      !identity ||
      hasProfile !== true
    ) {
      setRelated(EMPTY_RELATED);
      return;
    }

    let alive = true;
    const semanticGuard = { active: true };
    setRelated({
      tagStatus: "loading",
      tagRows: [],
      semanticStatus: readyOrigin === "source" ? "disabled" : "loading",
      semanticRows: [],
    });

    const tagRead = withReadTimeout(listRecentRecords(userId));
    const semanticRead =
      readyOrigin === "source"
        ? Promise.resolve({ status: "disabled" as const, rows: [] as RelatedRecord[] })
        : withReadTimeout(
            loadSemanticRows(
              userId,
              recordId,
              isMinor,
              () => semanticGuard.active && alive && isCurrent(identity),
            ),
            READ_TIMEOUT_MS,
            () => {
              semanticGuard.active = false;
            },
          );

    void Promise.allSettled([tagRead, semanticRead]).then(([tagResult, semanticResult]) => {
      if (!alive || !isCurrent(identity)) return;
      setRelated({
        tagStatus: tagResult.status === "fulfilled" ? "ready" : failureStatus(tagResult.reason),
        tagRows: tagResult.status === "fulfilled" ? (tagResult.value as TimelineRecord[]) : [],
        semanticStatus:
          semanticResult.status === "fulfilled"
            ? semanticResult.value.status
            : failureStatus(semanticResult.reason),
        semanticRows: semanticResult.status === "fulfilled" ? semanticResult.value.rows : [],
      });
    });
    return () => {
      alive = false;
      semanticGuard.active = false;
    };
  }, [hasProfile, identity, isCurrent, isMinor, readyOrigin, recordId, relatedRetry, userId]);

  const updateReadyPiece = useCallback((piece: DetailPiece) => {
    setPrimary((current) => (current.status === "ready" ? { ...current, piece } : current));
  }, []);

  const startEdit = useCallback(() => {
    if (
      primary.status !== "ready" ||
      primary.identity !== identity ||
      primary.piece.origin !== "record"
    )
      return;
    setActionError(null);
    setBodyDraft(primary.piece.body ?? "");
    setEditing(true);
  }, [identity, primary]);

  const submitEdit = useCallback(async () => {
    if (
      locksRef.current.edit ||
      primary.status !== "ready" ||
      primary.identity !== identity ||
      primary.piece.origin !== "record" ||
      !userId ||
      !recordId ||
      !identity
    )
      return;
    const previous = primary.piece;
    const nextBody = bodyDraft.trim();
    if (nextBody.length === 0 || nextBody === (previous.body ?? "").trim()) {
      setEditing(false);
      return;
    }

    locksRef.current.edit = identity;
    setEditBusy(true);
    setActionError(null);
    setEditing(false);
    updateReadyPiece({ ...previous, body: nextBody });
    try {
      await updateRecord(userId, recordId, { body: nextBody });
    } catch {
      if (isCurrent(identity)) {
        updateReadyPiece(previous);
        setBodyDraft(previous.body ?? "");
        setEditing(true);
        announceActionError();
      }
    } finally {
      if (locksRef.current.edit === identity) locksRef.current.edit = null;
      if (isCurrent(identity)) setEditBusy(false);
    }
  }, [
    announceActionError,
    bodyDraft,
    identity,
    isCurrent,
    primary,
    recordId,
    updateReadyPiece,
    userId,
  ]);

  const submitTag = useCallback(async () => {
    if (
      locksRef.current.tags ||
      primary.status !== "ready" ||
      primary.identity !== identity ||
      primary.piece.origin !== "record" ||
      !userId ||
      !recordId ||
      !identity
    )
      return;
    const tag = tagDraft.trim();
    if (!tag) {
      setAddingTag(false);
      setTagDraft("");
      return;
    }
    if (isDomainTag(tag)) {
      setAddingTag(false);
      setTagDraft("");
      announceActionError();
      return;
    }

    const previous = primary.piece;
    const currentTags = previous.tags ?? [];
    if (currentTags.includes(tag)) {
      setAddingTag(false);
      setTagDraft("");
      return;
    }
    const nextTags = [...currentTags, tag];
    locksRef.current.tags = identity;
    setTagsBusy(true);
    setActionError(null);
    setAddingTag(false);
    setTagDraft("");
    updateReadyPiece({ ...previous, tags: nextTags });
    try {
      await updateRecordTags(userId, recordId, nextTags);
    } catch {
      if (isCurrent(identity)) {
        updateReadyPiece(previous);
        announceActionError();
      }
    } finally {
      if (locksRef.current.tags === identity) locksRef.current.tags = null;
      if (isCurrent(identity)) setTagsBusy(false);
    }
  }, [
    announceActionError,
    identity,
    isCurrent,
    primary,
    recordId,
    tagDraft,
    updateReadyPiece,
    userId,
  ]);

  const moveTo = useCallback(
    async (target: DomainId) => {
      if (
        locksRef.current.tags ||
        primary.status !== "ready" ||
        primary.identity !== identity ||
        primary.piece.origin !== "record" ||
        !userId ||
        !recordId ||
        !identity
      )
        return;
      const previous = primary.piece;
      const currentTags = previous.tags ?? [];
      const nextTags = movedTags(currentTags, target);
      if (sameStrings(currentTags, nextTags)) {
        setMoving(false);
        return;
      }

      locksRef.current.tags = identity;
      setTagsBusy(true);
      setActionError(null);
      updateReadyPiece({ ...previous, tags: nextTags });
      try {
        await updateRecordTags(userId, recordId, nextTags);
        if (isCurrent(identity)) setMoving(false);
      } catch {
        if (isCurrent(identity)) {
          updateReadyPiece(previous);
          announceActionError();
        }
      } finally {
        if (locksRef.current.tags === identity) locksRef.current.tags = null;
        if (isCurrent(identity)) setTagsBusy(false);
      }
    },
    [announceActionError, identity, isCurrent, primary, recordId, updateReadyPiece, userId],
  );

  const handleDelete = useCallback(async () => {
    if (
      locksRef.current.delete ||
      primary.status !== "ready" ||
      primary.identity !== identity ||
      primary.piece.origin !== "record" ||
      !userId ||
      !identity
    )
      return;
    locksRef.current.delete = identity;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteRecord(userId, primary.piece.id);
      if (!isCurrent(identity)) return;
      reactExpression("sad");
      router.canGoBack() ? router.back() : router.replace("/records");
    } catch {
      if (isCurrent(identity)) announceActionError();
    } finally {
      if (locksRef.current.delete === identity) locksRef.current.delete = null;
      if (isCurrent(identity)) setDeleting(false);
    }
  }, [announceActionError, identity, isCurrent, primary, userId]);

  const promoteToWiki = useCallback(async () => {
    if (
      locksRef.current.promote ||
      promoted ||
      primary.status !== "ready" ||
      primary.identity !== identity ||
      primary.piece.origin !== "source" ||
      !userId ||
      !recordId ||
      !identity
    )
      return;
    locksRef.current.promote = identity;
    setPromoting(true);
    setActionError(null);
    try {
      await promotePendingUploads(userId).catch(() => undefined);
      const sourceId = recordId.startsWith(SOURCE_ID_PREFIX)
        ? recordId.slice(SOURCE_ID_PREFIX.length)
        : recordId;
      await generateSourcePage(userId, sourceId);
      if (!isCurrent(identity)) return;
      setPromoted(true);
      AccessibilityInfo.announceForAccessibility(t("deepspace:ds.wikiRecords.wikiPageMade"));
    } catch {
      if (isCurrent(identity)) announceActionError();
    } finally {
      if (locksRef.current.promote === identity) locksRef.current.promote = null;
      if (isCurrent(identity)) setPromoting(false);
    }
  }, [announceActionError, identity, isCurrent, primary, promoted, recordId, t, userId]);

  const readyPiece =
    primary.status === "ready" && primary.identity === identity ? primary.piece : null;
  const visibleTags = useMemo(() => stripDomainTags(readyPiece?.tags ?? []), [readyPiece?.tags]);

  const closeDelete = useCallback(() => {
    if (!deleting) setConfirmingDelete(false);
  }, [deleting]);
  const closeMove = useCallback(() => {
    if (!tagsBusy) setMoving(false);
  }, [tagsBusy]);

  const goBack = useCallback(() => {
    router.canGoBack() ? router.back() : router.replace("/records");
  }, []);

  const title = t("deepspace:recordDetail.title");

  if (authLoading) {
    return (
      <DeepSpaceScreen active="wiki" variant="windowed" header="none" title={title} onBack={goBack}>
        <View style={styles.centerState}>
          <DeepSpaceLoader variant="dots" caption={t("recordDetail:loading.auth")} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;
  if (hasProfile === null && !profileProbeFailed) {
    return (
      <DeepSpaceScreen active="wiki" variant="windowed" header="none" title={title} onBack={goBack}>
        <View style={styles.centerState}>
          <DeepSpaceLoader variant="dots" caption={t("recordDetail:loading.auth")} />
        </View>
      </DeepSpaceScreen>
    );
  }
  if (profileProbeFailed) {
    return (
      <DeepSpaceScreen active="wiki" variant="windowed" header="none" title={title} onBack={goBack}>
        {stateShell(
          t("recordDetail:state.errorTitle"),
          t("common:errors.network"),
          t("common:actions.retry"),
          () => void refresh(),
          "refresh",
        )}
      </DeepSpaceScreen>
    );
  }
  if (hasProfile === false) return <Redirect href="/complete-profile" />;

  if (primary.identity !== identity || primary.status === "idle" || primary.status === "loading") {
    return (
      <DeepSpaceScreen active="wiki" variant="windowed" header="none" title={title} onBack={goBack}>
        <View style={styles.centerState}>
          <DeepSpaceLoader variant="dots" caption={t("recordDetail:loading.record")} />
        </View>
      </DeepSpaceScreen>
    );
  }

  if (primary.status === "missing") {
    return (
      <DeepSpaceScreen active="wiki" variant="windowed" header="none" title={title} onBack={goBack}>
        {stateShell(
          t("recordDetail:state.missingTitle"),
          null,
          t("recordDetail:actions.backToRecords"),
          () => router.replace("/records"),
          "inbox",
        )}
      </DeepSpaceScreen>
    );
  }

  if (primary.status === "timeout" || primary.status === "error") {
    return (
      <DeepSpaceScreen active="wiki" variant="windowed" header="none" title={title} onBack={goBack}>
        {stateShell(
          t("recordDetail:state.errorTitle"),
          primary.status === "timeout" ? t("common:errors.network") : null,
          t("common:actions.retry"),
          () => setPrimaryRetry((value) => value + 1),
          "refresh",
        )}
      </DeepSpaceScreen>
    );
  }

  const piece = primary.piece;
  const type = presentationType(piece);
  const assessment = assessmentInfo(piece);
  const structured = parseStructured(piece.structured);
  const displayTitle = titleOf(
    piece,
    t("deepspace:recordDetail.kindFallback"),
    !assessment.isAssessment,
  );
  const date = evidenceDateLabel(piece.created_at, i18n.language === "ko" ? "ko" : "en");
  const domain = canonicalDomain(piece.tags ?? []);
  const relatedItems = mergedRelated(piece, related, t("deepspace:recordDetail.kindFallback"));
  const relatedIsSettled = relationSettled(related);
  const evidenceLine =
    relatedIsSettled && domain
      ? t("deepspace:ds.wikiRecords.secondbLinked", {
          star:
            i18n.language === "ko" ? getDomainStar(domain).nameKo : getDomainStar(domain).nameEn,
          n: relatedItems.length,
        })
      : relatedIsSettled && relatedItems.length > 0
        ? t("deepspace:recordDetail.headerLinked", { count: relatedItems.length })
        : t("deepspace:recordDetail.headerAlone");
  const source = piece.origin === "source";
  const fallbackBody = t("recordDetail:body.noText");
  const secondaryBody = piece.conclusion?.trim() || null;
  const canEdit = !source && Boolean(piece.body?.trim()) && !assessment.isAssessment && !structured;
  const recordBusy = editBusy || tagsBusy || deleting;

  return (
    <DeepSpaceScreen active="wiki" variant="windowed" header="none" title={title} onBack={goBack}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <PixelSurface variant="frame" contentStyle={styles.typeHeader}>
            <PixelSurface variant="inset" contentStyle={styles.typeIcon}>
              <PixelGlyph name={TYPE_GLYPH[type]} color={m3.color.primary} size={24} />
            </PixelSurface>
            <View style={styles.typeCopy}>
              <RNText style={[m3TextStyle("labelLarge"), styles.typeLabel]}>
                {t(typeLabelKey(piece))}
              </RNText>
              {date ? (
                <RNText style={[m3TextStyle("bodySmall"), styles.dateLabel]}>{date}</RNText>
              ) : null}
            </View>
          </PixelSurface>

          <RNText
            accessibilityRole="header"
            style={[m3TextStyle("headlineSmall"), styles.pieceTitle]}
          >
            {displayTitle}
          </RNText>

          {actionError ? (
            <PixelSurface variant="frame" background={m3.color.errorContainer}>
              <RNText
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                style={[m3TextStyle("bodyMedium"), styles.errorText]}
              >
                {actionError}
              </RNText>
            </PixelSurface>
          ) : null}

          {assessment.isAssessment ? (
            <PixelSurface variant="inset" contentStyle={styles.bodySurface}>
              <RNText style={[m3TextStyle("bodyMedium"), styles.bodyText]}>
                {t("deepspace:recordDetail.assessmentBody")}
              </RNText>
              {assessment.route ? (
                <PixelPressable
                  onPress={() => router.push(assessment.route as Href)}
                  accessibilityLabel={t("deepspace:recordDetail.assessmentCta")}
                  fullWidth
                  background={m3.color.primary}
                  contentStyle={styles.inlineAction}
                >
                  <RNText style={[m3TextStyle("labelLarge"), styles.primaryLabel]}>
                    {t("deepspace:recordDetail.assessmentCta")}
                  </RNText>
                  <PixelGlyph name="arrowForward" color={m3.color.onPrimary} size={24} />
                </PixelPressable>
              ) : null}
            </PixelSurface>
          ) : editing ? (
            <PixelSurface variant="inset" contentStyle={styles.bodySurface}>
              <TextInput
                value={bodyDraft}
                onChangeText={setBodyDraft}
                editable={!editBusy}
                multiline
                autoFocus
                textAlignVertical="top"
                style={styles.editInput}
                accessibilityLabel={t("deepspace:ds.wikiRecords.edit")}
              />
              <View style={styles.stackActions}>
                <PixelPressable
                  variant="frame"
                  onPress={() => setEditing(false)}
                  disabled={editBusy}
                  accessibilityLabel={t("deepspace:recordDetail.deleteCancel")}
                  fullWidth
                  contentStyle={styles.centerButton}
                >
                  <RNText style={[m3TextStyle("labelLarge"), styles.secondaryLabel]}>
                    {t("deepspace:recordDetail.deleteCancel")}
                  </RNText>
                </PixelPressable>
                <PixelPressable
                  onPress={() => void submitEdit()}
                  disabled={editBusy}
                  accessibilityLabel={t("deepspace:recordDetail.editSave")}
                  accessibilityState={{ busy: editBusy }}
                  fullWidth
                  background={editBusy ? m3.disabled.primary : m3.color.primary}
                  contentStyle={styles.centerButton}
                >
                  <RNText
                    style={[
                      m3TextStyle("labelLarge"),
                      { color: editBusy ? m3.disabled.onPrimary : m3.color.onPrimary },
                    ]}
                  >
                    {t("deepspace:recordDetail.editSave")}
                  </RNText>
                </PixelPressable>
              </View>
            </PixelSurface>
          ) : (
            <PixelSurface variant="inset" contentStyle={styles.bodySurface}>
              <RNText selectable style={[m3TextStyle("bodyLarge"), styles.bodyText]}>
                {piece.body?.trim() || secondaryBody || fallbackBody}
              </RNText>
            </PixelSurface>
          )}

          {structured ? (
            <PixelSurface variant="inset" contentStyle={styles.structuredSurface}>
              <RNText style={[m3TextStyle("labelLarge"), styles.sectionLabel]}>
                {structured.form === "fourw" ? "4W1H" : "3C4P"}
              </RNText>
              {Object.entries(structured.fields).map(([key, value]) => (
                <View key={key} style={styles.structuredRow}>
                  <RNText style={[m3TextStyle("labelMedium"), styles.structuredLabel]}>
                    {structuredFieldLabel(
                      structured.form,
                      key,
                      i18n.language === "ko" ? "ko" : "en",
                    )}
                  </RNText>
                  <RNText selectable style={[m3TextStyle("bodyMedium"), styles.bodyText]}>
                    {value}
                  </RNText>
                </View>
              ))}
            </PixelSurface>
          ) : null}

          <PixelSurface variant="bevel" contentStyle={styles.evidenceSurface}>
            <PixelGlyph name="bubble" color={m3.color.tertiary} size={24} />
            <RNText style={[m3TextStyle("bodyMedium"), styles.evidenceText]}>{evidenceLine}</RNText>
          </PixelSurface>

          <View style={styles.sectionBlock}>
            <RNText style={[m3TextStyle("labelLarge"), styles.sectionLabel]}>
              {t("deepspace:ds.wikiRecords.tags")}
            </RNText>
            <View style={styles.tagRow}>
              {visibleTags.map((tag) => (
                <PixelSurface key={tag} variant="frame" contentStyle={styles.tagContent}>
                  <RNText style={[m3TextStyle("labelMedium"), styles.tagText]}>{tag}</RNText>
                </PixelSurface>
              ))}
              {source ? null : addingTag ? (
                <PixelSurface
                  variant="inset"
                  style={styles.tagInputSurface}
                  contentStyle={styles.tagInputContent}
                >
                  <TextInput
                    value={tagDraft}
                    onChangeText={setTagDraft}
                    editable={!tagsBusy}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={() => void submitTag()}
                    placeholder={t("deepspace:ds.wikiRecords.addTag")}
                    placeholderTextColor={m3.color.onSurfaceVariant}
                    style={styles.tagInput}
                    accessibilityLabel={t("deepspace:ds.wikiRecords.addTag")}
                  />
                </PixelSurface>
              ) : (
                <PixelPressable
                  variant="frame"
                  onPress={() => {
                    setActionError(null);
                    setAddingTag(true);
                  }}
                  disabled={recordBusy}
                  accessibilityLabel={t("deepspace:ds.wikiRecords.addTag")}
                  contentStyle={styles.tagAction}
                >
                  <PixelGlyph name="add" color={m3.color.primary} size={24} />
                  <RNText style={[m3TextStyle("labelMedium"), styles.tagText]}>
                    {t("deepspace:ds.wikiRecords.addTag")}
                  </RNText>
                </PixelPressable>
              )}
            </View>
          </View>

          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeader}>
              <RNText style={[m3TextStyle("labelLarge"), styles.sectionLabel]}>
                {t("deepspace:ds.wikiRecords.linkedRecords")}
              </RNText>
              {relationBusy(related) ? <DeepSpaceLoader variant="dots" /> : null}
            </View>
            {relatedItems.length > 0 ? (
              <View style={styles.relatedList}>
                {relatedItems.map((item) => {
                  const itemType = presentationType({
                    kind: item.kind,
                    topic: item.title,
                    summary: null,
                    body: null,
                    tags: [],
                  });
                  return (
                    <PixelPressable
                      key={item.id}
                      variant="frame"
                      onPress={() =>
                        router.push({ pathname: "/record/[id]", params: { id: item.id } })
                      }
                      accessibilityLabel={item.title}
                      fullWidth
                      contentStyle={styles.relatedRow}
                    >
                      <PixelGlyph name={TYPE_GLYPH[itemType]} color={m3.color.primary} size={24} />
                      <RNText
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        style={[m3TextStyle("bodyMedium"), styles.relatedTitle]}
                      >
                        {item.title}
                      </RNText>
                      {item.semantic ? (
                        <PixelSurface variant="inset" contentStyle={styles.semanticBadge}>
                          <RNText style={[m3TextStyle("labelSmall"), styles.semanticText]}>
                            {t("deepspace:ds.wikiRecords.meaning")}
                          </RNText>
                        </PixelSurface>
                      ) : null}
                      <PixelGlyph name="chevronRight" color={m3.color.onSurfaceVariant} size={24} />
                    </PixelPressable>
                  );
                })}
              </View>
            ) : null}
            {relationFailed(related) ? (
              <PixelSurface variant="frame" contentStyle={styles.relatedError}>
                <RNText
                  accessibilityRole="alert"
                  style={[m3TextStyle("bodySmall"), styles.stateBody]}
                >
                  {t("deepspace:records.loadError")}
                </RNText>
                <PixelPressable
                  variant="frame"
                  onPress={() => setRelatedRetry((value) => value + 1)}
                  accessibilityLabel={t("deepspace:records.retry")}
                  fullWidth
                  contentStyle={styles.centerButton}
                >
                  <RNText style={[m3TextStyle("labelLarge"), styles.secondaryLabel]}>
                    {t("deepspace:records.retry")}
                  </RNText>
                </PixelPressable>
              </PixelSurface>
            ) : null}
          </View>

          {source ? (
            <PixelPressable
              onPress={() => void promoteToWiki()}
              disabled={promoting || promoted}
              accessibilityLabel={
                promoted
                  ? t("deepspace:ds.wikiRecords.wikiPageMade")
                  : t("deepspace:ds.wikiRecords.makeWikiPage")
              }
              accessibilityState={{ busy: promoting }}
              fullWidth
              background={promoting || promoted ? m3.disabled.primary : m3.color.primary}
              contentStyle={styles.actionContent}
            >
              <PixelGlyph
                name={promoted ? "check" : "book"}
                color={promoting || promoted ? m3.disabled.onPrimary : m3.color.onPrimary}
                size={24}
              />
              <RNText
                style={[
                  m3TextStyle("labelLarge"),
                  { color: promoting || promoted ? m3.disabled.onPrimary : m3.color.onPrimary },
                ]}
              >
                {promoted
                  ? t("deepspace:ds.wikiRecords.wikiPageMade")
                  : t("deepspace:ds.wikiRecords.makeWikiPage")}
              </RNText>
            </PixelPressable>
          ) : (
            <View style={styles.stackActions}>
              {canEdit ? (
                <PixelPressable
                  variant="frame"
                  onPress={startEdit}
                  disabled={recordBusy}
                  accessibilityLabel={t("deepspace:ds.wikiRecords.edit")}
                  fullWidth
                  contentStyle={styles.actionContent}
                >
                  <PixelGlyph name="edit" color={m3.color.primary} size={24} />
                  <RNText style={[m3TextStyle("labelLarge"), styles.secondaryLabel]}>
                    {t("deepspace:ds.wikiRecords.edit")}
                  </RNText>
                </PixelPressable>
              ) : null}
              <PixelPressable
                variant="frame"
                onPress={() => {
                  setActionError(null);
                  setMoving(true);
                }}
                disabled={recordBusy}
                accessibilityLabel={t("deepspace:ds.wikiRecords.move")}
                fullWidth
                contentStyle={styles.actionContent}
              >
                <PixelGlyph name="workspaces" color={m3.color.primary} size={24} />
                <RNText style={[m3TextStyle("labelLarge"), styles.secondaryLabel]}>
                  {t("deepspace:ds.wikiRecords.move")}
                </RNText>
              </PixelPressable>
              <PixelPressable
                variant="frame"
                onPress={() => {
                  setActionError(null);
                  setConfirmingDelete(true);
                }}
                disabled={recordBusy}
                accessibilityLabel={t("deepspace:recordDetail.a11yDelete")}
                fullWidth
                background={m3.color.errorContainer}
                contentStyle={styles.actionContent}
              >
                <PixelGlyph name="trash" color={m3.color.error} size={24} />
                <RNText style={[m3TextStyle("labelLarge"), styles.dangerLabel]}>
                  {t("deepspace:recordDetail.deleteConfirm")}
                </RNText>
              </PixelPressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {source ? null : (
        <>
          <PremiumModal
            visible={confirmingDelete}
            onClose={closeDelete}
            accessibilityLabel={t("deepspace:recordDetail.deleteConfirmTitle")}
          >
            <PixelSurface variant="bevel" contentStyle={styles.modalContent}>
              <PixelGlyph name="trash" color={m3.color.error} size={48} />
              <RNText
                accessibilityRole="header"
                style={[m3TextStyle("titleLarge"), styles.modalTitle]}
              >
                {t("deepspace:recordDetail.deleteConfirmTitle")}
              </RNText>
              <RNText style={[m3TextStyle("bodyMedium"), styles.stateBody]}>
                {t("deepspace:recordDetail.deleteConfirmBody")}
              </RNText>
              {actionError ? (
                <RNText
                  accessibilityRole="alert"
                  style={[m3TextStyle("bodySmall"), styles.errorText]}
                >
                  {actionError}
                </RNText>
              ) : null}
              <View style={styles.stackActions}>
                <PixelPressable
                  variant="frame"
                  onPress={closeDelete}
                  disabled={deleting}
                  accessibilityLabel={t("deepspace:recordDetail.deleteCancel")}
                  fullWidth
                  contentStyle={styles.centerButton}
                >
                  <RNText style={[m3TextStyle("labelLarge"), styles.secondaryLabel]}>
                    {t("deepspace:recordDetail.deleteCancel")}
                  </RNText>
                </PixelPressable>
                <PixelPressable
                  onPress={() => void handleDelete()}
                  disabled={deleting}
                  accessibilityLabel={t("deepspace:recordDetail.deleteConfirm")}
                  accessibilityState={{ busy: deleting }}
                  fullWidth
                  background={deleting ? m3.disabled.primary : m3.color.errorContainer}
                  contentStyle={styles.centerButton}
                >
                  <RNText
                    style={[
                      m3TextStyle("labelLarge"),
                      { color: deleting ? m3.disabled.onPrimary : m3.color.onErrorContainer },
                    ]}
                  >
                    {t("deepspace:recordDetail.deleteConfirm")}
                  </RNText>
                </PixelPressable>
              </View>
            </PixelSurface>
          </PremiumModal>

          <PremiumModal
            visible={moving}
            onClose={closeMove}
            accessibilityLabel={t("deepspace:ds.wikiRecords.move")}
          >
            <PixelSurface variant="bevel" contentStyle={styles.modalContent}>
              <RNText
                accessibilityRole="header"
                style={[m3TextStyle("titleLarge"), styles.modalTitle]}
              >
                {t("deepspace:ds.wikiRecords.move")}
              </RNText>
              {actionError ? (
                <RNText
                  accessibilityRole="alert"
                  style={[m3TextStyle("bodySmall"), styles.errorText]}
                >
                  {actionError}
                </RNText>
              ) : null}
              <View style={styles.moveList}>
                {DOMAIN_STARS.map((item) => {
                  const selected = canonicalDomain(piece.tags ?? []) === item.id;
                  return (
                    <PixelPressable
                      key={item.id}
                      variant={selected ? "inset" : "frame"}
                      onPress={() => void moveTo(item.id)}
                      disabled={tagsBusy}
                      accessibilityLabel={i18n.language === "ko" ? item.nameKo : item.nameEn}
                      accessibilityState={{ selected, busy: tagsBusy }}
                      fullWidth
                      contentStyle={styles.actionContent}
                    >
                      <PixelGlyph
                        name={selected ? "check" : "home"}
                        color={selected ? m3.color.tertiary : m3.color.primary}
                        size={24}
                      />
                      <RNText style={[m3TextStyle("labelLarge"), styles.secondaryLabel]}>
                        {i18n.language === "ko" ? item.nameKo : item.nameEn}
                      </RNText>
                    </PixelPressable>
                  );
                })}
              </View>
            </PixelSurface>
          </PremiumModal>
        </>
      )}
    </DeepSpaceScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minHeight: 0 },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", padding: m3.spacing.s6 },
  stateContent: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    gap: m3.spacing.s6,
    paddingVertical: m3.spacing.s8,
  },
  stateTitle: { color: m3.color.onSurface, textAlign: "center", paddingBottom: m3.spacing.s1 },
  stateBody: {
    color: m3.color.onSurfaceVariant,
    textAlign: "center",
    paddingBottom: m3.spacing.s1,
  },
  scroll: {
    gap: m3.spacing.s6,
    paddingHorizontal: m3.spacing.s6,
    paddingBottom: m3.spacing.s8 * 3,
  },
  typeHeader: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
  },
  typeIcon: {
    width: m3.minTouch,
    minHeight: m3.minTouch,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  typeCopy: { flex: 1, minWidth: 0, gap: m3.spacing.s1 },
  typeLabel: { color: m3.color.primary, paddingBottom: m3.spacing.s1 },
  dateLabel: { color: m3.color.onSurfaceVariant, paddingBottom: m3.spacing.s1 },
  pieceTitle: { color: m3.color.onSurface, paddingBottom: m3.spacing.s2 },
  bodySurface: { minHeight: m3.minTouch, gap: m3.spacing.s6, paddingVertical: m3.spacing.s6 },
  bodyText: { color: m3.color.onSurface, flexShrink: 1, minWidth: 0, paddingBottom: m3.spacing.s1 },
  editInput: {
    minHeight: 120,
    width: "100%",
    color: m3.color.onSurface,
    backgroundColor: m3.color.surfaceVariant,
    borderWidth: m3.spacing.s1,
    borderColor: m3.color.outline,
    borderRadius: m3.shape.none,
    fontFamily: m3.font.plain,
    fontSize: m3.type.bodyLarge.size,
    lineHeight: m3.type.bodyLarge.line,
    paddingHorizontal: m3.spacing.s4,
    paddingVertical: m3.spacing.s4,
  },
  structuredSurface: { gap: m3.spacing.s4, paddingVertical: m3.spacing.s6 },
  structuredRow: { gap: m3.spacing.s2 },
  structuredLabel: { color: m3.color.primary, paddingBottom: m3.spacing.s1 },
  evidenceSurface: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
    paddingVertical: m3.spacing.s6,
  },
  evidenceText: { flex: 1, minWidth: 0, color: m3.color.onSurface, paddingBottom: m3.spacing.s1 },
  sectionBlock: { gap: m3.spacing.s4 },
  sectionHeader: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s4,
  },
  sectionLabel: { color: m3.color.onSurface, paddingBottom: m3.spacing.s1 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: m3.spacing.s4 },
  tagContent: { minHeight: m3.minTouch, justifyContent: "center", paddingVertical: m3.spacing.s3 },
  tagText: { color: m3.color.primary, paddingBottom: m3.spacing.s1 },
  tagAction: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s2,
    paddingVertical: m3.spacing.s3,
  },
  tagInputSurface: { flexGrow: 1, minWidth: 160 },
  tagInputContent: { minHeight: m3.minTouch, justifyContent: "center", paddingVertical: 0 },
  tagInput: {
    minHeight: m3.minTouch,
    color: m3.color.onSurface,
    fontFamily: m3.font.plain,
    fontSize: m3.type.bodyMedium.size,
    lineHeight: m3.type.bodyMedium.line,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  relatedList: { gap: m3.spacing.s4 },
  relatedRow: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    gap: m3.spacing.s4,
    paddingVertical: m3.spacing.s4,
  },
  relatedTitle: { flex: 1, minWidth: 0, color: m3.color.onSurface, paddingBottom: m3.spacing.s1 },
  semanticBadge: {
    minHeight: m3.minTouch,
    justifyContent: "center",
    paddingHorizontal: m3.spacing.s2,
    paddingVertical: 0,
  },
  semanticText: { color: m3.color.tertiary, paddingBottom: m3.spacing.s1 },
  relatedError: { gap: m3.spacing.s4 },
  stackActions: { alignSelf: "stretch", gap: m3.spacing.s4 },
  actionContent: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: m3.spacing.s4,
    paddingVertical: m3.spacing.s4,
  },
  inlineAction: {
    minHeight: m3.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: m3.spacing.s4,
    paddingVertical: m3.spacing.s4,
  },
  centerButton: {
    minHeight: m3.minTouch,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: m3.spacing.s4,
  },
  primaryLabel: {
    flexShrink: 1,
    minWidth: 0,
    color: m3.color.onPrimary,
    textAlign: "center",
    paddingBottom: m3.spacing.s1,
  },
  secondaryLabel: {
    flexShrink: 1,
    minWidth: 0,
    color: m3.color.primary,
    textAlign: "center",
    paddingBottom: m3.spacing.s1,
  },
  dangerLabel: {
    flexShrink: 1,
    minWidth: 0,
    color: m3.color.onErrorContainer,
    textAlign: "center",
    paddingBottom: m3.spacing.s1,
  },
  errorText: { color: m3.color.onErrorContainer, paddingBottom: m3.spacing.s1 },
  modalContent: { alignSelf: "stretch", gap: m3.spacing.s6, paddingVertical: m3.spacing.s8 },
  modalTitle: { color: m3.color.onSurface, paddingBottom: m3.spacing.s1 },
  moveList: { alignSelf: "stretch", gap: m3.spacing.s4 },
});
