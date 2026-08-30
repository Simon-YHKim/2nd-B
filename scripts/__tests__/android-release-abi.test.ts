import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const root = path.resolve(__dirname, "../..");
const workflowPath = path.join(root, ".github/workflows/android-release.yml");
const workflow = fs.readFileSync(workflowPath, "utf8").replace(/\r\n?/g, "\n");

type AndroidReleaseWorkflow = {
  on?: {
    workflow_dispatch?: {
      inputs?: {
        android_abi?: {
          description?: string;
          required?: boolean;
          default?: string;
          type?: string;
          options?: string[];
        };
      };
    };
  };
  jobs?: {
    build?: {
      env?: Record<string, string>;
      steps?: Array<{
        name?: string;
        env?: Record<string, string>;
        run?: string;
      }>;
    };
  };
};

describe("Android diagnostic ABI workflow", () => {
  it("offers an allowlisted x86_64 dispatch while keeping arm64-v8a as the default", () => {
    const parsed = parse(workflow) as AndroidReleaseWorkflow;
    const input = parsed.on?.workflow_dispatch?.inputs?.android_abi;

    expect(input).toEqual(
      expect.objectContaining({
        required: false,
        default: "arm64-v8a",
        type: "choice",
        options: ["arm64-v8a", "x86_64"],
      }),
    );
    expect(parsed.jobs?.build?.env?.ANDROID_ABI_FILTER).toBe(
      "${{ github.event_name == 'workflow_dispatch' && inputs.android_abi == 'x86_64' && 'x86_64' || 'arm64-v8a' }}",
    );
  });

  it("fails before upload unless the APK contains exactly the selected ABI", () => {
    const parsed = parse(workflow) as AndroidReleaseWorkflow;
    const steps = parsed.jobs?.build?.steps ?? [];
    const verifyStep = steps.find((step) => step.name === "Verify diagnostic APK ABI");

    expect(verifyStep?.env?.SELECTED_ABI).toBe("${{ env.ANDROID_ABI_FILTER }}");
    expect(verifyStep?.run).toContain('unzip -Z1 "${{ steps.collect.outputs.apk }}"');
    expect(verifyStep?.run).toContain('${#ABIS[@]}" -ne 1');
    expect(verifyStep?.run).toContain('${ABIS[0]:-}" != "$SELECTED_ABI"');
    expect(verifyStep?.run).toContain("exit 1");

    const verifyIndex = steps.indexOf(verifyStep!);
    const uploadIndex = steps.findIndex((step) => step.name === "Upload workflow artifacts");
    expect(verifyIndex).toBeGreaterThan(-1);
    expect(uploadIndex).toBeGreaterThan(verifyIndex);
  });
});
