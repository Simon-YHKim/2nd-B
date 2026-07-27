import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text as RNText, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { DeepSpaceHubDock, SecondbStatusHeader, type DeepSpaceHubTab } from "@/components/deepspace";
import { Text } from "@/components/ui/Text";
import { isAvailableUiLocale, type AvailableUiLocale } from "@/lib/i18n/locales";
import { colors, radius, spacing } from "@/theme/tokens";
import { fontFamilies } from "@/theme/typography";

type CaptureMode = "text" | "photo" | "link" | "voice" | "todo";
type TrendAction = "selfKnowledge" | "morningRoutine";

interface HubCopy {
  header: Record<DeepSpaceHubTab, { text: string; tip: string }>;
  title: Record<DeepSpaceHubTab, string>;
  capture: {
    subtitle: string;
    modes: Record<CaptureMode, string>;
    draft: string;
    ideaTag: string;
    autoTag: string;
    recent: string;
    rows: Array<{ icon: string; title: string; time: string }>;
    captureLabel: string;
    captured: string;
    capture: string;
  };
  secondb: {
    user: string;
    reply: string;
    evidence: string;
    sent: string;
    inputLabel: string;
    placeholder: string;
    sendLabel: string;
  };
  trend: {
    subtitle: string;
    cards: Record<TrendAction, { title: string; delta: string; body: string; label: string }>;
    ready: (title: string) => string;
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
    holdLabel: string;
    approveLabel: string;
    hold: string;
    approve: string;
    digestLabel: string;
    digest: string;
  };
}

const COPY: Record<AvailableUiLocale, HubCopy> = {
  en: {
    header: {
      capture: { text: "This is the capture screen. Only the core remains.", tip: "Take a slow look." },
      secondb: { text: "This is SecondB chat. Only the core remains.", tip: "Take a slow look." },
      trend: { text: "This is the trends screen. Only the core remains.", tip: "Take a slow look." },
      review: { text: "This is the review screen. Only the core remains.", tip: "Take a slow look." },
    },
    title: { capture: "Capture", secondb: "SecondB", trend: "Trends", review: "Review" },
    capture: {
      subtitle: "Capture anything in one place",
      modes: { text: "Text", photo: "Photo", link: "Link", voice: "Voice", todo: "To-do" },
      draft: "What if today's meeting idea used a constellation metaphor for onboarding?",
      ideaTag: "#idea",
      autoTag: "AI auto tag",
      recent: "Recently captured",
      rows: [
        { icon: "T", title: "A line that stayed with me from a book", time: "2h" },
        { icon: "L", title: "Design reference article", time: "Yesterday" },
      ],
      captureLabel: "Capture the current stardust",
      captured: "Captured",
      capture: "Capture",
    },
    secondb: {
      user: "I feel so scattered lately. I was not like this before.",
      reply: "Your records show more task switching since March. It overlaps with a rise in extraversion. It may be a sign of broader interests, not just distraction.",
      evidence: "Based on 3 records",
      sent: "Sent.",
      inputLabel: "Ask SecondB",
      placeholder: "Ask SecondB...",
      sendLabel: "Send to SecondB",
    },
    trend: {
      subtitle: "The next step your attention is pointing to",
      cards: {
        selfKnowledge: { title: "Self-knowledge tools", delta: "Interest +32%", body: "Your most captured topic across the last 3 weeks. Try the attachment check next?", label: "Open self-knowledge suggestion" },
        morningRoutine: { title: "Morning routine", delta: "Interest +18%", body: "A common thread on better days. Add one rhythm record?", label: "Open morning routine suggestion" },
      },
      ready: (title) => `${title} suggestion is ready to open.`,
      empty: "New suggestions appear after more data accumulates.",
    },
    review: {
      subtitle: "When I change, review the constellation too",
      proposal: "SecondB suggestion",
      body: "Recent records suggest your extraversion may have risen. Raise the star brightness?",
      now: "Now",
      proposed: "Proposed",
      evidence: "Evidence\n5 records",
      note: "Only approved changes apply · every suggestion is recorded",
      approved: "Approved",
      held: "Held",
      holdLabel: "Hold suggestion",
      approveLabel: "Approve suggestion",
      hold: "Hold",
      approve: "Approve",
      digestLabel: "Open today's digest",
      digest: "Open today's digest ->",
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
      draft: "오늘 회의에서 나온 아이디어, 사용자 온보딩을 별자리 은유로 풀면 어떨까",
      ideaTag: "#아이디어",
      autoTag: "AI 자동 태그",
      recent: "최근에 담은 것",
      rows: [
        { icon: "T", title: "읽은 책에서 인상 깊었던 문장", time: "2시간" },
        { icon: "L", title: "디자인 레퍼런스 아티클", time: "어제" },
      ],
      captureLabel: "현재 별가루 담기",
      captured: "담겼어요",
      capture: "담기",
    },
    secondb: {
      user: "나 요즘 너무 산만한 것 같아. 예전엔 안 그랬는데?",
      reply: "기록을 보면 3월부터 작업 전환이 잦아졌어요. 외향성이 오른 시기와 겹쳐요. 산만함보다 관심이 넓어진 신호일 수 있어요.",
      evidence: "내 기록 3건 근거",
      sent: "보냈어요.",
      inputLabel: "세컨비에게 물어보기",
      placeholder: "세컨비에게 물어보기...",
      sendLabel: "세컨비에게 보내기",
    },
    trend: {
      subtitle: "요즘 너의 관심이 향하는 다음 한 걸음",
      cards: {
        selfKnowledge: { title: "자기이해 도구", delta: "관심 +32%", body: "최근 3주간 가장 자주 담은 주제. 관련 검사 애착(ECR-S)를 해볼까요?", label: "자기이해 도구 제안 열기" },
        morningRoutine: { title: "아침 루틴", delta: "관심 +18%", body: "기분이 좋은 날의 공통점. 리듬에 기록을 더 담아볼까요?", label: "아침 루틴 제안 열기" },
      },
      ready: (title) => `${title} 제안을 열 준비가 됐어요.`,
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
      holdLabel: "제안 보류",
      approveLabel: "제안 승인",
      hold: "보류",
      approve: "승인",
      digestLabel: "오늘의 정리 열기",
      digest: "오늘의 정리 열기 ->",
    },
  },
  es: {
    header: {
      capture: { text: "Esta es la pantalla de captura. Solo queda lo esencial.", tip: "Mírala con calma." },
      secondb: { text: "Este es el chat de SecondB. Solo queda lo esencial.", tip: "Míralo con calma." },
      trend: { text: "Esta es la pantalla de tendencias. Solo queda lo esencial.", tip: "Mírala con calma." },
      review: { text: "Esta es la pantalla de revisión. Solo queda lo esencial.", tip: "Mírala con calma." },
    },
    title: { capture: "Capturar", secondb: "SecondB", trend: "Tendencias", review: "Revisión" },
    capture: {
      subtitle: "Captura cualquier cosa en un solo lugar",
      modes: { text: "Texto", photo: "Foto", link: "Enlace", voice: "Voz", todo: "Tarea" },
      draft: "¿Y si la idea de la reunión usara una metáfora de constelación para la incorporación?",
      ideaTag: "#idea",
      autoTag: "Etiqueta automática",
      recent: "Capturas recientes",
      rows: [
        { icon: "T", title: "Una frase de un libro que se quedó conmigo", time: "2 h" },
        { icon: "L", title: "Artículo de referencia de diseño", time: "Ayer" },
      ],
      captureLabel: "Capturar el polvo de estrellas actual",
      captured: "Capturado",
      capture: "Capturar",
    },
    secondb: {
      user: "Últimamente me siento muy disperso. Antes no era así.",
      reply: "Tus registros muestran más cambios de tarea desde marzo. Coincide con una subida de extraversión. Puede ser una señal de intereses más amplios, no solo distracción.",
      evidence: "Basado en 3 registros",
      sent: "Enviado.",
      inputLabel: "Preguntar a SecondB",
      placeholder: "Preguntar a SecondB...",
      sendLabel: "Enviar a SecondB",
    },
    trend: {
      subtitle: "El siguiente paso al que apunta tu atención",
      cards: {
        selfKnowledge: { title: "Herramientas de autoconocimiento", delta: "Interés +32%", body: "Tu tema más capturado en las últimas 3 semanas. ¿Probar la revisión de apego?", label: "Abrir sugerencia de autoconocimiento" },
        morningRoutine: { title: "Rutina matutina", delta: "Interés +18%", body: "Un patrón común en los días mejores. ¿Añadir un registro de ritmo?", label: "Abrir sugerencia de rutina matutina" },
      },
      ready: (title) => `La sugerencia ${title} está lista para abrirse.`,
      empty: "Aparecerán nuevas sugerencias cuando se acumulen más datos.",
    },
    review: {
      subtitle: "Si yo cambio, revisa también la constelación",
      proposal: "Sugerencia de SecondB",
      body: "Los registros recientes sugieren que tu extraversión pudo subir. ¿Aumentar el brillo de la estrella?",
      now: "Ahora",
      proposed: "Propuesto",
      evidence: "Evidencia\n5 registros",
      note: "Solo se aplican cambios aprobados · cada sugerencia queda registrada",
      approved: "Aprobado",
      held: "En espera",
      holdLabel: "Poner sugerencia en espera",
      approveLabel: "Aprobar sugerencia",
      hold: "Espera",
      approve: "Aprobar",
      digestLabel: "Abrir resumen de hoy",
      digest: "Abrir resumen de hoy ->",
    },
  },
  pt: {
    header: {
      capture: { text: "Esta é a tela de captura. Só ficou o essencial.", tip: "Veja com calma." },
      secondb: { text: "Este é o chat do SecondB. Só ficou o essencial.", tip: "Veja com calma." },
      trend: { text: "Esta é a tela de tendências. Só ficou o essencial.", tip: "Veja com calma." },
      review: { text: "Esta é a tela de revisão. Só ficou o essencial.", tip: "Veja com calma." },
    },
    title: { capture: "Capturar", secondb: "SecondB", trend: "Tendências", review: "Revisão" },
    capture: {
      subtitle: "Capture qualquer coisa em um só lugar",
      modes: { text: "Texto", photo: "Foto", link: "Link", voice: "Voz", todo: "Tarefa" },
      draft: "E se a ideia da reunião usasse uma metáfora de constelação para a entrada do usuário?",
      ideaTag: "#ideia",
      autoTag: "Etiqueta automática",
      recent: "Capturas recentes",
      rows: [
        { icon: "T", title: "Uma frase de um livro que ficou comigo", time: "2 h" },
        { icon: "L", title: "Artigo de referência de design", time: "Ontem" },
      ],
      captureLabel: "Capturar o pó de estrelas atual",
      captured: "Capturado",
      capture: "Capturar",
    },
    secondb: {
      user: "Ultimamente me sinto muito disperso. Antes eu não era assim.",
      reply: "Seus registros mostram mais troca de tarefas desde março. Isso coincide com uma alta de extroversão. Pode ser sinal de interesses mais amplos, não só distração.",
      evidence: "Com base em 3 registros",
      sent: "Enviado.",
      inputLabel: "Perguntar ao SecondB",
      placeholder: "Perguntar ao SecondB...",
      sendLabel: "Enviar ao SecondB",
    },
    trend: {
      subtitle: "O próximo passo para onde sua atenção aponta",
      cards: {
        selfKnowledge: { title: "Ferramentas de autoconhecimento", delta: "Interesse +32%", body: "Seu tema mais capturado nas últimas 3 semanas. Quer tentar a checagem de apego?", label: "Abrir sugestão de autoconhecimento" },
        morningRoutine: { title: "Rotina matinal", delta: "Interesse +18%", body: "Um padrão comum nos dias melhores. Adicionar um registro de ritmo?", label: "Abrir sugestão de rotina matinal" },
      },
      ready: (title) => `A sugestão ${title} está pronta para abrir.`,
      empty: "Novas sugestões aparecem quando houver mais dados.",
    },
    review: {
      subtitle: "Quando eu mudar, revise também a constelação",
      proposal: "Sugestão do SecondB",
      body: "Registros recentes sugerem que sua extroversão pode ter aumentado. Elevar o brilho da estrela?",
      now: "Agora",
      proposed: "Proposto",
      evidence: "Evidência\n5 registros",
      note: "Só mudanças aprovadas são aplicadas · toda sugestão fica registrada",
      approved: "Aprovado",
      held: "Em espera",
      holdLabel: "Manter sugestão em espera",
      approveLabel: "Aprovar sugestão",
      hold: "Espera",
      approve: "Aprovar",
      digestLabel: "Abrir resumo de hoje",
      digest: "Abrir resumo de hoje ->",
    },
  },
  id: {
    header: {
      capture: { text: "Ini layar tangkap. Hanya inti yang tersisa.", tip: "Lihat pelan-pelan." },
      secondb: { text: "Ini chat SecondB. Hanya inti yang tersisa.", tip: "Lihat pelan-pelan." },
      trend: { text: "Ini layar tren. Hanya inti yang tersisa.", tip: "Lihat pelan-pelan." },
      review: { text: "Ini layar tinjauan. Hanya inti yang tersisa.", tip: "Lihat pelan-pelan." },
    },
    title: { capture: "Tangkap", secondb: "SecondB", trend: "Tren", review: "Tinjau" },
    capture: {
      subtitle: "Tangkap apa pun di satu tempat",
      modes: { text: "Teks", photo: "Foto", link: "Tautan", voice: "Suara", todo: "Tugas" },
      draft: "Bagaimana kalau ide rapat hari ini memakai metafora konstelasi untuk onboarding?",
      ideaTag: "#ide",
      autoTag: "Tag otomatis AI",
      recent: "Baru ditangkap",
      rows: [
        { icon: "T", title: "Kalimat dari buku yang terus teringat", time: "2 jam" },
        { icon: "L", title: "Artikel referensi desain", time: "Kemarin" },
      ],
      captureLabel: "Tangkap stardust saat ini",
      captured: "Tertangkap",
      capture: "Tangkap",
    },
    secondb: {
      user: "Akhir-akhir ini aku merasa sangat buyar. Dulu tidak begini.",
      reply: "Catatanmu menunjukkan lebih banyak perpindahan tugas sejak Maret. Ini beririsan dengan naiknya ekstraversi. Bisa jadi tanda minat yang melebar, bukan sekadar distraksi.",
      evidence: "Berdasarkan 3 catatan",
      sent: "Terkirim.",
      inputLabel: "Tanya SecondB",
      placeholder: "Tanya SecondB...",
      sendLabel: "Kirim ke SecondB",
    },
    trend: {
      subtitle: "Langkah berikut yang ditunjuk perhatianmu",
      cards: {
        selfKnowledge: { title: "Alat memahami diri", delta: "Minat +32%", body: "Topik yang paling sering kamu tangkap dalam 3 minggu terakhir. Coba cek keterikatan?", label: "Buka saran memahami diri" },
        morningRoutine: { title: "Rutinitas pagi", delta: "Minat +18%", body: "Pola umum pada hari yang terasa lebih baik. Tambahkan satu catatan ritme?", label: "Buka saran rutinitas pagi" },
      },
      ready: (title) => `Saran ${title} siap dibuka.`,
      empty: "Saran baru muncul setelah data bertambah.",
    },
    review: {
      subtitle: "Saat aku berubah, tinjau juga konstelasinya",
      proposal: "Saran SecondB",
      body: "Catatan terbaru menunjukkan ekstraversimu mungkin naik. Naikkan kecerahan bintang?",
      now: "Sekarang",
      proposed: "Usulan",
      evidence: "Bukti\n5 catatan",
      note: "Hanya perubahan yang disetujui diterapkan · semua saran dicatat",
      approved: "Disetujui",
      held: "Ditahan",
      holdLabel: "Tahan saran",
      approveLabel: "Setujui saran",
      hold: "Tahan",
      approve: "Setujui",
      digestLabel: "Buka ringkasan hari ini",
      digest: "Buka ringkasan hari ini ->",
    },
  },
};

const CAPTURE_MODES: CaptureMode[] = ["text", "photo", "link", "voice", "todo"];

function copyFor(localeTag: string | null | undefined): HubCopy {
  const base = localeTag?.split("-")[0];
  return COPY[isAvailableUiLocale(localeTag) ? localeTag : isAvailableUiLocale(base) ? base : "en"];
};

export function DeepSpaceHubDockScreen() {
  const { i18n } = useTranslation();
  const copy = copyFor(i18n.language);
  const [active, setActive] = useState<DeepSpaceHubTab>("capture");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("text");
  const [captured, setCaptured] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [chatSent, setChatSent] = useState(false);
  const [trendAction, setTrendAction] = useState<TrendAction | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"hold" | "approve" | null>(null);
  const header = copy.header[active];
  const title = useMemo(() => copy.title[active], [active, copy]);

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
  trendAction: TrendAction | null;
  setTrendAction: (value: TrendAction | null) => void;
  reviewDecision: "hold" | "approve" | null;
  setReviewDecision: (value: "hold" | "approve") => void;
  copy: HubCopy;
}

function renderContent(active: DeepSpaceHubTab, state: HubState) {
  if (active === "capture") return <CaptureContent {...state} />;
  if (active === "secondb") return <SecondbContent {...state} />;
  if (active === "trend") return <TrendContent {...state} />;
  return <ReviewContent {...state} />;
}

function CaptureContent({ captureMode, setCaptureMode, captured, setCaptured, copy: hubCopy }: HubState) {
  const copy = hubCopy.capture;
  return (
    <>
      <Text variant="body" style={styles.subtitle}>{copy.subtitle}</Text>
      <View style={styles.modeRow}>
        {CAPTURE_MODES.map((mode) => (
          <Pressable
            key={mode}
            accessibilityRole="tab"
            accessibilityState={{ selected: captureMode === mode }}
            onPress={() => setCaptureMode(mode)}
          >
            <Text variant="caption" style={[styles.modeChip, captureMode === mode && styles.modeChipActive]}>{copy.modes[mode]}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.captureBox}><Text variant="body" style={styles.captureText}>{copy.draft}</Text><View style={styles.cursor} /></View>
      <View style={styles.tagRow}><Text variant="caption" pixelEn style={styles.tag}>{copy.ideaTag}</Text><Text variant="caption" pixelEn style={styles.tag}>{copy.autoTag}</Text></View>
      <Text variant="caption" pixelEn style={styles.sectionLabel}>{copy.recent}</Text>
      {copy.rows.map((row) => (
        <SmallRow key={row.title} icon={row.icon} title={row.title} time={row.time} />
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.captureLabel}
        onPress={() => setCaptured(true)}
        style={styles.primaryButton}
      >
        <Text variant="caption" style={styles.primaryButtonText}>{captured ? copy.captured : copy.capture}</Text>
      </Pressable>
    </>
  );
}

function SecondbContent({ chatDraft, setChatDraft, chatSent, setChatSent, copy }: HubState) {
  const secondbCopy = copy.secondb;
  return (
    <View style={styles.chatStack}>
      <Text variant="body" style={styles.userBubble}>{secondbCopy.user}</Text>
      <View style={styles.aiGroup}>
        <Text variant="body" style={styles.aiBubble}>{secondbCopy.reply}</Text>
        <Text variant="subtle" style={styles.evidence}>{secondbCopy.evidence}</Text>
      </View>
      {chatSent ? <Text variant="subtle" style={styles.sentNote}>{secondbCopy.sent}</Text> : null}
      <View style={styles.inputBar}>
        <TextInput
          accessibilityLabel={secondbCopy.inputLabel}
          placeholder={secondbCopy.placeholder}
          placeholderTextColor={colors.textLo}
          value={chatDraft}
          onChangeText={setChatDraft}
          style={styles.inputText}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={secondbCopy.sendLabel}
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

function TrendContent({ trendAction, setTrendAction, copy: hubCopy }: HubState) {
  const copy = hubCopy.trend;
  return (
    <>
      <Text variant="body" style={styles.subtitle}>{copy.subtitle}</Text>
      <TrendCard {...copy.cards.selfKnowledge} onPress={() => setTrendAction("selfKnowledge")} />
      <TrendCard {...copy.cards.morningRoutine} onPress={() => setTrendAction("morningRoutine")} />
      {trendAction ? <Text variant="subtle" style={styles.sentNote}>{copy.ready(copy.cards[trendAction].title)}</Text> : null}
      <View style={styles.emptyCard}><Text variant="body" style={styles.mutedBody}>{copy.empty}</Text></View>
    </>
  );
}

function ReviewContent({ reviewDecision, setReviewDecision, copy }: HubState) {
  const reviewCopy = copy.review;
  return (
    <>
      <Text variant="body" style={styles.subtitle}>{reviewCopy.subtitle}</Text>
      <View style={styles.reviewCard}>
        <Text variant="caption" pixelEn style={styles.sectionLabelSoul}>{reviewCopy.proposal}</Text>
        <Text variant="body" style={styles.reviewBody}>{reviewCopy.body}</Text>
        <View style={styles.scoreRow}><Score label={reviewCopy.now} value="61" /><RNText style={styles.arrow}>→</RNText><Score label={reviewCopy.proposed} value="68" /><Text variant="subtle" style={styles.evidenceRight}>{reviewCopy.evidence}</Text></View>
      </View>
      <Text variant="subtle" style={styles.reviewNote}>{reviewCopy.note}</Text>
      {reviewDecision ? <Text variant="subtle" style={styles.sentNote}>{reviewDecision === "approve" ? reviewCopy.approved : reviewCopy.held}</Text> : null}
      <View style={styles.actionRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={reviewCopy.holdLabel} onPress={() => setReviewDecision("hold")} style={styles.secondaryButton}><Text variant="caption" style={styles.secondaryButtonText}>{reviewCopy.hold}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={reviewCopy.approveLabel} onPress={() => setReviewDecision("approve")} style={styles.soulButton}><Text variant="caption" style={styles.soulButtonText}>{reviewCopy.approve}</Text></Pressable>
      </View>
      <Pressable accessibilityRole="link" accessibilityLabel={reviewCopy.digestLabel} onPress={() => router.push("/digest")} style={{ marginTop: spacing.sm, alignSelf: "center" }}>
        <Text variant="caption" color="brand">{reviewCopy.digest}</Text>
      </Pressable>
    </>
  );
}

function SmallRow({ icon, title, time }: { icon: string; title: string; time: string }) {
  return <View style={styles.smallRow}><RNText style={styles.rowIcon}>{icon}</RNText><Text variant="body" style={styles.rowTitle} numberOfLines={1}>{title}</Text><Text variant="subtle" style={styles.rowTime}>{time}</Text></View>;
}

function TrendCard({ title, delta, body, label, onPress }: { title: string; delta: string; body: string; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.card}><View style={styles.cardHead}><Text variant="heading" style={styles.cardTitle}>{title}</Text><Text variant="subtle" style={styles.delta}>{delta}</Text></View><Text variant="body" style={styles.cardBody}>{body}</Text></Pressable>;
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
