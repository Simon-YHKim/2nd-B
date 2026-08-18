// 세션 브리핑 파일의 진실성 가드.
//
// ## 왜 이 파일이 있는가
//
// 이 저장소에는 AI 세션이 **자동으로 읽는 지시 파일이 두 개** 있다.
//
//   CLAUDE.md   Claude 세션
//   AGENTS.md   Codex 및 그 밖의 에이전트
//
// 둘은 같은 사실을 각자 서술했고, **따로 낡았다.** 2026-08-19 실측 시점에
// `AGENTS.md` 는 여전히 이렇게 적고 있었다:
//
//   - "Build with Gemini XPRIZE (Education & Human Potential) 출품작"
//     -> XPRIZE 는 2026-08-15 에 종료됐다 (Simon 결정)
//   - "**Deadline**: 2026-08-17 06:00 KST"
//     -> 마감은 없다. 게다가 그 날짜는 이미 지났다
//
// 이건 오탈자가 아니라 **행동을 바꾸는 오정보**다. 지난 마감을 믿는 세션은
// 스코프를 압축하는데, `CLAUDE.md` 는 정확히 그 판단을 금지하고 있다.
// 같은 날 `AGENTS.md` 의 C1 줄은 boundary.ts 개명(#1229)으로 갱신돼 있었다 —
// 즉 **선택적으로 관리되는 중이었고, 그래서 더 위험했다.** 최신인 줄 알게 된다.
//
// ## 이 파일이 지키는 것
//
// 1. 두 지시 파일에 **은퇴한 주장**이 다시 들어오지 않는다.
// 2. `AGENTS.md` 가 `CLAUDE.md` 를 정본으로 가리킨다 — 중복이 드리프트의 원인이었다.
// 3. 문서가 "고쳤다" 고 주장하는 **배선이 코드에 실제로 살아 있다.**
//    이게 핵심이다: 누가 그 배선을 걷어내면 문서 쪽 정정이 거짓이 되는데,
//    그건 조용히 일어난다. 여기서 깨지게 만든다.
//
// 문서는 낡지만 이 테스트는 낡으면 깨진다 — `dev-only-routes.test.ts` 와 같은 규율.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

/** 세션이 자동으로 읽는 지시 파일. 새 에이전트가 늘면 여기에 더한다. */
const BRIEFING_FILES = ["CLAUDE.md", "AGENTS.md"] as const;

/**
 * 파일에서 **주장하는 부분만** 남긴다.
 *
 * 틀린 문장을 지우기만 하면 다음 세션이 왜 틀렸는지 모르고 되돌린다. 그래서 이
 * 저장소는 원문을 **인용해서 정정하는** 방식을 쓴다(취소선·코드 스팬·"…라고 적고
 * 있었다"). 그 인용까지 금지하면 정정 자체를 못 쓰게 된다.
 *
 * 그래서 규칙은 "그 단어를 쓰지 마라" 가 아니라 **"그것을 사실로 주장하지 마라"** 다.
 * 코드 펜스·인라인 코드·취소선 안은 인용으로 보고 걷어낸 뒤 검사한다.
 */
function assertionsOnly(path: string): string {
  return read(path)
    .replace(/```[\s\S]*?```/g, "")   // 코드 펜스
    .replace(/`[^`\n]*`/g, "")        // 인라인 코드 = 인용
    .replace(/~~[\s\S]*?~~/g, "");    // 취소선 = 철회된 원문
}

describe("세션 브리핑 파일", () => {
  it("둘 다 존재한다", () => {
    for (const f of BRIEFING_FILES) expect(existsSync(join(ROOT, f))).toBe(true);
  });

  // ── 은퇴한 주장 ──────────────────────────────────────────────────
  it("마감 날짜를 적지 않는다", () => {
    // Simon 2026-08-15: 마감은 없다. 외부 마감에 맞춘 스코프 압축 금지.
    // 지난 날짜가 박혀 있으면 세션이 "이미 늦었다" 로 읽고 조용히 범위를 줄인다.
    for (const f of BRIEFING_FILES) {
      const hit = assertionsOnly(f)
        .split("\n")
        .filter((l) => /Deadline\**\s*:\s*\*{0,2}\d{4}-\d{2}-\d{2}/i.test(l));
      expect({ file: f, deadlineLines: hit }).toEqual({ file: f, deadlineLines: [] });
    }
  });

  it("XPRIZE 를 살아 있는 출품 트랙으로 적지 않는다", () => {
    // 단어 자체는 금지가 아니다 — C6·C12 가 실제로 xprize.org 를 참조하고,
    // 두 파일 모두 "종료됐다" 는 사실을 적어야 한다. 금지되는 것은 **현재형 주장**이다.
    for (const f of BRIEFING_FILES) {
      const src = assertionsOnly(f);
      const claimsEntry = /XPRIZE[^\n]{0,60}출품작(?![이가]\s*아니)/.test(src);
      expect({ file: f, claimsLiveEntry: claimsEntry }).toEqual({ file: f, claimsLiveEntry: false });
    }
  });

  it("XPRIZE 가 종료됐다는 사실을 둘 다 담고 있다", () => {
    // 반대 방향. 그냥 지우면 다음 세션이 아무것도 모르고, 코드에 남은 잔재
    // (judge mode · C6 · C12)를 보고 "아직 대회 중이구나" 로 되돌아간다.
    for (const f of BRIEFING_FILES) {
      expect({ file: f, saysRetired: /XPRIZE/.test(read(f)) && /종료|아니다/.test(read(f)) }).toEqual({
        file: f,
        saysRetired: true,
      });
    }
  });

  // ── 중복이 드리프트의 원인이었다 ─────────────────────────────────
  it("AGENTS.md 가 CLAUDE.md 를 정본으로 가리킨다", () => {
    // 두 파일이 같은 사실을 각자 서술하면 반드시 갈라진다. 실제로 갈라졌다.
    // 그래서 AGENTS.md 는 요약본이 아니라 **포인터**여야 한다.
    const agents = read("AGENTS.md");
    expect(agents).toContain("CLAUDE.md");
    expect(/CLAUDE\.md[^\n]{0,80}(정본|먼저 읽)/.test(agents)).toBe(true);
  });

  // ── 정정을 인용할 거면 정정 표시를 달고 인용한다 ──────────────────
  it("철회된 주장을 인용할 때는 정정 표시가 같이 있다", () => {
    // 원문 보존은 좋다(역사 기록). 다만 정정 표시 없이 남으면 다음 세션이
    // 그걸 현황으로 읽는다. 문구가 있으면 정정 마커도 있어야 한다.
    const RETRACTED = [
      "위키에 아무것도 안 쓴다",
      "렌더하는 코드가 0건",
    ];
    for (const f of BRIEFING_FILES) {
      const src = read(f);
      for (const phrase of RETRACTED) {
        if (!src.includes(phrase)) continue;
        expect({ file: f, phrase, hasCorrectionMarker: src.includes("2026-08-19 정정") }).toEqual({
          file: f,
          phrase,
          hasCorrectionMarker: true,
        });
      }
    }
  });
});

// ── 문서가 "고쳤다" 고 말하는 배선이 실제로 살아 있는가 ──────────────
//
// 위의 정정들은 **코드가 그대로일 때만** 참이다. 누가 배선을 걷어내면 정정이
// 거짓이 되고, 문서만 보는 다음 세션은 이미 없는 기능을 있다고 믿는다.
// 그래서 주장과 코드를 여기서 묶는다.
describe("정정이 의존하는 배선", () => {
  it("대화가 위키로 가는 길이 살아 있다", () => {
    // 이 배선이 사라지면 CLAUDE.md 의 "1순위 결함은 해결됐다" 가 거짓이 된다.
    // 배선은 #1224(2026-08-17, 수동 경로) + #1236(2026-08-18, 자동 게이트) 둘로 이뤄져 있다.
    expect(existsSync(join(ROOT, "src/lib/chat/keep-exchange.ts"))).toBe(true);
    expect(existsSync(join(ROOT, "src/lib/chat/autosave.ts"))).toBe(true);

    const keep = read("src/lib/chat/keep-exchange.ts");
    expect(keep).toContain("export function exchangeMarkdown");
    expect(keep).toContain("export function composeExchangeBody");

    const chat = read("src/app/secondb.tsx");
    // 위키로 실제로 쓰는 호출. 이게 없으면 대화는 다시 휘발한다.
    expect(chat).toContain("captureFromMarkdown");
    expect(chat).toContain("keepExchange");
    // 자동 경로의 게이트. 동의 없이 저장되면 안 되고, 게이트가 사라져도 안 된다.
    expect(chat).toContain("chatAutosaveAllowed");
  });

  it("자동 저장 기본값이 OFF 다", () => {
    // 기본값 ON 은 "사라진다고 생각하고 한 말" 이 남는 것을 사용자가 모른 채
    // 겪게 만든다. privacy/prefs.ts 규율(보관·프로파일링은 명시적으로 켜기 전까지 OFF).
    const prefs = read("src/lib/privacy/prefs.ts");
    expect(prefs).toContain("chat_autosave");
    const autosave = read("src/lib/chat/autosave.ts");
    // 명시적 true 일 때만 허용 — `!== false` 같은 형태로 뒤집히면 fail-open 이 된다.
    expect(autosave).toMatch(/===\s*true/);
  });

  it("자동 저장이 도메인 태그를 붙이지 않는다", () => {
    // 붙이면 대화가 저절로 별을 밝힌다. 밝기의 정직성이 우선이라 일부러 뺀 것이고,
    // 그 의도가 주석으로만 남아 있으면 다음 사람이 "버그네" 하고 채운다.
    const chat = read("src/app/secondb.tsx");
    expect(chat).toContain("CHAT_KEEP_TAG");
    const keep = read("src/lib/chat/keep-exchange.ts");
    expect(keep).toContain("CHAT_KEEP_TAG");
  });
});
