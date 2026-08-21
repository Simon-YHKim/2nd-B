// `{{who}}` 는 화면에 절대 그대로 나오면 안 된다.
//
// 이 placeholder 는 호출부가 값을 넘겨서 채워지는 게 아니라 i18next 의
// defaultVariables 로 전역 공급된다(src/lib/persona/use-address.ts). 편해서 고른
// 방식이지만 실패 모드가 조용하다 — 공급자가 안 붙으면 어떤 오류도 없이 화면에
// "{{who}}의 영역이" 가 그대로 찍힌다.
//
// 그래서 세 가지를 못박는다: 공급자가 실제로 마운트돼 있을 것, 폴백이 빈칸이
// 아닐 것, 그리고 ko 밖의 로케일에는 이 placeholder 가 새지 않을 것.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { addressTerm } from "../address";

const ROOT = join(__dirname, "..", "..", "..", "..");
const LOCALES = join(ROOT, "locales");

function values(obj: unknown, out: string[] = []): string[] {
  if (typeof obj === "string") out.push(obj);
  else if (obj && typeof obj === "object") for (const v of Object.values(obj)) values(v, out);
  return out;
}

function localeValues(lang: string): string[] {
  const dir = join(LOCALES, lang);
  const out: string[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    values(JSON.parse(readFileSync(join(dir, f), "utf8")), out);
  }
  return out;
}

describe("{{who}} placeholder", () => {
  it("한국어에서 실제로 쓰이고 있다", () => {
    const used = localeValues("ko").filter((v) => v.includes("{{who}}"));
    expect(used.length).toBeGreaterThanOrEqual(30);
  });

  it("한국어가 아닌 로케일에는 새지 않는다", () => {
    // addressTerm 은 ko 가 아니면 빈 문자열을 준다. 다른 로케일 값에
    // {{who}} 가 있으면 그 자리가 통째로 비어버린다.
    for (const lang of ["en", "es", "id", "pt"]) {
      const leaked = localeValues(lang).filter((v) => v.includes("{{who}}"));
      expect({ lang, leaked }).toEqual({ lang, leaked: [] });
    }
  });

  it("폴백이 빈 문자열이 아니다", () => {
    // 빈칸이면 "{{who}}의 영역이" 가 "의 영역이" 가 된다. 이름은 선택 입력이라
    // 이 경로는 드물지 않다.
    expect(addressTerm(null, "ko").length).toBeGreaterThan(0);
    expect(addressTerm("", "ko").length).toBeGreaterThan(0);
  });

  it("공급자가 앱 트리에 마운트돼 있다", () => {
    // 이게 빠지면 어떤 오류도 없이 화면에 {{who}} 가 그대로 찍힌다.
    const layout = readFileSync(join(ROOT, "src", "app", "_layout.tsx"), "utf8");
    expect(layout).toContain("useAddressTerm");
    expect(layout).toContain("<AddressTermSync />");
  });

  it("치환 결과에 중괄호가 남지 않는다", () => {
    // 조사까지 붙여서 실제로 만들어지는 문장을 확인한다.
    const samples = localeValues("ko").filter((v) => v.includes("{{who}}"));
    for (const name of ["허슬케이", null]) {
      const who = addressTerm(name, "ko");
      for (const s of samples) {
        expect(s.replace(/\{\{who\}\}/g, who)).not.toContain("{{who}}");
      }
    }
  });
});
