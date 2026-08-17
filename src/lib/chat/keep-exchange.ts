// 대화를 위키로 보내는 길 (Simon 1순위 결함, 2026-08-17).
//
// 지금까지 대화는 **아무것도 남기지 않았다.** `conversation.ts` 에 쓰기 경로가
// 없고 `secondb.tsx` 도 `createRecord` 를 부르지 않는다. 대화를 위키로 보내는
// 유일한 길은 제안 프롬프트 "위키에 저장" 한 줄이었는데, 그건 LLM 에게 한 단락
// 요약을 시키고 사용자가 그 결과를 손으로 `/capture` 에 옮겨 담는 경로다.
//
// 그래서 "대화로 알아낸 페르소나"가 구조상 성립하지 않았다. 대화가 흔적을 안
// 남기니 위키도 페르소나도 대화로부터 자라지 않는다.
//
// ## 왜 요약이 아니라 원문인가
//
// Simon 정정(2026-08-17): 위키가 원본이고 페르소나는 그 파생 요약이다. 저장할
// 때 LLM 에게 한 번 더 요약을 시키면 원본 자리에 요약이 들어앉는다. 그러면
// 나중에 읽는 쪽은 요약의 요약을 읽게 된다. 여기서는 **오간 말 그대로**를 담는다.
// LLM 호출도 없으니 무료 한도도 안 태운다.
//
// ## 왜 답변만이 아니라 짝으로 담는가
//
// 답변 한 줄만 떼어놓으면 뜻이 사라진다. "그건 피로 때문일 수 있습니다" 는
// 무엇에 대한 답인지 없으면 나중에 읽는 사람에게도, 검색하는 엔진에게도
// 쓸모가 없다. 그래서 직전 사용자 발화와 짝으로 담는다.

/** 담을 수 있는 한 턴. secondb.tsx 의 ChatTurn 과 같은 모양이되 최소만. */
export interface KeepableTurn {
  role: "user" | "secondb";
  text: string;
  /** 인사말·오류 문구처럼 앱이 만든 턴. 담기 대상이 아니다. */
  synthetic?: boolean;
}

/** 기록 본문이 무한정 길어지지 않게. 대화 한 짝이 저널 한 편보다 길 이유가 없다. */
export const KEEP_MAX_CHARS = 4000;

/**
 * 이 턴을 담을 수 있는가.
 *
 * 세컨비의 진짜 답변만 담는다. 인사말·오류 문구(synthetic)는 사용자가 남긴
 * 것도 세컨비가 관찰한 것도 아니라서 위키에 들어가면 잡음이 된다.
 */
export function isKeepable(turn: KeepableTurn): boolean {
  return turn.role === "secondb" && !turn.synthetic && turn.text.trim().length > 0;
}

/**
 * 해당 답변 바로 앞의 사용자 발화를 찾는다.
 *
 * 바로 앞 턴이 아니라 **앞으로 훑는다**: 세컨비가 연달아 두 턴을 말하는 경우가
 * 있어서(예: 답변 뒤에 이어지는 안내) 바로 앞만 보면 짝을 놓친다.
 */
export function findPrompt(turns: readonly KeepableTurn[], replyIndex: number): string | null {
  for (let i = replyIndex - 1; i >= 0; i--) {
    const t = turns[i];
    if (t.role === "user" && t.text.trim().length > 0) return t.text.trim();
    // 다른 사용자 발화를 만나기 전에 또 다른 담을 수 있는 답변을 만나면,
    // 그 답변이 이 짝의 주인이므로 여기서 멈춘다.
    if (isKeepable(t)) return null;
  }
  return null;
}

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max).trimEnd()}…`;
}

/**
 * 기록 본문. 마크다운 인용으로 누가 한 말인지 남긴다.
 *
 * 서식을 붙이는 이유는 장식이 아니라 **구분**이다. 나중에 이 기록이 다시 대화
 * 맥락으로 들어갈 때(loadStructuredContext -> 프롬프트), 사용자가 쓴 문장과
 * 모델이 쓴 문장이 섞여 있으면 모델이 자기 말을 사용자의 기록으로 읽는다.
 */
export function composeExchangeBody(
  args: { prompt: string | null; reply: string; speaker: string },
  locale: "en" | "ko",
): string {
  const L =
    locale === "ko"
      ? { me: "나", asked: "물어본 것" }
      : { me: "Me", asked: "I asked" };
  const reply = clip(args.reply, KEEP_MAX_CHARS);
  const prompt = args.prompt ? clip(args.prompt, KEEP_MAX_CHARS) : null;
  const blocks: string[] = [];
  if (prompt) blocks.push(`**${L.asked}**\n\n> ${prompt.split("\n").join("\n> ")}`);
  blocks.push(`**${args.speaker}**\n\n${reply}`);
  return blocks.join("\n\n");
}

/**
 * 목록에 보일 제목. 사용자가 물어본 말을 쓰고, 없으면 답변 첫 줄을 쓴다.
 *
 * 사용자의 말을 먼저 쓰는 이유: 나중에 기록 목록에서 찾을 때 사람은 자기가
 * 무엇을 물었는지로 기억하지, 모델이 뭐라고 답했는지로 기억하지 않는다.
 */
export function exchangeTopic(prompt: string | null, reply: string): string {
  const source = (prompt ?? reply).trim().split("\n")[0] ?? "";
  return clip(source, 80);
}

/** 이 기록이 대화에서 왔음을 나타내는 태그. */
export const CHAT_KEEP_TAG = "secondb_chat";
