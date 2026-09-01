import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useTranslation } from "react-i18next";

import { SecondbStatusHeader } from "@/components/deepspace";
import { startTask } from "@/lib/tasks/store";
import { Text } from "@/components/ui/Text";
import { colors, radius, spacing } from "@/theme/tokens";
import { withAlpha } from "@/lib/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { m3 } from "@/lib/theme/m3";

type CopyLocale = "en" | "ko" | "es" | "pt" | "id";

interface FlowColumn {
  title: string;
  subtitle: string;
  tone: "mint" | "cyan" | "soul";
  items: { label: string; path: Href; note: string }[];
}

const FLOW: FlowColumn[] = [
  {
    title: "① 진입",
    subtitle: "온보딩 · 인증",
    tone: "mint",
    items: [
      { label: "인트로", path: "/onboarding", note: "첫 기록까지" },
      { label: "로그인", path: "/sign-in", note: "Google · email" },
      { label: "가입", path: "/sign-up", note: "age-tier" },
      { label: "프로필", path: "/complete-profile", note: "동의 · 기본값" },
    ],
  },
  {
    title: "② 홈",
    subtitle: "북극성 · 7별",
    tone: "soul",
    items: [
      { label: "홈 별자리", path: "/deepspace-home", note: "preview" },
      { label: "북극성", path: "/core-brain", note: "종합" },
      { label: "라이브 홈", path: "/", note: "shell" },
    ],
  },
  {
    title: "③ 자기이해",
    subtitle: "7렌즈",
    tone: "cyan",
    items: [
      { label: "지금의 나", path: "/big-five", note: "now" },
      { label: "회상", path: "/interview", note: "recall" },
      { label: "보여지는 나", path: "/persona", note: "seen" },
      { label: "리듬", path: "/esm", note: "rhythm" },
      { label: "관계", path: "/attachment", note: "relational" },
      { label: "될 수 있는 나", path: "/imagine", note: "possible" },
      { label: "가치", path: "/audit?screener=1", note: "values" },
    ],
  },
  {
    title: "④ 매일 허브",
    subtitle: "담기 · 세컨비",
    tone: "cyan",
    items: [
      { label: "허브 preview", path: "/deepspace-hub", note: "4 panels" },
      { label: "담기", path: "/capture", note: "first save" },
      { label: "세컨비", path: "/secondb", note: "chat" },
      { label: "트렌드", path: "/trends", note: "rising" },
      { label: "기록", path: "/records", note: "archive" },
    ],
  },
  {
    title: "⑤ 지식망",
    subtitle: "그래프 · wiki",
    tone: "soul",
    items: [
      { label: "그래프", path: "/graph", note: "map" },
      { label: "위키", path: "/wiki", note: "knowledge" },
      { label: "인사이트", path: "/insights", note: "patterns" },
      { label: "리서치", path: "/research", note: "sources" },
      { label: "AI 뮤지엄", path: "/museum", note: "history" },
    ],
  },
  {
    title: "⑥ 시스템",
    subtitle: "계정 · 내보내기",
    tone: "mint",
    items: [
      { label: "프로필", path: "/profile", note: "me" },
      { label: "계정", path: "/account", note: "identity" },
      { label: "개인정보", path: "/privacy", note: "trust" },
      { label: "IDEN", path: "/iden", note: "export" },
      { label: "지원", path: "/support", note: "help" },
    ],
  },
];

const HEADER_COPY: Record<CopyLocale, { text: string; tip: string; title: string; subtitle: string; demoLabel: string; demoNote: string; loadingTitle: string; openSuffix: string }> = {
  en: { text: "The whole path is mapped on one screen. Home is the center.", tip: "Entry, home, capture, and export should connect without dead ends.", title: "Screen Relationship Map", subtitle: "A deep-space QA screen that checks the canonical flowmap against real routes.", demoLabel: "Preview loading system", demoNote: "Background dock plus completion toast demo", loadingTitle: "Reviewing your stars again", openSuffix: "open" },
  ko: { text: "전체 흐름을 한 장으로 묶었어요. 홈이 모든 화면의 중심이에요.", tip: "막히는 화면 없이 진입, 홈, 담기, 내보내기까지 이어져야 해요.", title: "화면 관계 지도", subtitle: "정본 flowmap을 실제 route로 검증하는 deep-space QA 화면입니다.", demoLabel: "로딩 시스템 미리보기", demoNote: "백그라운드 도크 + 완료 토스트 데모", loadingTitle: "별을 다시 살펴보는 중", openSuffix: "열기" },
  es: { text: "Todo el recorrido cabe en una pantalla. Inicio es el centro.", tip: "Entrada, inicio, captura y exportacion deben conectarse sin callejones sin salida.", title: "Mapa de relaciones de pantallas", subtitle: "Pantalla QA deep-space que compara el flowmap canonico con rutas reales.", demoLabel: "Vista previa del sistema de carga", demoNote: "Dock en segundo plano y toast de finalizacion", loadingTitle: "Revisando tus estrellas otra vez", openSuffix: "abrir" },
  pt: { text: "Todo o percurso esta em uma tela. A Home e o centro.", tip: "Entrada, home, captura e exportacao precisam se conectar sem becos sem saida.", title: "Mapa de relacao das telas", subtitle: "Tela QA deep-space que confere o flowmap canonico com rotas reais.", demoLabel: "Prever sistema de carregamento", demoNote: "Dock em segundo plano e toast de conclusao", loadingTitle: "Revendo suas estrelas novamente", openSuffix: "abrir" },
  id: { text: "Seluruh alur dipetakan dalam satu layar. Home menjadi pusatnya.", tip: "Masuk, home, capture, dan export harus tersambung tanpa jalan buntu.", title: "Peta Hubungan Layar", subtitle: "Layar QA deep-space yang memeriksa flowmap kanonis terhadap route nyata.", demoLabel: "Pratinjau sistem loading", demoNote: "Dock latar belakang dan toast selesai", loadingTitle: "Meninjau ulang bintangmu", openSuffix: "buka" },
};

const FLOW_BY_LOCALE: Record<CopyLocale, FlowColumn[]> = {
  ko: FLOW.map((column) => column.title === "② 홈" ? { ...column, items: column.items.map((item) => item.path === "/core-brain" ? { ...item, label: "북극성", note: "종합" } : item) } : column),
  en: [
    { title: "1 Entry", subtitle: "Onboarding · auth", tone: "mint", items: [{ label: "Intro", path: "/onboarding", note: "to first record" }, { label: "Sign in", path: "/sign-in", note: "Google · email" }, { label: "Sign up", path: "/sign-up", note: "age-tier" }, { label: "Profile", path: "/complete-profile", note: "consent · defaults" }] },
    { title: "2 Home", subtitle: "Polaris · 7 stars", tone: "soul", items: [{ label: "Home constellation", path: "/deepspace-home", note: "preview" }, { label: "Polaris", path: "/core-brain", note: "aggregate" }, { label: "Live home", path: "/", note: "shell" }] },
    { title: "3 Self-knowledge", subtitle: "7 lenses", tone: "cyan", items: [{ label: "Current self", path: "/big-five", note: "now" }, { label: "Recall", path: "/interview", note: "recall" }, { label: "Seen self", path: "/persona", note: "seen" }, { label: "Rhythm", path: "/esm", note: "rhythm" }, { label: "Relationship", path: "/attachment", note: "relational" }, { label: "Possible self", path: "/imagine", note: "possible" }, { label: "Values", path: "/audit?screener=1", note: "values" }] },
    { title: "4 Daily hub", subtitle: "Capture · SecondB", tone: "cyan", items: [{ label: "Hub preview", path: "/deepspace-hub", note: "4 panels" }, { label: "Capture", path: "/capture", note: "first save" }, { label: "SecondB", path: "/secondb", note: "chat" }, { label: "Trends", path: "/trends", note: "rising" }, { label: "Records", path: "/records", note: "archive" }] },
    { title: "5 Knowledge web", subtitle: "Graph · wiki", tone: "soul", items: [{ label: "Graph", path: "/graph", note: "map" }, { label: "Wiki", path: "/wiki", note: "knowledge" }, { label: "Insights", path: "/insights", note: "patterns" }, { label: "Research", path: "/research", note: "sources" }, { label: "AI Museum", path: "/museum", note: "history" }] },
    { title: "6 System", subtitle: "Account · export", tone: "mint", items: [{ label: "Profile", path: "/profile", note: "me" }, { label: "Account", path: "/account", note: "identity" }, { label: "Privacy", path: "/privacy", note: "trust" }, { label: "IDEN", path: "/iden", note: "export" }, { label: "Support", path: "/support", note: "help" }] },
  ],
  es: [
    { title: "1 Entrada", subtitle: "Onboarding · auth", tone: "mint", items: [{ label: "Intro", path: "/onboarding", note: "primer registro" }, { label: "Iniciar sesion", path: "/sign-in", note: "Google · email" }, { label: "Registrarse", path: "/sign-up", note: "age-tier" }, { label: "Perfil", path: "/complete-profile", note: "consentimiento · defaults" }] },
    { title: "2 Inicio", subtitle: "Polaris · 7 estrellas", tone: "soul", items: [{ label: "Constelacion inicial", path: "/deepspace-home", note: "preview" }, { label: "Polaris", path: "/core-brain", note: "sintesis" }, { label: "Inicio vivo", path: "/", note: "shell" }] },
    { title: "3 Autoconocimiento", subtitle: "7 lentes", tone: "cyan", items: [{ label: "Yo actual", path: "/big-five", note: "now" }, { label: "Recuerdo", path: "/interview", note: "recall" }, { label: "Yo visto", path: "/persona", note: "seen" }, { label: "Ritmo", path: "/esm", note: "rhythm" }, { label: "Relacion", path: "/attachment", note: "relational" }, { label: "Yo posible", path: "/imagine", note: "possible" }, { label: "Valores", path: "/audit?screener=1", note: "values" }] },
    { title: "4 Hub diario", subtitle: "Captura · SecondB", tone: "cyan", items: [{ label: "Preview del hub", path: "/deepspace-hub", note: "4 panels" }, { label: "Captura", path: "/capture", note: "first save" }, { label: "SecondB", path: "/secondb", note: "chat" }, { label: "Tendencias", path: "/trends", note: "rising" }, { label: "Registros", path: "/records", note: "archive" }] },
    { title: "5 Red de conocimiento", subtitle: "Grafo · wiki", tone: "soul", items: [{ label: "Grafo", path: "/graph", note: "map" }, { label: "Wiki", path: "/wiki", note: "knowledge" }, { label: "Insights", path: "/insights", note: "patterns" }, { label: "Investigacion", path: "/research", note: "sources" }, { label: "Museo AI", path: "/museum", note: "history" }] },
    { title: "6 Sistema", subtitle: "Cuenta · exportacion", tone: "mint", items: [{ label: "Perfil", path: "/profile", note: "me" }, { label: "Cuenta", path: "/account", note: "identity" }, { label: "Privacidad", path: "/privacy", note: "trust" }, { label: "IDEN", path: "/iden", note: "export" }, { label: "Soporte", path: "/support", note: "help" }] },
  ],
  pt: [
    { title: "1 Entrada", subtitle: "Onboarding · auth", tone: "mint", items: [{ label: "Intro", path: "/onboarding", note: "primeiro registro" }, { label: "Entrar", path: "/sign-in", note: "Google · email" }, { label: "Cadastrar", path: "/sign-up", note: "age-tier" }, { label: "Perfil", path: "/complete-profile", note: "consentimento · defaults" }] },
    { title: "2 Home", subtitle: "Polaris · 7 estrelas", tone: "soul", items: [{ label: "Constelacao da home", path: "/deepspace-home", note: "preview" }, { label: "Polaris", path: "/core-brain", note: "sintese" }, { label: "Home ativa", path: "/", note: "shell" }] },
    { title: "3 Autoconhecimento", subtitle: "7 lentes", tone: "cyan", items: [{ label: "Eu atual", path: "/big-five", note: "now" }, { label: "Recordacao", path: "/interview", note: "recall" }, { label: "Eu visto", path: "/persona", note: "seen" }, { label: "Ritmo", path: "/esm", note: "rhythm" }, { label: "Relacionamento", path: "/attachment", note: "relational" }, { label: "Eu possivel", path: "/imagine", note: "possible" }, { label: "Valores", path: "/audit?screener=1", note: "values" }] },
    { title: "4 Hub diario", subtitle: "Captura · SecondB", tone: "cyan", items: [{ label: "Preview do hub", path: "/deepspace-hub", note: "4 panels" }, { label: "Capturar", path: "/capture", note: "first save" }, { label: "SecondB", path: "/secondb", note: "chat" }, { label: "Tendencias", path: "/trends", note: "rising" }, { label: "Registros", path: "/records", note: "archive" }] },
    { title: "5 Rede de conhecimento", subtitle: "Grafo · wiki", tone: "soul", items: [{ label: "Grafo", path: "/graph", note: "map" }, { label: "Wiki", path: "/wiki", note: "knowledge" }, { label: "Insights", path: "/insights", note: "patterns" }, { label: "Pesquisa", path: "/research", note: "sources" }, { label: "Museu AI", path: "/museum", note: "history" }] },
    { title: "6 Sistema", subtitle: "Conta · exportacao", tone: "mint", items: [{ label: "Perfil", path: "/profile", note: "me" }, { label: "Conta", path: "/account", note: "identity" }, { label: "Privacidade", path: "/privacy", note: "trust" }, { label: "IDEN", path: "/iden", note: "export" }, { label: "Suporte", path: "/support", note: "help" }] },
  ],
  id: [
    { title: "1 Masuk", subtitle: "Onboarding · auth", tone: "mint", items: [{ label: "Intro", path: "/onboarding", note: "rekaman pertama" }, { label: "Masuk", path: "/sign-in", note: "Google · email" }, { label: "Daftar", path: "/sign-up", note: "age-tier" }, { label: "Profil", path: "/complete-profile", note: "persetujuan · default" }] },
    { title: "2 Home", subtitle: "Polaris · 7 bintang", tone: "soul", items: [{ label: "Konstelasi home", path: "/deepspace-home", note: "preview" }, { label: "Polaris", path: "/core-brain", note: "sintesis" }, { label: "Home live", path: "/", note: "shell" }] },
    { title: "3 Pemahaman diri", subtitle: "7 lensa", tone: "cyan", items: [{ label: "Diri kini", path: "/big-five", note: "now" }, { label: "Ingatan", path: "/interview", note: "recall" }, { label: "Diri terlihat", path: "/persona", note: "seen" }, { label: "Ritme", path: "/esm", note: "rhythm" }, { label: "Relasi", path: "/attachment", note: "relational" }, { label: "Diri mungkin", path: "/imagine", note: "possible" }, { label: "Nilai", path: "/audit?screener=1", note: "values" }] },
    { title: "4 Hub harian", subtitle: "Capture · SecondB", tone: "cyan", items: [{ label: "Preview hub", path: "/deepspace-hub", note: "4 panels" }, { label: "Capture", path: "/capture", note: "first save" }, { label: "SecondB", path: "/secondb", note: "chat" }, { label: "Tren", path: "/trends", note: "rising" }, { label: "Rekaman", path: "/records", note: "archive" }] },
    { title: "5 Jejaring pengetahuan", subtitle: "Graf · wiki", tone: "soul", items: [{ label: "Graf", path: "/graph", note: "map" }, { label: "Wiki", path: "/wiki", note: "knowledge" }, { label: "Insight", path: "/insights", note: "patterns" }, { label: "Riset", path: "/research", note: "sources" }, { label: "Museum AI", path: "/museum", note: "history" }] },
    { title: "6 Sistem", subtitle: "Akun · export", tone: "mint", items: [{ label: "Profil", path: "/profile", note: "me" }, { label: "Akun", path: "/account", note: "identity" }, { label: "Privasi", path: "/privacy", note: "trust" }, { label: "IDEN", path: "/iden", note: "export" }, { label: "Dukungan", path: "/support", note: "help" }] },
  ],
};

function copyLocaleFor(language?: string): CopyLocale {
  const code = language?.toLowerCase().split("-")[0];
  return code === "ko" || code === "es" || code === "pt" || code === "id" ? code : "en";
}

export function DeepSpaceFlowMapScreen() {
  const router = useRouter();
  const { i18n } = useTranslation();
  const locale = copyLocaleFor(i18n.language);
  const header = HEADER_COPY[locale];
  const flow = FLOW_BY_LOCALE[locale];

  // Loading-system demo (Claude Design loading.dc.html, C to D to E): wraps a
  // long task with startTask so the global BackgroundTaskDock (D) spins while the
  // app stays usable, then the CompletionToast (E) shows on finish (no auto-nav,
  // the user taps the result link). This QA screen is not a merged feature, so
  // wiring the demo here keeps the shipped screens untouched.
  // TODO: point run() at a real long task (e.g. star re-analysis / import parse)
  // once one is exposed outside the merged feature screens.
  const runLoadingDemo = () => {
    startTask({
      title: header.loadingTitle,
      mode: "background",
      etaSec: 8,
      resultHref: "/museum",
      run: () => new Promise<void>((resolve) => setTimeout(resolve, 8000)),
    });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.phone}>
        <View style={styles.statusBar}>
          <RNText style={styles.statusText}>9:41</RNText>
          <RNText style={styles.statusText}>●●● ▮</RNText>
        </View>
        <SecondbStatusHeader
          mood="positive"
          text={header.text}
          tip={header.tip}
        />
        <Text variant="caption" pixelEn style={styles.kicker}>2ND-BRAIN · FLOW MAP</Text>
        <Text variant="heading" style={styles.title}>{header.title}</Text>
        <Text variant="body" style={styles.subtitle}>{header.subtitle}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={header.demoLabel}
          onPress={runLoadingDemo}
          style={[styles.chip, styles.demoChip]}
          android_ripple={{ color: withAlpha(colors.cyan, 0.12) }}
        >
          <Text variant="caption" style={styles.chipLabel}>{header.demoLabel}</Text>
          <Text variant="subtle" style={styles.chipNote}>{header.demoNote}</Text>
        </Pressable>
        <View style={styles.grid}>
          {flow.map((column) => (
            <View key={column.title} style={styles.column}>
              <Text variant="caption" style={[styles.columnTitle, styles[`${column.tone}Text`]]}>{column.title}</Text>
              <Text variant="subtle" style={styles.columnSub}>{column.subtitle}</Text>
              {column.items.map((item) => (
                <Pressable
                  key={`${column.title}-${item.path}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label} ${header.openSuffix}`}
                  onPress={() => router.push(item.path)}
                  style={styles.chip}
                  android_ripple={{ color: withAlpha(colors.cyan, 0.12) }}
                >
                  <Text variant="caption" style={styles.chipLabel}>{item.label}</Text>
                  <Text variant="subtle" style={styles.chipNote}>{item.note}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgDeep },
  content: { alignItems: "center", paddingHorizontal: 20, paddingTop: 40, paddingBottom: 40 },
  phone: { width: 320, minHeight: 680, overflow: "hidden", borderRadius: radius.phone, backgroundColor: colors.bgDeep, borderWidth: 1, borderColor: colors.borderHi, paddingBottom: 22 },
  statusBar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 22, paddingTop: 14 },
  statusText: { color: colors.textMid, fontFamily: fontFamilies.pixelKo, fontSize: 12, lineHeight: 16 },
  kicker: { marginTop: spacing.md, marginHorizontal: 20, color: colors.cyanBright, fontSize: 7, lineHeight: 12, letterSpacing: 1.2 },
  title: { marginTop: spacing.xs, marginHorizontal: 20, color: colors.textTitle, fontSize: 18 },
  subtitle: { marginTop: spacing.xs, marginHorizontal: 20, color: colors.textMid, fontSize: 12.5 },
  grid: { paddingHorizontal: 14, paddingTop: spacing.lg, gap: spacing.md },
  column: { borderWidth: 1, borderColor: colors.border, borderRadius: m3.shape.medium, backgroundColor: colors.cardBg, padding: spacing.md },
  columnTitle: { fontSize: 12 },
  columnSub: { marginTop: 2, marginBottom: spacing.sm, color: colors.textLo, fontSize: 11 },
  mintText: { color: colors.mint },
  cyanText: { color: colors.cyanBright },
  soulText: { color: colors.soul },
  chip: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: m3.shape.small, backgroundColor: colors.cardBg, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, marginTop: spacing.xs },
  chipLabel: { color: colors.textTitle, fontSize: 11 },
  chipNote: { marginTop: 2, color: colors.textLo, fontSize: 10.5 },
  demoChip: { marginHorizontal: 20, marginTop: spacing.md },
});
