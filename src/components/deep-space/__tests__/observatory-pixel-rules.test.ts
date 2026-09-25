import { readFileSync } from "node:fs";
import { join } from "node:path";

const destination = readFileSync(join(__dirname, "..", "StarDestination.tsx"), "utf8");
const controls = readFileSync(join(__dirname, "..", "TelescopeControls.tsx"), "utf8");
const capture = readFileSync(join(__dirname, "..", "StarCapture.tsx"), "utf8");
const home = readFileSync(join(__dirname, "..", "ConstellationHome.tsx"), "utf8");

describe("observatory PIXEL-CLAY regression", () => {
  test('camera remote stops across lifecycle boundaries without subscribing to Android blur on web', () => {
    expect(controls).toContain("Platform.OS === 'android' ? AppState.addEventListener('blur', failSafeStop) : undefined");
    expect(controls).toContain("window.addEventListener('blur', failSafeStop)");
    expect(controls).toContain("window.addEventListener('pointercancel', failSafeStop)");
    expect(controls).toContain("document.addEventListener('visibilitychange', visibility)");
    expect(controls).toContain("if (!enabled) failSafeStop()");
    expect(controls).toContain("remote.stop(); knob.stopAnimation()");
    expect(controls).toContain("if (held.current) aim(");
    expect(controls).toContain("if (sliderHeld.current) remote.setZoom(");
  });

  test("the destination uses duration-scaled steps while retaining reduced motion", () => {
    expect(destination).toContain("pixelStepsFor(duration)");
    expect(destination).not.toMatch(/\bEasing\./);
    expect(destination).toContain('if (reducedMotion) { progress.setValue(active ? 1 : 0); done(); return; }');
    expect(destination).toContain('runCameraSequence(active ? CAMERA_APPROACH : CAMERA_RETURN');
  });

  test('camera reversal releases its audio and cancels stale focus locks', () => {
    expect(destination).toContain('<CameraTransition key={`${active}:${reducedMotion}`}');
    expect(destination).toContain('return runCameraSequence(');
    expect(destination).toContain('reducedMotion ? null : <CameraCue key={phase} phase={phase} />');
    expect(destination).not.toContain('setTimeout');
  });

  test('travel waits for a single completed exposure and cancels on lifecycle changes', () => {
    expect(capture).toContain('runCameraSequence(CAMERA_SHUTTER');
    expect(capture).toContain('live = false; stop()');
    expect(capture).toContain("Platform.OS === 'android' ? AppState.addEventListener('blur', cancel) : undefined");
    expect(capture).toContain("window.addEventListener('blur', cancel)");
    expect(capture).toContain("document.addEventListener('visibilitychange', visibility)");
    expect(capture).toContain('if (reducedMotion) { callbacks.current.onComplete(); return; }');
    expect(capture).not.toContain('setTimeout');
    expect(home).toContain('!cameraReady || captureId !== null');
    expect(home).toContain('if (!captureLock.current || !homeActive.current) return');
    expect(home).toContain('{homeFocused && captureId ? (');
  });

  test.each([
    ["destination name", destination, "name", 24],
    ["telescope labels", controls, "caption", 12],
  ] as const)("%s uses a native Galmuri multiple", (_label, source, style, size) => {
    const block = source.match(new RegExp(`\\b${style}:\\s*\\{([^}]+)\\}`))?.[1];
    expect(block).toMatch(/fontFamily:\s*m3\.font\.(?:brand|mono)/);
    expect(block).toMatch(new RegExp(`fontSize:\\s*${size}\\b`));
  });
});
