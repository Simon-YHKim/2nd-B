import {
  resolveKnowledgeSourceLink,
  safeDoiHref,
  safeDoiReferenceHref,
  safeHttpsHref,
} from "../source-link";

describe("safeHttpsHref", () => {
  test("canonicalizes an unambiguous HTTPS URL", () => {
    expect(safeHttpsHref("https://Example.COM/paper?q=one#abstract")).toBe(
      "https://example.com/paper?q=one#abstract",
    );
    expect(safeHttpsHref("HTTPS://example.com")).toBe("https://example.com/");
  });

  test.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "secondbrain://research/paper",
    "http://example.com/paper",
    "ftp://example.com/paper",
    "//example.com/paper",
    "https:example.com/paper",
    "/relative/paper",
    "not a url",
    "",
  ])("rejects a non-HTTPS or ambiguous target: %s", (value) => {
    expect(safeHttpsHref(value)).toBeNull();
  });

  test.each([
    "https://user@example.com/paper",
    "https://user:password@example.com/paper",
    "https://@example.com/paper",
    "https://example.com\\@attacker.example/paper",
  ])("rejects userinfo and authority confusion: %s", (value) => {
    expect(safeHttpsHref(value)).toBeNull();
  });

  test.each([
    " https://example.com/paper",
    "https://example.com/paper ",
    "https://example.com/\nattacker",
    "https://example.com/\tattacker",
    "https://example.com/\u0000attacker",
    "https://example.com/%0aattacker",
    "https://example.com/%09attacker",
    "https://example.com/%7fattacker",
    "https://example.com/%5cattacker",
    "https://ｅxample.com/paper",
    "https://K.example/paper",
    "https://ſafe.example/paper",
  ])("rejects control characters and browser-normalized ambiguity: %s", (value) => {
    expect(safeHttpsHref(value)).toBeNull();
  });

  test("rejects non-strings and excessive URLs", () => {
    expect(safeHttpsHref(null)).toBeNull();
    expect(safeHttpsHref(42)).toBeNull();
    expect(safeHttpsHref(`https://example.com/${"a".repeat(2048)}`)).toBeNull();
  });
});

describe("safeDoiHref", () => {
  test("accepts a raw DOI token and builds the fixed resolver URL", () => {
    expect(safeDoiHref("10.1037/0022-3514.52.1.81")).toBe(
      "https://doi.org/10.1037/0022-3514.52.1.81",
    );
    expect(safeDoiHref("10.1016/S0147-1767(97)00034-5")).toBe(
      "https://doi.org/10.1016/S0147-1767(97)00034-5",
    );
  });

  test.each([
    "javascript:alert(1)",
    "data:text/html,evil",
    "file:///tmp/paper",
    "http://doi.org/10.1037/example",
    "https://doi.org/10.1037/example",
    "10.123/example",
    " 10.1037/example",
    "10.1037/example ",
    "10.1037/line\nbreak",
    "10.1037/%0aevil",
    "10.1037/example?redirect=evil",
    "10.1037/example#fragment",
    "10.1037/@evil",
    "10.1037/Kelvin",
    "10.1037/ſafe",
    "10.1037//evil",
    "10.1037/../evil",
    "10.1037/safe/./evil",
    "",
  ])("rejects a non-canonical DOI token: %s", (value) => {
    expect(safeDoiHref(value)).toBeNull();
  });
});

describe("safeDoiReferenceHref", () => {
  test("accepts a raw DOI or the exact doi.org HTTPS form", () => {
    expect(safeDoiReferenceHref("10.1037/0022-3514.52.1.81")).toBe(
      "https://doi.org/10.1037/0022-3514.52.1.81",
    );
    expect(safeDoiReferenceHref("https://doi.org/10.1037/0022-3514.52.1.81")).toBe(
      "https://doi.org/10.1037/0022-3514.52.1.81",
    );
    expect(safeDoiReferenceHref("HTTPS://DOI.ORG/10.1016/S0147-1767(97)00034-5")).toBe(
      "https://doi.org/10.1016/S0147-1767(97)00034-5",
    );
  });

  test("upgrades only the exact legacy http doi.org resolver", () => {
    expect(safeDoiReferenceHref("http://doi.org/10.1037/example")).toBe(
      "https://doi.org/10.1037/example",
    );
    expect(safeDoiReferenceHref("HTTP://DOI.ORG/10.1037/example")).toBe(
      "https://doi.org/10.1037/example",
    );
  });

  test.each([
    "javascript:alert(1)",
    "data:text/html,evil",
    "file:///tmp/paper",
    "http://evil.example/10.1037/example",
    "https://evil.example/10.1037/example",
    "https://doi.org.evil.example/10.1037/example",
    "https://doi.org@evil.example/10.1037/example",
    "https://user@doi.org/10.1037/example",
    "https://doi.org:443/10.1037/example",
    "https:doi.org/10.1037/example",
    "//doi.org/10.1037/example",
    "https://dοi.org/10.1037/example",
    "https://doi.org/10.1037/example?next=https://evil.example",
    "https://doi.org/10.1037/example#evil",
    "https://doi.org/10.1037%2Fexample",
    "https://doi.org/10.1037/../evil",
    "https://doi.org/10.1037/example\n",
  ])("rejects a non-exact or unsafe DOI reference: %s", (value) => {
    expect(safeDoiReferenceHref(value)).toBeNull();
  });
});

describe("resolveKnowledgeSourceLink", () => {
  test("prefers a validated DOI and derives both href and label from it", () => {
    expect(
      resolveKnowledgeSourceLink({
        doi: "10.1037/0022-3514.52.1.81",
        url: "https://publisher.example/paper",
      }),
    ).toEqual({
      href: "https://doi.org/10.1037/0022-3514.52.1.81",
      label: "doi.org/10.1037/0022-3514.52.1.81",
    });
  });

  test("uses a validated URL when the DOI is absent", () => {
    expect(resolveKnowledgeSourceLink({ doi: null, url: "https://publisher.example/paper" })).toEqual({
      href: "https://publisher.example/paper",
      label: "https://publisher.example/paper",
    });
  });

  test("fails the whole row closed when either stored target is invalid", () => {
    expect(
      resolveKnowledgeSourceLink({
        doi: "10.1037/safe",
        url: "javascript:alert(1)",
      }),
    ).toBeNull();
    expect(
      resolveKnowledgeSourceLink({
        doi: "javascript:alert(1)",
        url: "https://publisher.example/paper",
      }),
    ).toBeNull();
    expect(resolveKnowledgeSourceLink({ doi: null, url: null })).toBeNull();
  });

  // "keeps the archived research renderer behind the shared safe-link boundary" 는
  // 2026-10-05 에 은퇴했다. 그 대상인 보관본 legacy/screens/research.tsx 가 롤백 레버
  // 제거와 함께 E:/Legacy/2ndB 로 나갔고(Simon 결정 Q-261004-11 C), 검사는 보관본을
  // 읽지 않는다(legacy-archive-integrity.test.ts). ⚠ 그래서 지금 src 안에서
  // resolveKnowledgeSourceLink 를 부르는 배송 화면은 0곳이다(배송 /research 에는 출처
  // 목록이 없다). 출처 링크를 다시 그리는 화면이 생기면 그 화면에 이 경계 단언을 다시 건다.
});
