// `/capture` 의 bare 딥스페이스 화면과 share-target/mode query intake가
// 같은 route-level 인증 관문 뒤에 머무는지 소스 계약으로 지킨다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(join(__dirname, "..", "capture.tsx"), "utf8").replace(/\r\n/g, "\n");
const DEFAULT_EXPORT_START = SOURCE.indexOf("export default function Capture()");
const DEFAULT_EXPORT_END = SOURCE.indexOf("\nexport interface CaptureLegacyProps", DEFAULT_EXPORT_START);
const CAPTURE = SOURCE.slice(DEFAULT_EXPORT_START, DEFAULT_EXPORT_END);

describe("/capture 공통 인증 관문", () => {
  it("loading, signed-out, missing-profile 순서로 첫 deep-space 분기 전에 막는다", () => {
    const loadingAt = CAPTURE.indexOf("if (loading)");
    const signedOutAt = CAPTURE.indexOf('if (!userId) return <Redirect href="/sign-in" />;');
    const missingProfileAt = CAPTURE.indexOf(
      'if (hasProfile === false) return <Redirect href="/complete-profile" />;',
    );
    const deepSpaceAt = CAPTURE.indexOf("if (isDeepSpaceUI())");

    expect(CAPTURE).toContain("const { userId, loading, hasProfile } = useAuth();");
    expect(loadingAt).toBeGreaterThan(-1);
    expect(signedOutAt).toBeGreaterThan(loadingAt);
    expect(missingProfileAt).toBeGreaterThan(signedOutAt);
    expect(deepSpaceAt).toBeGreaterThan(missingProfileAt);
  });

  it("bare CaptureView와 query CaptureLegacy가 공통 관문 뒤에서만 갈린다", () => {
    const missingProfileAt = CAPTURE.indexOf(
      'if (hasProfile === false) return <Redirect href="/complete-profile" />;',
    );
    const queryBranchAt = CAPTURE.indexOf("if (hasFullCaptureParams || fullCaptureActive)");
    const queryIntakeAt = CAPTURE.indexOf("<CaptureLegacy embeddedInDock />");
    const bareCaptureAt = CAPTURE.indexOf("<CaptureView />");

    expect(queryBranchAt).toBeGreaterThan(missingProfileAt);
    expect(queryIntakeAt).toBeGreaterThan(queryBranchAt);
    expect(bareCaptureAt).toBeGreaterThan(queryBranchAt);
    expect(CAPTURE.split('href="/sign-in"').length - 1).toBe(1);
    expect(CAPTURE.split('href="/complete-profile"').length - 1).toBe(1);
  });
});
