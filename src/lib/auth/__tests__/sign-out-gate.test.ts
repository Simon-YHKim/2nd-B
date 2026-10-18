import { createSignOutGate } from "../sign-out-gate";

describe("sign-out gate (Q-261018-50, review #2625 r2)", () => {
  test("two presses that overlap while the session is being read start one flow", () => {
    const gate = createSignOutGate();
    expect(gate.tryCapture()).toBe(true);
    expect(gate.tryCapture()).toBe(false);
    expect(gate.phase).toBe("capturing");
  });

  test("a confirm runs only for an open dialog, and only once", () => {
    const gate = createSignOutGate();
    expect(gate.tryRun()).toBe(false);
    gate.tryCapture();
    expect(gate.tryRun()).toBe(false);
    gate.confirming();
    expect(gate.tryRun()).toBe(true);
    expect(gate.tryRun()).toBe(false);
    expect(gate.tryCapture()).toBe(false);
  });

  test("closing the dialog without confirming lets the next press start again", () => {
    const gate = createSignOutGate();
    gate.tryCapture();
    gate.confirming();
    gate.cancelConfirm();
    expect(gate.phase).toBe("idle");
    expect(gate.tryCapture()).toBe(true);
  });

  test("cancel does not stop a sign-out that is already running", () => {
    const gate = createSignOutGate();
    gate.tryCapture();
    gate.confirming();
    gate.tryRun();
    gate.cancelConfirm();
    expect(gate.phase).toBe("running");
  });

  test("a failure releases the gate", () => {
    const gate = createSignOutGate();
    gate.tryCapture();
    gate.release();
    expect(gate.tryCapture()).toBe(true);
    gate.confirming();
    gate.tryRun();
    gate.release();
    expect(gate.phase).toBe("idle");
  });
});
