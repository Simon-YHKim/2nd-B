// Scaffolding for READING a reflection (2026-06-28 research): reflection prompts
// are not self-sufficient. App-based journaling helped only users at average-or-
// higher dispositional self-reflection; lower-disposition reflectors got no
// benefit from a prompt alone (MacIsaac, Mushquash & Wekerle, 2023). The fix the
// literature points to is MODELING how to interpret the mirror — turning a passive
// read into a concrete, active step. So under a summary we offer two short modelled
// steps, not more text to absorb.
//
// The second step deliberately embeds the anti-Barnum stance from the same research
// pass: the user CHECKS the read against their own truth ("if a part doesn't fit,
// note what's different") rather than simply accepting a flattering verdict.
//
// Pure + tested; the ReflectionScaffold component renders it. Generic by design so
// it can sit under any reflection surface (today: the legacy persona summary; ready
// to drop into a canon narrative surface when one exists).

export interface ReflectionScaffoldCopy {
  title: string;
  steps: [string, string];
  cta: string;
}

export function reflectionScaffold(locale: "en" | "ko"): ReflectionScaffoldCopy {
  if (locale === "ko") {
    return {
      title: "이 요약, 이렇게 한번 읽어볼까요",
      steps: [
        "한 가지를 골라, 최근 그게 나타난 구체적인 순간을 떠올려보세요.",
        "맞지 않는 부분이 있다면, 무엇이 다른지 한 줄로 적어보세요.",
      ],
      cta: "한 줄 남기기",
    };
  }
  return {
    title: "A way to read this",
    steps: [
      "Pick one thing, and recall a specific recent moment it showed up.",
      "If a part doesn't fit, note in one line what's actually different.",
    ],
    cta: "Jot one line",
  };
}
