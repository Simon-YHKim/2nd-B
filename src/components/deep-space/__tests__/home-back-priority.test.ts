import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHomeCoachmarkBackPriority } from "@/lib/nav/home-coachmark-back";
import { createPocketPhoneBackHandler } from "@/lib/nav/pocket-phone-back";

const read = (path: string) => readFileSync(`src/${path}`, "utf8");
const bools = [false, true];

describe("R3-3 home Back composition matrix", () => {
  test("all visibility, handset, focus, active and registration orders keep guide then phone then default", () => {
    for (const reversed of bools) for (const visible of bools) for (const raised of bools)
      for (const focused of bools) for (const active of bools) {
        const priority = createHomeCoachmarkBackPriority();
        const calls: string[] = [];
        let expanded = raised;
        const phone = createPocketPhoneBackHandler({
          isExpanded: () => expanded, isCoachmarkVisible: priority.isVisible,
          lower: () => { expanded = false; calls.push("phone"); },
        });
        const owner = visible && focused ? priority.claim(() => calls.push("coachmark")) : null;
        const handlers = [() => { calls.push("default"); return false; }];
        const overlays = [
          ...(focused && active ? [phone] : []), ...(owner ? [owner.back] : []),
        ];
        // Android calls newest first. Refocus can reverse the two registrations.
        handlers.push(...(reversed ? overlays.reverse() : overlays));
        const expected = [
          ...(visible && focused ? ["coachmark"] : []),
          ...(raised && focused && active ? ["phone"] : []),
        ];
        for (let press = 0; press < 3; press += 1) {
          const consumed = [...handlers].reverse().some(handler => handler());
          expect(consumed).toBe(press < expected.length);
          expect(calls[press]).toBe(expected[press] ?? "default");
        }
        owner?.release();
        expect(priority.isVisible()).toBe(false);
      }
  });

  test("blur, stale cleanup, refocus and same-frame second Back respect independent coachmark leases", () => {
    const priority = createHomeCoachmarkBackPriority();
    const finish = jest.fn();
    const first = priority.claim(finish);
    expect(priority.isVisible()).toBe(true);
    first.release();
    expect(priority.isVisible()).toBe(false);
    expect(first.back()).toBe(false);
    const second = priority.claim(finish);
    first.release();
    expect(priority.isVisible()).toBe(true);
    expect(second.back()).toBe(true);
    expect(priority.isVisible()).toBe(false);
    expect(second.back()).toBe(false);
    expect(finish).toHaveBeenCalledTimes(1);
    second.release();
    expect(priority.isVisible()).toBe(false);
  });

  test("the focused coachmark publishes its lease and both dismiss paths release it before React unmounts", () => {
    const source = read("components/deep-space/HomeCoachmarks.tsx");
    const effect = source.slice(source.indexOf("useFocusEffect(useCallback("), source.indexOf("\n  return ("));
    expect(source).toContain('import { homeCoachmarkBack } from "@/lib/nav/home-coachmark-back"');
    expect(effect).toContain("const owner = homeCoachmarkBack.claim(finish)");
    expect(effect).toContain("backOwner.current = owner");
    expect(effect).toContain('BackHandler.addEventListener("hardwareBackPress", owner.back)');
    expect(effect).toMatch(/return \(\) => \{\s*owner.release\(\);\s*sub.remove\(\);/);
    expect(effect).toContain("[finish]");
    expect(source).toMatch(/backOwner.current\?\.release\(\);\s*markCoachmarksSeen\(ownerId\);/);
    expect(source).toContain("onSkip={finish}");
    const phone = read("components/deep-space/PocketPhone.tsx");
    expect(phone).toContain("import { homeCoachmarkBack } from '@/lib/nav/home-coachmark-back'");
    expect(phone).toContain("isCoachmarkVisible: homeCoachmarkBack.isVisible");
    const phoneEffect = phone.slice(phone.indexOf("useFocusEffect(useCallback("), phone.indexOf("  const activate"));
    expect(phoneEffect).toContain("if (Platform.OS !== 'android' || !active) return;");
    expect(phoneEffect).toContain("return () => sub.remove()");
    expect(phoneEffect).toContain("[active, settle]");
  });

  test("the complete registration inventory preserves other home owners and their separation", () => {
    const inventory: Record<string, number> = {
      "app/+not-found.tsx": 1, "app/capture.tsx": 1, "app/onboarding.tsx": 1, "app/people.tsx": 2,
      // The native lock consumes Back while covered; its lifecycle is exercised
      // by device-lock-gate.test.ts without replacing the home owners below.
      "components/auth/DeviceLockGate.tsx": 1,
      "components/dashboard/DashboardPhone.tsx": 1,
      "components/deep-space/DeepSpaceScreen.tsx": 1, "components/deep-space/HomeCoachmarks.tsx": 1,
      "components/deep-space/PocketPhone.tsx": 1, "components/deep-space/StarCapture.tsx": 1,
      "components/deep-space/StarDestination.tsx": 1, "lib/auth/useSignInForm.ts": 1,
      "lib/auth/useSignUpForm.ts": 1, "lib/nav/phone-embed.tsx": 1,
      "screens/deepspace/dds-auth-screens.tsx": 1, "screens/deepspace/museum/MuseumTimelineScreen.tsx": 1,
    };
    const files = execFileSync("git", ["grep", "-l", "hardwareBackPress", "--", "src", ":(exclude)**/__tests__/**"], { encoding: "utf8" }).trim().split(/\r?\n/);
    const actual: Record<string, number> = {};
    for (const file of files) {
      const count = readFileSync(file, "utf8").match(/BackHandler\.addEventListener\(['"]hardwareBackPress['"]/g)?.length ?? 0;
      if (count) actual[file.slice(4)] = count;
    }
    expect(actual).toEqual(inventory);
    const home = read("components/deep-space/ConstellationHome.tsx");
    expect(home).toMatch(/\{!visualFocusId \? \([\s\S]*?<PocketPhone[\s\S]*?active=\{homeFocused\}/);
    expect(home).toMatch(/\{visualFocusId \? \(\s*<StarDestination\s+active=\{focusedId !== null\}/);
    expect(home).toMatch(/\{homeFocused && visualFocusId \? \(\s*<StarCapture[\s\S]*?active=\{captureId === visualFocusId\}/);
    expect(home.indexOf("<StarDestination")).toBeLessThan(home.indexOf("<StarCapture"));
    expect(read("components/deep-space/StarCapture.tsx")).toMatch(/if \(!active\) return;\s*if \(reducedMotion\)/);
    expect(read("components/deep-space/StarDestination.tsx")).toMatch(/if \(!active\) return;\s*const back = BackHandler/);
    expect(read("components/deep-space/DeepSpaceScreen.tsx")).toContain('if (active === "home" || !TABS.includes(active)) return;');
    const dashboard = read("components/dashboard/DashboardPhone.tsx");
    expect(dashboard).toMatch(/useFocusEffect\(useCallback\(\(\) => \{\s*if \(museumOpen\) return;/);
    expect(dashboard).toContain("for (let i = claimedBack.current.length - 1; i >= 0; i -= 1) if (claimedBack.current[i]()) return true;");
    expect(read("lib/nav/phone-embed.tsx")).toMatch(/useFocusEffect\(useCallback\(\(\) => \{\s*if \(embed\) return embed.claimBack\(handler\);/);
    expect(read("components/deep-space/DeepSpaceShell.tsx")).toMatch(/\{coachmarksDue === true \? \(\s*<HomeCoachmarks/);
  });
});
