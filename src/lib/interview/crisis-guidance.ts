import { crisisHotlines } from "../safety/classifier";
import { emergencyGuidance } from "../safety/emergency-routing";
import type { Locale } from "../safety/lexicon";

/** Model backstop after the input gate. Language is not evidence of location.
 *  Reuse the app's age-aware support table and approved emergency guidance. */
export function interviewCrisisGuidance(locale: Locale, minor = false): string {
  const support = crisisHotlines(locale, minor).map((line) => line.number)
    .join(locale === "ko" ? " 또는 " : " or ");
  const physical = emergencyGuidance("KR_119", locale)!.text;
  const threat = emergencyGuidance("KR_112", locale)!.text;
  if (locale === "ko") {
    return `5) 지금의 위험이 보이면 인터뷰 질문과 말문 후보를 멈추고 안전 안내를 우선합니다. `
      + `스스로 삶을 끝내거나 자신을 해치려는 이야기에는 한국에 계실 경우 ${support}로 안내하세요. `
      + `그 이야기만을 이유로 경찰 번호를 붙이지 마세요. `
      + `이미 다쳤거나 약을 삼킨 것처럼 몸이 지금 위급한 경우에만 다음 안내를 사용하세요: ${physical} `
      + `다른 사람이 지금 위협하는 경우에는 다음 안내를 사용하세요: ${threat} `
      + `과거에 겪은 일이라는 이유만으로 지금 위험하다고 단정하지 마세요. `
      + `어느 위험인지 분명하지 않은 현재의 자기 위해 우려에는 한국에 계실 경우 ${support}를 안내하세요. `
      + `다른 나라에서는 현지의 도움을 안내하고, 언어로 위치를 추정하거나 확실하지 않은 번호를 지어내지 마세요. `
      + `안전 안내도 JSON의 question에 넣고 openers는 빈 배열로 두세요.`;
  }
  return `5) If there is a current risk, stop interview questions and suggested openers; safety guidance takes priority. `
    + `For talk of ending their life or hurting themselves, suggest ${support} if they are in the US. `
    + `Do not add a police number for that reason alone. `
    + `Only for immediate physical danger, such as an injury or something already swallowed, use: ${physical} `
    + `For an active threat from another person, use: ${threat} `
    + `A past experience alone does not establish current danger. `
    + `If the nature of a current self-harm concern is unclear, suggest ${support} if they are in the US. `
    + `Elsewhere, point to local help. Never infer location from language or invent a number. `
    + `Put safety guidance in the JSON question field and leave openers empty.`;
}
