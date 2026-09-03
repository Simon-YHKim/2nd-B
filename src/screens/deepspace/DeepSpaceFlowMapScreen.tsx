import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useTranslation } from "react-i18next";

import { SecondbStatusHeader } from "@/components/deepspace";
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
    subtitle: "일곱 별 · 북극성",
    tone: "soul",
    items: [
      { label: "홈 별자리", path: "/deepspace-home", note: "preview" },
      { label: "북극성", path: "/core-brain", note: "종합" },
      { label: "라이브 홈", path: "/", note: "shell" },
    ],
  },
  {
    title: "③ 레거시 레퍼런스",
    subtitle: "이전 자기이해 축",
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

const HEADER_COPY: Record<CopyLocale, { text: string; tip: string; title: string; subtitle: string; archiveLabel: string; archiveNote: string; openSuffix: string }> = {
  en: { text: "This screen preserves an earlier flow map in Design Lab.", tip: "It is a visual reference, not the current product map.", title: "Archived Screen Relationship Map", subtitle: "A Design Lab archive from before the current seven-stars model. It is not the current product flow or source of truth.", archiveLabel: "Archived loading reference", archiveNote: "Inactive · starts no task or timer", openSuffix: "open reference" },
  ko: { text: "이 화면은 Design Lab에 보관된 이전 흐름도예요.", tip: "현재 제품 지도가 아니라 예전 시각 레퍼런스예요.", title: "화면 관계 지도 보관본", subtitle: "현행 일곱 별 모델 이전 흐름을 보존한 Design Lab 보관본입니다. 현재 제품 동선이나 정본이 아닙니다.", archiveLabel: "보관된 로딩 레퍼런스", archiveNote: "비활성 · 작업이나 타이머를 시작하지 않음", openSuffix: "레퍼런스 열기" },
  es: { text: "Esta pantalla conserva un mapa de flujo anterior en Design Lab.", tip: "Es una referencia visual, no el mapa actual del producto.", title: "Archivo del mapa de pantallas", subtitle: "Un archivo de Design Lab anterior al modelo actual de siete estrellas. No es el flujo vigente ni la fuente oficial.", archiveLabel: "Referencia de carga archivada", archiveNote: "Inactiva · no inicia tareas ni temporizadores", openSuffix: "abrir referencia" },
  pt: { text: "Esta tela preserva um mapa de fluxo anterior no Design Lab.", tip: "É uma referência visual, não o mapa atual do produto.", title: "Arquivo do mapa de telas", subtitle: "Um arquivo do Design Lab anterior ao modelo atual de sete estrelas. Não é o fluxo vigente nem a fonte oficial.", archiveLabel: "Referência de carregamento arquivada", archiveNote: "Inativa · não inicia tarefas nem temporizadores", openSuffix: "abrir referência" },
  id: { text: "Layar ini menyimpan peta alur lama di Design Lab.", tip: "Ini adalah referensi visual, bukan peta produk saat ini.", title: "Arsip Peta Hubungan Layar", subtitle: "Arsip Design Lab dari sebelum model tujuh bintang saat ini. Ini bukan alur produk atau sumber acuan saat ini.", archiveLabel: "Referensi loading yang diarsipkan", archiveNote: "Nonaktif · tidak memulai tugas atau timer", openSuffix: "buka referensi" },
};

const FLOW_BY_LOCALE: Record<CopyLocale, FlowColumn[]> = {
  ko: FLOW.map((column) => column.title === "② 홈" ? { ...column, items: column.items.map((item) => item.path === "/core-brain" ? { ...item, label: "북극성", note: "종합" } : item) } : column),
  en: [
    { title: "1 Entry", subtitle: "Onboarding · auth", tone: "mint", items: [{ label: "Intro", path: "/onboarding", note: "to first record" }, { label: "Sign in", path: "/sign-in", note: "Google · email" }, { label: "Sign up", path: "/sign-up", note: "age-tier" }, { label: "Profile", path: "/complete-profile", note: "consent · defaults" }] },
    { title: "2 Home", subtitle: "Polaris · 7 stars", tone: "soul", items: [{ label: "Home constellation", path: "/deepspace-home", note: "preview" }, { label: "Polaris", path: "/core-brain", note: "aggregate" }, { label: "Live home", path: "/", note: "shell" }] },
    { title: "3 Legacy references", subtitle: "Retired self-knowledge axes", tone: "cyan", items: [{ label: "Current self", path: "/big-five", note: "now" }, { label: "Recall", path: "/interview", note: "recall" }, { label: "Seen self", path: "/persona", note: "seen" }, { label: "Rhythm", path: "/esm", note: "rhythm" }, { label: "Relationship", path: "/attachment", note: "relational" }, { label: "Possible self", path: "/imagine", note: "possible" }, { label: "Values", path: "/audit?screener=1", note: "values" }] },
    { title: "4 Daily hub", subtitle: "Capture · SecondB", tone: "cyan", items: [{ label: "Hub preview", path: "/deepspace-hub", note: "4 panels" }, { label: "Capture", path: "/capture", note: "first save" }, { label: "SecondB", path: "/secondb", note: "chat" }, { label: "Trends", path: "/trends", note: "rising" }, { label: "Records", path: "/records", note: "archive" }] },
    { title: "5 Knowledge web", subtitle: "Graph · wiki", tone: "soul", items: [{ label: "Graph", path: "/graph", note: "map" }, { label: "Wiki", path: "/wiki", note: "knowledge" }, { label: "Insights", path: "/insights", note: "patterns" }, { label: "Research", path: "/research", note: "sources" }, { label: "AI Museum", path: "/museum", note: "history" }] },
    { title: "6 System", subtitle: "Account · export", tone: "mint", items: [{ label: "Profile", path: "/profile", note: "me" }, { label: "Account", path: "/account", note: "identity" }, { label: "Privacy", path: "/privacy", note: "trust" }, { label: "IDEN", path: "/iden", note: "export" }, { label: "Support", path: "/support", note: "help" }] },
  ],
  es: [
    { title: "1 Entrada", subtitle: "Onboarding · auth", tone: "mint", items: [{ label: "Intro", path: "/onboarding", note: "primer registro" }, { label: "Iniciar sesion", path: "/sign-in", note: "Google · email" }, { label: "Registrarse", path: "/sign-up", note: "age-tier" }, { label: "Perfil", path: "/complete-profile", note: "consentimiento · defaults" }] },
    { title: "2 Inicio", subtitle: "Polaris · 7 estrellas", tone: "soul", items: [{ label: "Constelacion inicial", path: "/deepspace-home", note: "preview" }, { label: "Polaris", path: "/core-brain", note: "sintesis" }, { label: "Inicio vivo", path: "/", note: "shell" }] },
    { title: "3 Referencias archivadas", subtitle: "Ejes anteriores de autoconocimiento", tone: "cyan", items: [{ label: "Yo actual", path: "/big-five", note: "now" }, { label: "Recuerdo", path: "/interview", note: "recall" }, { label: "Yo visto", path: "/persona", note: "seen" }, { label: "Ritmo", path: "/esm", note: "rhythm" }, { label: "Relacion", path: "/attachment", note: "relational" }, { label: "Yo posible", path: "/imagine", note: "possible" }, { label: "Valores", path: "/audit?screener=1", note: "values" }] },
    { title: "4 Hub diario", subtitle: "Captura · SecondB", tone: "cyan", items: [{ label: "Preview del hub", path: "/deepspace-hub", note: "4 panels" }, { label: "Captura", path: "/capture", note: "first save" }, { label: "SecondB", path: "/secondb", note: "chat" }, { label: "Tendencias", path: "/trends", note: "rising" }, { label: "Registros", path: "/records", note: "archive" }] },
    { title: "5 Red de conocimiento", subtitle: "Grafo · wiki", tone: "soul", items: [{ label: "Grafo", path: "/graph", note: "map" }, { label: "Wiki", path: "/wiki", note: "knowledge" }, { label: "Insights", path: "/insights", note: "patterns" }, { label: "Investigacion", path: "/research", note: "sources" }, { label: "Museo AI", path: "/museum", note: "history" }] },
    { title: "6 Sistema", subtitle: "Cuenta · exportacion", tone: "mint", items: [{ label: "Perfil", path: "/profile", note: "me" }, { label: "Cuenta", path: "/account", note: "identity" }, { label: "Privacidad", path: "/privacy", note: "trust" }, { label: "IDEN", path: "/iden", note: "export" }, { label: "Soporte", path: "/support", note: "help" }] },
  ],
  pt: [
    { title: "1 Entrada", subtitle: "Onboarding · auth", tone: "mint", items: [{ label: "Intro", path: "/onboarding", note: "primeiro registro" }, { label: "Entrar", path: "/sign-in", note: "Google · email" }, { label: "Cadastrar", path: "/sign-up", note: "age-tier" }, { label: "Perfil", path: "/complete-profile", note: "consentimento · defaults" }] },
    { title: "2 Home", subtitle: "Polaris · 7 estrelas", tone: "soul", items: [{ label: "Constelacao da home", path: "/deepspace-home", note: "preview" }, { label: "Polaris", path: "/core-brain", note: "sintese" }, { label: "Home ativa", path: "/", note: "shell" }] },
    { title: "3 Referências arquivadas", subtitle: "Eixos anteriores de autoconhecimento", tone: "cyan", items: [{ label: "Eu atual", path: "/big-five", note: "now" }, { label: "Recordacao", path: "/interview", note: "recall" }, { label: "Eu visto", path: "/persona", note: "seen" }, { label: "Ritmo", path: "/esm", note: "rhythm" }, { label: "Relacionamento", path: "/attachment", note: "relational" }, { label: "Eu possivel", path: "/imagine", note: "possible" }, { label: "Valores", path: "/audit?screener=1", note: "values" }] },
    { title: "4 Hub diario", subtitle: "Captura · SecondB", tone: "cyan", items: [{ label: "Preview do hub", path: "/deepspace-hub", note: "4 panels" }, { label: "Capturar", path: "/capture", note: "first save" }, { label: "SecondB", path: "/secondb", note: "chat" }, { label: "Tendencias", path: "/trends", note: "rising" }, { label: "Registros", path: "/records", note: "archive" }] },
    { title: "5 Rede de conhecimento", subtitle: "Grafo · wiki", tone: "soul", items: [{ label: "Grafo", path: "/graph", note: "map" }, { label: "Wiki", path: "/wiki", note: "knowledge" }, { label: "Insights", path: "/insights", note: "patterns" }, { label: "Pesquisa", path: "/research", note: "sources" }, { label: "Museu AI", path: "/museum", note: "history" }] },
    { title: "6 Sistema", subtitle: "Conta · exportacao", tone: "mint", items: [{ label: "Perfil", path: "/profile", note: "me" }, { label: "Conta", path: "/account", note: "identity" }, { label: "Privacidade", path: "/privacy", note: "trust" }, { label: "IDEN", path: "/iden", note: "export" }, { label: "Suporte", path: "/support", note: "help" }] },
  ],
  id: [
    { title: "1 Masuk", subtitle: "Onboarding · auth", tone: "mint", items: [{ label: "Intro", path: "/onboarding", note: "rekaman pertama" }, { label: "Masuk", path: "/sign-in", note: "Google · email" }, { label: "Daftar", path: "/sign-up", note: "age-tier" }, { label: "Profil", path: "/complete-profile", note: "persetujuan · default" }] },
    { title: "2 Home", subtitle: "Polaris · 7 bintang", tone: "soul", items: [{ label: "Konstelasi home", path: "/deepspace-home", note: "preview" }, { label: "Polaris", path: "/core-brain", note: "sintesis" }, { label: "Home live", path: "/", note: "shell" }] },
    { title: "3 Referensi arsip", subtitle: "Sumbu pemahaman diri terdahulu", tone: "cyan", items: [{ label: "Diri kini", path: "/big-five", note: "now" }, { label: "Ingatan", path: "/interview", note: "recall" }, { label: "Diri terlihat", path: "/persona", note: "seen" }, { label: "Ritme", path: "/esm", note: "rhythm" }, { label: "Relasi", path: "/attachment", note: "relational" }, { label: "Diri mungkin", path: "/imagine", note: "possible" }, { label: "Nilai", path: "/audit?screener=1", note: "values" }] },
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
        <Text variant="caption" pixelEn style={styles.kicker}>DESIGN LAB · ARCHIVE</Text>
        <Text variant="heading" style={styles.title}>{header.title}</Text>
        <Text variant="body" style={styles.subtitle}>{header.subtitle}</Text>
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${header.archiveLabel}. ${header.archiveNote}`}
          style={[styles.chip, styles.archiveChip]}
        >
          <Text variant="caption" style={styles.chipLabel}>{header.archiveLabel}</Text>
          <Text variant="subtle" style={styles.chipNote}>{header.archiveNote}</Text>
        </View>
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
  archiveChip: { marginHorizontal: 20, marginTop: spacing.md },
});
