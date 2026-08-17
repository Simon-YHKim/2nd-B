// 세컨비 정체성 문장의 불변식.
//
// 2026-08-15 에 Simon 이 "친구가 아니다" 를 뒤집기로 승인했고, 그에 맞춰 문장을
// 다시 썼다. 완화한 것은 **거리감뿐이다.** 따뜻해질수록 지어내기 쉬워지므로
// 나머지 넷은 오히려 더 명시적으로 적었고, 여기서 그걸 못박는다.
//
// 이 파일은 check-mascot-voice / check-anti-anthro 의 스캔 범위 밖이다
// (그 둘은 로케일 문자열과 personas.ts 만 본다). 즉 런타임 출력을 붙잡는 것은
// 이 프롬프트의 문장들뿐이라, 여기가 무너지면 잡아줄 다른 그물이 없다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(__dirname, "..", "conversation.ts"), "utf8").replace(/\r\n/g, "\n");

/** SYSTEM_PROMPT_HEADER 리터럴만 떼어낸다 (주변 주석은 뺀다). */
function header(): string {
  const start = SRC.indexOf("const SYSTEM_PROMPT_HEADER = {");
  expect(start).toBeGreaterThan(-1);
  const end = SRC.indexOf("\n};", start);
  expect(end).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

describe("세컨비 정체성 프롬프트", () => {
  it("더 이상 친구를 부정하지 않는다", () => {
    // 승인된 변경. 이 문장이 살아 있으면 친구 같은 톤이 프롬프트 차원에서 계속 막힌다.
    const h = header();
    expect(h).not.toContain("친구가 아니라");
    expect(h).not.toContain("not an assistant, companion, or friend");
    expect(h).not.toContain("do not position yourself as a friend");
  });

  it("매니저로 자기를 규정한다", () => {
    const h = header();
    expect(h).toContain("개인 매니저");
    expect(h).toMatch(/manager/i);
  });

  it("근거 없는 단정 금지가 살아 있다", () => {
    // 따뜻함이 지어내기 면허가 되면 안 된다. 이게 이 앱의 핵심 불변식이다.
    const h = header();
    expect(h).toContain("기록에 없는 사실이나 특성, 수치");
    expect(h).toMatch(/Never assert a fact, trait, or number/i);
    expect(h).toContain("심리 점수");
  });

  it("사람이 아니라 패턴을 말하라는 지시가 살아 있다", () => {
    const h = header();
    expect(h).toContain("단정이 아니라 기록 속 패턴");
    expect(h).toMatch(/not a verdict about the person/i);
  });

  it("임상 어휘 금지가 살아 있다", () => {
    const h = header();
    expect(h).toContain("진단하거나 임상 용어를 쓰지 마세요");
    expect(h).toMatch(/never diagnose/i);
  });

  it("과잉 자기지식 주장 금지가 살아 있다", () => {
    const h = header();
    expect(h).toContain("더 잘 안다고 주장하지 마세요");
    expect(h).toMatch(/Never claim to know them better than they know themselves/i);
  });

  it("한국어 말투가 앱과 같다", () => {
    // UI 는 합쇼체 + ~나요? 로 통일했다. 모델만 해요체로 답하면 한 화면 안에서
    // 두 말투가 섞인다.
    expect(header()).toContain("'~습니다'");
    expect(header()).toContain("'~나요?'");
  });

  it("금지 어휘를 프롬프트에 쓰지 않는다", () => {
    // check-forbidden-lexicon 이 이 파일을 스캔한다. 이전 초안이 영어
    // "counseling" 으로 CI 를 깨뜨렸다 - 뜻을 지키면서 단어만 피한다.
    expect(header()).not.toMatch(/counseling|therapy|심리상담/i);
  });
});

// 이름은 시스템 프롬프트 **안**에 들어간다. 사용자가 정하는 문자열이 지시문
// 자리에 앉는다는 뜻이라, 씻는 단계가 빠지면 그게 곧 프롬프트 주입이다.
describe("이름 호칭", () => {
  it("프롬프트 조립 전에 이름을 씻는다", () => {
    expect(SRC).toContain("promptSafeName(input.displayName)");
  });

  it("씻은 값만 프롬프트에 들어간다", () => {
    // input.displayName 이 그대로 템플릿에 들어가면 씻은 의미가 없다.
    const assembly = SRC.slice(SRC.indexOf("const addressLine"), SRC.indexOf("const system ="));
    expect(assembly).toContain("safeName");
    expect(assembly).not.toContain("input.displayName");
  });

  it("이름이 없으면 그 줄을 아예 빼고, 빈칸으로 부르지 않는다", () => {
    // "이 사람의 이름은  입니다" 같은 문장이 모델에게 가면 안 된다.
    const assembly = SRC.slice(SRC.indexOf("const addressLine"), SRC.indexOf("const system ="));
    expect(assembly).toContain('safeName');
    expect(assembly).toMatch(/:\s*""/);
  });

  it("호칭 줄이 인젝션 가드보다 앞이라 가드가 뒤에서 덮는다", () => {
    const system = SRC.slice(SRC.indexOf("const system ="));
    const addr = system.indexOf("${addressLine}");
    const guard = system.indexOf("${guardLine}");
    expect(addr).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(addr);
  });
});
