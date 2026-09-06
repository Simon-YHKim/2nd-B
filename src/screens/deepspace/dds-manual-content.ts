export type ManualLocale = "en" | "ko";
export type ManualTopicId = "stars" | "brightness" | "source" | "ratify" | "data";

export type ManualRoute =
  | "/secondb?panel=dashboard"
  | "/brightness"
  | "/records"
  | "/review"
  | "/privacy"
  | "/iden"
  | "/account?tool=export"
  | "/support";

export type ManualGlyph = "home" | "sparkle" | "book" | "taskAlt" | "lock";

export interface ManualAction {
  label: string;
  route: ManualRoute;
}

export interface ManualTopic {
  id: ManualTopicId;
  icon: ManualGlyph;
  question: string;
  answer: string;
  actions: readonly ManualAction[];
}

export interface ManualScreenCopy {
  hero: string;
  tip: string;
  searchLabel: string;
  searchPlaceholder: string;
  noResults: string;
  expanded: string;
  collapsed: string;
}

const SCREEN_COPY: Record<ManualLocale, ManualScreenCopy> = {
  en: {
    hero: "Five questions explain how your records become something useful.",
    tip: "Open one answer at a time, or filter the guide below.",
    searchLabel: "Filter the user guide",
    searchPlaceholder: "Search questions and answers",
    noResults: "No matching section. Ask SecondB in your own words.",
    expanded: "Answer open",
    collapsed: "Answer closed",
  },
  ko: {
    hero: "기록이 어떻게 나를 위한 도구가 되는지 다섯 질문으로 알아봅니다.",
    tip: "한 번에 한 답만 열거나 아래에서 안내서를 검색하세요.",
    searchLabel: "사용 안내서 검색",
    searchPlaceholder: "질문과 답변 검색",
    noResults: "맞는 안내를 찾지 못했습니다. 세컨비에게 직접 물어보세요.",
    expanded: "답변 열림",
    collapsed: "답변 닫힘",
  },
};

const TOPICS: Record<ManualLocale, readonly ManualTopic[]> = {
  en: [
    {
      id: "stars",
      icon: "home",
      question: "What are the seven stars?",
      answer:
        "They are profile · infancy · school years · twenties · later life · work · now. Career, finance, growth, relationships, health, and rest are the six life areas in the SecondB dashboard, not stars.",
      actions: [{ label: "Open the SecondB dashboard", route: "/secondb?panel=dashboard" }],
    },
    {
      id: "brightness",
      icon: "sparkle",
      question: "What do brightness and Polaris mean?",
      answer:
        "Brightness records how many interview layers you actually opened. Coverage can reach L4; L5 appears only after you ratify a proposal. Polaris is a summary derived from those inputs, not the source record.",
      actions: [{ label: "View brightness", route: "/brightness" }],
    },
    {
      id: "source",
      icon: "book",
      question: "What does SecondB read?",
      answer:
        "Your wiki and records are the detailed source. SecondB reads that original material when it answers; Polaris is a derived summary rather than the source it should quote from.",
      actions: [{ label: "Open records", route: "/records" }],
    },
    {
      id: "ratify",
      icon: "taskAlt",
      question: "When does a suggestion change my profile?",
      answer:
        "Never by itself. AI output remains a proposal until you ratify it. Only a proposal you confirm can be applied to your model or open L5.",
      actions: [{ label: "Review proposals", route: "/review" }],
    },
    {
      id: "data",
      icon: "lock",
      question: "Where do privacy, safety, and exports live?",
      answer:
        "Privacy choices and account export are explicit controls. IDEN is a portable identity summary. If a message needs urgent support, the app shows support resources before an ordinary reply and does not contact services for you.",
      actions: [
        { label: "Privacy controls", route: "/privacy" },
        { label: "Portable IDEN", route: "/iden" },
        { label: "Account export", route: "/account?tool=export" },
        { label: "Support resources", route: "/support" },
      ],
    },
  ],
  ko: [
    {
      id: "stars",
      icon: "home",
      question: "일곱 별은 무엇인가요?",
      answer:
        "프로필 · 영유아기 · 학창시절 · 20대 · 30대 이후 · 직장 · 지금입니다. 커리어 · 재정 · 성장 · 관계 · 건강 · 휴식은 별이 아니라 세컨비 대시보드의 생활 여섯 영역입니다.",
      actions: [{ label: "세컨비 대시보드 열기", route: "/secondb?panel=dashboard" }],
    },
    {
      id: "brightness",
      icon: "sparkle",
      question: "밝기와 북극성은 무엇을 뜻하나요?",
      answer:
        "밝기는 인터뷰에서 실제로 연 층을 나타냅니다. 기록만으로는 L4까지이며, L5는 제안을 직접 확인한 뒤에만 열립니다. 북극성은 그 입력에서 파생된 요약이지 원본 기록이 아닙니다.",
      actions: [{ label: "밝기 보기", route: "/brightness" }],
    },
    {
      id: "source",
      icon: "book",
      question: "세컨비는 무엇을 읽나요?",
      answer:
        "위키와 기록이 상세 원본입니다. 세컨비는 북극성 요약이 아니라 그 원문을 읽습니다. 답변이 근거를 제시할 때도 실제 기록을 가리킵니다.",
      actions: [{ label: "기록 열기", route: "/records" }],
    },
    {
      id: "ratify",
      icon: "taskAlt",
      question: "제안은 언제 나에게 반영되나요?",
      answer:
        "AI 결과는 스스로 상태를 바꾸지 않는 제안입니다. 사용자가 내용을 확인하기 전에는 반영되지 않으며, 확인한 제안만 나의 요약을 바꾸거나 L5를 열 수 있습니다.",
      actions: [{ label: "제안 확인하기", route: "/review" }],
    },
    {
      id: "data",
      icon: "lock",
      question: "프라이버시 · 안전 · 내보내기는 어디에 있나요?",
      answer:
        "프라이버시 선택과 계정 내보내기는 직접 여는 기능입니다. IDEN은 나에 대한 요약을 옮길 수 있는 파일입니다. 긴급한 지원이 필요한 메시지에는 일반 답변보다 지원 연락처를 먼저 보여주며, 앱이 대신 연락하지는 않습니다.",
      actions: [
        { label: "프라이버시 설정", route: "/privacy" },
        { label: "포터블 IDEN", route: "/iden" },
        { label: "계정 내보내기", route: "/account?tool=export" },
        { label: "지원 안내", route: "/support" },
      ],
    },
  ],
};

export function manualScreenCopyFor(locale: ManualLocale): ManualScreenCopy {
  return SCREEN_COPY[locale];
}

export function manualTopicsFor(locale: ManualLocale): readonly ManualTopic[] {
  return TOPICS[locale];
}

function searchableText(topic: ManualTopic): string {
  return [topic.question, topic.answer, ...topic.actions.map(({ label }) => label)].join(" ");
}

export function filterManualTopics(
  topics: readonly ManualTopic[],
  query: string,
): readonly ManualTopic[] {
  const needle = query.normalize("NFKC").trim().toLocaleLowerCase();
  if (!needle) return topics;
  return topics.filter((topic) =>
    searchableText(topic).normalize("NFKC").toLocaleLowerCase().includes(needle),
  );
}
