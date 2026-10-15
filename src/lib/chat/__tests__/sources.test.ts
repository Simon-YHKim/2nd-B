import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatSourceCitationLabel, parseSourceCitations, sourceCitationDisplay } from "../sources";
import { chatDisplayText } from "../display-text";
import { buildSourcePayload } from "@/lib/wiki/ingest-helpers";

describe("parseSourceCitations", () => {
  test("returns no chips when there are no citations", () => {
    const r = parseSourceCitations("Just a plain reply.");
    expect(r.chips).toEqual([]);
    expect(r.display).toBe("Just a plain reply.");
  });

  test("extracts a single citation and renders a friendly label in display", () => {
    const r = parseSourceCitations("This echoes [[morning-pages]] from your notes.");
    expect(r.chips).toEqual(["morning-pages"]);
    expect(r.display).toBe("This echoes Morning Pages from your notes.");
  });

  test("de-duplicates repeated slugs but keeps first-seen order", () => {
    const r = parseSourceCitations("[[a]] then [[b]] then [[a]] again.");
    expect(r.chips).toEqual(["a", "b"]);
  });

  test("trims whitespace inside the brackets", () => {
    const r = parseSourceCitations("see [[  spaced-slug  ]] here");
    expect(r.chips).toEqual(["spaced-slug"]);
    expect(r.display).toBe("see Spaced Slug here");
  });

  test("handles Korean slugs", () => {
    const r = parseSourceCitations("그건 [[아침-기록]] 조각에서 왔어요.");
    expect(r.chips).toEqual(["아침-기록"]);
    expect(r.display).toBe("그건 아침 기록 조각에서 왔어요.");
  });

  test("ignores empty brackets", () => {
    const r = parseSourceCitations("nothing [[]] here");
    expect(r.chips).toEqual([]);
  });

  test("formats source labels without changing the stored slug", () => {
    expect(formatSourceCitationLabel("big-five_notes")).toBe("Big Five Notes");
    expect(formatSourceCitationLabel("민지의-성장-노트")).toBe("민지의 성장 노트");
  });
});

describe("sourceCitationDisplay (bubble only)", () => {
  test("corrects the reported sentence without changing legacy text or chip identities", () => {
    const raw = "이 답은 관련 위키 기록 [[untitled]]와 소스의 자기 이해 기록을 보고 말씀드렸습니다.";
    expect(sourceCitationDisplay(raw, "기록")).toBe("이 답은 관련 위키 기록과 소스의 자기 이해 기록을 보고 말씀드렸습니다.");
    expect(parseSourceCitations(raw)).toEqual({
      display: "이 답은 관련 위키 기록 Untitled와 소스의 자기 이해 기록을 보고 말씀드렸습니다.",
      chips: ["untitled"],
    });
  });

  describe.each([
    ["untitled", "기록", "기록", true],
    ["untitled", "메모", "메모", false],
    ["아침-기록", "기록", "아침 기록", true],
    ["자기-이해", "기록", "자기 이해", false],
  ] as const)("changed name %s → %s / %s", (slug, fallback, label, hasJong) => {
    test.each([
      ["과", "와"], ["을", "를"], ["은", "는"],
      ["이", "가"], ["으로", "로"], ["이나", "나"],
    ])("selects %s/%s after the replacement", (withJong, withoutJong) => {
      const wrong = hasJong ? withoutJong : withJong;
      const correct = hasJong ? withJong : withoutJong;
      expect(sourceCitationDisplay(`[[${slug}]]${wrong} 이어집니다.`, fallback)).toBe(`${label}${correct} 이어집니다.`);
      expect(sourceCitationDisplay(`[[${slug}]]${correct} 이어집니다.`, fallback)).toBe(`${label}${correct} 이어집니다.`);
    });
  });

  test.each([
    ["[[나의-서울]]으로 갑니다.", "나의 서울로 갑니다."],
    ["[[기록-1]]으로 갑니다.", "기록 1로 갑니다."],
    ["[[untitled]]와", "기록과"],
    ["[[untitled]]와, 이어집니다.", "기록과, 이어집니다."],
    ["[[untitled]]와。", "기록과。"],
    ["[[untitled]]와\n다음 줄", "기록과\n다음 줄"],
    ["[[untitled]]와\t다음", "기록과\t다음"],
    ["‘[[untitled]]와’", "‘기록과’"],
    ["「[[untitled]]와」", "「기록과」"],
    ["『[[untitled]]와』", "『기록과』"],
    ["[[untitled]]와/", "기록과/"],
    ["[[untitled]]와·", "기록과·"],
    ["[[untitled-deadbeef]]와 봅니다.", "기록과 봅니다."],
    ["[[아침-기록]]와 [[자기-이해]]을 봅니다.", "아침 기록과 자기 이해를 봅니다."],
    ["[[a]], [[아침-기록]]와 봅니다.", "A, 아침 기록과 봅니다."],
    ["기록 [[untitled]]와 메모 [[자기-이해]]을 봅니다.", "기록과 메모 자기 이해를 봅니다."],
  ])("uses known sounds and particle boundaries: %j", (raw, expected) => {
    expect(sourceCitationDisplay(raw, "기록")).toBe(expected);
  });

  test.each([
    "이야기", "가다", "가나다", "이나마", "으로부터", "로서", "을지", "는지",
    "와함께", "과정", "은빛", "나무", "가A", "가1", "가_내용", "가＿내용", "와🙂", "와\u0301",
    " 와 함께", "\t와 함께", "\n와 함께",
  ])("does not mistake a following word or detached particle for josa: %j", suffix => {
    expect(sourceCitationDisplay(`[[untitled]]${suffix}`, "기록")).toBe(`기록${suffix}`);
  });

  test.each([
    ["[[기록]]와 봅니다.", "기록와 봅니다."],
    ["[[  기록  ]]와 봅니다.", "기록와 봅니다."],
    ["[[자기 이해]]을 봅니다.", "자기 이해을 봅니다."],
    ["[[english-study]]은 참고합니다.", "English Study은 참고합니다."],
    ["[[notes-🙂]]은 참고합니다.", "notes 🙂은 참고합니다."],
  ])("leaves unchanged names and undecidable sounds alone: %j", (raw, expected) => {
    expect(sourceCitationDisplay(raw, "기록")).toBe(expected);
  });

  test.each([
    ["기록 [[untitled]]와 봅니다.", "기록과 봅니다."],
    ["기록 [[untitled-deadbeef]]를 봅니다.", "기록을 봅니다."],
    ["앞의 기록 [[ Untitled ]]는 이어집니다.", "앞의 기록은 이어집니다."],
    ["(기록 [[untitled]]와)", "(기록과)"],
    ["기록 [[기록]]과 봅니다.", "기록 기록과 봅니다."],
    ["기록 [[아침-기록]]와 봅니다.", "기록 아침 기록과 봅니다."],
    ["기록 [[untitled-notes]]와 봅니다.", "기록 Untitled Notes와 봅니다."],
    ["앞기록 [[untitled]]와 봅니다.", "앞기록 기록과 봅니다."],
    ["1기록 [[untitled]]와 봅니다.", "1기록 기록과 봅니다."],
    ["_기록 [[untitled]]와 봅니다.", "_기록 기록과 봅니다."],
    ["＿기록 [[untitled]]와 봅니다.", "＿기록 기록과 봅니다."],
    ["‿기록 [[untitled]]와 봅니다.", "‿기록 기록과 봅니다."],
    ["기록  [[untitled]]와 봅니다.", "기록  기록과 봅니다."],
    ["기록\t[[untitled]]와 봅니다.", "기록\t기록과 봅니다."],
    ["기록\n[[untitled]]와 봅니다.", "기록\n기록과 봅니다."],
    ["기록 [[untitled]].", "기록."],
  ])("collapses only a whole neutral word separated by one space: %j", (raw, expected) => {
    expect(sourceCitationDisplay(raw, "기록")).toBe(expected);
  });

  test("keeps English prose and undecidable fallback particles unchanged", () => {
    expect(sourceCitationDisplay("As noted in [[untitled]] and [[english-study]], start here.", "Record"))
      .toBe("As noted in Record and English Study, start here.");
    expect(sourceCitationDisplay("[[untitled]]은 참고합니다.", "Record")).toBe("Record은 참고합니다.");
    expect(sourceCitationDisplay("메모 [[untitled]]과 봅니다.", "메모")).toBe("메모와 봅니다.");
  });

  test.each([
    ["먼저 하는 게 좋습니다 [[english-study]].", "먼저 하는 게 좋습니다."],
    ["먼저 하는 게 좋습니다. [[english-study]]", "먼저 하는 게 좋습니다."],
    ["먼저 하는 게 좋습니다. [[english-study]].", "먼저 하는 게 좋습니다."],
    ["Try this first [[english-study]].", "Try this first."],
    ["Try this first. [[english-study]]", "Try this first."],
    ["Try this first [[english-study]], then continue.", "Try this first, then continue."],
    ["먼저 [[영어-공부]]\n다음 문장", "먼저\n다음 문장"],
    ["첫 줄 [[a]]  \r\n둘째 줄 [[b]]\t", "첫 줄\r\n둘째 줄"],
    ["첫 줄.\n[[a]]\n다음 줄.", "첫 줄.\n\n다음 줄."],
    ["먼저 합니다 ([[a]]).", "먼저 합니다."],
    ["먼저 합니다([[a]]).", "먼저 합니다."],
    ["먼저 합니다 （ [[a]] ）.", "먼저 합니다."],
    ["Try this ([[a]]) first.", "Try this first."],
    ["Try this ( [[a]] [[b]] ).", "Try this."],
    ["먼저 합니다 [[a]] [[b]].", "먼저 합니다."],
    ["먼저 합니다 [[a]][[b]].", "먼저 합니다."],
    ["먼저 합니다 [[a]], [[b]]; [[a]].", "먼저 합니다."],
    ["먼저 합니다 ([[a]]) ([[b]]).", "먼저 합니다."],
    ["먼저  \t [[a]]  . 다음  [[b]] !", "먼저. 다음!"],
    ["먼저 합니다 [[untitled]].", "먼저 합니다."],
    ["먼저 합니다 [[untitled-deadbeef]].", "먼저 합니다."],
    ["[[영어-공부]]에 적은 것처럼 진행합니다.", "영어 공부에 적은 것처럼 진행합니다."],
    ["기존 [[영어-공부]]처럼 진행합니다.", "기존 영어 공부처럼 진행합니다."],
    ["기존 [[영어-공부]]내용입니다.", "기존 영어 공부내용입니다."],
    ["([[영어-공부]])에서 확인합니다.", "(영어 공부)에서 확인합니다."],
    ["기존 ([[영어-공부]])에서 확인합니다.", "기존 (영어 공부)에서 확인합니다."],
    ["as noted in [[english-study]], start here.", "as noted in English Study, start here."],
    ["As noted IN [[english-study]].", "As noted IN English Study."],
    ["Learn from [[english-study]].", "Learn from English Study."],
    ["This echoes [[english-study]].", "This echoes English Study."],
    ["See [[english-study]].", "See English Study."],
    ["I prefer [[english-study]].", "I prefer English Study."],
    ["We discussed [[english-study]].", "We discussed English Study."],
    ["As noted in my [[english-study]].", "As noted in my English Study."],
    ["An unfamiliar phrase [[english-study]].", "An unfamiliar phrase English Study."],
    ["Practice daily [[english-study]].", "Practice daily."],
    ["As noted in ([[english-study]]), start here.", "As noted in (English Study), start here."],
    ["This echoes [[english-study]] from your notes.", "This echoes English Study from your notes."],
    ["[[english-study]], as mentioned earlier.", "English Study, as mentioned earlier."],
    [" [[english-study]], as mentioned earlier.", " English Study, as mentioned earlier."],
    ["([[english-study]])", "(English Study)"],
    ["예전[[영어-공부]].", "예전영어 공부."],
    ["[[untitled]]에 적은 것처럼 진행합니다.", "기록에 적은 것처럼 진행합니다."],
    ["[[untitled-deadbeef]]에서 확인합니다.", "기록에서 확인합니다."],
    ["as noted in [[untitled]], start here.", "as noted in 기록, start here."],
    ["[[a]]처럼 하고 다시 합니다 [[a]].", "A처럼 하고 다시 합니다."],
    ["원문  그대로.  \n  들여쓰기", "원문  그대로.  \n  들여쓰기"],
    ["", ""],
    ["nothing [[]] here", "nothing [[]] here"],
    ["nothing [[ ]] here", "nothing here"],
    ["([[ ]])", ""],
  ])("%j → %j", (input, expected) => {
    const original = parseSourceCitations(input);
    expect(sourceCitationDisplay(input, "기록")).toBe(expected);
    // Same legacy text and ordered, deduplicated chip identities after drawing.
    expect(parseSourceCitations(input)).toEqual(original);
  });

  test.each([
    ["**먼저 합니다 [[a]].**", "먼저 합니다."],
    ["**먼저** [[a]]\n_다음_ [[b]]", "먼저\n다음"],
    ["**먼저 합니다** ([[a]]).", "먼저 합니다."],
    ["**[[영어-공부]]**에 적은 것처럼", "영어 공부에 적은 것처럼"],
    ["as noted in **[[english-study]]**, start here.", "as noted in English Study, start here."],
    ["**[[untitled]]**에 적은 것처럼", "기록에 적은 것처럼"],
  ])("strip formatting before citation placement: %j", (raw, expected) => {
    expect(sourceCitationDisplay(chatDisplayText(raw), "기록")).toBe(expected);
  });

  test("legacy parsing, repeated chip order and whitespace-only markers stay unchanged", () => {
    const raw = "**First** [[b]] [[a]] [[b]] [[ ]] [[untitled]].";
    expect(parseSourceCitations(raw)).toEqual({
      display: "**First** B A B  Untitled.", chips: ["b", "a", "untitled"],
    });
    expect(sourceCitationDisplay(chatDisplayText(raw), "Record")).toBe("First.");
  });

  test("only actual untitled slug forms use the existing localized record fallback", () => {
    const built = buildSourcePayload("No heading or title.");
    expect(built.suggested_slug).toBe("untitled");
    for (const locale of ["en", "ko", "es", "pt", "id"]) {
      const copy = JSON.parse(readFileSync(resolve(__dirname, `../../../../locales/${locale}/deepspace.json`), "utf8"));
      const label = copy.time.recordFallback;
      expect(typeof label).toBe("string");
      for (const slug of [built.suggested_slug, "untitled-deadbeef", " Untitled "]) {
        expect(formatSourceCitationLabel(slug, label)).toBe(label);
        expect(sourceCitationDisplay(`as noted in [[${slug}]],`, label)).toBe(`as noted in ${label},`);
      }
    }
    expect(formatSourceCitationLabel("untitled")).toBe("Untitled");
    expect(formatSourceCitationLabel("untitled-notes", "기록")).toBe("Untitled Notes");
    expect(formatSourceCitationLabel("untitled-123", "기록")).toBe("Untitled 123");
    expect(formatSourceCitationLabel("untitled-deadbeef-notes", "기록")).toBe("Untitled Deadbeef Notes");
  });
});
