import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "..", "ConstellationHome.tsx"), "utf8");

describe("별자리 홈 상단 알림 전광판", () => {
  it("공지 센터의 실제 제목을 사용하고 같은 공지를 열 수 있다", () => {
    expect(source).toContain("manualNotice.title[");
    expect(source).toMatch(/<NoticeTicker[\s\S]*?text=\{tickerText\}[\s\S]*?onPress=\{openNotice\}/);
  });

  it("모션 줄이기에서는 움직이는 텍스트 대신 정지된 문장을 보여준다", () => {
    expect(source).toMatch(/reducedMotion \? \([\s\S]*?<Text[\s\S]*?numberOfLines=\{1\}/);
  });

  it("한 번 지나간 뒤에도 오른쪽에서 다시 시작한다", () => {
    expect(source).toContain("offset.setValue(startX)");
    expect(source).toContain("if (active && finished) run()");
  });
});

describe("별 광채의 선명한 윤곽", () => {
  it("도메인 별과 북극성 모두 디더 아래에 불투명한 바탕을 그린다", () => {
    expect(source).toContain("fill={DOMAIN_HALO_BASE}");
    expect(source).toContain("fill={POLARIS_HALO_BASE}");
    expect(source).toContain("ladderDitherCells(i + 1)");
  });
});
