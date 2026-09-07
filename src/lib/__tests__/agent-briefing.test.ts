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
 * 세션이 **읽으라고 지시받는** 정본 문서. 자동으로 로드되지는 않지만 루트 CLAUDE.md
 * 가 이름을 대고 가리키므로 같은 은퇴 주장 규율이 걸린다.
 *
 * `docs/VISION.md` 가 여기 없어서 2026-09-07 까지 "마감: 2026-08-17 06:00 KST" 를
 * 그대로 달고 있었다. CLAUDE.md 는 "마감은 없다" 를 못박고 VISION.md 는 마감을
 * 적는, 정본 둘이 서로 모순인 상태였다. 배너로 정정하고 여기 넣는다.
 */
const CANONICAL_DOCS = ["docs/VISION.md"] as const;
const RETIRED_CLAIM_FILES = [...BRIEFING_FILES, ...CANONICAL_DOCS] as const;

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
    for (const f of RETIRED_CLAIM_FILES) {
      const hit = assertionsOnly(f)
        .split("\n")
        .filter((l) => /Deadline\**\s*:\s*\*{0,2}\d{4}-\d{2}-\d{2}/i.test(l));
      expect({ file: f, deadlineLines: hit }).toEqual({ file: f, deadlineLines: [] });
    }
  });

  it("XPRIZE 를 살아 있는 출품 트랙으로 적지 않는다", () => {
    // 단어 자체는 금지가 아니다 — 과거 감사·핸드오프가 그 시점의 사실로 남기고,
    // 두 파일 모두 "종료됐다" 는 사실을 적어야 한다. 금지되는 것은 **현재형 주장**이다.
    for (const f of RETIRED_CLAIM_FILES) {
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

// ── 살아남은 의무가 죽은 근거로 자기를 설명하지 않는가 ──────────────────
//
// C12 는 2026-09-06 에 폐지됐지만 **폐지된 것은 번호지 의무가 아니다.**
// `docs/CONSTRAINTS.md` 가 문단 하나를 따로 써서 지켰고(싣는 폰트가 SIL OFL 이라
// 저작권·Reserved Font Name 고지가 따라다녀야 한다), 검사는 `AssetLicenseDisclosure`
// 라는 번호 없는 이름으로, README 는 "Bundled assets and licenses" 로 옮겨왔다.
//
// 2026-09-08 실측: **`docs/ASSETS.md` 만 안 따라왔다.** 제목이 "Pre-existing Assets
// Registry" 이고 머리말이 "XPRIZE rulebook §04 requires disclosure" 로 존재 이유를
// 대고 있었다. 그 파일만 읽은 사람은 대회 서류로 보고 **지워도 된다고 결론 낸다** —
// CONSTRAINTS.md 가 막으려던 바로 그 결론이고, 지우면 OFL 고지가 사라진다.
describe("AssetLicenseDisclosure 가 사는 문서", () => {
  it("죽은 규정집으로 자기 존재를 설명하지 않는다", () => {
    // 인용은 허용한다 — 정정하려면 원문을 인용해야 한다. 금지하는 것은
    // **정정 표시 없이 근거로 세우는 것**이다.
    // ⚠ 초판은 `competition window` 만 봤다. 변이 검증에서 제목을
    //   "What is in scope for the competition"(= 원래 제목) 으로 되돌렸는데
    //   **통과했다** — 그 문자열에는 `window` 가 없다. 즉 이 가드는 고치려던
    //   원문 자체를 못 잡고 있었다. `competition` 단독까지 본다.
    const src = assertionsOnly("docs/ASSETS.md");
    const claims = src
      .split("\n")
      .filter((l) => /rulebook|competition|submission deadline|pre-existing assets registry/i.test(l))
      .filter((l) => !/정정|취소|no longer|retired/.test(l));
    expect({ file: "docs/ASSETS.md", claims }).toEqual({ file: "docs/ASSETS.md", claims: [] });
  });

  it("살아 있는 근거(SIL OFL)를 스스로 밝힌다", () => {
    // 위 검사만 있으면 "규정집 문장을 지우기"로도 통과한다. 그러면 왜 남겨야
    // 하는지가 사라져서 다음 사람이 파일째 지운다. 이유가 있어야 통과시킨다.
    const src = read("docs/ASSETS.md");
    expect(src).toContain("SIL OFL");
    expect(/Reserved Font Name/.test(src)).toBe(true);
  });

  it("검사가 이 파일을 실제로 읽는다 — 지우면 CI 가 막는다", () => {
    // 문서가 "검사가 지킨다"고 적었으면 그게 참이어야 한다.
    const check = read("scripts/check-constraints.ts");
    expect(check).toContain("AssetLicenseDisclosure");
    expect(check).toContain("docs/ASSETS.md");
  });

  it("CONSTRAINTS.md 가 팩 개수를 산문에 박아두지 않는다", () => {
    // 박으면 반드시 낡는다. 실제로 "currently 9 packs" 였고 검사는 10 을 냈다.
    // 세는 것은 검사의 일이고 문서는 그 사실을 가리키기만 한다.
    const src = read("docs/CONSTRAINTS.md");
    const pinned = src.match(/\b\d+\s+packs?\b/g)?.filter((m) => !/^\s*0\s/.test(m)) ?? [];
    // 정정문에서 옛 수치를 인용하는 것은 허용 — 그 줄에는 "said" 가 붙는다.
    const live = pinned.filter((m) => {
      const line = src.split("\n").find((l) => l.includes(m)) ?? "";
      return !/said|정정|~~/.test(line);
    });
    expect({ pinned: live }).toEqual({ pinned: [] });
  });
});

// ── 살아 있는 문서가 없는 소스 경로를 지목하지 않는가 ──────────────────
//
// 파일 개명은 조용하다. 코드는 안 깨지고 CI 도 안 잡는다. 그저 문서를 따라간
// 사람이 없는 파일을 찾다가 그 문서 전체를 못 믿게 된다.
//
// 2026-09-07 실측: `src/lib/llm/gemini.ts` 를 지목하는 문서가 **13개** 남아
// 있었다. 그 파일은 #1229(2026-08-17)가 `boundary.ts` 로 개명한 것이다.
//
// 여기 올리는 것은 **살아 있는 안내 문서**만이다. 감사 스냅샷과 핸드오프 로그는
// 그 시점에 맞는 경로를 적은 것이라 대상이 아니다 — 고치면 오히려 기록이 틀려진다.
// 나머지 10개는 그래서 여기 없다. 살아 있는 안내로 승격되면 그때 더한다.
const LIVE_DOCS_NAMING_SOURCE = [
  "docs/LLM-ROUTING.md",
  "docs/system-report.html",
  "docs/pricing-simulation.html",
] as const;

/** 지워졌거나 개명된 소스 경로 → 지금 이름(정정에 써야 하는 말). */
const REMOVED_SOURCE_PATHS = [
  ["src/lib/llm/gemini.ts", "boundary.ts"],
  ["src/lib/judge/domains.ts", "삭제"],
] as const;

describe("문서가 지목하는 소스 경로", () => {
  it("여기 적은 경로는 실제로 저장소에 없다", () => {
    // 되살아나면 아래 검사가 의미를 잃는다. 가드가 무엇을 지키는지부터 확인한다.
    for (const [gone] of REMOVED_SOURCE_PATHS) {
      expect({ path: gone, exists: existsSync(join(ROOT, gone)) })
        .toEqual({ path: gone, exists: false });
    }
  });

  it.each(LIVE_DOCS_NAMING_SOURCE)("%s 가 지운 경로를 그대로 지목하지 않는다", (doc) => {
    // ⚠ 여기서는 인라인 코드를 걷어내지 않는다. `assertionsOnly` 는 인용을 빼는데,
    //   경로 참조는 원래 코드 스팬으로 쓰므로 걷어내면 검사가 텅 빈다.
    //   대신 **같은 줄에 지금 이름이 함께 있으면** 정정으로 보고 통과시킨다.
    const offenders = read(doc)
      .split("\n")
      .flatMap((line, i) =>
        REMOVED_SOURCE_PATHS
          .filter(([gone, now]) => line.includes(gone) && !line.includes(now))
          .map(([gone]) => `L${i + 1} ${gone}`),
      );
    expect({ doc, offenders }).toEqual({ doc, offenders: [] });
  });
});

// ── 문서의 벤더 주장이 코드와 같은 말을 하는가 ─────────────────────────
describe("LLM-ROUTING.md 의 OCR 주장", () => {
  it("'무조건 Gemini' 를 정정 없이 주장하지 않는다", () => {
    // 2026-07-04 에 쓴 핀이다. 그 뒤 Simon 이 2026-08-23 에 뒤집었고
    // (`OCR = openai 유지, gemini 예외 없음`) 코드도 따라갔다. 그런데 이 문서는
    // 상단 배너가 "§0 원칙은 지금도 유효" 라고 축복하고 있어서, 읽는 사람이
    // 뒤집힌 핀을 현행으로 받는다. 문구가 남아 있어도 좋지만 정정 표시는 있어야 한다.
    const doc = read("docs/LLM-ROUTING.md");
    if (!doc.includes("무조건 Gemini")) return;
    expect({ hasCorrection: doc.includes("2026-08-23 정정") })
      .toEqual({ hasCorrection: true });
  });

  it("코드는 멀티모달 벤더를 스위치로 정한다 — 문서의 정정이 참인 근거", () => {
    // 정정이 코드와 어긋나면 그것도 거짓말이다. 둘을 묶는다.
    const routing = read("src/lib/llm/routing.ts");
    expect(routing).toContain("MULTIMODAL_PURPOSES");
    expect(routing).toContain("EXPO_PUBLIC_MULTIMODAL_VENDOR");
    // 핀이 살아 있었다면 벤더가 상수여야 한다. 함수로 정해지면 핀은 없다.
    expect(routing).toContain("export function multimodalVendor()");
  });
});

// ── C10 이 서술하는 연령 게이트가 코드와 같은 말을 하는가 ─────────────
//
// 2026-09-08 실측에서 `docs/CONSTRAINTS.md` C10 의 "Jurisdiction (current
// limitation)" 문단이 **두 가지를 반대로** 적고 있었다:
//
//   문서: "국가 신호가 아직 없다. 전원 KR 규칙으로 `digitalConsentAge("KR")` 고정"
//   실제: 신호는 2026-08-16 에 도착했고, 클라이언트는
//         `digitalConsentAge(resolveJurisdiction())` 로 **관할별로 분기한다**
//
// 진짜 격차는 반대 방향이다 — **클라이언트는 분기하는데 서버는 안 한다.**
// 서버 게이트는 `< 14` 를 5곳에 박아두고 관할을 읽는 마이그레이션이 0개다.
// 그래서 EU/미상 관할의 14~15세는 우리 매트릭스가 거부하는데 권위 있는 서버
// 게이트가 통과시킨다. 문서가 그걸 반대로 적으면 아무도 그 구멍을 못 본다.
//
// ⚠ 이 가드는 **게이트를 바꾸라고 요구하지 않는다.** EU 최소 가입연령은 Simon
//    미결 사항이다(루트 CLAUDE.md). 요구하는 것은 문서가 실제를 적는 것뿐이다.
describe("C10 연령 게이트 서술", () => {
  it("클라이언트 게이트가 관할을 읽는다 — 문서의 근거", () => {
    const auth = read("src/lib/supabase/auth.ts");
    expect(auth).toContain("digitalConsentAge(resolveJurisdiction())");
  });

  it("국가 신호가 실재한다 — '아직 없다'가 거짓인 근거", () => {
    expect(existsSync(join(ROOT, "src/lib/auth/device-region.ts"))).toBe(true);
    const ca = read("src/lib/auth/consent-age.ts");
    expect(ca).toContain("deviceRegionCode");
    expect(ca).toContain("export function resolveJurisdiction()");
  });

  it("C10 이 '국가 신호가 없다'고 주장하지 않는다", () => {
    // 인용은 허용한다(취소선으로 원문을 보존하는 것이 이 저장소의 정정 방식).
    // 금지되는 것은 **사실로 주장하는 것**이다.
    const claims = assertionsOnly("docs/CONSTRAINTS.md")
      .split("\n")
      .filter((l) => /does not yet collect a reliable|not wired to a live signal/i.test(l));
    expect({ claims }).toEqual({ claims: [] });
  });

  it("C10 이 서버가 관할을 안 읽는다는 사실을 담고 있다", () => {
    // 반대 방향. 그냥 틀린 문장을 지우면 격차 자체가 기록에서 사라진다.
    const c10 = read("docs/CONSTRAINTS.md");
    expect(/server[^\n]{0,80}(does not|no)\b/i.test(c10)).toBe(true);
    expect(c10).toContain("No migration reads a jurisdiction");
  });
});

// ── 싣는 심리검사 문항의 사용권·판본 격차 ────────────────────────────
//
// 2026-09-08 실측: 앱은 BFI-44(44문항)와 ECR-S(12문항)의 **영문 원문 그대로 +
// 한국어 번역**을 코드에 싣는다. 그런데
//
//   `bfi.ts:2`        "Public domain." — 출처·허가 기록이 저장소에 없다
//   `attachment.ts`   사용권 문장이 아예 없다 (서지 인용만)
//
// 그리고 두 배치 문서가 자기 §Cautions 에서 **"직접 번역 말고 한국어 검증본을
// 쓰라"** 고 적는데, 코드의 `ko:` 문항은 그 금지된 직접 번역이고 검증본
// (Choi 2025 BFI-2 한국판 · Lee 2023 CR-ECR-SF 한국판)을 참조하지 않는다.
//
// ⚠ 이 가드는 **문항을 바꾸라고 요구하지 않는다.** 검사 도구 교체는 타당도와
//    법무가 걸린 제품 결정이다. 요구하는 것은 **격차가 기록된 채로 남아 있는
//    것**뿐이다 — 코드가 문항을 계속 싣는 한, 배치 문서가 그 사실을 적고 있어야
//    한다. 한쪽만 조용히 고쳐서 격차가 안 보이게 되는 것을 막는다.
const SHIPPED_INSTRUMENTS = [
  { code: "src/lib/persona/bfi.ts", doc: "docs/research/batches/big-five.md", items: 44 },
  { code: "src/lib/persona/attachment.ts", doc: "docs/research/batches/attachment.md", items: 12 },
] as const;

describe("싣는 검사 문항의 사용권 기록", () => {
  it.each(SHIPPED_INSTRUMENTS)("$code 가 실제로 한국어 문항을 싣는다", ({ code, items }) => {
    // 격차의 전제. 문항을 내리면 이 검사가 먼저 깨지고, 그때 아래 기록 요구도
    // 같이 풀어야 한다 — 그 순서가 맞다.
    const ko = (read(code).match(/\n\s*\{[^\n]*\bko:\s*"/g) ?? []).length;
    expect({ code, ko }).toEqual({ code, ko: items });
  });

  it.each(SHIPPED_INSTRUMENTS)("$doc 가 그 격차를 기록하고 있다", ({ doc }) => {
    const src = read(doc);
    expect(src).toContain("문항 사용권과 한국어 판본");
    // 결론이 아니라 측정으로 남아야 한다. "해결됨" 으로 조용히 닫는 것을 막는다.
    expect(/결론이 아니라 측정/.test(src)).toBe(true);
  });

  it("MSCEIT 처럼 저작권이 분명한 도구는 싣지 않는다", () => {
    // 실측 0건. 되살아나면 위 격차와 성격이 다른 문제가 된다 —
    // MSCEIT 는 MHS 가 상업 배포하는 도구다.
    const hits = SHIPPED_INSTRUMENTS.filter(({ code }) => /MSCEIT/i.test(read(code)));
    expect({ shipped: hits.map((h) => h.code) }).toEqual({ shipped: [] });
  });
});
