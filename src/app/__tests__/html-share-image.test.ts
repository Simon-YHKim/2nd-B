// 공유 카드(og:image)는 **조용히 깨지는 종류**의 자산이다.
//
// 잘못돼도 페이지는 멀쩡히 뜬다. 링크를 붙였을 때 미리보기 이미지만 안 나오고,
// 그걸 알아차리려면 카카오톡·슬랙에 실제로 붙여봐야 한다. 그래서 눈으로 볼 수
// 없는 세 조건 — 절대 URL인가 · 파일이 실재하는가 · 크기가 1200x630인가 — 를
// 검사로 고정한다.
import { readFileSync } from "node:fs";
import path from "node:path";

import { SITE_ORIGIN, SITE_SHARE_IMAGE, SITE_TITLE } from "@/lib/site-meta";

const root = path.resolve(__dirname, "../../..");
const html = readFileSync(path.join(root, "src/app/+html.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("웹 셸의 공유 카드", () => {
  it("og:image 는 절대 URL 이다 (상대 경로는 크롤러가 무시한다)", () => {
    expect(SITE_SHARE_IMAGE).toMatch(/^https:\/\//);
    // 원본에 끝 슬래시가 붙으면 이미지 URL 이 `//og-image.png` 가 된다.
    expect(SITE_ORIGIN.endsWith("/")).toBe(false);
    expect(SITE_SHARE_IMAGE).toBe(`${SITE_ORIGIN}/og-image.png`);
  });

  it("셸이 그 상수를 쓰고, 주소를 손으로 박아두지 않는다", () => {
    expect(html).toContain('<meta property="og:image" content={SITE_SHARE_IMAGE} />');
    expect(html).toContain('<meta name="twitter:image" content={SITE_SHARE_IMAGE} />');
    // 1200x630 카드에 summary 를 쓰면 정사각형으로 잘린다.
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).not.toContain('content="https://simon-yhkim.github.io');
  });

  it("자산이 실재하고 선언한 크기와 같다", () => {
    const png = readFileSync(path.join(root, "public/og-image.png"));
    // PNG IHDR: 8바이트 시그니처 + 4길이 + 4타입 뒤에 너비·높이가 온다.
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect([width, height]).toEqual([1200, 630]);
    expect(html).toContain(`<meta property="og:image:width" content="${width}" />`);
    expect(html).toContain(`<meta property="og:image:height" content="${height}" />`);
    // 미리보기 스크레이퍼 상당수가 5MB 넘는 이미지를 그냥 버린다.
    expect(png.length).toBeLessThan(5 * 1024 * 1024);
  });

  it("카드 원본이 저장소에 있다 (이미지만 남으면 다시 못 만든다)", () => {
    const card = readFileSync(path.join(root, "design/og-card/og-card.html"), "utf8");
    // 별자리는 캐논에서 온 값이어야 한다 — 지극선(Merak → Dubhe → 북극성).
    const canon = JSON.parse(
      readFileSync(path.join(root, "design/proto_rev2/reference-app/data/core/constellation.json"), "utf8"),
    ) as { polarisGuide: string; lines: string[] };
    expect(card).toContain(canon.polarisGuide);
    canon.lines.forEach((line) => expect(card).toContain(line));
    // 문구는 site-meta 와 같아야 한다.
    expect(card).toContain(SITE_TITLE.split(" · ")[1]);
  });
});
