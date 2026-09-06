// Source pin (render tests are blocked in this repo): the recommendations
// consent copy must not hardcode a vendor name. It read "Gemini로 전송돼요" /
// "sent to Gemini" until 2026-09-01 while the reasoning-vendor switch was one
// console command away from openai — the same defect class #1506 fixed for
// the embedding consent, found live by the console (REQ-260901-03).

import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/screens/deepspace/DeepSpaceDesignScreens.tsx"),
  "utf8",
);

describe("recommendations consent copy names the vendor from the switch", () => {
  test("no hardcoded vendor name in the consent sentence (ko or en)", () => {
    expect(SRC).not.toMatch(/Gemini로 전송돼요/);
    expect(SRC).not.toMatch(/OpenAI로 전송돼요/);
    expect(SRC).not.toMatch(/sent to (Gemini|OpenAI) for analysis/);
  });

  test("both locales interpolate recommendationVendorLabel() at the processor slot", () => {
    expect(SRC).toMatch(/분석을 위해 \$\{recommendationVendorLabel\(\)\} 서버로 전송돼요\(해외에서 처리\)/);
    expect(SRC).toMatch(/sent to \$\{recommendationVendorLabel\(\)\} for analysis \(processed overseas\)/);
  });

  test("the label is imported from the ops module that owns the flow", () => {
    expect(SRC).toMatch(
      /import \{[^}]*\brecommendationVendorLabel\b[^}]*\} from "@\/lib\/ops\/recommend"/,
    );
  });
});
