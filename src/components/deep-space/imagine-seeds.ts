// The reference ImagineScreen's three divergent seeds (sb-more IMAGINE_SEEDS),
// KO canonical / EN mirrored; other locales fall back to EN like the
// 460-ternary surfaces. Static demo content by design — no dynamic generation
// (src/lib/llm/imagine.ts stays dormant; "세컨비와 더" deep-links Divergent chat).
// Kept in a .ts module (not the .tsx view) so canon tests can import it without
// dragging JSX through jest's classic transform.
export const IMAGINE_SEEDS = [
  {
    icon: "expand",
    ko: {
      angle: "확장",
      title: "1년 안식년을 떠난다면",
      body: "돈·일·관계 제약을 잠깐 지우면, 가장 먼저 하고 싶은 건 뭘까요?",
      steps: ["하고 싶은 3가지를 적어보기", "그중 이번 달 1시간으로 맛보기", "관계 별에 동행할 사람 떠올리기"],
    },
    en: {
      angle: "Expand",
      title: "If you took a year off",
      body: "Erase money, work, and ties for a moment - what would you do first?",
      steps: ["Write 3 things you want to do", "Taste one with a single hour this month", "Picture who joins you on the relations star"],
    },
  },
  {
    icon: "cached",
    ko: {
      angle: "반전",
      title: "지금과 정반대로 산다면",
      body: "계획 대신 즉흥, 혼자 대신 함께. 반대편에서 끌리는 한 가지는?",
      steps: ["평소 안 하던 것 하나 이번 주에 시도", "어색했던 점을 세컨비와 기록", "휴식 별로 담아 패턴 보기"],
    },
    en: {
      angle: "Reverse",
      title: "If you lived the exact opposite",
      body: "Improvise instead of plan, together instead of alone. What pulls you from the far side?",
      steps: ["Try one thing you never do this week", "Note what felt awkward with SecondB", "Capture it to the rest star and watch the pattern"],
    },
  },
  {
    icon: "hub",
    ko: {
      angle: "연결",
      title: "커리어 × 휴식을 합치면",
      body: "두 별을 억지로 이으면 어떤 엉뚱한 아이디어가 나올까요?",
      steps: ["두 키워드로 프로젝트 1줄 써보기", "주말 2시간 프로토타입", "성장 별에 실험으로 기록"],
    },
    en: {
      angle: "Connect",
      title: "Career × rest, combined",
      body: "Force the two stars together - what odd idea falls out?",
      steps: ["Write a one-line project from the two keywords", "Prototype it in two weekend hours", "Log it on the growth star as an experiment"],
    },
  },
] as const;

export type ImagineSeedIcon = (typeof IMAGINE_SEEDS)[number]["icon"];
