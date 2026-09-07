// 클라이언트 번들에 실려 나가는 **자격 형태 공개 변수**의 표면을 고정한다.
//
// `EXPO_PUBLIC_*` 는 Metro 가 빌드 때 **값으로 치환**한다. 그래서 이 접두사를 단 변수는
// 예외 없이 공개 번들에 인라인되고, 웹에서는 누구나 파일을 받아 읽을 수 있다.
// 2026-09-07 실측: 라이브 번들 `entry-...js` 의 `searchFoods` 안에 MFDS 서비스키가
// 64자 리터럴로 박혀 있었다(2026-06-20 #498 이 web-deploy 에 주입한 뒤로 계속).
//
// **그렇다고 전부 문제인 것은 아니다.** 이 목록의 대부분은 애초에 클라이언트용으로
// 발급되는 값이다(Supabase anon 은 RLS 뒤에 있고, RevenueCat SDK 키와 Paddle client
// 토큰은 공개 전제, Google 브라우저 키는 리퍼러 제한으로 지킨다). 진짜 문제는
// **서버용으로 발급된 키를 클라이언트에 둔 것**이다 - 공공데이터포털 서비스키가 그렇다.
// 계정 할당량이 붙어 있어 가져다 쓰면 우리 쿼터가 소진된다.
//
// 그래서 이 가드는 "공개 변수 금지"가 아니라 **표면을 고정**한다:
//   · 새 자격 형태 변수가 클라이언트 코드나 웹 배포 워크플로에 들어오면 **실패**한다.
//   · 이미 있는 것은 성격과 근거를 여기 적어 둔다. 프록시로 옮기면 목록에서 지운다.
// 값을 검사하지 않는다(값은 저장소에 없다). 검사 대상은 **이름의 존재**다.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const SRC = resolve(__dirname, "../..");
const WORKFLOW = resolve(__dirname, "../../../.github/workflows/web-deploy.yml");

/** 이름이 자격처럼 생긴 것. 값의 성격은 아래 표가 정한다. */
const CREDENTIAL_SHAPED = /^EXPO_PUBLIC_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)$/;

type Kind = "public-by-design" | "pending-proxy";

/** 표면 고정. 늘리려면 근거를 함께 적어야 한다. */
const SURFACE: Readonly<Record<string, { kind: Kind; why: string }>> = {
  EXPO_PUBLIC_SUPABASE_ANON_KEY: {
    kind: "public-by-design",
    why: "anon 키는 공개 전제이고 RLS 가 실제 경계다. CLAUDE.md 가 명시한다.",
  },
  EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: {
    kind: "public-by-design",
    why: "RevenueCat 이 클라이언트 SDK 용으로 발급하는 공개 키.",
  },
  EXPO_PUBLIC_REVENUECAT_IOS_KEY: {
    kind: "public-by-design",
    why: "RevenueCat 이 클라이언트 SDK 용으로 발급하는 공개 키(iOS 쪽).",
  },
  EXPO_PUBLIC_PADDLE_CLIENT_TOKEN: {
    kind: "public-by-design",
    why: "Paddle client-side token. 결제 확정은 서버가 한다.",
  },
  EXPO_PUBLIC_GOOGLE_API_KEY: {
    kind: "public-by-design",
    why: "브라우저 키. 경계는 값 비공개가 아니라 리퍼러/API 제한이다.",
  },
  // EXPO_PUBLIC_MFDS_FOOD_KEY / EXPO_PUBLIC_EXIM_FX_KEY 는 2026-09-08 에 여기서
  // 빠졌다. 프록시로 옮겼고(public-data-proxy) 클라이언트도 워크플로도 더 이상
  // 이름을 읽지 않는다. 값을 지운 것이 아니라 표면에서 내린 것이다 - 저장소
  // Variable 은 그대로 두고 경위를 문서에 남겼다(RETIREMENT_DOC).
};

/** 은퇴한 자격 변수의 기록. 지우는 대신 남긴다(Simon 규칙 2026-09-08). */
const RETIREMENT_DOC = resolve(__dirname, "../../../docs/PUBLIC-DATA-KEY-RETIREMENT.md");
const RETIRED = ["EXPO_PUBLIC_MFDS_FOOD_KEY", "EXPO_PUBLIC_EXIM_FX_KEY"] as const;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "__tests__") walk(p, out);
    } else if (/\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * 주석은 걷어낸다. Metro 가 값으로 치환하는 것은 **코드의 참조**뿐이고, 주석은
 * 번들에 남지도 않는다. 그런데 은퇴한 이름일수록 "왜 옮겼는지"를 설명하느라
 * 주석에 자주 등장한다 - 그걸 세면 가드가 자기 설명문에 걸린다(이 저장소에서
 * 주석發 거짓양성이 이미 네 번 났다).
 */
function stripComments(text: string, kind: "ts" | "yaml"): string {
  if (kind === "yaml") return text.replace(/(^|\s)#.*$/gm, "$1");
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function namesIn(text: string, kind: "ts" | "yaml"): string[] {
  return [...stripComments(text, kind).matchAll(/EXPO_PUBLIC_[A-Z0-9_]+/g)]
    .map((m) => m[0])
    .filter((n) => CREDENTIAL_SHAPED.test(n));
}

const fromSource = new Set<string>();
for (const f of walk(SRC)) {
  for (const n of namesIn(readFileSync(f, "utf8"), "ts")) fromSource.add(n);
}
const fromWorkflow = new Set(namesIn(readFileSync(WORKFLOW, "utf8"), "yaml"));

describe("공개 번들에 실리는 자격 형태 변수의 표면", () => {
  test("가드가 진짜 소스와 워크플로를 읽는다", () => {
    expect(fromSource.size).toBeGreaterThan(3);
    expect(fromWorkflow.size).toBeGreaterThan(1);
  });

  test("클라이언트 코드가 읽는 것이 전부 표에 있다", () => {
    expect([...fromSource].sort()).toEqual(
      [...fromSource].filter((n) => n in SURFACE).sort(),
    );
  });

  test("웹 배포가 주입하는 것도 전부 표에 있다", () => {
    expect([...fromWorkflow].sort()).toEqual(
      [...fromWorkflow].filter((n) => n in SURFACE).sort(),
    );
  });

  test("표에 죽은 항목이 없다 (옮겼으면 지운다)", () => {
    for (const name of Object.keys(SURFACE)) {
      const live = fromSource.has(name) || fromWorkflow.has(name);
      expect({ name, live }).toEqual({ name, live: true });
    }
  });

  test("프록시 대기 항목이 남아 있지 않다 (둘 다 옮겨졌다)", () => {
    const pending = Object.entries(SURFACE)
      .filter(([, v]) => v.kind === "pending-proxy")
      .map(([k]) => k)
      .sort();
    expect(pending).toEqual([]);
  });

  test("은퇴한 둘은 클라이언트에도 웹 배포에도 없다", () => {
    for (const name of RETIRED) {
      expect({ name, inSource: fromSource.has(name) }).toEqual({ name, inSource: false });
      expect({ name, inWorkflow: fromWorkflow.has(name) }).toEqual({ name, inWorkflow: false });
    }
  });

  test("모든 항목에 성격과 근거가 있다", () => {
    const KINDS = new Set(["public-by-design", "pending-proxy"]);
    for (const [name, v] of Object.entries(SURFACE)) {
      expect({ name, known: KINDS.has(v.kind) }).toEqual({ name, known: true });
      expect({ name, hasWhy: v.why.length > 20 }).toEqual({ name, hasWhy: true });
    }
  });
});

// 지우지 않고 은퇴시키기로 했다(Simon 2026-09-08): 저장소 Variable 은 그대로 두고,
// 무엇이었는지 · 어디서 쓰였는지 · 언제 왜 내렸는지를 문서에 남긴다. 문서가 조용히
// 사라지거나 값이 적히는 것을 여기서 막는다.
describe("은퇴 기록", () => {
  const doc = readFileSync(RETIREMENT_DOC, "utf8");

  test("문서가 두 변수를 이름으로 지목한다", () => {
    expect(doc.length).toBeGreaterThan(800);
    for (const name of RETIRED) expect(doc).toContain(name);
  });

  test("어디서 쓰였는지와 무엇이 대신하는지가 적혀 있다", () => {
    expect(doc).toContain("src/lib/nutrition/foods.ts");
    expect(doc).toContain("src/lib/finance/fx.ts");
    expect(doc).toContain(".github/workflows/web-deploy.yml");
    expect(doc).toContain("public-data-proxy");
  });

  test("값 자체는 문서에 없다 (이름·경로·상태만)", () => {
    // data.go.kr 서비스키는 64자 hex, 수출입은행 authkey 는 24자 영숫자다.
    expect(doc).not.toMatch(/\b[0-9a-fA-F]{32,}\b/);
    expect(doc).not.toMatch(/(serviceKey|authkey)\s*[=:]\s*[A-Za-z0-9%+/]{16,}/i);
  });
});
