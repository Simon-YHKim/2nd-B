// REQ-260824-01: a vendor that stops working has to reach a person.
//
// The case that motivated it: xai's secret was present, the API answered 403,
// refresh reported success, and the log said "XAI_API_KEY 가 없어 건너뜀". Three
// separate things went wrong there and only one was the missing loop entry:
//
//   1. the failure did not fail the job, so nothing was emailed;
//   2. the message named the wrong cause, so reading the log misled;
//   3. the whole run still reported success, so the summary agreed with the
//      wrong message.
//
// The hardest part of this is NOT detecting failure. It is not crying wolf:
// xai will keep returning 403 until Simon funds it, and a job that is red every
// night is a job nobody opens. That is what the acknowledge list is for, and
// why an acknowledged failure is still printed.

import { alertsFor, type VendorStatus, type SeatOutcome } from "../refresh-models";

const st = (entries: [string, VendorStatus][]) =>
  new Map(entries as [Parameters<typeof alertsFor>[0] extends ReadonlyMap<infer K, unknown> ? K : never, VendorStatus][]);

const seat = (s: string, vendor: string, applied: boolean, reason?: string) =>
  ({ seat: s, vendor, applied, reason }) as unknown as SeatOutcome;

describe("a key that is present and does not work is an alert", () => {
  test("the xai case fails the job", () => {
    const v = alertsFor(st([["xai", { kind: "list_failed", why: "xai 403" }]]), [], []);
    expect(v.failures).toEqual(["xai: 모델 목록 조회 실패 - xai 403"]);
    expect(v.acknowledged).toEqual([]);
  });

  test("the reason travels with it, so the log does not have to be believed twice", () => {
    const v = alertsFor(st([["openai", { kind: "list_failed", why: "HTTP 401 invalid api key" }]]), [], []);
    expect(v.failures[0]).toContain("HTTP 401 invalid api key");
  });
});

describe("a vendor nobody configured is not an alert", () => {
  test("no_key stays quiet", () => {
    // Deliberately unconfigured. Turning an intended state red every night is
    // how a job stops being read.
    const v = alertsFor(st([["xai", { kind: "no_key" }]]), [], []);
    expect(v.failures).toEqual([]);
    expect(v.acknowledged).toEqual([]);
  });

  test("and its seats do not alert either", () => {
    const v = alertsFor(
      st([["xai", { kind: "no_key" }]]),
      [seat("xai-frontier", "xai", false, "XAI_API_KEY 미설정")],
      [],
    );
    expect(v.failures).toEqual([]);
  });
});

describe("a seat that did not apply is an alert", () => {
  test("a smoke-test failure surfaces", () => {
    // A model was found and does not work. That is the case where "promotion
    // succeeded" and a seat silently keeps an old model.
    const v = alertsFor(
      st([["openai", { kind: "ok", models: ["gpt-5.6-terra"] }]]),
      [seat("openai-frontier", "openai", false, "HTTP 400 unsupported parameter")],
      [],
    );
    expect(v.failures).toEqual(["openai-frontier: 좌석 미적용 - HTTP 400 unsupported parameter"]);
  });

  test("a class with no matching model surfaces", () => {
    // The shape of the gpt-5.6 tier bug: the run reported success while a seat
    // quietly matched nothing for weeks.
    const v = alertsFor(
      st([["openai", { kind: "ok", models: ["gpt-5.5"] }]]),
      [seat("openai-sol", "openai", false, "등급에 맞는 모델 없음")],
      [],
    );
    expect(v.failures).toHaveLength(1);
    expect(v.failures[0]).toContain("openai-sol");
  });

  test("an applied seat is silent", () => {
    const v = alertsFor(
      st([["openai", { kind: "ok", models: ["gpt-5.6-terra"] }]]),
      [seat("openai-frontier", "openai", true)],
      [],
    );
    expect(v.failures).toEqual([]);
  });
});

describe("one cause is reported once", () => {
  test("a failed vendor does not also report each of its seats", () => {
    // Four seats on one dead vendor is one problem, not five. A verdict that
    // repeated it would bury the other vendors' real failures underneath.
    const v = alertsFor(
      st([["xai", { kind: "list_failed", why: "xai 403" }]]),
      [
        seat("xai-frontier", "xai", false, "xai 목록 조회 실패"),
        seat("xai-second", "xai", false, "xai 목록 조회 실패"),
      ],
      [],
    );
    expect(v.failures).toHaveLength(1);
    expect(v.failures[0]).toContain("모델 목록 조회 실패");
  });
});

describe("the acknowledge list keeps the alert worth reading", () => {
  test("an acknowledged vendor does not fail the job", () => {
    // xai stays 403 until it is funded. Red every night = read never.
    const v = alertsFor(st([["xai", { kind: "list_failed", why: "xai 403" }]]), [], ["xai"]);
    expect(v.failures).toEqual([]);
    expect(v.acknowledged).toHaveLength(1);
  });

  test("but it is still reported, because being forgotten was the original bug", () => {
    const v = alertsFor(st([["xai", { kind: "list_failed", why: "xai 403" }]]), [], ["xai"]);
    expect(v.acknowledged[0]).toContain("xai 403");
  });

  test("acknowledging one vendor does not silence another", () => {
    const v = alertsFor(
      st([
        ["xai", { kind: "list_failed", why: "403" }],
        ["openai", { kind: "list_failed", why: "401" }],
      ]),
      [],
      ["xai"],
    );
    expect(v.failures).toHaveLength(1);
    expect(v.failures[0]).toContain("openai");
    expect(v.acknowledged).toHaveLength(1);
  });

  test("the list tolerates the shapes an env var actually arrives in", () => {
    // "" splits to [""], and a human writes " xai , openai ".
    for (const acked of [[""], [" xai "], ["XAI"], ["xai", ""]]) {
      const v = alertsFor(st([["xai", { kind: "list_failed", why: "403" }]]), [], acked);
      const silenced = v.failures.length === 0;
      expect(silenced).toBe(acked.some((a) => a.trim().toLowerCase() === "xai"));
    }
  });
});
