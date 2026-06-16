import { scrubPii, restorePii, hasPii } from "../pii-scrub";

describe("scrubPii", () => {
  it("redacts an email and round-trips on restore", () => {
    const t = "Reach me at jane.doe@example.com about the draft.";
    const { scrubbed, tokens } = scrubPii(t);
    expect(scrubbed).not.toContain("jane.doe@example.com");
    expect(scrubbed).toContain("[[PII:email:1]]");
    expect(tokens).toHaveLength(1);
    expect(restorePii(scrubbed, tokens)).toBe(t);
  });

  it("redacts a Korean resident-registration number", () => {
    const { scrubbed, tokens } = scrubPii("주민번호는 900101-1234567 입니다.");
    expect(scrubbed).not.toContain("900101-1234567");
    expect(tokens[0].kind).toBe("krrrn");
  });

  it("redacts a Luhn-valid card number but leaves a random digit run alone", () => {
    const valid = scrubPii("card 4242 4242 4242 4242 end");
    expect(valid.tokens.some((t) => t.kind === "card")).toBe(true);

    const invalid = scrubPii("order 1234 5678 1234 5671 ref");
    expect(invalid.tokens.some((t) => t.kind === "card")).toBe(false);
  });

  it("redacts phone numbers and IPv4 addresses", () => {
    const phone = scrubPii("call 010-1234-5678 now");
    expect(phone.tokens.some((t) => t.kind === "phone")).toBe(true);

    const ip = scrubPii("server at 192.168.0.42 responded");
    expect(ip.tokens.some((t) => t.kind === "ipv4")).toBe(true);
  });

  it("numbers multiple matches of the same kind deterministically", () => {
    const { scrubbed, tokens } = scrubPii("a@x.com and b@y.com");
    expect(scrubbed).toBe("[[PII:email:1]] and [[PII:email:2]]");
    expect(tokens.map((t) => t.value)).toEqual(["a@x.com", "b@y.com"]);
  });

  it("is deterministic for the same input", () => {
    const t = "email z@z.io ip 10.0.0.1 phone 010-9999-8888";
    expect(scrubPii(t)).toEqual(scrubPii(t));
  });

  it("leaves PII-free text untouched", () => {
    const t = "A reflective note about morning focus.";
    const { scrubbed, tokens } = scrubPii(t);
    expect(scrubbed).toBe(t);
    expect(tokens).toHaveLength(0);
  });

  it("restores a multi-kind scrub exactly", () => {
    const t = "Contact a@b.com or 010-1111-2222, host 8.8.8.8.";
    const { scrubbed, tokens } = scrubPii(t);
    expect(restorePii(scrubbed, tokens)).toBe(t);
  });
});

describe("hasPii", () => {
  it("flags text containing PII", () => {
    expect(hasPii("ping me at a@b.com")).toBe(true);
  });
  it("is false for clean text", () => {
    expect(hasPii("just some ordinary words")).toBe(false);
  });
});
