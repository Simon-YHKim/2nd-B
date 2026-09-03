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
import { createElement, type ReactNode } from "react";
import i18next from "i18next";

import { addressTerm } from "../address";
import { initI18n } from "../../i18n";
import {
  acceptAddressDisplayName,
  ADDRESS_VARIABLES_CHANGED_EVENT,
  currentDisplayName,
  syncAddressOwner,
  useAddressTerm,
} from "../use-address";

const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup(node: ReactNode): string;
};

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

function AddressOwnerRender({
  userId,
  locale,
}: {
  userId: string | null;
  locale: string;
}) {
  useAddressTerm(userId, locale);
  const who = i18next.options.interpolation?.defaultVariables?.who;
  return createElement("span", null, typeof who === "string" ? who : "");
}

function installLocalStorageSpy(): {
  setItem: jest.Mock<void, [string, string]>;
  restore: () => void;
} {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  const setItem = jest.fn<void, [string, string]>((key, value) => {
    values.set(key, value);
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem,
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: () => null,
      length: 0,
    } as Storage,
  });

  return {
    setItem,
    restore: () => {
      if (previousStorage) {
        Object.defineProperty(globalThis, "localStorage", previousStorage);
      } else {
        delete (globalThis as { localStorage?: Storage }).localStorage;
      }
    },
  };
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

  it("**첫 렌더에** 값이 이미 들어 있다 — 마운트만으로는 모자란다", () => {
    // ⚠ 이 검사가 없어서 실제로 새어 나갔다(2026-08-27, `/account` 말풍선에
    //   `여기는 {{who}}의 공간입니다.` 가 그대로 찍혔다).
    //
    //   공급자는 붙어 있었다. 그런데 `useAddressTerm` 은 `useEffect` 라 **첫 렌더
    //   뒤**에 돌고, 값을 넣는 방식이 i18next 의 `defaultVariables` 를 **변형**하는
    //   것이라 이미 그려진 `t()` 결과를 다시 그리지 않는다. 그 화면이 재렌더되지
    //   않으면 placeholder 가 그대로 남는다.
    //
    //   그래서 i18n 초기화가 **동기적으로** 폴백을 심어야 한다.
    //   "붙어 있다" 와 "첫 렌더에 값이 있다" 는 다른 조건이다.
    const i18n = readFileSync(join(ROOT, "src", "lib", "i18n", "index.ts"), "utf8");
    expect(i18n).toContain("seedAddressDefault");
    // 초기화(`.init(`) 뒤에 와야 한다 — 앞에 두면 i18next.language 가 아직 없다.
    const initAt = i18n.indexOf(".init({");
    const seedAt = i18n.indexOf("seedAddressDefault(");
    expect(initAt).toBeGreaterThan(-1);
    expect(seedAt).toBeGreaterThan(initAt);
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

  it("호칭 갱신 전용 이벤트는 locale preference를 저장하지 않는다", () => {
    const storage = installLocalStorageSpy();
    const addressRefresh = jest.fn();
    try {
      initI18n();
      const initialLanguage = i18next.language;
      const reactOptions = (i18next.options as typeof i18next.options & {
        react?: { bindI18n?: string | false };
      }).react;
      expect(String(reactOptions?.bindI18n).split(/\s+/)).toContain(
        ADDRESS_VARIABLES_CHANGED_EVENT,
      );

      i18next.on(ADDRESS_VARIABLES_CHANGED_EVENT, addressRefresh);
      syncAddressOwner("language-owner", initialLanguage);
      expect(
        acceptAddressDisplayName("language-owner", initialLanguage, "Name"),
      ).toBe(true);
      expect(addressRefresh).toHaveBeenCalledTimes(1);
      expect(storage.setItem).not.toHaveBeenCalled();
    } finally {
      i18next.off(ADDRESS_VARIABLES_CHANGED_EVENT, addressRefresh);
      syncAddressOwner(null, i18next.language);
      storage.restore();
    }
  });

  it("다른 locale로 실제 변경하면 preference를 저장한다", async () => {
    const initialLanguage = initI18n().language;
    const changedLanguage = initialLanguage === "ko" ? "en" : "ko";
    const storage = installLocalStorageSpy();
    try {
      await i18next.changeLanguage(changedLanguage);
      expect(storage.setItem).toHaveBeenCalledTimes(1);
      expect(storage.setItem).toHaveBeenLastCalledWith(
        "2nd-brain:locale",
        changedLanguage,
      );
    } finally {
      await i18next.changeLanguage(initialLanguage);
      storage.restore();
    }
  });

  it("이미 활성인 locale을 명시 선택해도 preference를 저장한다", async () => {
    const activeLanguage = initI18n().language;
    const storage = installLocalStorageSpy();
    try {
      await i18next.changeLanguage(activeLanguage);
      expect(storage.setItem).toHaveBeenCalledTimes(1);
      expect(storage.setItem).toHaveBeenLastCalledWith(
        "2nd-brain:locale",
        activeLanguage,
      );
    } finally {
      storage.restore();
    }
  });

  it("실제 hook 렌더의 A→B 첫 프레임에서 이전 이름을 버리고 늦은 A를 거부한다", () => {
    initI18n();
    syncAddressOwner("owner-a", "ko");
    expect(acceptAddressDisplayName("owner-a", "ko", "에이")).toBe(true);
    expect(currentDisplayName("owner-a")).toBe("에이");

    // Server rendering deliberately does not run effects. Seeing B's fallback
    // here proves useAddressTerm applies the owner boundary during render, not
    // in its lookup effect after a frame containing A's name could escape.
    const firstBFrame = renderToStaticMarkup(
      createElement(AddressOwnerRender, { userId: "owner-b", locale: "ko" }),
    );
    expect(firstBFrame).toContain(addressTerm(null, "ko"));
    expect(firstBFrame).not.toContain("에이");
    expect(currentDisplayName("owner-b")).toBeNull();
    expect(currentDisplayName("owner-a")).toBeNull();
    expect(i18next.options.interpolation?.defaultVariables?.who).toBe(
      addressTerm(null, "ko"),
    );

    // A의 늦은 조회 결과도 B cache/UI를 다시 오염시킬 수 없다.
    expect(acceptAddressDisplayName("owner-a", "ko", "늦은 에이")).toBe(false);
    expect(currentDisplayName("owner-b")).toBeNull();
    expect(i18next.options.interpolation?.defaultVariables?.who).toBe(
      addressTerm(null, "ko"),
    );

    syncAddressOwner(null, "ko");
  });

  it("같은 계정의 locale 첫 프레임도 이전 locale 호칭을 쓰지 않는다", () => {
    initI18n();
    syncAddressOwner("locale-owner", "ko");
    expect(acceptAddressDisplayName("locale-owner", "ko", "로케일")).toBe(true);

    try {
      const firstEnglishFrame = renderToStaticMarkup(
        createElement(AddressOwnerRender, {
          userId: "locale-owner",
          locale: "en",
        }),
      );
      expect(firstEnglishFrame).toBe("<span></span>");
      expect(i18next.options.interpolation?.defaultVariables?.who).toBe("");
      // The old-locale lookup may still resolve, but it cannot repaint EN.
      expect(
        acceptAddressDisplayName("locale-owner", "ko", "늦은 로케일"),
      ).toBe(false);
      expect(i18next.options.interpolation?.defaultVariables?.who).toBe("");
    } finally {
      syncAddressOwner(null, "en");
    }
  });

  it("complete-profile의 keyed remount 경계가 모든 계정 draft와 #1583 reset을 소유한다", () => {
    const screen = readFileSync(
      join(ROOT, "src", "app", "(auth)", "complete-profile.tsx"),
      "utf8",
    );
    const wrapperAt = screen.indexOf("export default function CompleteProfile() {");
    const bodyAt = screen.indexOf("function CompleteProfileBody() {");
    expect(wrapperAt).toBeGreaterThan(-1);
    expect(bodyAt).toBeGreaterThan(wrapperAt);

    const wrapper = screen.slice(wrapperAt, bodyAt);
    const keyedBody = screen.slice(bodyAt);
    expect(wrapper).toContain("const { userId } = useAuth();");
    expect(wrapper).toContain('<CompleteProfileBody key={userId ?? "anon"} />');
    expect(wrapper).not.toContain("useState(");
    for (const draftState of [
      "[birthDate, setBirthDate]",
      "[displayName, setDisplayName]",
      "[goal, setGoal]",
      "[consent, setConsent]",
    ]) {
      expect(keyedBody).toContain(draftState);
    }
    // #1583 navigation reset must remain inside the keyed body after the port.
    expect(keyedBody).toContain("const rootNavigationRef = useNavigationContainerRef();");
    expect(keyedBody).toContain("function resetSignedOutNavigation(): void {");
  });
});
