// 들어온 자료를 읽어 주는 자리.
//
// ── 왜 이 화면이 생겼나 (실측 2026-09-13) ────────────────────────────────
//
// 배송되는 앱에는 **가져온 자료가 도착한 뒤 무슨 일이 일어나는지 보는 곳이
// 없었다.** 파일을 넣으면 `sources` 행은 만들어지는데, 그 행을 띄우는 화면이
// 하나도 없었다.
//
// 그래서 Phase 1(자료를 읽고 요약과 되새김 질문 넷을 만드는 길)의 **배송
// 호출부가 0건**이었다. 호출부 둘은 둘 다 배송되지 않는 반쪽 안에 있었고
// (`src/app/inbox.tsx:452`, `src/app/wiki.tsx:318`),
// `DeepSpaceDesignScreens.tsx` 는 152·159·160 세 줄에서
// `listSources` · `generateSourcePage` · `runPhase1` 을 **import 만 하고 한
// 번도 쓰지 않았다** — 이 화면을 만들려다 멈춘 자리다. eslint 의
// `no-unused-vars` 가 `warn` 이라 CI 는 계속 초록이었다.
//
// 그 결과 가져오기 화면이 코드로 적어둔 약속이 지켜질 수 없었다:
//   "No LLM here - imported notes land in the inbox for Phase 1/2 later ($0)"
// 나중이 오지 않았다. 이 화면이 그 "나중"이다.
//
// ── 왜 알림 허브 안이 아니라 별도 화면인가 ───────────────────────────────
//
// 옛 `/inbox`(858줄)는 소스 목록이었고 지금 `/inbox`(145줄)는 신호 허브다.
// 목록을 허브 안에 넣으면 허브가 목록이 된다 — "화면 하나에 메시지 하나"와
// O-7(터치는 화면을 단순하게)을 정면으로 어긴다. 그래서 허브에는 **한 줄
// 신호**만 두고, 누르면 이 화면으로 **전환**한다. 기능은 하나도 안 줄었다.
//
// ── 위키로 점프하지 않는 이유 ────────────────────────────────────────────
//
// 옛 화면은 페이지를 만든 뒤 `/wiki?focusSourceId=…` 로 보냈는데, 배송 위키는
// `focusPageId` 를 읽는다 — 즉 그 파라미터는 **받는 사람이 없다**(#1782 에서
// 고아 파라미터 셋 중 하나로 기록됐다). 여기서 같은 파라미터를 다시 보내면
// 내가 방금 찾아낸 결함을 내 손으로 다시 만드는 것이다. 그래서 지금은 위키를
// 파라미터 없이 연다. 점프는 위키 회차(검색·지표와 같은 묶음)에서 받는 쪽을
// 먼저 만들고 잇는다.
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useTranslation } from "react-i18next";

import { PixelGlyph } from "@/components/pixel/PixelGlyph";
import { canonGlyph, type AnyGlyphName } from "@/components/pixel/pixel-glyphs";
import { m3 } from "@/lib/theme/m3";
import { MdButton, MdCard, m3TextStyle } from "@/components/m3";
import { DeepSpaceLoader } from "@/components/deepspace";
import { DeepSpaceScreen } from "@/components/deep-space/DeepSpaceScreen";
import { useAuth } from "@/lib/auth/AuthContext";
import { listSources } from "@/lib/wiki/queries";
import { downloadRawClipping } from "@/lib/wiki/storage";
import { readPhase1, runPhase1, type Phase1Result } from "@/lib/wiki/phase1";
import { generateSourcePage } from "@/lib/wiki/phase2";
import type { SourceKind, SourceRow } from "@/lib/wiki/types";

/** 미리보기로 보여 주는 앞부분 길이. 본문 전체는 열지 않는다 — 이 화면은
 *  읽는 자리가 아니라 **무엇이 들어왔는지 알아보는** 자리다. */
const PREVIEW_CHARS = 600;

/** 한 화면에서 다루는 최대 소스 수. 옛 화면과 같은 값. */
const LIST_LIMIT = 100;

const KIND_GLYPH: Readonly<Record<string, string>> = {
  article: "article",
  video: "play_circle",
  paper: "school",
  code: "code",
  reddit: "forum",
  inbox: "inbox",
};

function glyphFor(kind: SourceKind): AnyGlyphName {
  return canonGlyph(KIND_GLYPH[kind] ?? "description");
}

/** runPhase1 은 en/ko 두 갈래만 받는다. 나머지 세 로케일은 en 으로 간다 —
 *  화면 문구는 다섯 언어 전부 번역돼 있고, 모델에게 주는 지시만 en 이다. */
function promptLocale(language: string | undefined): "en" | "ko" {
  return language?.toLowerCase().startsWith("ko") === true ? "ko" : "en";
}

type BodyState = { kind: "loading" } | { kind: "text"; text: string } | { kind: "error" };

function Loading() {
  return (
    <View style={s.loading}>
      <DeepSpaceLoader variant="dots" />
    </View>
  );
}

export function DeepSpaceSourcesScreen() {
  const { t } = useTranslation("deepspace");
  const { userId, loading: authLoading } = useAuth();

  const title = t("ds.sources.title");
  if (authLoading) {
    return (
      <DeepSpaceScreen active="lens" header="none" variant="windowed" title={title} onBack={() => router.back()}>
        <Loading />
      </DeepSpaceScreen>
    );
  }
  if (!userId) return <Redirect href="/sign-in" />;

  return <SourcesBody userId={userId} title={title} />;
}

function SourcesBody({ userId, title }: { userId: string; title: string }) {
  const { t, i18n } = useTranslation("deepspace");
  const { isMinor } = useAuth();
  const locale = promptLocale(i18n.language);

  const [rows, setRows] = useState<SourceRow[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bodyById, setBodyById] = useState<Record<string, BodyState>>({});
  const [briefId, setBriefId] = useState<string | null>(null);
  const [pageId, setPageId] = useState<string | null>(null);
  const [openBrief, setOpenBrief] = useState<{ id: string; result: Phase1Result } | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listSources(userId, { limit: LIST_LIMIT }));
    } catch (e) {
      console.warn("[sources] listSources failed", (e as Error).message);
      setRows([]);
      setNotice({ tone: "bad", text: t("ds.sources.loadError") });
    }
  }, [userId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // 본문은 펼칠 때 한 번만 받아 캐시한다. 실패는 캐시하되 **다시 누르면 다시
  // 시도**한다 — 실패를 성공처럼 캐시하면 사용자는 영원히 같은 오류를 본다.
  const toggleExpand = useCallback(
    (row: SourceRow) => {
      const next = expandedId === row.id ? null : row.id;
      setExpandedId(next);
      if (next === null) return;
      const cached = bodyById[row.id];
      if (cached !== undefined && cached.kind === "text") return;
      setBodyById((prev) => ({ ...prev, [row.id]: { kind: "loading" } }));
      void downloadRawClipping(row.storage_path)
        .then((text) => setBodyById((prev) => ({ ...prev, [row.id]: { kind: "text", text } })))
        .catch(() => setBodyById((prev) => ({ ...prev, [row.id]: { kind: "error" } })));
    },
    [expandedId, bodyById],
  );

  const makeBrief = useCallback(
    async (row: SourceRow) => {
      if (briefId !== null) return;
      setBriefId(row.id);
      setNotice(null);
      try {
        const result = await runPhase1({ userId, sourceId: row.id, locale, minor: isMinor === true });
        setOpenBrief({ id: row.id, result });
        await load();
      } catch (e) {
        // 원문 오류는 로그에만. 화면에는 제품 말투 + 다시 하기.
        console.warn("[sources] runPhase1 failed", (e as Error).message);
        setNotice({ tone: "bad", text: t("ds.sources.briefError") });
      } finally {
        setBriefId(null);
      }
    },
    [briefId, userId, locale, isMinor, load, t],
  );

  const makePage = useCallback(
    async (row: SourceRow) => {
      if (pageId !== null) return;
      setPageId(row.id);
      setNotice(null);
      try {
        await generateSourcePage(userId, row.id);
        setNotice({ tone: "ok", text: t("ds.sources.pageDone", { title: sourceTitle(row, t) }) });
        await load();
      } catch (e) {
        console.warn("[sources] generateSourcePage failed", (e as Error).message);
        setNotice({ tone: "bad", text: t("ds.sources.pageError") });
      } finally {
        setPageId(null);
      }
    },
    [pageId, userId, load, t],
  );

  if (rows === null) {
    return (
      <DeepSpaceScreen active="lens" header="none" variant="windowed" title={title} onBack={() => router.back()}>
        <Loading />
      </DeepSpaceScreen>
    );
  }

  return (
    <DeepSpaceScreen active="lens" header="none" variant="windowed" title={title} onBack={() => router.back()}>
      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        <RNText style={[m3TextStyle("headlineSmall"), s.pageTitle]}>{title}</RNText>

        {notice !== null ? (
          <View
            style={[s.notice, notice.tone === "bad" ? s.noticeBad : s.noticeOk]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <RNText style={[m3TextStyle("bodySmall"), s.noticeText]}>{notice.text}</RNText>
          </View>
        ) : null}

        {rows.length === 0 ? (
          <View style={s.empty}>
            <RNText style={[m3TextStyle("bodyMedium"), s.dim]}>{t("ds.sources.empty")}</RNText>
            <MdButton
              label={t("ds.sources.emptyCta")}
              variant="filled"
              onPress={() => router.push("/import")}
              accessibilityLabel={t("ds.sources.emptyCta")}
              style={s.emptyCta}
            />
          </View>
        ) : (
          <View style={s.stack10}>
            <RNText style={[m3TextStyle("bodySmall"), s.dim]}>
              {t("ds.sources.count", { n: rows.length })}
            </RNText>
            {rows.map((row) => (
              <SourceCard
                key={row.id}
                row={row}
                expanded={expandedId === row.id}
                body={bodyById[row.id]}
                briefRunning={briefId === row.id}
                pageRunning={pageId === row.id}
                brief={openBrief !== null && openBrief.id === row.id ? openBrief.result : null}
                onToggle={() => toggleExpand(row)}
                onMakeBrief={() => void makeBrief(row)}
                onShowBrief={() => {
                  const stored = readPhase1(row.frontmatter);
                  if (stored !== null) setOpenBrief({ id: row.id, result: stored });
                }}
                onHideBrief={() => setOpenBrief(null)}
                onMakePage={() => void makePage(row)}
                onOpenWiki={() => router.push("/wiki")}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </DeepSpaceScreen>
  );
}

function sourceTitle(row: SourceRow, t: (k: string) => string): string {
  const named = row.title.trim();
  return named.length > 0 ? named : t("ds.sources.untitled");
}

interface CardProps {
  row: SourceRow;
  expanded: boolean;
  body: BodyState | undefined;
  briefRunning: boolean;
  pageRunning: boolean;
  brief: Phase1Result | null;
  onToggle: () => void;
  onMakeBrief: () => void;
  onShowBrief: () => void;
  onHideBrief: () => void;
  onMakePage: () => void;
  onOpenWiki: () => void;
}

function SourceCard(p: CardProps) {
  const { t } = useTranslation("deepspace");
  const { row } = p;
  const name = sourceTitle(row, t);
  const hasBrief = readPhase1(row.frontmatter) !== null;

  return (
    <MdCard variant="filled" style={s.card}>
      <Pressable
        onPress={p.onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: p.expanded }}
        accessibilityLabel={
          p.expanded
            ? t("ds.sources.collapseFor", { title: name })
            : t("ds.sources.expandFor", { title: name })
        }
        style={s.cardHead}
      >
        <View style={s.kindBox}>
          <PixelGlyph name={glyphFor(row.kind)} color={m3.color.primary} size={20} />
        </View>
        <View style={s.flex1}>
          <RNText style={[m3TextStyle("titleSmall"), s.cardTitle]} numberOfLines={2}>
            {name}
          </RNText>
          {row.tags.length > 0 ? (
            <RNText style={[m3TextStyle("labelSmall"), s.dim]} numberOfLines={1}>
              #{row.tags.join(" #")}
            </RNText>
          ) : null}
        </View>
        <PixelGlyph
          name={canonGlyph(p.expanded ? "expand_less" : "expand_more")}
          color={m3.color.onSurfaceVariant}
          size={18}
        />
      </Pressable>

      {p.expanded ? (
        <View style={s.preview}>
          {p.body === undefined || p.body.kind === "loading" ? (
            <RNText style={[m3TextStyle("bodySmall"), s.dim]}>{t("ds.sources.previewLoading")}</RNText>
          ) : p.body.kind === "error" ? (
            <RNText style={[m3TextStyle("bodySmall"), s.dim]}>{t("ds.sources.previewError")}</RNText>
          ) : (
            <RNText style={[m3TextStyle("bodySmall"), s.previewText]}>
              {p.body.text.slice(0, PREVIEW_CHARS)}
              {p.body.text.length > PREVIEW_CHARS ? "…" : ""}
            </RNText>
          )}
        </View>
      ) : null}

      <View style={s.actions}>
        {hasBrief ? (
          <MdButton
            label={p.brief !== null ? t("ds.sources.briefHide") : t("ds.sources.briefView")}
            variant="text"
            onPress={p.brief !== null ? p.onHideBrief : p.onShowBrief}
            accessibilityLabel={t("ds.sources.briefViewFor", { title: name })}
            style={s.action}
          />
        ) : (
          <MdButton
            label={p.briefRunning ? t("ds.sources.briefRunning") : t("ds.sources.brief")}
            variant="text"
            disabled={p.briefRunning}
            onPress={p.onMakeBrief}
            accessibilityLabel={t("ds.sources.briefFor", { title: name })}
            accessibilityState={{ disabled: p.briefRunning, busy: p.briefRunning }}
            style={s.action}
          />
        )}

        {row.ingested ? (
          <MdButton
            label={t("ds.sources.pageOpen")}
            variant="text"
            onPress={p.onOpenWiki}
            accessibilityLabel={t("ds.sources.pageOpenFor", { title: name })}
            style={s.action}
          />
        ) : (
          <MdButton
            label={p.pageRunning ? t("ds.sources.pageRunning") : t("ds.sources.page")}
            variant="text"
            disabled={p.pageRunning}
            onPress={p.onMakePage}
            accessibilityLabel={t("ds.sources.pageFor", { title: name })}
            accessibilityState={{ disabled: p.pageRunning, busy: p.pageRunning }}
            style={s.action}
          />
        )}
      </View>

      {p.brief !== null ? (
        <View style={s.brief}>
          <RNText style={[m3TextStyle("labelSmall"), s.briefCap]}>{t("ds.sources.briefSummary")}</RNText>
          <RNText style={[m3TextStyle("bodySmall"), s.briefText]}>{p.brief.summary}</RNText>
          {p.brief.questions.length > 0 ? (
            <>
              <RNText style={[m3TextStyle("labelSmall"), s.briefCap]}>{t("ds.sources.briefQuestions")}</RNText>
              {p.brief.questions.map((q, i) => (
                <RNText key={i} style={[m3TextStyle("bodySmall"), s.briefText]}>
                  {i + 1}. {q}
                </RNText>
              ))}
            </>
          ) : null}
        </View>
      ) : null}
    </MdCard>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 },
  loading: { paddingVertical: 48, alignItems: "center" },
  flex1: { flex: 1, minWidth: 0 },
  stack10: { gap: 10 },
  pageTitle: { color: m3.color.onSurface, fontFamily: m3.font.brand, marginTop: 8, marginBottom: 12 },
  dim: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  empty: { gap: 14, paddingVertical: 24 },
  emptyCta: { alignSelf: "flex-start" },
  notice: { padding: 12, marginBottom: 12, borderLeftWidth: 3, backgroundColor: m3.color.surfaceContainer },
  noticeOk: { borderLeftColor: m3.color.primary },
  noticeBad: { borderLeftColor: m3.color.error },
  noticeText: { color: m3.color.onSurface, fontFamily: m3.font.brand },
  card: { padding: 14 },
  cardHead: { flexDirection: "row", gap: 12, alignItems: "center" },
  kindBox: {
    width: 40,
    height: 40,
    borderRadius: m3.shape.none,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: m3.color.surfaceContainer,
  },
  cardTitle: { color: m3.color.onSurface, fontFamily: m3.font.brand },
  preview: {
    marginTop: 10,
    padding: 10,
    backgroundColor: m3.color.surfaceContainer,
    borderRadius: m3.shape.none,
  },
  previewText: { color: m3.color.onSurfaceVariant, fontFamily: m3.font.brand },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  action: { minHeight: 44, paddingHorizontal: 0, marginRight: 12 },
  brief: {
    marginTop: 10,
    padding: 12,
    gap: 4,
    backgroundColor: m3.color.surfaceContainer,
    borderRadius: m3.shape.none,
  },
  briefCap: { color: m3.color.primary, fontFamily: m3.font.brand, marginTop: 4 },
  briefText: { color: m3.color.onSurface, fontFamily: m3.font.brand },
});
