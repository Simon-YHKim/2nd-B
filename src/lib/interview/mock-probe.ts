import type { DrillLayer } from "./probe";
import { canCreditAnswer } from "./continuity";

/** Deterministic offline fixture. Exercises context plumbing, not live model quality. */
export function mockInterviewProbe(system: string, transcript: string, locale: "en" | "ko"): string {
  const layers: DrillLayer[] = ["fact", "feeling", "meaning", "belief", "echo"];
  const target = /(?:다음 깊이 단계|Next depth layer to probe): L([1-5])/.exec(system);
  const layer = layers[Number(target?.[1] ?? 1) - 1] ?? "fact";
  // wrapUntrusted closes immediately after the final answer, on the same line.
  // Remove only that generated envelope before reading turns, including multiline answers.
  const body = /^<UNTRUSTED type="interview_transcript">([\s\S]*)<\/UNTRUSTED>$/.exec(transcript)?.[1] ?? transcript;
  const answers = body.split(/\n(?=[QA] \([a-z]+\): )/).flatMap((turn) => {
    const answer = /^A \((fact|feeling|meaning|belief|echo|choice)\): ([\s\S]*)$/.exec(turn);
    return answer ? [answer] : [];
  });
  const answer = answers[answers.length - 1];
  const text = answer?.[2]?.trim() ?? "";
  const asked = answer?.[1] as DrillLayer | undefined;
  const questions = locale === "ko" ? {
    fact: "그 장면에서 직접 했던 행동 하나가 기억나나요?",
    feeling: "그 순간의 기분을 말하고 싶은 만큼 들려주실래요?",
    meaning: "그 일에서 본인에게 중요했던 부분은 무엇인가요?",
    belief: "그 뒤 본인에 대한 생각에 달라진 점이 있나요?",
    echo: "그 생각이 요즘의 선택과 이어지는 부분이 있나요?",
  } : {
    fact: "What is one action you remember taking in that scene?",
    feeling: "If you want to share, what feeling stands out from that moment?",
    meaning: "What part of that experience mattered to you?",
    belief: "Did that experience change how you see yourself?",
    echo: "Does that thought connect to any choice you make now?",
  };
  const anchor = text.replace(/[?？]/g, " ").replace(/\s+/g, " ").slice(0, 65);
  return JSON.stringify({
    question: `${anchor ? `“${anchor}” · ` : ""}${questions[layer]}`,
    answeredLayer: asked && layers.includes(asked) && canCreditAnswer(text, asked, locale) ? asked : "none",
    openers: [],
  });
}
