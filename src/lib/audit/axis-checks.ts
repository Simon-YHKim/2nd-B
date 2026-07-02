// Axis-scoped reflective checks (rev2 P3b): 동기 (self-determination) and 강점
// (character strengths). These are FOCUSED versions of the life-audit pattern —
// free-text reflection prompts anchored to the existing framework vocabulary
// (questions.ts / frameworkLabels.ts), saved as audit_response records.
//
// Honesty + licensing: these are self-checks (자기 점검), NOT validated
// instruments — no proprietary questionnaire items are bundled (the validated
// tools in the app stay BFI-44 / IPIP-NEO-120 / ECR-S, all public-domain or
// research-free). Copy stays in the self-understanding/growth register.

export type AxisCheckId = "motivation" | "strengths" | "values";

export interface AxisQuestion {
  id: string;
  /** Framework tag from the shared audit vocabulary (frameworkLabels.ts). */
  framework: string;
  prompt: { en: string; ko: string };
}

export interface AxisCheck {
  id: AxisCheckId;
  /** Record tag marking which axis check produced the answer. */
  tag: string;
  title: { en: string; ko: string };
  intro: { en: string; ko: string };
  questions: AxisQuestion[];
}

const MOTIVATION: AxisCheck = {
  id: "motivation",
  tag: "axis_check:motivation",
  title: { en: "Motivation check", ko: "동기 체크" },
  intro: {
    en: "Six short reflections on what moves you: choosing for yourself, getting better at things, and feeling connected. Write freely; there are no scores.",
    ko: "나를 움직이는 힘을 여섯 번의 짧은 돌아보기로 살펴봐요. 스스로 선택하는 것, 점점 나아지는 것, 연결되어 있다는 느낌. 점수는 없어요. 자유롭게 적어 주세요.",
  },
  questions: [
    {
      id: "mot-auto-1",
      framework: "sdt:autonomy",
      prompt: {
        en: "What do you keep doing these days purely by your own choice, things nobody has to ask you to do?",
        ko: "요즘 누가 시키지 않아도 스스로 선택해서 계속하는 일은 무엇인가요?",
      },
    },
    {
      id: "mot-auto-2",
      framework: "sdt:autonomy",
      prompt: {
        en: "Where in your days do you feel you can't act on your own terms right now?",
        ko: "지금 생활에서 '내 뜻대로 하기 어렵다'고 느끼는 부분은 어디인가요?",
      },
    },
    {
      id: "mot-comp-1",
      framework: "sdt:competence",
      prompt: {
        en: "When did you last catch yourself getting better at something? What was it?",
        ko: "최근에 '내가 이걸 점점 잘하게 되네'라고 느낀 순간은 언제, 무엇이었나요?",
      },
    },
    {
      id: "mot-comp-2",
      framework: "sdt:competence",
      prompt: {
        en: "Is anything in your life too easy to stay interesting, or too hard to hold on to?",
        ko: "너무 쉬워서 지루해졌거나, 너무 어려워서 버거운 일이 있나요?",
      },
    },
    {
      id: "mot-rel-1",
      framework: "sdt:relatedness",
      prompt: {
        en: "Who feels genuinely supportive these days? What moment made you feel it?",
        ko: "요즘 나를 진심으로 지지해 준다고 느끼는 사람은 누구인가요? 어떤 순간에 그렇게 느꼈나요?",
      },
    },
    {
      id: "mot-rel-2",
      framework: "sdt:relatedness",
      prompt: {
        en: "Is there a bond you miss that has drifted? What would reaching out look like?",
        ko: "함께하고 싶은데 멀어진 관계가 있나요? 다시 손을 내민다면 어떤 모습일까요?",
      },
    },
  ],
};

const STRENGTHS: AxisCheck = {
  id: "strengths",
  tag: "axis_check:strengths",
  title: { en: "Strengths check", ko: "강점 체크" },
  intro: {
    en: "Six spotting questions that surface what you're naturally good at: energy, flow, praise, fast learning, proud moments, and where to use it next.",
    ko: "내가 자연스럽게 잘하는 것을 찾아내는 여섯 가지 질문이에요. 에너지, 몰입, 칭찬, 빠른 배움, 자랑스러운 순간, 그리고 다음에 쓸 곳까지.",
  },
  questions: [
    {
      id: "str-energy",
      framework: "via:character_strength",
      prompt: {
        en: "What activity leaves you with MORE energy than you started with?",
        ko: "하고 나면 오히려 힘이 나는 활동은 무엇인가요?",
      },
    },
    {
      id: "str-flow",
      framework: "via:character_strength",
      prompt: {
        en: "Recall a recent moment you lost track of time. What were you doing?",
        ko: "시간 가는 줄 모르고 몰입했던 최근 순간을 떠올려 보세요. 무엇을 하고 있었나요?",
      },
    },
    {
      id: "str-praise",
      framework: "via:character_strength",
      prompt: {
        en: "What do people repeatedly praise you for, or keep asking your help with?",
        ko: "다른 사람들이 자주 칭찬하거나, 자꾸 도움을 청해 오는 나의 능력은 무엇인가요?",
      },
    },
    {
      id: "str-fast",
      framework: "via:character_strength",
      prompt: {
        en: "What have you picked up unusually fast compared to the people around you?",
        ko: "주변 사람들보다 유난히 빨리 배웠던 것이 있나요?",
      },
    },
    {
      id: "str-peak",
      framework: "via:character_strength",
      prompt: {
        en: "Your proudest moment this past year, and the strength it drew on?",
        ko: "지난 1년에서 가장 자랑스러웠던 순간과, 그때 발휘된 나의 강점은 무엇인가요?",
      },
    },
    {
      id: "str-apply",
      framework: "via:character_strength",
      prompt: {
        en: "Where could you deliberately use that strength once more this week?",
        ko: "그 강점을 이번 주에 한 번 더 일부러 써 본다면, 어디에 쓸 수 있을까요?",
      },
    },
  ],
};

// 가치관 (rev2 P3b) — Schwartz-anchored self-check. The prototype's values
// screen shows a ranked spectrum; honesty rules (no mock numbers) mean the
// spectrum renders only once these reflections accumulate — this check is the
// input side. One reflection per anchor value; the prototype's value notes
// ("스스로 정하고 움직일 때 가장 나다워요" …) seeded the prompts.
const VALUES: AxisCheck = {
  id: "values",
  tag: "axis_check:values",
  title: { en: "Values check", ko: "가치관 체크" },
  intro: {
    en: "Six short reflections on what you hold important: deciding for yourself, novelty, being the same inside and out, caring, achieving, and stability. No scores; your answers become the signals behind the values spectrum.",
    ko: "무엇을 중요하게 여기는지 여섯 번의 짧은 돌아보기로 살펴봐요. 스스로 정하는 것, 새로움, 겉과 속이 같은 것, 돌봄, 성취, 안정. 점수는 없어요. 적어 주신 기록이 가치 스펙트럼의 근거가 돼요.",
  },
  questions: [
    {
      id: "val-selfdir",
      framework: "values:self_direction",
      prompt: {
        en: "What choice did you recently make and carry through entirely on your own terms?",
        ko: "최근에 온전히 내 뜻으로 정해서 끝까지 밀고 나간 선택은 무엇이었나요?",
      },
    },
    {
      id: "val-stim",
      framework: "values:stimulation",
      prompt: {
        en: "What newness or learning is pulling you in these days?",
        ko: "요즘 나를 끌어당기는 새로움이나 배움이 있나요? 무엇인가요?",
      },
    },
    {
      id: "val-auth",
      framework: "values:authenticity",
      prompt: {
        en: "When did being different on the outside and inside last feel uncomfortable? What was the situation?",
        ko: "겉과 속이 달라서 불편했던 최근 순간이 있나요? 어떤 상황이었나요?",
      },
    },
    {
      id: "val-benev",
      framework: "values:benevolence",
      prompt: {
        en: "When did caring for someone close recently feel most like you?",
        ko: "가까운 사람을 챙기면서 '이게 나답다'고 느낀 최근 순간은 언제였나요?",
      },
    },
    {
      id: "val-achieve",
      framework: "values:achievement",
      prompt: {
        en: "What gave you an unusually strong sense of 'I did it'?",
        ko: "'해냈다'는 감각이 유난히 컸던 일은 무엇이었나요?",
      },
    },
    {
      id: "val-secure",
      framework: "values:security",
      prompt: {
        en: "When did you last need things predictable and steady? How filled is that need right now?",
        ko: "안정과 예측 가능함이 필요했던 순간은 언제였나요? 지금 그 필요는 얼마나 채워져 있나요?",
      },
    },
  ],
};

export const AXIS_CHECKS: Record<AxisCheckId, AxisCheck> = {
  motivation: MOTIVATION,
  strengths: STRENGTHS,
  values: VALUES,
};
