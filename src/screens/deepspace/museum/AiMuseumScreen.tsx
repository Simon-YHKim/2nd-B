// AI Museum (Claude Design "AI 뮤지엄.dc.html"). GT7-brand-museum style:
// 8 category tabs + a horizontal card rail of milestone moments, deep-space cyan.
// One screen, browse sideways. Language follows i18n (ko/en) with a header toggle.
// deepSpace.* tokens only (no hex), no em dashes, touch targets >= 44px.
//
// Data: the CATS array below is ported 1:1 from the design canon (8 categories x
// dated milestones, ko/en inline) so copy is never invented. New moments: add one
// { date, ko:[title, body], en:[title, body] } row to the right category.
//
// Images: the web design used drag-drop slots; on native each moment shows a
// labeled placeholder. Wire real bundled/remote art per moment where // TODO.

import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { deepSpace, deepSpaceRadii, deepSpaceSpacing, withAlpha } from "@/lib/theme/tokens";
import { Text } from "@/components/ui/Text";

// `img` (optional): a public-domain image URL (Wikimedia Special:FilePath). It
// overlays the accent-orb slot; if it fails to load, the orb shows through, so a
// missing/blocked image never looks broken. PD sources are credited in README
// (C12). Moments without a confirmed-PD image keep the orb placeholder.
type Entry = { date: string; ko: [string, string]; en: [string, string]; img?: string };
type Category = {
  id: string;
  accent: string;
  ko: string;
  en: string;
  dko: string;
  den: string;
  entries: Entry[];
};

const CATS: Category[] = [
  {
    id: "found", accent: deepSpace.text, ko: "기반 연구·아키텍처", en: "Foundations & Architecture",
    dko: "생각하는 기계라는 꿈이 수학과 회로가 된 순간들.", den: "When the dream of a thinking machine became math and circuits.",
    entries: [
      { date: "1950", ko: ["튜링 테스트", "앨런 튜링이 기계가 생각할 수 있는가를 모방 게임으로 다시 물었다."], en: ["The Turing Test", "Alan Turing reframed can machines think as the imitation game."], img: "https://commons.wikimedia.org/wiki/Special:FilePath/Alan_Turing_Aged_16.jpg?width=640" },
      { date: "1956", ko: ["다트머스 회의", "인공지능이 처음 하나의 학문 이름으로 태어났다."], en: ["Dartmouth Workshop", "Artificial intelligence was born as the name of a field."] },
      { date: "1958", ko: ["퍼셉트론", "로젠블랫이 스스로 학습하는 인공 뉴런을 만들었다."], en: ["The Perceptron", "Rosenblatt built the first learning artificial neuron."] },
      { date: "1986", ko: ["역전파", "다층 신경망을 실제로 학습시키는 길이 열렸다."], en: ["Backpropagation", "Made training deep multi-layer networks practical."] },
      { date: "1997", ko: ["LSTM", "긴 기억을 가진 순환 신경망이 등장했다."], en: ["LSTM", "Recurrent networks gained long-term memory."] },
      { date: "2017", ko: ["트랜스포머", "Attention Is All You Need, 오늘날 모든 LLM의 골격."], en: ["The Transformer", "Attention Is All You Need, the backbone of every modern LLM."], img: "https://commons.wikimedia.org/wiki/Special:FilePath/The-Transformer-model-architecture.png?width=640" },
      { date: "2020", ko: ["스케일링 법칙", "더 크게가 더 똑똑하게로 이어진다는 법칙이 밝혀졌다."], en: ["Scaling Laws", "Bigger models reliably and predictably get smarter."] },
    ],
  },
  {
    id: "llm", accent: deepSpace.accent, ko: "언어·LLM", en: "Language & LLM",
    dko: "문장 한 줄이 대화가 되고, 대화가 일상이 되기까지.", den: "From one fluent sentence to a conversation in everyone's day.",
    entries: [
      { date: "2018", ko: ["BERT & GPT-1", "사전학습-미세조정이 자연어 처리를 다시 썼다."], en: ["BERT & GPT-1", "Pretrain-then-finetune reshaped natural language processing."] },
      { date: "2019", ko: ["GPT-2", "너무 유창해 공개를 단계적으로 미룬 모델."], en: ["GPT-2", "So fluent its release was staged over misuse fears."] },
      { date: "2020", ko: ["GPT-3", "1750억 파라미터, few-shot의 시대가 열렸다."], en: ["GPT-3", "175B parameters opened the few-shot era."] },
      { date: "2022", ko: ["ChatGPT", "5일 만에 100만 사용자, AI가 일상으로 들어왔다."], en: ["ChatGPT", "One million users in five days; AI went mainstream."] },
      { date: "2023", ko: ["GPT-4", "멀티모달 추론으로 큰 도약을 이뤘다."], en: ["GPT-4", "A major leap into multimodal reasoning."] },
      { date: "2023", ko: ["Claude", "헌법적 AI(Constitutional AI)로 더 안전한 대화를."], en: ["Claude", "Constitutional AI for safer, steerable dialogue."] },
      { date: "2023", ko: ["Gemini", "구글의 멀티모달 응전."], en: ["Gemini", "Google's natively multimodal answer."] },
      { date: "2024", ko: ["추론 모델", "o1·Claude가 답하기 전에 생각하는 시간을 갖다."], en: ["Reasoning Models", "o1 and Claude take time to think before answering."] },
    ],
  },
  {
    id: "gen", accent: deepSpace.soul, ko: "이미지·생성", en: "Image & Generative",
    dko: "기계가 보고 베끼던 것에서, 꿈꾸고 그리는 것으로.", den: "From machines that copy what they see to ones that dream and draw.",
    entries: [
      { date: "2014", ko: ["GAN", "굿펠로우, 생성자와 판별자의 대결이 시작됐다."], en: ["GANs", "Goodfellow's generator versus discriminator duel."], img: "https://commons.wikimedia.org/wiki/Special:FilePath/Ian_Goodfellow.jpg?width=640" },
      { date: "2015", ko: ["딥드림", "신경망이 꾸는 꿈을 처음 눈으로 봤다."], en: ["DeepDream", "The first look inside a network's dreams."], img: "https://commons.wikimedia.org/wiki/Special:FilePath/Google_Deep_Dream_Image_(19926204302).jpg?width=640" },
      { date: "2021", ko: ["DALL·E & CLIP", "글로 그림을 그리기 시작했다."], en: ["DALL·E & CLIP", "Drawing pictures straight from words."], img: "https://commons.wikimedia.org/wiki/Special:FilePath/DALL-E_2_artificial_intelligence_digital_image_generated_photo.jpg?width=640" },
      { date: "2022", ko: ["Diffusion 폭발", "Stable Diffusion·Midjourney가 이미지 생성을 모두의 손에."], en: ["Diffusion Boom", "Stable Diffusion and Midjourney put image-making in every hand."], img: "https://commons.wikimedia.org/wiki/Special:FilePath/Demonstration_of_inpainting_and_outpainting_using_Stable_Diffusion_(step_1_of_4).png?width=640" },
      { date: "2024", ko: ["Sora", "글에서 영상으로, 생성의 다음 차원."], en: ["Sora", "From text to video, the next dimension of generation."] },
    ],
  },
  {
    id: "agent", accent: deepSpace.mint, ko: "로보틱스·에이전트·체화", en: "Robotics, Agents & Embodiment",
    dko: "화면 속 지능이 게임을 이기고, 세상 속 몸을 얻기까지.", den: "Intelligence that won games, then reached for a body in the world.",
    entries: [
      { date: "1997", ko: ["딥블루", "체스 세계 챔피언을 이긴 첫 기계."], en: ["Deep Blue", "The first machine to beat the chess world champion."], img: "https://commons.wikimedia.org/wiki/Special:FilePath/Deep_Blue.jpg?width=640" },
      { date: "2016", ko: ["AlphaGo", "이세돌을 꺾고 직관의 벽을 넘었다."], en: ["AlphaGo", "Defeated Lee Sedol, crossing the barrier of intuition."], img: "https://commons.wikimedia.org/wiki/Special:FilePath/Lee_Se-Dol_-_2016_(cropped).jpg?width=640" },
      { date: "2019", ko: ["AlphaStar", "실시간 전략 게임을 정복했다."], en: ["AlphaStar", "Mastered real-time strategy at grandmaster level."] },
      { date: "2022", ko: ["Gato", "하나의 모델이 600가지 일을 해냈다."], en: ["Gato", "A single model doing 600 different tasks."] },
      { date: "2023", ko: ["자율 에이전트", "AutoGPT, 스스로 계획하고 실행하는 AI."], en: ["Autonomous Agents", "AutoGPT, AI that plans and runs its own steps."] },
      { date: "2024", ko: ["휴머노이드", "Figure·Optimus, 체화 지능이 떠오르다."], en: ["Humanoids", "Figure and Optimus, embodied intelligence rises."], img: "https://commons.wikimedia.org/wiki/Special:FilePath/Optimus_Tesla.jpg?width=640" },
    ],
  },
  {
    id: "voice", accent: deepSpace.accentSoft, ko: "음성·멀티모달", en: "Voice & Multimodal",
    dko: "말로 묻고, 보고 듣고 답하는 AI로.", den: "Ask out loud; an AI that sees, hears, and replies.",
    entries: [
      { date: "2011", ko: ["Siri & Watson", "말로 묻는 비서, 퀴즈쇼를 이긴 AI."], en: ["Siri & Watson", "A spoken assistant; an AI that won Jeopardy."], img: "https://commons.wikimedia.org/wiki/Special:FilePath/IBM_Watson.PNG?width=640" },
      { date: "2016", ko: ["WaveNet", "사람과 거의 같은 합성 음성."], en: ["WaveNet", "Synthetic speech almost indistinguishable from human."] },
      { date: "2022", ko: ["Whisper", "거의 모든 언어를 받아쓰다."], en: ["Whisper", "Transcribing nearly every language on earth."] },
      { date: "2023", ko: ["GPT-4V", "보는 AI의 등장."], en: ["GPT-4V", "The arrival of an AI that can see."] },
      { date: "2024", ko: ["GPT-4o", "실시간 음성·시각 대화."], en: ["GPT-4o", "Real-time voice and vision conversation."] },
    ],
  },
  {
    id: "hw", accent: deepSpace.accentDim, ko: "하드웨어·인프라", en: "Hardware & Infrastructure",
    dko: "지능을 떠받친, 보이지 않는 엔진들.", den: "The invisible engines that carry intelligence.",
    entries: [
      { date: "2006", ko: ["CUDA", "GPU를 범용 계산기로 바꿨다."], en: ["CUDA", "Turned GPUs into general-purpose compute."], img: "https://commons.wikimedia.org/wiki/Special:FilePath/NVidia_G71_GPU.jpg?width=640" },
      { date: "2012", ko: ["GPU 딥러닝", "AlexNet이 GPU 위에서 우승했다."], en: ["GPU Deep Learning", "AlexNet won ImageNet running on GPUs."], img: "https://commons.wikimedia.org/wiki/Special:FilePath/Galaxy_NVIDIA_GeForce_GTX_460.JPG?width=640" },
      { date: "2016", ko: ["TPU", "구글의 AI 전용 칩."], en: ["TPU", "Google's purpose-built AI chip."] },
      { date: "2022", ko: ["H100", "생성형 AI를 떠받친 엔진."], en: ["H100", "The engine behind the generative AI wave."], img: "https://commons.wikimedia.org/wiki/Special:FilePath/NVIDIA_H100_(%E6%9E%81%E5%AE%A2%E6%B9%BEGeekerwan)_025.png?width=640" },
      { date: "2024", ko: ["Blackwell", "조 단위 파라미터를 겨냥하다."], en: ["Blackwell", "Built for trillion-parameter models."], img: "https://commons.wikimedia.org/wiki/Special:FilePath/Jensen_Huang_-_RTX_Blackwell_-_Nvidia_Keynote_-_CES_2025_Las_Vegas_(3).jpg?width=640" },
    ],
  },
  {
    id: "oss", accent: deepSpace.text, ko: "오픈소스·생태계", en: "Open Source & Ecosystem",
    dko: "소수의 실험실에서, 모두의 도구로.", den: "From a few labs to a tool for everyone.",
    entries: [
      { date: "2015", ko: ["TensorFlow", "구글이 딥러닝을 공개했다."], en: ["TensorFlow", "Google open-sourced deep learning."] },
      { date: "2016", ko: ["PyTorch", "연구자의 사실상 표준이 되다."], en: ["PyTorch", "Became researchers' de facto standard."] },
      { date: "2018", ko: ["HuggingFace", "모델을 누구나 나누는 광장."], en: ["Hugging Face", "A public square for sharing models."] },
      { date: "2023", ko: ["Llama", "메타가 모델 가중치를 열었다."], en: ["Llama", "Meta opened the model weights."] },
      { date: "2024", ko: ["개방 생태계", "Llama 3, 오픈 모델이 프런티어를 좇다."], en: ["Open Ecosystem", "Llama 3, open models chasing the frontier."] },
    ],
  },
  {
    id: "soc", accent: deepSpace.soul, ko: "사회·정책·안전", en: "Society, Policy & Safety",
    dko: "힘이 커질수록 함께 무거워진 질문들.", den: "As the power grew, so did the questions.",
    entries: [
      { date: "2015", ko: ["OpenAI 설립", "안전한 AGI를 사명으로 내걸다."], en: ["OpenAI Founded", "Founded with a mission to build safe AGI."] },
      { date: "2017", ko: ["아실로마 원칙", "AI 연구의 윤리 합의가 모이다."], en: ["Asilomar Principles", "A shared ethics charter for AI research."] },
      { date: "2022", ko: ["RLHF", "인간 피드백으로 모델을 정렬하다."], en: ["RLHF", "Aligning models with human feedback."] },
      { date: "2023", ko: ["EU AI Act & 안전 정상회의", "첫 포괄 규제와 국제 안전 논의."], en: ["EU AI Act & Safety Summit", "First broad regulation and global safety talks."], img: "https://commons.wikimedia.org/wiki/Special:FilePath/UK_Government_hosts_AI_Summit_at_Bletchley_Park_(53301734397).jpg?width=640" },
      { date: "2024", ko: ["프런티어 안전", "최전선 모델의 자율 안전 약속."], en: ["Frontier Safety", "Voluntary safety commitments for frontier models."] },
    ],
  },
];

const CARD_W = 320;

export function AiMuseumScreen() {
  const { i18n } = useTranslation();
  const ko = i18n.language?.toLowerCase().startsWith("ko") ?? false;
  const [catIdx, setCatIdx] = useState(0);

  const active = CATS[catIdx];
  const C = ko
    ? { eyebrow: "AI 뮤지엄", title: "AI 발전사 뮤지엄", subtitle: "기계가 생각하기 시작한 순간들 · 1950 → 2026", moments: "개의 순간", scroll: "옆으로 밀어 더 많은 순간을 보세요", langBtn: "EN" }
    : { eyebrow: "THE AI MUSEUM", title: "The Museum of AI", subtitle: "Moments when machines began to think · 1950 → 2026", moments: " moments", scroll: "Scroll sideways for more moments", langBtn: "한국어" };

  const tabs = useMemo(
    () => CATS.map((c) => ({ id: c.id, label: ko ? c.ko : c.en, color: c.accent })),
    [ko],
  );

  const toggleLang = () => void i18n.changeLanguage(ko ? "en" : "ko");

  const renderCard = ({ item, index }: { item: Entry; index: number }) => {
    const [title, body] = ko ? item.ko : item.en;
    const num = String(index + 1).padStart(2, "0");
    return (
      <View style={styles.card}>
        {/* TODO: replace the placeholder with the moment's bundled/remote image.
            Until then, an intentional deep-space slot (category-accent orb), not a
            blank box. */}
        <View style={[styles.slot, { backgroundColor: withAlpha(active.accent, 0.1) }]}>
          <View style={[styles.slotOrb, { backgroundColor: withAlpha(active.accent, 0.22), borderColor: active.accent }]} />
          <Text variant="subtle" style={styles.slotHint}>{`${item.date} · ${title}`}</Text>
          {item.img ? (
            <Image source={{ uri: item.img }} style={styles.slotImg} contentFit="cover" accessible accessibilityLabel={title} />
          ) : null}
        </View>
        <View style={styles.cardBody}>
          <Text variant="heading" style={styles.num}>{num}</Text>
          <View style={[styles.dateChip, { borderColor: active.accent }]}>
            <Text variant="caption" style={[styles.dateText, { color: active.accent }]}>{item.date}</Text>
          </View>
          <Text variant="heading" style={styles.cardTitle}>{title}</Text>
          <Text variant="body" style={styles.cardBodyText}>{body}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.glow} pointerEvents="none" />

      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Text variant="heading" style={styles.backIcon}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text variant="caption" pixelEn style={styles.eyebrow}>{C.eyebrow}</Text>
          <Text variant="heading" style={styles.title}>{C.title}</Text>
          <Text variant="body" style={styles.subtitle}>{C.subtitle}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={toggleLang} hitSlop={8} style={styles.langBtn}>
          <Text variant="caption" style={styles.langText}>{C.langBtn}</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
        {tabs.map((tab, i) => {
          const on = i === catIdx;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setCatIdx(i)}
              hitSlop={6}
              style={[styles.tab, on ? { borderColor: tab.color, backgroundColor: deepSpace.cardPressed } : null]}
            >
              <View style={[styles.tabDot, { backgroundColor: tab.color }]} />
              <Text variant="caption" style={[styles.tabLabel, on ? styles.tabLabelOn : null]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.catHead}>
        <View style={[styles.catDot, { backgroundColor: active.accent }]} />
        <Text variant="heading" style={styles.catName}>{ko ? active.ko : active.en}</Text>
        <Text variant="caption" pixelEn style={styles.catCount}>{`${active.entries.length}${C.moments}`}</Text>
      </View>
      <Text variant="body" style={styles.catDesc}>{ko ? active.dko : active.den}</Text>

      <FlatList
        key={active.id}
        data={active.entries}
        keyExtractor={(e, i) => `${active.id}-${i}`}
        renderItem={renderCard}
        horizontal
        showsHorizontalScrollIndicator
        snapToInterval={CARD_W + 18}
        decelerationRate="fast"
        contentContainerStyle={styles.rail}
      />

      <Text variant="subtle" style={styles.scrollHint}>{C.scroll}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: deepSpace.bg },
  glow: { position: "absolute", top: 0, left: 0, right: 0, height: 240, backgroundColor: deepSpace.bgGlow, opacity: 0.5 },

  header: { flexDirection: "row", alignItems: "flex-start", gap: deepSpaceSpacing.sm, paddingHorizontal: deepSpaceSpacing.lg, paddingTop: deepSpaceSpacing.sm },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -10 },
  backIcon: { fontSize: 26, color: deepSpace.accentBright },
  headerText: { flex: 1 },
  eyebrow: { fontSize: 9, letterSpacing: 1.6, color: deepSpace.text, marginBottom: 6 },
  title: { fontSize: 24, color: deepSpace.textHi },
  subtitle: { fontSize: 13, color: deepSpace.textMid, marginTop: 6 },
  langBtn: { minHeight: 36, paddingHorizontal: deepSpaceSpacing.md, alignItems: "center", justifyContent: "center", borderRadius: deepSpaceRadii.md, borderWidth: 1, borderColor: deepSpace.cardLineStrong, backgroundColor: deepSpace.card },
  langText: { fontSize: 13, color: deepSpace.accentSoft },

  tabRow: { gap: 8, paddingHorizontal: deepSpaceSpacing.lg, paddingVertical: deepSpaceSpacing.md },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: deepSpace.cardLine, borderRadius: deepSpaceRadii.md, backgroundColor: deepSpace.card },
  tabDot: { width: 7, height: 7, borderRadius: 4 },
  tabLabel: { fontSize: 13, color: deepSpace.textMid },
  tabLabelOn: { color: deepSpace.textHi },

  catHead: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: deepSpaceSpacing.lg, marginTop: 4 },
  catDot: { width: 9, height: 9, borderRadius: 5 },
  catName: { fontSize: 19, color: deepSpace.accentBright },
  catCount: { fontSize: 8, letterSpacing: 1, color: deepSpace.text },
  catDesc: { fontSize: 13, color: deepSpace.textMid, paddingHorizontal: deepSpaceSpacing.lg, marginTop: 8, lineHeight: 20 },

  rail: { gap: 18, paddingHorizontal: deepSpaceSpacing.lg, paddingTop: deepSpaceSpacing.md, paddingBottom: deepSpaceSpacing.sm },
  card: { width: CARD_W, borderRadius: deepSpaceRadii.lg, overflow: "hidden", borderWidth: 1, borderColor: deepSpace.cardLine, backgroundColor: deepSpace.card },
  slot: { height: 184, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: deepSpace.cardPressed, borderBottomWidth: 1, borderBottomColor: deepSpace.cardLine, padding: deepSpaceSpacing.md },
  slotOrb: { width: 48, height: 48, borderRadius: 24, borderWidth: 1 },
  slotImg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  slotHint: { fontSize: 11, color: deepSpace.textLo, textAlign: "center" },
  cardBody: { padding: deepSpaceSpacing.md, gap: 8 },
  num: { fontSize: 26, color: deepSpace.cardLineStrong },
  dateChip: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderRadius: deepSpaceRadii.sm },
  dateText: { fontSize: 12 },
  cardTitle: { fontSize: 18, color: deepSpace.textHi },
  cardBodyText: { fontSize: 13, color: deepSpace.textMid, lineHeight: 20 },

  scrollHint: { fontSize: 12, color: deepSpace.textLo, paddingHorizontal: deepSpaceSpacing.lg, paddingTop: 4 },
});
