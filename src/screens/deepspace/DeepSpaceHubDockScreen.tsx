import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text as RNText, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { DeepSpaceHubDock, SecondbStatusHeader, type DeepSpaceHubTab } from "@/components/deepspace";
import { Text } from "@/components/ui/Text";
import { colors, radius, spacing } from "@/theme/tokens";
import { fontFamilies } from "@/theme/typography";
import { isAvailableUiLocale, type AvailableUiLocale } from "@/lib/i18n/locales";

type CaptureMode = "text" | "photo" | "link" | "voice" | "todo";
type TrendId = "selfTools" | "morningRoutine";

interface HubDockCopy {
  header: Record<DeepSpaceHubTab, { text: string; tip: string }>;
  title: Record<DeepSpaceHubTab, string>;
  capture: {
    subtitle: string;
    modes: Record<CaptureMode, string>;
    sample: string;
    tagIdea: string;
    tagAuto: string;
    recent: string;
    rowBook: string;
    rowDesign: string;
    timeTwoHours: string;
    timeYesterday: string;
    a11ySave: string;
    save: string;
    saved: string;
  };
  secondb: {
    user: string;
    ai: string;
    evidence: string;
    sent: string;
    inputLabel: string;
    placeholder: string;
    sendLabel: string;
  };
  trend: {
    subtitle: string;
    cards: Record<TrendId, { title: string; delta: string; body: string; a11y: string; action: string }>;
    empty: string;
  };
  review: {
    subtitle: string;
    proposal: string;
    body: string;
    now: string;
    proposed: string;
    evidence: string;
    note: string;
    approved: string;
    held: string;
    holdAction: string;
    approveAction: string;
    holdLabel: string;
    approveLabel: string;
    digestLabel: string;
  };
}

const COPY: Record<AvailableUiLocale, HubDockCopy> = {
  en: {
    header: {
      capture: { text: "This is the capture screen. I kept only the essentials.", tip: "Take your time looking around." },
      secondb: { text: "This is the SecondB chat screen. I kept only the essentials.", tip: "Take your time looking around." },
      trend: { text: "This is the trends screen. I kept only the essentials.", tip: "Take your time looking around." },
      review: { text: "This is the review screen. I kept only the essentials.", tip: "Take your time looking around." },
    },
    title: { capture: "Capture", secondb: "SecondB", trend: "Trends", review: "Review" },
    capture: {
      subtitle: "Save anything in one place",
      modes: { text: "Text", photo: "Photo", link: "Link", voice: "Voice", todo: "To-do" },
      sample: "What if we explain the onboarding idea from today's meeting as a constellation?",
      tagIdea: "#idea",
      tagAuto: "AI auto tag",
      recent: "Recently captured",
      rowBook: "A sentence that stayed with me from a book",
      rowDesign: "Design reference article",
      timeTwoHours: "2h",
      timeYesterday: "Yesterday",
      a11ySave: "Save current stardust",
      save: "Save",
      saved: "Saved",
    },
    secondb: {
      user: "I feel scattered lately. I didn't used to be like this.",
      ai: "Your records show more task switching since March. It overlaps with a rise in extraversion. It may signal broader interest, not only distraction.",
      evidence: "Based on 3 of your records",
      sent: "Sent. Chat saving will connect in the next step.",
      inputLabel: "Ask SecondB",
      placeholder: "Ask SecondB...",
      sendLabel: "Send to SecondB",
    },
    trend: {
      subtitle: "The next step your attention is pointing toward",
      cards: {
        selfTools: { title: "Self-understanding tools", delta: "Interest +32%", body: "Your most-saved topic over the last 3 weeks. Want to try attachment ECR-S?", a11y: "Open self-understanding tools suggestion", action: "Self-understanding tools" },
        morningRoutine: { title: "Morning routine", delta: "Interest +18%", body: "A shared pattern on good days. Want to save more about your rhythm?", a11y: "Open morning routine suggestion", action: "Morning routine" },
      },
      empty: "New suggestions appear when more data builds up.",
    },
    review: {
      subtitle: "When you change, review the constellation too",
      proposal: "SecondB's proposal",
      body: "Recent records suggest your extraversion rose. Raise the star brightness?",
      now: "Now",
      proposed: "Proposed",
      evidence: "Evidence\n5 records",
      note: "Only approvals are applied · every proposal stays in the log",
      approved: "Approved",
      held: "Held",
      holdAction: "Hold",
      approveAction: "Approve",
      holdLabel: "Hold proposal",
      approveLabel: "Approve proposal",
      digestLabel: "Open today's digest",
    },
  },
  ko: {
    header: {
      capture: { text: "담기 화면이에요. 핵심만 추렸어요.", tip: "천천히 둘러보세요." },
      secondb: { text: "세컨비챗 화면이에요. 핵심만 추렸어요.", tip: "천천히 둘러보세요." },
      trend: { text: "트렌드 화면이에요. 핵심만 추렸어요.", tip: "천천히 둘러보세요." },
      review: { text: "점검 화면이에요. 핵심만 추렸어요.", tip: "천천히 둘러보세요." },
    },
    title: { capture: "담기", secondb: "세컨비", trend: "트렌드", review: "점검" },
    capture: {
      subtitle: "무엇이든 한 곳으로 담는다",
      modes: { text: "글", photo: "사진", link: "링크", voice: "음성", todo: "할 일" },
      sample: "오늘 회의에서 나온 아이디어, 사용자 온보딩을 별자리 은유로 풀면 어떨까",
      tagIdea: "#아이디어",
      tagAuto: "AI 자동 태그",
      recent: "최근에 담은 것",
      rowBook: "읽은 책에서 인상 깊었던 문장",
      rowDesign: "디자인 레퍼런스 아티클",
      timeTwoHours: "2시간",
      timeYesterday: "어제",
      a11ySave: "현재 별가루 담기",
      save: "담기",
      saved: "담겼어요",
    },
    secondb: {
      user: "나 요즘 너무 산만한 것 같아. 예전엔 안 그랬는데?",
      ai: "기록을 보면 3월부터 작업 전환이 잦아졌어요. 외향성이 오른 시기와 겹쳐요. 산만함보다 관심이 넓어진 신호일 수 있어요.",
      evidence: "내 기록 3건 근거",
      sent: "보냈어요. 대화 저장은 다음 단계에서 연결돼요.",
      inputLabel: "세컨비에게 물어보기",
      placeholder: "세컨비에게 물어보기…",
      sendLabel: "세컨비에게 보내기",
    },
    trend: {
      subtitle: "요즘 너의 관심이 향하는 다음 한 걸음",
      cards: {
        selfTools: { title: "자기이해 도구", delta: "관심 +32%", body: "최근 3주간 가장 자주 담은 주제. 관련 검사 애착(ECR-S)를 해볼까요?", a11y: "자기이해 도구 제안 열기", action: "자기이해 도구" },
        morningRoutine: { title: "아침 루틴", delta: "관심 +18%", body: "기분이 좋은 날의 공통점. 리듬에 기록을 더 담아볼까요?", a11y: "아침 루틴 제안 열기", action: "아침 루틴" },
      },
      empty: "데이터가 더 쌓이면 새로운 제안이 나타납니다.",
    },
    review: {
      subtitle: "내가 달라졌다면 별자리도 함께 점검",
      proposal: "세컨비의 제안",
      body: "최근 기록을 보면 외향성이 올라간 것 같아요. 별 밝기를 올릴까요?",
      now: "지금",
      proposed: "제안",
      evidence: "근거\n기록 5건",
      note: "승인해야만 반영됩니다 · 모든 제안은 기록에 남습니다",
      approved: "승인됨",
      held: "보류됨",
      holdAction: "보류",
      approveAction: "승인",
      holdLabel: "제안 보류",
      approveLabel: "제안 승인",
      digestLabel: "오늘의 정리 열기",
    },
  },
  es: {
    header: {
      capture: { text: "Esta es la pantalla para guardar. Dejé solo lo esencial.", tip: "Explórala con calma." },
      secondb: { text: "Esta es la pantalla de chat de SecondB. Dejé solo lo esencial.", tip: "Explórala con calma." },
      trend: { text: "Esta es la pantalla de tendencias. Dejé solo lo esencial.", tip: "Explórala con calma." },
      review: { text: "Esta es la pantalla de revisión. Dejé solo lo esencial.", tip: "Explórala con calma." },
    },
    title: { capture: "Guardar", secondb: "SecondB", trend: "Tendencias", review: "Revisión" },
    capture: {
      subtitle: "Guarda cualquier cosa en un solo lugar",
      modes: { text: "Texto", photo: "Foto", link: "Enlace", voice: "Voz", todo: "Tarea" },
      sample: "¿Y si explicamos la idea de onboarding de la reunión como una constelación?",
      tagIdea: "#idea",
      tagAuto: "Etiqueta automática de IA",
      recent: "Guardado reciente",
      rowBook: "Una frase de un libro que se me quedó",
      rowDesign: "Artículo de referencia de diseño",
      timeTwoHours: "2 h",
      timeYesterday: "Ayer",
      a11ySave: "Guardar el polvo estelar actual",
      save: "Guardar",
      saved: "Guardado",
    },
    secondb: {
      user: "Últimamente me siento disperso. Antes no era así.",
      ai: "Tus registros muestran más cambios de tarea desde marzo. Coincide con una subida de extraversión. Puede ser interés más amplio, no solo distracción.",
      evidence: "Basado en 3 de tus registros",
      sent: "Enviado. Guardar chats se conectará en el siguiente paso.",
      inputLabel: "Preguntar a SecondB",
      placeholder: "Pregunta a SecondB...",
      sendLabel: "Enviar a SecondB",
    },
    trend: {
      subtitle: "El siguiente paso hacia donde apunta tu atención",
      cards: {
        selfTools: { title: "Herramientas de autoconocimiento", delta: "Interés +32%", body: "Tu tema más guardado en las últimas 3 semanas. ¿Quieres probar apego ECR-S?", a11y: "Abrir sugerencia de herramientas de autoconocimiento", action: "Herramientas de autoconocimiento" },
        morningRoutine: { title: "Rutina matutina", delta: "Interés +18%", body: "Un patrón común en los días buenos. ¿Quieres guardar más sobre tu ritmo?", a11y: "Abrir sugerencia de rutina matutina", action: "Rutina matutina" },
      },
      empty: "Aparecerán nuevas sugerencias cuando se acumule más información.",
    },
    review: {
      subtitle: "Si cambias, revisa también la constelación",
      proposal: "Propuesta de SecondB",
      body: "Los registros recientes sugieren que subió tu extraversión. ¿Aumentamos el brillo de la estrella?",
      now: "Ahora",
      proposed: "Propuesto",
      evidence: "Evidencia\n5 registros",
      note: "Solo se aplica con aprobación · cada propuesta queda registrada",
      approved: "Aprobado",
      held: "En espera",
      holdAction: "Pausar",
      approveAction: "Aprobar",
      holdLabel: "Pausar propuesta",
      approveLabel: "Aprobar propuesta",
      digestLabel: "Abrir resumen de hoy",
    },
  },
  pt: {
    header: {
      capture: { text: "Esta é a tela de captura. Mantive só o essencial.", tip: "Explore com calma." },
      secondb: { text: "Esta é a tela de chat do SecondB. Mantive só o essencial.", tip: "Explore com calma." },
      trend: { text: "Esta é a tela de tendências. Mantive só o essencial.", tip: "Explore com calma." },
      review: { text: "Esta é a tela de revisão. Mantive só o essencial.", tip: "Explore com calma." },
    },
    title: { capture: "Capturar", secondb: "SecondB", trend: "Tendências", review: "Revisão" },
    capture: {
      subtitle: "Guarde qualquer coisa em um só lugar",
      modes: { text: "Texto", photo: "Foto", link: "Link", voice: "Voz", todo: "Tarefa" },
      sample: "E se explicarmos a ideia de onboarding da reunião como uma constelação?",
      tagIdea: "#ideia",
      tagAuto: "Etiqueta automática de IA",
      recent: "Capturas recentes",
      rowBook: "Uma frase de um livro que ficou comigo",
      rowDesign: "Artigo de referência de design",
      timeTwoHours: "2 h",
      timeYesterday: "Ontem",
      a11ySave: "Salvar a poeira estelar atual",
      save: "Salvar",
      saved: "Salvo",
    },
    secondb: {
      user: "Tenho me sentido disperso ultimamente. Eu não era assim antes.",
      ai: "Seus registros mostram mais troca de tarefas desde março. Isso coincide com uma alta em extroversão. Pode indicar interesses mais amplos, não só distração.",
      evidence: "Com base em 3 dos seus registros",
      sent: "Enviado. O salvamento do chat será conectado no próximo passo.",
      inputLabel: "Perguntar ao SecondB",
      placeholder: "Pergunte ao SecondB...",
      sendLabel: "Enviar ao SecondB",
    },
    trend: {
      subtitle: "O próximo passo para onde sua atenção aponta",
      cards: {
        selfTools: { title: "Ferramentas de autoconhecimento", delta: "Interesse +32%", body: "Seu tema mais salvo nas últimas 3 semanas. Quer testar apego ECR-S?", a11y: "Abrir sugestão de ferramentas de autoconhecimento", action: "Ferramentas de autoconhecimento" },
        morningRoutine: { title: "Rotina matinal", delta: "Interesse +18%", body: "Um padrão comum nos dias bons. Quer salvar mais sobre seu ritmo?", a11y: "Abrir sugestão de rotina matinal", action: "Rotina matinal" },
      },
      empty: "Novas sugestões aparecem quando mais dados se acumulam.",
    },
    review: {
      subtitle: "Se você mudou, revise também a constelação",
      proposal: "Proposta do SecondB",
      body: "Registros recentes sugerem aumento de extroversão. Aumentar o brilho da estrela?",
      now: "Agora",
      proposed: "Proposto",
      evidence: "Evidência\n5 registros",
      note: "Só aprovações são aplicadas · toda proposta fica no registro",
      approved: "Aprovado",
      held: "Em espera",
      holdAction: "Pausar",
      approveAction: "Aprovar",
      holdLabel: "Pausar proposta",
      approveLabel: "Aprovar proposta",
      digestLabel: "Abrir resumo de hoje",
    },
  },
  id: {
    header: {
      capture: { text: "Ini layar simpan. Saya sisakan yang penting saja.", tip: "Lihat pelan-pelan." },
      secondb: { text: "Ini layar chat SecondB. Saya sisakan yang penting saja.", tip: "Lihat pelan-pelan." },
      trend: { text: "Ini layar tren. Saya sisakan yang penting saja.", tip: "Lihat pelan-pelan." },
      review: { text: "Ini layar tinjauan. Saya sisakan yang penting saja.", tip: "Lihat pelan-pelan." },
    },
    title: { capture: "Simpan", secondb: "SecondB", trend: "Tren", review: "Tinjau" },
    capture: {
      subtitle: "Simpan apa pun di satu tempat",
      modes: { text: "Teks", photo: "Foto", link: "Tautan", voice: "Suara", todo: "Tugas" },
      sample: "Bagaimana kalau ide onboarding dari rapat hari ini dijelaskan sebagai konstelasi?",
      tagIdea: "#ide",
      tagAuto: "Tag otomatis AI",
      recent: "Baru disimpan",
      rowBook: "Kalimat dari buku yang terus teringat",
      rowDesign: "Artikel referensi desain",
      timeTwoHours: "2 jam",
      timeYesterday: "Kemarin",
      a11ySave: "Simpan stardust saat ini",
      save: "Simpan",
      saved: "Tersimpan",
    },
    secondb: {
      user: "Akhir-akhir ini aku merasa mudah terpecah. Dulu tidak begini.",
      ai: "Catatanmu menunjukkan lebih banyak perpindahan tugas sejak Maret. Ini beririsan dengan naiknya ekstraversi. Mungkin ini tanda minat yang lebih luas, bukan sekadar terdistraksi.",
      evidence: "Berdasarkan 3 catatanmu",
      sent: "Terkirim. Penyimpanan chat akan dihubungkan pada langkah berikutnya.",
      inputLabel: "Tanya SecondB",
      placeholder: "Tanya SecondB...",
      sendLabel: "Kirim ke SecondB",
    },
    trend: {
      subtitle: "Langkah berikutnya yang ditunjuk perhatianmu",
      cards: {
        selfTools: { title: "Alat pemahaman diri", delta: "Minat +32%", body: "Topik yang paling sering kamu simpan dalam 3 minggu terakhir. Mau mencoba attachment ECR-S?", a11y: "Buka saran alat pemahaman diri", action: "Alat pemahaman diri" },
        morningRoutine: { title: "Rutinitas pagi", delta: "Minat +18%", body: "Pola yang sama pada hari-hari baik. Mau menyimpan lebih banyak tentang ritmemu?", a11y: "Buka saran rutinitas pagi", action: "Rutinitas pagi" },
      },
      empty: "Saran baru muncul saat data bertambah.",
    },
    review: {
      subtitle: "Saat kamu berubah, tinjau juga konstelasinya",
      proposal: "Usulan SecondB",
      body: "Catatan terbaru menunjukkan ekstraversimu naik. Naikkan kecerahan bintang?",
      now: "Sekarang",
      proposed: "Usulan",
      evidence: "Bukti\n5 catatan",
      note: "Hanya persetujuan yang diterapkan · setiap usulan tetap tercatat",
      approved: "Disetujui",
      held: "Ditahan",
      holdAction: "Tahan",
      approveAction: "Setujui",
      holdLabel: "Tahan usulan",
      approveLabel: "Setujui usulan",
      digestLabel: "Buka ringkasan hari ini",
    },
  },
};

const CAPTURE_MODES: CaptureMode[] = ["text", "photo", "link", "voice", "todo"];
const TREND_IDS: TrendId[] = ["selfTools", "morningRoutine"];

function copyForLanguage(language: string | undefined): HubDockCopy {
  const normalized = language?.split("-")[0];
  return isAvailableUiLocale(language) ? COPY[language] : normalized && isAvailableUiLocale(normalized) ? COPY[normalized] : COPY.en;
}

export function DeepSpaceHubDockScreen() {
  const { i18n } = useTranslation();
  const copy = useMemo(() => copyForLanguage(i18n.language), [i18n.language]);
  const [active, setActive] = useState<DeepSpaceHubTab>("capture");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("text");
  const [captured, setCaptured] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [chatSent, setChatSent] = useState(false);
  const [trendAction, setTrendAction] = useState<TrendId | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"hold" | "approve" | null>(null);
  const header = copy.header[active];
  const title = copy.title[active];

  return (
    <View style={styles.screen}>
      <View style={styles.phoneShadow}>
        <View style={styles.phone}>
          <View style={styles.starField} pointerEvents="none">
          <View style={[styles.microStar, styles.microStarA]} />
          <View style={[styles.microStar, styles.microStarB]} />
        </View>
        <View style={styles.statusBar}>
          <RNText style={styles.statusText}>9:41</RNText>
          <RNText style={styles.statusText}>●●● ▮</RNText>
        </View>
        <SecondbStatusHeader mood={active === "capture" ? "neutral" : "positive"} text={header.text} tip={header.tip} />
        <View style={styles.titleRow}>
          <RNText style={styles.back}>‹</RNText>
          <Text variant="heading" style={styles.title}>{title}</Text>
          <Text variant="caption" pixelEn style={styles.kicker}>{active === "capture" ? "5 MODE" : active === "review" ? "RATIFY" : active === "trend" ? "DISCOVER" : "IMAGINE"}</Text>
        </View>
        <View style={styles.content}>
          {renderContent(active, {
            captureMode,
            setCaptureMode,
            captured,
            setCaptured,
            chatDraft,
            setChatDraft,
            chatSent,
            setChatSent,
            trendAction,
            setTrendAction,
            reviewDecision,
            setReviewDecision,
            copy,
          })}
        </View>
        <DeepSpaceHubDock active={active} onChange={setActive} />
        </View>
      </View>
    </View>
  );
}

interface HubState {
  captureMode: CaptureMode;
  setCaptureMode: (mode: CaptureMode) => void;
  captured: boolean;
  setCaptured: (value: boolean) => void;
  chatDraft: string;
  setChatDraft: (value: string) => void;
  chatSent: boolean;
  setChatSent: (value: boolean) => void;
  trendAction: TrendId | null;
  setTrendAction: (value: TrendId | null) => void;
  reviewDecision: "hold" | "approve" | null;
  setReviewDecision: (value: "hold" | "approve") => void;
  copy: HubDockCopy;
}

function renderContent(active: DeepSpaceHubTab, state: HubState) {
  if (active === "capture") return <CaptureContent {...state} />;
  if (active === "secondb") return <SecondbContent {...state} />;
  if (active === "trend") return <TrendContent {...state} />;
  return <ReviewContent {...state} />;
}

function CaptureContent({ captureMode, setCaptureMode, captured, setCaptured, copy }: HubState) {
  const c = copy.capture;
  return (
    <>
      <Text variant="body" style={styles.subtitle}>{c.subtitle}</Text>
      <View style={styles.modeRow}>
        {CAPTURE_MODES.map((mode) => (
          <Pressable
            key={mode}
            accessibilityRole="tab"
            accessibilityState={{ selected: captureMode === mode }}
            onPress={() => setCaptureMode(mode)}
          >
            <Text variant="caption" style={[styles.modeChip, captureMode === mode && styles.modeChipActive]}>{c.modes[mode]}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.captureBox}><Text variant="body" style={styles.captureText}>{c.sample}</Text><View style={styles.cursor} /></View>
      <View style={styles.tagRow}><Text variant="caption" pixelEn style={styles.tag}>{c.tagIdea}</Text><Text variant="caption" pixelEn style={styles.tag}>{c.tagAuto}</Text></View>
      <Text variant="caption" pixelEn style={styles.sectionLabel}>{c.recent}</Text>
      <SmallRow icon="✎" title={c.rowBook} time={c.timeTwoHours} />
      <SmallRow icon="🔗" title={c.rowDesign} time={c.timeYesterday} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={c.a11ySave}
        onPress={() => setCaptured(true)}
        style={styles.primaryButton}
      >
        <Text variant="caption" style={styles.primaryButtonText}>{captured ? c.saved : c.save}</Text>
      </Pressable>
    </>
  );
}

function SecondbContent({ chatDraft, setChatDraft, chatSent, setChatSent, copy }: HubState) {
  const c = copy.secondb;
  return (
    <View style={styles.chatStack}>
      <Text variant="body" style={styles.userBubble}>{c.user}</Text>
      <View style={styles.aiGroup}>
        <Text variant="body" style={styles.aiBubble}>{c.ai}</Text>
        <Text variant="subtle" style={styles.evidence}>{c.evidence}</Text>
      </View>
      {chatSent ? <Text variant="subtle" style={styles.sentNote}>{c.sent}</Text> : null}
      <View style={styles.inputBar}>
        <TextInput
          accessibilityLabel={c.inputLabel}
          placeholder={c.placeholder}
          placeholderTextColor={colors.textLo}
          value={chatDraft}
          onChangeText={setChatDraft}
          style={styles.inputText}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={c.sendLabel}
          disabled={chatDraft.trim().length === 0}
          onPress={() => setChatSent(true)}
          style={[styles.sendCircle, chatDraft.trim().length === 0 && styles.disabledButton]}
        >
          <RNText style={styles.sendText}>↑</RNText>
        </Pressable>
      </View>
    </View>
  );
}

function TrendContent({ trendAction, setTrendAction, copy }: HubState) {
  const c = copy.trend;
  return (
    <>
      <Text variant="body" style={styles.subtitle}>{c.subtitle}</Text>
      {TREND_IDS.map((id) => (
        <TrendCard
          key={id}
          title={c.cards[id].title}
          delta={c.cards[id].delta}
          body={c.cards[id].body}
          a11y={c.cards[id].a11y}
          onPress={() => setTrendAction(id)}
        />
      ))}
      {trendAction ? <Text variant="subtle" style={styles.sentNote}>{c.cards[trendAction].action}</Text> : null}
      <View style={styles.emptyCard}><Text variant="body" style={styles.mutedBody}>{c.empty}</Text></View>
    </>
  );
}

function ReviewContent({ reviewDecision, setReviewDecision, copy }: HubState) {
  const c = copy.review;
  return (
    <>
      <Text variant="body" style={styles.subtitle}>{c.subtitle}</Text>
      <View style={styles.reviewCard}>
        <Text variant="caption" pixelEn style={styles.sectionLabelSoul}>{c.proposal}</Text>
        <Text variant="body" style={styles.reviewBody}>{c.body}</Text>
        <View style={styles.scoreRow}><Score label={c.now} value="61" /><RNText style={styles.arrow}>→</RNText><Score label={c.proposed} value="68" /><Text variant="subtle" style={styles.evidenceRight}>{c.evidence}</Text></View>
      </View>
      <Text variant="subtle" style={styles.reviewNote}>{c.note}</Text>
      {reviewDecision ? <Text variant="subtle" style={styles.sentNote}>{reviewDecision === "approve" ? c.approved : c.held}</Text> : null}
      <View style={styles.actionRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={c.holdLabel} onPress={() => setReviewDecision("hold")} style={styles.secondaryButton}><Text variant="caption" style={styles.secondaryButtonText}>{c.holdAction}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={c.approveLabel} onPress={() => setReviewDecision("approve")} style={styles.soulButton}><Text variant="caption" style={styles.soulButtonText}>{c.approveAction}</Text></Pressable>
      </View>
      <Pressable accessibilityRole="link" accessibilityLabel={c.digestLabel} onPress={() => router.push("/digest")} style={{ marginTop: spacing.sm, alignSelf: "center" }}>
        <Text variant="caption" color="brand">{c.digestLabel} →</Text>
      </Pressable>
    </>
  );
}

function SmallRow({ icon, title, time }: { icon: string; title: string; time: string }) {
  return <View style={styles.smallRow}><RNText style={styles.rowIcon}>{icon}</RNText><Text variant="body" style={styles.rowTitle} numberOfLines={1}>{title}</Text><Text variant="subtle" style={styles.rowTime}>{time}</Text></View>;
}

function TrendCard({ title, delta, body, a11y, onPress }: { title: string; delta: string; body: string; a11y: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={styles.card}><View style={styles.cardHead}><Text variant="heading" style={styles.cardTitle}>{title}</Text><Text variant="subtle" style={styles.delta}>{delta}</Text></View><Text variant="body" style={styles.cardBody}>{body}</Text></Pressable>;
}

function Score({ label, value }: { label: string; value: string }) {
  return <View style={styles.score}><Text variant="subtle" style={styles.scoreLabel}>{label}</Text><Text variant="heading" style={styles.scoreValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", paddingHorizontal: 20, paddingTop: 40, backgroundColor: colors.bgDeep },
  phoneShadow: { width: 320, height: 680, borderRadius: radius.phone, shadowColor: colors.bgDeep, shadowOpacity: 0.6, shadowRadius: 80, shadowOffset: { width: 0, height: 30 }, elevation: 10, backgroundColor: "transparent" },
  phone: { position: "relative", width: "100%", height: "100%", overflow: "hidden", borderRadius: radius.phone, backgroundColor: colors.bgDeep, borderWidth: 1, borderColor: colors.borderHi },
  starField: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  microStar: { position: "absolute", width: 2, height: 2, borderRadius: 1, backgroundColor: colors.cyanDim, opacity: 0.5 },
  microStarA: { top: 82, left: 72 },
  microStarB: { top: 108, right: 70, opacity: 0.4 },
  statusBar: { position: "relative", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 22, paddingTop: 14 },
  statusText: { color: colors.textMid, fontFamily: fontFamilies.pixelKo, fontSize: 11, lineHeight: 16 },
  titleRow: { position: "relative", flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: 20, paddingTop: 16 },
  back: { color: colors.textTitle, opacity: 0.7, fontSize: 18, lineHeight: 22 },
  title: { color: colors.textTitle, fontSize: 16 },
  kicker: { marginLeft: "auto", color: colors.cyanBright, opacity: 0.55, fontSize: 7, lineHeight: 12 },
  content: { position: "relative", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 86, minHeight: 454 },
  subtitle: { color: colors.textMid, fontSize: 13, marginBottom: spacing.md },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: spacing.md },
  modeChip: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.cardBg, color: colors.cyanSoft, fontSize: 12 },
  modeChipActive: { borderColor: colors.borderHi, backgroundColor: colors.mist, color: colors.textTitle },
  captureBox: { minHeight: 128, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.cardBg, paddingHorizontal: 15, paddingVertical: 14, flexDirection: "row" },
  captureText: { flex: 1, color: colors.textTitle, fontSize: 13.5 },
  cursor: { width: 2, height: 15, marginTop: 3, backgroundColor: colors.cyan },
  tagRow: { flexDirection: "row", gap: 7, marginTop: spacing.sm },
  tag: { color: colors.cyanBright, opacity: 0.55, borderWidth: 1, borderColor: colors.border, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5, fontSize: 6, lineHeight: 10 },
  sectionLabel: { color: colors.cyanBright, opacity: 0.55, marginTop: spacing.lg, marginBottom: spacing.sm, fontSize: 7, lineHeight: 12 },
  smallRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.ruleSoft, borderRadius: 10, backgroundColor: colors.cardBg, marginBottom: spacing.sm },
  rowIcon: { fontSize: 14, lineHeight: 18 },
  rowTitle: { flex: 1, color: colors.textMid, fontSize: 12.5 },
  rowTime: { color: colors.cyanBright, opacity: 0.4, fontSize: 10 },
  primaryButton: { marginTop: spacing.md, padding: 13, borderRadius: 12, backgroundColor: colors.cyanBright, alignItems: "center" },
  pressedButton: { opacity: 0.72 },
  disabledButton: { opacity: 0.42 },
  primaryButtonText: { color: colors.bgDeep, fontSize: 14, fontWeight: "700" },
  chatStack: { gap: 12 },
  userBubble: { alignSelf: "flex-end", maxWidth: "78%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.mist, color: colors.textTitle, fontSize: 13 },
  aiGroup: { alignSelf: "flex-start", maxWidth: "82%" },
  aiBubble: { paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.bgMid, color: colors.cyanSoft, fontSize: 13 },
  evidence: { alignSelf: "flex-start", marginTop: 7, color: colors.cyanBright, opacity: 0.55, borderWidth: 1, borderColor: colors.ruleSoft, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, fontSize: 10 },
  inputBar: { marginTop: 218, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingLeft: 14, paddingRight: 8, paddingVertical: 8, borderWidth: 1, borderColor: colors.borderHi, borderRadius: 22, backgroundColor: colors.bgMid },
  inputText: { flex: 1, minHeight: 34, color: colors.textTitle, fontFamily: fontFamilies.readable, fontSize: 13, lineHeight: 18, paddingVertical: 0 },
  sendCircle: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: colors.cyanBright },
  sendText: { color: colors.bgDeep, fontSize: 15, lineHeight: 18 },
  card: { paddingHorizontal: 16, paddingVertical: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.cardBg, marginBottom: 12 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: spacing.sm },
  cardTitle: { color: colors.textTitle, fontSize: 13 },
  delta: { marginLeft: "auto", color: colors.mint, fontSize: 10 },
  cardBody: { color: colors.textMid, fontSize: 12.5 },
  emptyCard: { paddingHorizontal: 16, paddingVertical: 15, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderHi, borderRadius: 14, backgroundColor: colors.cardBg },
  mutedBody: { color: colors.textLo, fontSize: 12.5 },
  reviewCard: { padding: 16, borderWidth: 1, borderColor: colors.soulLine, borderRadius: 14, backgroundColor: colors.cardBg },
  sectionLabelSoul: { color: colors.soul, marginBottom: 12, fontSize: 7, lineHeight: 12 },
  reviewBody: { color: colors.textTitle, marginBottom: 13, fontSize: 13 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 10, backgroundColor: colors.bgMid },
  score: { alignItems: "center" },
  scoreLabel: { color: colors.textLo, fontSize: 10 },
  scoreValue: { color: colors.cyanSoft, fontSize: 18 },
  arrow: { color: colors.soul, fontSize: 16, lineHeight: 20 },
  evidenceRight: { marginLeft: "auto", color: colors.cyanBright, opacity: 0.55, textAlign: "right", fontSize: 10 },
  reviewNote: { marginTop: spacing.md, textAlign: "center", color: colors.cyanBright, opacity: 0.5, fontSize: 11 },
  sentNote: { marginTop: spacing.sm, color: colors.mint, fontSize: 11, textAlign: "center" },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: 138 },
  secondaryButton: { flex: 1, padding: 12, borderWidth: 1, borderColor: colors.borderHi, borderRadius: 12, alignItems: "center", backgroundColor: colors.cardBg },
  secondaryButtonText: { color: colors.cyanSoft, fontSize: 13 },
  soulButton: { flex: 1.4, padding: 12, borderRadius: 12, alignItems: "center", backgroundColor: colors.soul },
  soulButtonText: { color: colors.bgDeep, fontSize: 13, fontWeight: "700" },
});
