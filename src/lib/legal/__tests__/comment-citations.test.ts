// 코드 **주석 안의** `파일:줄` 인용이 아직 그 줄을 가리키는가.
//
// ## 왜 이게 있어야 했나
//
// `dpia-crisis-rail-anchors.test.ts` 는 **법률 문서**의 인용을 지킨다. 그런데
// 그 문서가 근거로 지목하는 것 중에 **코드 주석**이 있다 - `consent.ts` 헤더가
// "동의 ack 를 수집하는 자리 네 곳" 을 이름과 줄로 적고, DPIA 가 그 주석을
// 자기 근거로 인용한다. 사슬의 첫 마디는 검사받고 있었고 **둘째 마디는 아니었다.**
//
// 실제로 이렇게 됐다 (2026-09-08, 전부 같은 날):
//
//   06:27  `consent.ts` 주석의 인용을 고쳤다. 그 시각에 **맞았다.**
//   07:22  다른 수정이 `complete-profile.tsx` 에 32줄을 넣었다.
//   08:57  DPIA 쪽 인용은 새 줄번호로 적었다 (맞음).
//   --     `consent.ts` 는 아무도 다시 안 봤다. :308 -> :333, :161 -> :169 로 밀렸다.
//
// **같은 날, 같은 회차, 같은 사람**이 쓴 두 곳이 55분 만에 갈라졌고 아무 검사도
// 울지 않았다. 줄 번호는 그 정도 속도로 낡는다.
//
// 그리고 하루 뒤, 이 사실을 **설명하려고 쓴 정정문**도 같은 이유로 낡았다
// (`SbIcon.tsx` 가 옛 인용을 그대로 되풀이했는데 그 줄이 이미 밀려 있었다).
// 그래서 규칙이 하나 붙는다: **옛 인용을 인용하지 않는다.**
//
// ## 무엇을 지키나
//
// 인용마다 **그 줄에 있어야 하는 심볼**을 적는다. 줄이 밀리면 심볼이 안 맞고
// 검사가 운다. 줄 번호만 대조하면 "파일이 있고 줄이 범위 안" 이라는 이유로
// 밀린 인용이 그대로 통과한다 - 회차 65 가 DPIA 에서 정확히 그렇게 당했다.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");

interface CommentCite {
  /** 인용을 **쓴** 파일. 줄 번호는 안 적는다 - 그 자체가 낡기 때문이다. */
  from: string;
  /** 인용된 곳. `경로:줄` 또는 `경로:줄-줄`. */
  cite: string;
  /** 그 줄들에 실제로 있어야 하는 것. 주장을 떠받치는 내용이어야 한다. */
  symbol: string;
  /** 근거가 코드가 아니라 주석일 때. 주장 자체가 "코드가 뭐라고 적어 뒀나" 일
   *  때만 정당하다. */
  evidence?: "comment";
  why: string;
}

const CITES: CommentCite[] = [
  {
    from: "src/app/(auth)/complete-profile.tsx",
    cite: "src/lib/persona/northstar.ts:66-68",
    symbol: "hotline modal instead of navigating away",
    evidence: "comment",
    why: "주장이 'saveNorthstar 의 계약이 이렇게 적혀 있다' 라서 근거가 그 계약문이다. 화면이 그것을 어겼다는 지적의 출발점.",
  },
  {
    from: "src/lib/auth/consent-age.ts",
    cite: "src/lib/safety/lexicon.ts:460",
    symbol: '"2026-06-10"',
    why: "주장은 **그 값이 무엇인가** 다. 상수 이름이 아니라 값을 잡아야 값이 바뀔 때 운다.",
  },
  {
    from: "src/lib/notices/remote.ts",
    cite: "src/lib/supabase/privacy.ts:12-29",
    symbol: "return resolvePrivacyPrefs(null)",
    why: "'읽기는 FAIL SOFT 한다' 의 실제 동작 - catch 안에서 기본값을 돌려주는 그 줄.",
  },
  {
    from: "src/lib/notices/remote.ts",
    cite: "src/lib/wiki/moderation-queries.ts:31-36",
    symbol: 'error.code !== "23505"',
    why: "'중복 키 말고는 THROW 한다' 의 실제 조건. 중복 키 코드를 잡는다.",
  },
  {
    from: "src/lib/notices/remote.ts",
    cite: "src/lib/wiki/template-queries.ts:35-49",
    symbol: "owner_id: string;",
    why: "'행 모양을 손으로 선언하고 경계에서 캐스팅한다' 의 근거는 snake_case 필드다. 인터페이스 이름이 아니라 **손으로 적은 필드**를 잡는다.",
  },
  {
    from: "src/lib/supabase/consent.ts",
    cite: "src/app/(auth)/sign-up.tsx:219",
    symbol: "<ConsentNotice",
    why: "동의 고지를 **수집하는** 자리. DPIA 가 이 주석을 근거로 인용한다.",
  },
  {
    from: "src/lib/supabase/consent.ts",
    cite: "src/app/(auth)/complete-profile.tsx:333",
    symbol: "<ConsentNotice",
    why: "같은 것의 두 번째 진입 화면. ⚠ 이 줄이 :308 에서 밀린 채 방치돼 있었다.",
  },
  {
    from: "src/lib/supabase/consent.ts",
    cite: "src/lib/auth/useSignUpForm.ts:318",
    symbol: "recordConsentBestEffort(",
    why: "원장에 **쓰는** 자리. 화면 파일이 아니라 화면의 훅에 있다는 것이 이 주석의 요점.",
  },
  {
    from: "src/lib/supabase/consent.ts",
    cite: "src/app/(auth)/complete-profile.tsx:169",
    symbol: "recordConsentBestEffort(",
    why: "두 번째 쓰기 자리. ⚠ 이 줄도 :161 에서 밀린 채 방치돼 있었다.",
  },
  {
    from: "src/screens/deepspace/museum/museum-translation.ts",
    cite: "scripts/check-i18n-keys.ts:53-74",
    symbol: "REQUIRED_LOCALES",
    why: "'로케일 번들에 넣으면 다섯 로케일 전부에 요구된다' 는 결정 근거. 요구하는 목록 자체를 잡는다.",
  },
];

/** 주석 줄에서만 찾는다. 코드 안의 문자열은 인용이 아니다. */
const CITE_RE =
  /((?:src|db|docs|supabase|scripts|design|public)\/[A-Za-z0-9_./()-]+\.(?:ts|tsx|sql|md|json|yml)):(\d+)(?:-(\d+))?/g;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "__mocks__") continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(e.name)) {
      out.push(relative(ROOT, full).split(sep).join("/"));
    }
  }
  return out;
}

function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

/** 저장소 안 모든 주석에서 발견된 `파일:줄` 인용. */
function foundCites(): { from: string; cite: string }[] {
  const out: { from: string; cite: string }[] = [];
  for (const rel of sourceFiles(join(ROOT, "src"))) {
    for (const line of readFileSync(join(ROOT, rel), "utf8").split("\n")) {
      if (!isCommentLine(line)) continue;
      for (const m of line.matchAll(CITE_RE)) {
        out.push({ from: rel, cite: m[3] ? `${m[1]}:${m[2]}-${m[3]}` : `${m[1]}:${m[2]}` });
      }
    }
  }
  return out;
}

function slice(cite: string): string {
  const at = cite.lastIndexOf(":");
  const path = cite.slice(0, at);
  const [a, b] = cite.slice(at + 1).split("-").map(Number);
  const lines = readFileSync(join(ROOT, path), "utf8").split("\n");
  return lines.slice(a - 1, (b ?? a)).join("\n");
}

function stripComments(text: string): string {
  return text
    .split("\n")
    .map(l => (isCommentLine(l) ? "" : l))
    .join("\n");
}

const found = foundCites();
const key = (c: { from: string; cite: string }) => `${c.from} -> ${c.cite}`;

describe("주석이 단 인용은 여전히 그 줄을 가리킨다", () => {
  it("주석을 실제로 훑었다 - 0건 통과를 막는다", () => {
    // 정규식이 조용히 아무것도 못 잡으면 아래 검사는 전부 무의미해진다.
    expect(found.length).toBeGreaterThanOrEqual(8);
  });

  // ⚠ **인용이 옮겨지면 이 검사와 다음 검사가 함께 운다.** 한쪽은 "모르는 인용이
  //   생겼다", 다른 쪽은 "알던 인용이 사라졌다" 로 나온다 - 그 둘이 같이 뜨면
  //   `:308` 이 새로 생기고 `:333` 이 없어졌다는 뜻, 즉 **한 인용이 옮겨간 것**이다.
  //   심볼 검사는 이때 안 운다. 표가 여전히 옛 줄을 가리키고 그 줄은 멀쩡하기
  //   때문이다. 심볼 검사가 우는 것은 **코드가 표 밑에서 밀렸을 때**다.
  it("표에 없는 인용이 없다 - 새 인용은 즉시 걸린다", () => {
    const known = new Set(CITES.map(key));
    expect(found.filter(c => !known.has(key(c))).map(key)).toEqual([]);
  });

  it("표에 죽은 줄이 없다 - 사라진 인용을 계속 지키는 척하지 않는다", () => {
    // 표가 실재하지 않는 인용을 담고 있으면, 그 주장이 코드에서 없어졌다는
    // 사실을 표가 가린다. 회차 64 의 '명단이 제 근거를 검사한다' 와 같은 형태.
    const live = new Set(found.map(key));
    expect(CITES.map(key).filter(k => !live.has(k))).toEqual([]);
  });

  it("인용한 줄에 그 심볼이 실제로 있다", () => {
    const wrong: string[] = [];
    for (const a of CITES) {
      const raw = slice(a.cite);
      const text = a.evidence === "comment" ? raw : stripComments(raw);
      if (!text.includes(a.symbol)) wrong.push(`${key(a)} :: ${a.symbol}`);
    }
    expect(wrong).toEqual([]);
  });

  it("표의 모든 줄이 근거를 적었다", () => {
    expect(CITES.filter(a => a.why.trim().length < 10).map(key)).toEqual([]);
  });
});
