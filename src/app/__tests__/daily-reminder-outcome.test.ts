import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// 리마인더를 껐는데 계속 온다.
//
// `cancelDailyReview()` 는 던지지 않고 `DailyReviewResult` 를 돌려준다:
//   "cancelled"    OS 예약을 실제로 취소했다
//   "unavailable"  웹/Expo Go - 애초에 예약이 없다
//   "error"        취소가 던졌다. **OS 예약은 그대로 남아 있다**
//
// ⚠ 끄는 분기가 그 값을 버리고 무조건 화면과 설정을 off 로 바꾼다:
//
//   } else {
//     await cancelDailyReview();
//     setReminderOn(false);
//     setDailyReviewEnabledPref(false);
//   }
//
// 그러면 사용자가 끈 알림이 **매일 계속 옵니다.** 화면은 꺼졌다고 말하고,
// 다시 켜서 끄는 것 말고는 되돌릴 방법이 없습니다.
//
// ⚠ **바로 위 켜는 분기는 같은 종류의 결과를 읽고 있다** - `res === "scheduled"`
// 일 때만 켜고 `"denied"` 면 안내를 띄운다. 같은 `if/else` 의 한쪽만 읽는다.
//
// 시각 변경(`pickReminderHour`)도 같다: 시각을 상태와 설정에 **먼저** 쓰고
// 재예약 결과를 버린다. 실패하면 화면은 새 시각을, OS 는 옛 시각을 갖는다.
const FILE = "src/app/digest.tsx";
const LOCALES = ["en", "ko", "es", "pt", "id"] as const;

function callback(name: string, context: Record<string, unknown>) {
  const source = fs.readFileSync(path.join(process.cwd(), FILE), "utf8");
  const ast = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression = "";
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name
      && node.initializer && ts.isCallExpression(node.initializer)) {
      expression = node.initializer.arguments[0]!.getText(ast);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!expression) throw new Error(`${name} 선언을 찾지 못했다`);
  const js = ts.transpileModule(`const run = (${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(context), `${js}\nreturn run;`)(...Object.values(context)) as
    (arg: never) => Promise<void>;
}

interface Options {
  cancel?: string;
  schedule?: string;
  hourNow?: number;
  reminderOn?: boolean;
}

function harness(name: "toggleReminder" | "pickReminderHour", options: Options = {}) {
  const calls = {
    on: [] as boolean[],
    enabledPref: [] as boolean[],
    hour: [] as number[],
    hourPref: [] as number[],
    denied: [] as boolean[],
    failed: [] as boolean[],
  };
  const context: Record<string, unknown> = {
    reminderHour: options.hourNow ?? 9,
    reminderOn: options.reminderOn ?? true,
    setReminderBusy: () => undefined,
    setReminderDenied: (v: boolean) => { if (v) calls.denied.push(v); },
    setReminderFailed: (v: boolean) => { if (v) calls.failed.push(v); },
    setReminderOn: (v: boolean) => { calls.on.push(v); },
    setDailyReviewEnabledPref: (v: boolean) => { calls.enabledPref.push(v); },
    setReminderHour: (v: number) => { calls.hour.push(v); },
    setDailyReviewHourPref: (v: number) => { calls.hourPref.push(v); },
    t: (key: string) => key,
    scheduleDailyReview: async () => options.schedule ?? "scheduled",
    cancelDailyReview: async () => options.cancel ?? "cancelled",
  };
  return { run: callback(name, context), calls };
}

const bundle = (code: string) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), "locales", code, "ratifications.json"), "utf8"))
    .digest.reminder as Record<string, string>;

describe("리마인더 끄기", () => {
  test("취소되면 끈다", async () => {
    const screen = harness("toggleReminder", { cancel: "cancelled" });
    await screen.run(false as never);
    expect(screen.calls.on).toEqual([false]);
    expect(screen.calls.enabledPref).toEqual([false]);
    expect(screen.calls.failed).toEqual([]);
  });

  test("웹·Expo Go 처럼 예약 자체가 없으면 그냥 끈다", async () => {
    // "unavailable" 은 실패가 아니다. 여기서 실패로 세면 알림을 못 쓰는 환경에서
    // 토글이 영원히 안 꺼진다.
    const screen = harness("toggleReminder", { cancel: "unavailable" });
    await screen.run(false as never);
    expect(screen.calls.on).toEqual([false]);
    expect(screen.calls.failed).toEqual([]);
  });

  test("취소가 실패하면 껐다고 말하지 않는다 - 알림은 그대로 온다", async () => {
    const screen = harness("toggleReminder", { cancel: "error" });
    await screen.run(false as never);
    expect(screen.calls.on).toEqual([]);
    expect(screen.calls.enabledPref).toEqual([]);
    expect(screen.calls.failed.length).toBeGreaterThan(0);
  });
});

describe("리마인더 켜기 - 지금까지 그대로", () => {
  test("예약되면 켠다", async () => {
    const screen = harness("toggleReminder", { schedule: "scheduled" });
    await screen.run(true as never);
    expect(screen.calls.on).toEqual([true]);
    expect(screen.calls.enabledPref).toEqual([true]);
  });

  test("권한이 거부되면 켜지 않고 안내한다", async () => {
    const screen = harness("toggleReminder", { schedule: "denied" });
    await screen.run(true as never);
    expect(screen.calls.on).toEqual([]);
    expect(screen.calls.denied.length).toBeGreaterThan(0);
  });
});

describe("시각 변경", () => {
  test("재예약되면 새 시각을 남긴다", async () => {
    const screen = harness("pickReminderHour", { hourNow: 9, schedule: "scheduled" });
    await screen.run(21 as never);
    expect(screen.calls.hour).toEqual([21]);
    expect(screen.calls.hourPref).toEqual([21]);
    expect(screen.calls.failed).toEqual([]);
  });

  test("재예약이 실패하면 옛 시각으로 되돌린다 - OS 가 갖고 있는 것이 그것이다", async () => {
    const screen = harness("pickReminderHour", { hourNow: 9, schedule: "error" });
    await screen.run(21 as never);
    expect(screen.calls.hour.at(-1)).toBe(9);
    expect(screen.calls.hourPref.at(-1)).toBe(9);
    expect(screen.calls.failed.length).toBeGreaterThan(0);
  });

  test("예약을 지원하지 않는 환경이면 되돌리지 않는다 - 반박할 OS 예약이 없다", async () => {
    // 웹·Expo Go. "unavailable" 을 실패로 세면 사용자가 고른 시각이 튕겨 나간다.
    const screen = harness("pickReminderHour", { hourNow: 9, schedule: "unavailable" });
    await screen.run(21 as never);
    expect(screen.calls.hour).toEqual([21]);
    expect(screen.calls.failed).toEqual([]);
  });

  test("꺼져 있으면 재예약하지 않고 시각만 저장한다", async () => {
    const screen = harness("pickReminderHour", { hourNow: 9, reminderOn: false });
    await screen.run(21 as never);
    expect(screen.calls.hour).toEqual([21]);
    expect(screen.calls.failed).toEqual([]);
  });
});

describe("문구", () => {
  test("새 문구가 5개 로케일에 다 있고 영어 거울이 아니다", () => {
    const en = bundle("en").changeFailed;
    expect(typeof en).toBe("string");
    for (const code of LOCALES) {
      const value = bundle(code).changeFailed;
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
      // 이 번들은 네 언어가 전부 실제 번역이다(실측: EN 과 0% 동일).
      if (code !== "en") expect(value).not.toBe(en);
    }
  });

  test("권한 안내와 다른 문구다 - 두 사실을 한 줄로 합치지 않는다", () => {
    // "권한이 꺼져 있다" 와 "끄지 못했다" 는 사용자가 할 행동이 다르다.
    for (const code of LOCALES) {
      const copy = bundle(code);
      expect(copy.changeFailed).not.toBe(copy.denied);
    }
  });
});
