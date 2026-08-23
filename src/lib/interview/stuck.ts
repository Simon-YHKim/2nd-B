// 사람이 **못 답했을 때** 를 알아보고, 같은 층을 더 쉬운 각도로 다시 묻는다.
//
// 왜 생겼나 (Simon 실측, 2026-08-24). 인터뷰를 실제로 쳐보니 이렇게 갔다:
//
//   L3 의미 → "그 일이 본인에게 무엇을 보여줬다고 생각하세요?"
//           → "잘 모르겠는데"
//   L4 믿음 → "그 경험이 남긴 생각이 있다면…"        ← 더 깊이 내려갔다
//           → "모르겠다구"
//   L5 울림 → "그 생각이 요즘 어떤 선택에서…"        ← 또 내려갔다
//
// 두 가지가 동시에 틀렸다.
//
//   ① **"모르겠다"가 칸을 채웠다.** `incrementCoverage` 는 비어 있지 않은 답이면
//      무조건 셌다. 못 판 것을 판 것으로 세고, 그 칸 수가 그대로
//      `narrativeStarLevel` 의 입력이라 **등급까지 오염됐다.** 7렌즈 감사에서
//      걸린 "행이 들어왔는가를 구인으로 착각" 과 같은 병이다.
//   ② **막혔다는 신호를 다루는 코드가 아예 없었다.** 되묻기(loop-check)는
//      *반복*을 잡지 *막힘*을 잡지 않아 발동하지 않는다. 서로 다른 실패다.
//
// [Simon 결정 2026-08-24] 막히면 **같은 층에 머물되 더 쉬운 각도로** 다시 묻는다.
// 최대 두 번까지 시도하고, 그래도 막히면 넘어간다 — 다만 **그 칸은 끝까지 빈 칸**이다.
//
// 판정을 LLM 에 맡기지 않은 것도 의도다. 이 판정이 곧 별의 밝기로 이어지므로
// 결정론적이고 감사 가능해야 한다. 대신 **보수적으로** 잡는다: 사용자가 스스로
// "모르겠다"고 말한 경우에만 안 센다. 애매하면 센다.

import { type DrillLayer } from "./probe";

/** 한 층에서 발판을 최대 몇 번까지 줄지. 넘으면 칸을 비운 채 다음 층으로 간다. */
export const MAX_SCAFFOLDS_PER_LAYER = 2;

/** "못 답하겠다"는 표시. 정규화된 답 **전체가** 사실상 이것뿐일 때만 걸린다. */
const NON_ANSWER: Record<"en" | "ko", RegExp> = {
  // 모르겠다 / 몰라 / 글쎄 / 딱히 / 생각 안 나 / 기억 안 나 / 없다 / 패스
  ko: /(모르겠|모르갰|몰라|모름|글쎄|딱히|생각안|생각이안|기억안|기억이안|잘모|없는것같|없어|없음|패스|스킵)/,
  en: /\b(i\s*(do\s*not|don'?t|dont)\s*know|no\s*idea|not\s*sure|dunno|idk|nothing|can'?t\s*think|skip|pass)\b/,
};

/** 이보다 길면 "그냥 모르겠다"가 아니라 무언가를 말한 것으로 본다.
 *
 *  "모르겠다는 게 아니라 사실 그때 진짜 무서웠어" 같은 답을 비-답변으로 세면
 *  진짜 재료를 버리게 된다. 길이는 **정규화 후 글자 수**로 잰다. */
const NON_ANSWER_MAX_LEN = 24;

function normalize(text: string): string {
  return text.replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase();
}

/**
 * 이 답이 "못 답하겠다"인가.
 *
 * 보수적이다 — 짧고, 그 안에 포기 표시가 있을 때만 참이다. 빈 답은 화면이 먼저
 * 막으므로 여기서는 참으로 보지 않는다(칸을 세지 않는 것은 어차피 같다).
 */
export function isNonAnswer(text: string, locale: "en" | "ko"): boolean {
  const clean = normalize(text);
  if (clean.length === 0) return false;
  if (clean.length > NON_ANSWER_MAX_LEN) return false;
  return NON_ANSWER[locale].test(clean);
}

/**
 * 층마다 하나씩 준비한 **더 쉬운 각도**. 모델이 발판을 못 만들거나 같은 질문을
 * 되풀이할 때 쓴다.
 *
 * 공통 수법: 해석을 요구하지 않는다. 대신 **비교·가정·구체 예시**로 우회한다.
 * "무엇을 의미했나" 는 답하기 어렵지만 "그 일이 없었다면 뭐가 달랐을까" 는
 * 장면만 있으면 답할 수 있다. `docs/research/batches/self-knowledge.md` 의
 * reflection-promoting 결을 따랐고, 진단·조언은 없다.
 */
export const SCAFFOLD_FALLBACK: Record<"en" | "ko", Record<DrillLayer, readonly [string, string]>> = {
  ko: {
    fact: [
      "크게 중요한 장면이 아니어도 괜찮아요. 그날 눈에 들어온 것 하나만 떠올려 보면요?",
      "그때 옆에 누가 있었는지만 먼저 말해 주실 수 있어요?",
    ],
    feeling: [
      "이름 붙이기 어려우면, 그때가 편한 쪽이었어요 불편한 쪽이었어요?",
      "그 장면을 지금 다시 떠올리면 몸이 먼저 반응하는 데가 있어요?",
    ],
    meaning: [
      "그때 그 일이 아예 없었다면, 뭐가 달라졌을까요?",
      "그 일을 친구가 겪었다고 하면 친구에게 뭐라고 말해 주실 것 같아요?",
    ],
    belief: [
      "그 뒤로 비슷한 상황이 오면 어떻게 하게 되던가요?",
      "그때 이후로 사람들한테 기대를 더 하게 됐어요, 덜 하게 됐어요?",
    ],
    echo: [
      "요즘 그때랑 비슷하다고 느껴지는 순간이 있다면 언제예요?",
      "최근에 한 선택 중에 그때 일이 스쳤던 게 있어요?",
    ],
  },
  en: {
    fact: [
      "It doesn't have to be a big scene. What's one thing you remember noticing that day?",
      "Could you start with just who else was there?",
    ],
    feeling: [
      "If naming it is hard, was it more comfortable or uncomfortable?",
      "When you picture it now, does your body react anywhere first?",
    ],
    meaning: [
      "If that hadn't happened at all, what would be different?",
      "If a friend told you the same story, what would you say to them?",
    ],
    belief: [
      "When something similar came up later, what did you end up doing?",
      "After that, did you expect more from people, or less?",
    ],
    echo: [
      "Is there a moment lately that feels a bit like that one?",
      "Has a recent choice brought that moment back at all?",
    ],
  },
};

/** `streak` 번째 발판 문장. 두 번이 같으면 반복이 되므로 갈아 쓴다. */
export function scaffoldQuestion(
  layer: DrillLayer,
  locale: "en" | "ko",
  streak: number,
): string {
  const pair = SCAFFOLD_FALLBACK[locale][layer];
  return pair[Math.min(Math.max(streak, 1), pair.length) - 1] ?? pair[0];
}

/** 발판을 쓸 차례인가. `streak` 은 **이 층에서** 연속으로 못 답한 횟수다. */
export function shouldScaffold(streak: number): boolean {
  return streak > 0 && streak <= MAX_SCAFFOLDS_PER_LAYER;
}
