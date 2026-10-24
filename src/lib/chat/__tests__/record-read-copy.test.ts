import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { recordReadCopy } from "../record-read-copy";

const pack = (locale: string) => JSON.parse(readFileSync(resolve(__dirname, "../../../../locales", locale, "consent.json"), "utf8"));
const copy = (locale: string) => recordReadCopy(key => key.split(".").reduce((value, part) => value[part], pack(locale)));

test("Q-71 approved original plus legal section 4 recommendation, without inventing a version", () => {
  const ko = copy("ko");
  expect(ko.version).toBeNull();
  expect(ko.title).toBe("대화에서 내 기록을 읽어도 될까요?");
  expect(ko.lines.map(line => `${line.label}: ${line.text}`)).toEqual([
    "보내는 것: 질문과 관련된 기록의 본문 일부입니다. 건강이나 마음 상태 같은 민감한 내용이 있을 수 있습니다.",
    "쓰는 이유: 지금 대화의 답을 만드는 데만 씁니다.",
    "받는 곳: AI 제공자 OpenAI(미국)에 보냅니다.",
    "보관: 회사는 보낸 본문을 따로 저장하지 않습니다. 제공자는 공개 정책상 남용을 막기 위한 점검에 최대 30일 보관할 수 있습니다(처리방침 제5조).",
    "선택권: 동의하지 않아도 대화할 수 있습니다. 기록을 읽은 답만 받지 못합니다. 설정에서 언제든 끌 수 있습니다.",
  ]);
  expect(ko.smallPrint).toBe("다른 사람의 이름·건강·돈 이야기가 담긴 기록도 보내질 수 있습니다. 다른 사람이 원하지 않을 내용은 적지 않는 것을 권장합니다.");
  expect(ko.ack).toBe("위 목적으로 내 기록에 담긴 민감정보를 처리하는 것에 별도로 동의합니다.");
  expect([ko.notNow, ko.agree]).toEqual(["지금은 안 할게요", "동의합니다"]);
  expect(ko.afterPress).toEqual({ agreed: "기록 읽기를 켰습니다.", declined: "기록 없이 답합니다. 설정에서 켤 수 있습니다." });
  expect(ko.settings).toEqual({
    name: "기록 읽기", off: "꺼져 있습니다. 켜면 대화에서 질문과 관련된 기록의 본문 일부를 읽고 답합니다.",
    enable: "기록 읽기 켜기", confirmEnable: "동의하고 켜기",
    on: "켜져 있습니다. 대화에서 질문과 관련된 기록의 본문 일부를 AI 제공자에게 보냅니다.",
    disable: "기록 읽기 끄기",
    justDisabled: "꺼져 있습니다. 다음 대화부터 보내지 않습니다. 이미 보낸 내용은 회수할 수 없고, 제공자 보관 기준은 처리방침 제5조를 따릅니다.",
    minor: "기록 읽기는 꺼져 있고 켤 수 없습니다.",
  });
});

test.each(["ko", "en", "es", "pt", "id"])("%s copy has the inline clause 5 target and all legal elements", locale => {
  const content = copy(locale);
  expect(content.lines).toHaveLength(5);
  expect(content.lines[3].link.section).toBe("5");
  expect(content.lines[3].text.split(content.lines[3].link.label)).toHaveLength(2);
  expect(content.lines.every(line => line.label && line.text)).toBe(true);
  expect(Object.values(content.settings).every(Boolean)).toBe(true);
  expect(content.smallPrint).toBeTruthy();
  expect(Object.values(content.afterPress).every(Boolean)).toBe(true);
});

test("English follows the approved in-chat title and five-line meaning", () => {
  const en = copy("en");
  expect(en.title).toBe("May we read your entries in chat?");
  expect(en.lines.map(line => line.text)).toEqual([
    "Parts of entries related to your question. They may include sensitive information, such as your health or emotional state.",
    "Used only to answer in this conversation.",
    "Sent to the AI provider OpenAI (United States).",
    "The company does not separately store the text sent. Under its public policy, the provider may retain it for up to 30 days for abuse checks (Privacy Policy Section 5).",
    "You can chat without agreeing. You will only miss answers based on reading your entries. You can turn this off anytime in settings.",
  ]);
});
