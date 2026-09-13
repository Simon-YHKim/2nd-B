import { readFileSync } from "node:fs";
import { join } from "node:path";

import { canonicalNetworkIdentity } from "../../../../supabase/functions/_shared/network-identity";

const edge = readFileSync(
  join(process.cwd(), "supabase", "functions", "peer-respond", "index.ts"),
  "utf8",
);

describe("peer responder network identity", () => {
  test("canonicalizes the trusted hop before either HMAC derivation", () => {
    const resolveIdentity = edge.indexOf("const networkHint = trustedGatewayNetworkHint(req)");
    const quotaHmac = edge.indexOf("peer-respond:abuse:v1:${networkHint}");
    const auditHmac = edge.indexOf("v1:ip:${networkHint}");

    expect(edge).toContain(
      "import { canonicalNetworkIdentity } from '../_shared/network-identity.ts'",
    );
    expect(edge.match(/canonicalNetworkIdentity\(/g)).toHaveLength(2);
    expect(resolveIdentity).toBeGreaterThan(0);
    expect(quotaHmac).toBeGreaterThan(resolveIdentity);
    expect(auditHmac).toBeGreaterThan(quotaHmac);
    expect(edge).not.toMatch(
      /console\.(?:log|warn|error)\([^\n]*(?:networkHint|cf-connecting-ip|x-forwarded-for)/,
    );
  });

  test("converges textual IPv6 variants within one /64", () => {
    const variants = [
      "2001:0DB8:ABCD:0012:0000:0000:0000:0001",
      "2001:db8:abcd:12::ffff",
      "2001:db8:abcd:0012:1234:5678:90ab:cdef",
      "2001:db8:abcd:12::203.0.113.7",
    ];

    const identities = variants.map(canonicalNetworkIdentity);

    expect(new Set(identities)).toEqual(new Set(["ipv6/64:2001:db8:abcd:12"]));
  });

  test("keeps different IPv6 /64 prefixes distinct", () => {
    expect(canonicalNetworkIdentity("2001:db8:abcd:12::1")).not.toBe(
      canonicalNetworkIdentity("2001:db8:abcd:13::1"),
    );
  });

  test("accepts the shortest valid IPv6 literal", () => {
    expect(canonicalNetworkIdentity("::")).toBe("ipv6/64:0:0:0:0");
  });

  test.each([
    ["::1", "ipv6/64:0:0:0:0"],
    ["1::", "ipv6/64:1:0:0:0"],
    ["2001:db8::192.0.2.1", "ipv6/64:2001:db8:0:0"],
    ["1:2:3:4:5:6:7:8", "ipv6/64:1:2:3:4"],
    ["FFFF:FFFF:FFFF:FFFF:FFFF:FFFF:FFFF:FFFF", "ipv6/64:ffff:ffff:ffff:ffff"],
  ])("canonicalizes valid IPv6 boundary form %s", (raw, expected) => {
    expect(canonicalNetworkIdentity(raw)).toBe(expected);
  });

  test("maps IPv4-embedded IPv6 variants to the underlying IPv4 identity", () => {
    const ipv4 = canonicalNetworkIdentity("203.0.113.7");

    expect(ipv4).toBe("203.0.113.7");
    expect(canonicalNetworkIdentity("::ffff:203.0.113.7")).toBe(ipv4);
    expect(canonicalNetworkIdentity("0:0:0:0:0:FFFF:CB00:7107")).toBe(ipv4);
  });

  test("keeps ordinary IPv4 addresses isolated per address", () => {
    expect(canonicalNetworkIdentity("203.0.113.7")).not.toBe(
      canonicalNetworkIdentity("203.0.113.8"),
    );
    expect(canonicalNetworkIdentity("0.0.0.0")).toBe("0.0.0.0");
    expect(canonicalNetworkIdentity("255.255.255.255")).toBe("255.255.255.255");
    expect(canonicalNetworkIdentity("203.000.113.007")).toBe("203.0.113.7");
  });

  test.each([
    "",
    "not-an-ip",
    "deadbeef",
    "2001:db8:::1",
    "2001:db8::1::2",
    "2001:db8::zzzz",
    "2001:db8:00000::1",
    "2001:db8:1:2:3:4:5",
    "1:2:3:4:5:6:7::8",
    "1:2:3:4:5:6:7:8:9",
    "1:2:3:4:5:6:7:192.0.2.1",
    "2001:db8::192.0.2.999",
    " 2001:db8::1",
    "203.0.113.999",
    "203.0.113",
    "203.0.113.7.8",
    "203.0.113.7".repeat(8),
  ])("fails closed without returning malformed input: %s", (raw) => {
    expect(canonicalNetworkIdentity(raw)).toBeNull();
  });
});
