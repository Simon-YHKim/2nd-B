// 대화 -> 위키 배선이 실제로 화면에 붙어 있는가.
//
// 이 기능의 값어치는 전부 "대화가 흔적을 남긴다"에 있다. 순수 함수
// (keep-exchange.ts)는 따로 테스트하지만, 그게 화면에 안 붙어 있으면 아무 일도
// 일어나지 않고 아무도 모른다 - 결함이 조용하다. 렌더 테스트가 이 저장소에서
// 막혀 있어(RN 0.85 + jest) 다른 deep-space 가드들과 같은 방식으로 소스를 읽는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(__dirname, "..", "..", "..", "app", "secondb.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");

/** 주석은 금지어를 **금지하려고** 그 이름을 부른다. 실행 코드만 본다. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/**
 * keepExchange 의 **본문만** 떼어낸다. 중괄호를 세서 함수 끝에서 정확히 멈춘다.
 *
 * 처음에는 "다음 주석까지"로 잘랐는데 그 사이에 다른 함수들이 들어와서, 그
 * 함수들이 부르는 callGemini 를 이 함수가 부르는 것으로 읽었다.
 */
function keepHandlerBody(): string {
  const start = SRC.indexOf("async function keepExchange");
  expect(start).toBeGreaterThan(-1);
  let depth = 0;
  let seen = false;
  for (let i = start; i < SRC.length; i++) {
    if (SRC[i] === "{") {
      depth++;
      seen = true;
    } else if (SRC[i] === "}") {
      depth--;
      if (seen && depth === 0) return stripComments(SRC.slice(start, i + 1));
    }
  }
  throw new Error("keepExchange 의 끝을 찾지 못했다");
}

describe("대화 -> 위키 배선", () => {
  it("답변에 담기 버튼이 붙어 있다", () => {
    expect(SRC).toContain("keepExchange");
    expect(SRC).toContain("isKeepable(turn)");
    expect(SRC).toContain('t("keepToWiki")');
  });

  it("기록을 실제로 만든다 (화면 이동이 아니라)", () => {
    // 기존 경로는 /capture 로 넘기는 것이었다. 그건 대화를 떠나야 하고
    // 사용자가 거기서 다시 저장해야 해서, 대부분 저장되지 않았다.
    expect(SRC).toContain("createRecord(");
    expect(SRC).toContain("CHAT_KEEP_TAG");
  });

  it("LLM 을 다시 부르지 않는다", () => {
    // 원문 그대로 담는 게 요점이다. 저장할 때 요약을 시키면 위키(원본)
    // 자리에 요약이 들어앉고, 나중에 읽는 쪽은 요약의 요약을 읽는다.
    const handler = keepHandlerBody();
    expect(handler).not.toMatch(/callGemini|sendChatMessage|callAdvisor/);
    expect(handler).toContain("withFollowup: false");
  });

  it("별 밝기를 건드리지 않는다", () => {
    // domain: 태그가 붙으면 그 영역의 별이 밝아진다. 대화를 담았다고 그 영역을
    // 더 아는 것은 아니다 (정직한 밝기 규칙).
    const handler = keepHandlerBody();
    expect(handler).not.toContain("domain:");
    expect(handler).not.toContain("domainTagFor");
  });

  it("저장 경로에도 위기 안내가 있다", () => {
    // 이 화면의 C9 는 전송 경로에만 있었다. createRecord 는 저장할 때마다
    // 로컬 분류를 돌리고 레드존을 followup 으로 알려주므로, 다른 저장 화면
    // (northstar/capture)과 같이 핫라인을 띄워야 한다.
    expect(SRC).toContain("keepCrisis");
    expect(SRC).toContain('res.followup?.zone === "red"');
    expect(SRC).toContain("KR_1388");
  });

  it("같은 답변을 두 번 담지 못한다", () => {
    // 두 번 누르면 같은 대화가 기록에 두 번 들어가고, 그건 나중에 읽을 때
    // 같은 말을 두 번 한 것처럼 보인다.
    expect(SRC).toContain("keptIdx");
    expect(SRC).toContain("keptIdx.has(index)");
  });
});
