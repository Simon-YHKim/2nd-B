// KakaoTalk relation signals (연동 P0③): pseudonymous frequency/recency
// aggregation — names go in, only subject keys come out.

import { aggregateRelationSignals, parseKakaoExport } from "../kakao";
import { buildProposals } from "../proposals";
import { subjectKeyFor } from "../../relation/star-alias";

function line(day: number, sender: string, text: string): string {
  return `2026년 7월 ${day}일 오후 3:0${day % 10}, ${sender} : ${text}`;
}

const EXPORT = [
  "홍길동님과 카카오톡 대화",
  "저장한 날짜 : 2026-07-18",
  // 지수: 6 messages over 4 distinct days in a ~14-day span -> weekly-ish
  line(1, "지수", "산 책 갈까"),
  line(1, "지수", "좋아"),
  line(3, "지수", "내일 봐"),
  line(7, "지수", "사진 보냈어"),
  line(7, "지수", "확인해줘"),
  line(14, "지수", "고마워"),
  // 민준: exactly at the 3-message noise floor
  line(2, "민준", "ㅎㅎ"),
  line(9, "민준", "그때 보자"),
  line(9, "민준", "응"),
  // 드라이브-바이 sender: below the floor, must be dropped
  line(5, "스팸봇", "광고입니다"),
] .join("\n");

describe("aggregateRelationSignals", () => {
  const signals = aggregateRelationSignals(parseKakaoExport(EXPORT));

  test("aggregates per sender above the noise floor, keyed pseudonymously", () => {
    expect(signals).toHaveLength(2);
    const jisu = signals.find((s) => s.subjectKey === subjectKeyFor("지수"));
    const minjun = signals.find((s) => s.subjectKey === subjectKeyFor("민준"));
    expect(jisu).toMatchObject({ messageCount: 6, activeDays: 4 });
    expect(minjun).toMatchObject({ messageCount: 3, activeDays: 2 });
    expect(jisu!.firstIso!.slice(0, 7)).toBe("2026-07");
    expect(jisu!.lastIso! > jisu!.firstIso!).toBe(true);
  });

  test("no raw sender name survives into the output (PIPA 가명화)", () => {
    const serialized = JSON.stringify(signals);
    for (const name of ["지수", "민준", "스팸봇", "홍길동"]) {
      expect(serialized).not.toContain(name);
    }
  });

  test("cadence bands are deterministic", () => {
    for (const s of signals) {
      expect(["daily", "weekly", "monthly", "rarely"]).toContain(s.cadence);
    }
  });
});

describe("buildProposals kakao outcome", () => {
  test("carries relationSignals alongside the appointment proposals", () => {
    const outcome = buildProposals("kakao", EXPORT);
    expect(outcome.relationSignals?.length).toBe(2);
    // Appointment hints are unaffected by the new aggregation.
    expect(outcome.summary.raw).toBe(0);
  });

  test("non-kakao kinds carry no relation signals", () => {
    const outcome = buildProposals("ics", "BEGIN:VCALENDAR\nEND:VCALENDAR");
    expect(outcome.relationSignals).toBeUndefined();
  });
});
