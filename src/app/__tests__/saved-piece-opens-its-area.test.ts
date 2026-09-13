// P1 (Simon 결정 2026-09-13 22:26 · 2026-09-14 01:45): 저장한 것을 그것이 담긴 영역 화면에서 보여준다.
//
//   보내는 곳   /capture 저장 후 버튼(조각 · 기록 한 버튼) · 배송 기록 상세의 영역 버튼
//   받는 곳     /star/[domain] 이 pieceId 로 그것을 읽어 맨 위에 보여준다
//   영역 없음   /capture 는 그것의 상세(/record/[id], 조각은 ?origin=source)로, 기록 상세는 버튼을 숨긴다
//   id 없음     /capture 는 기록 보관소(/records)로 간다
//
// 전에는 조각 버튼이 `/?highlightRecordId=<id>` 로 갔고 라벨은 "그래프 보기", 힌트는 "…강조해요"
// 였다. 그 이름을 읽던 그래프 홈은 아카이브됐고 배송 홈의 별 일곱은 도메인이 아니라서
// (lib/persona/home-stars.ts) 두 약속이 다 지켜지지 않았다. 기록 버튼은 영역과 무관하게
// 기록 보관소 목록(일기 - id 를 남기지 않았다)이나 기록 상세(음성 · 할 일 · 4W1H)로 갔다.
//
// 태그 -> 경로 해석과 조회는 lib/records/__tests__ 의 domain-screen · get-piece-summary 가,
// 기록이 저장 때 붙은 태그를 돌려받는지는 create-advisor-gate 가 순수하게 잰다. 여기서는
// 화면이 그것을 **실제로 쓰는지**를 소스로 잰다 - 컴포넌트 렌더 테스트는 이 저장소에서
// 막혀 있다(RN 0.85 upstream).
//
// ⚠ 레거시 src/app/record/[id].tsx 의 같은 버튼은 여기서 재지 않는다. 그 반쪽은 어떤 배송
//   빌드도 그리지 않고, guard-pins-not-in-dead-renderers 래칫이 그 파일을 0 으로 막는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DOMAIN_STARS } from "../../lib/persona/domain-stars";

const CAPTURE = readFileSync(join(__dirname, "..", "capture.tsx"), "utf8").replace(/\r\n/g, "\n");
const STAR = readFileSync(join(__dirname, "..", "star", "[domain].tsx"), "utf8").replace(/\r\n/g, "\n");
const DETAIL = readFileSync(
  join(__dirname, "..", "..", "screens", "deepspace", "dds-record-detail-screen.tsx"),
  "utf8",
).replace(/\r\n/g, "\n");
const GET_PIECE = readFileSync(join(__dirname, "..", "..", "lib", "records", "get-piece.ts"), "utf8").replace(
  /\r\n/g,
  "\n",
);

function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

// 저장 핸들러 셋. 한 핸들러 안에서만 찾도록 다음 함수 이름까지 자른다.
const journalHandler = () =>
  between(CAPTURE, "async function handleJournalSubmit(", "async function handleNoteLikeSubmit(");
const noteHandler = () =>
  between(CAPTURE, "async function handleNoteLikeSubmit(", "async function handleStartRecording(");
const sourceHandler = () => between(CAPTURE, "async function handleSubmit(", "async function runPropose(");

describe("/capture 저장 후 버튼", () => {
  test("저장한 소스의 태그로 영역을 정한다", () => {
    expect(sourceHandler()).toContain("setSavedDomain(lifeDomainOf(result.source.tags));");
  });

  test("기록 저장(일기 · 음성 · 할 일 · 4W1H)은 createRecord 가 돌려준 id 와 태그로 영역을 정한다", () => {
    for (const block of [journalHandler(), noteHandler()]) {
      expect(block).toContain("setSavedSourceId(res.id);");
      expect(block).toContain("setSavedDomain(filedDomainOf(res.tags));");
      // reset() 이 saved 상태를 null 로 비운다. 그 뒤에 둬야 방금 남긴 값이 살아남는다.
      const reset = block.indexOf("reset();");
      expect(reset).toBeGreaterThan(0);
      expect(block.indexOf("setSavedSourceId(res.id);")).toBeGreaterThan(reset);
      expect(block.indexOf("setSavedDomain(filedDomainOf(res.tags));")).toBeGreaterThan(reset);
      // 다시 읽지 않는다 - 방금 insert 한 값을 돌려받는다.
      expect(block).not.toMatch(/getRecordById\(|getPieceSummary\(|getPieceById\(/);
    }
  });

  test("일기도 id 를 남긴다 (예전에는 null 이라 기록 보관소 목록으로만 갔다)", () => {
    expect(journalHandler()).not.toContain("setSavedSourceId(null)");
  });

  test("영역이 있으면 그 영역 화면에 그것을 보여 달라고 보낸다 (조각은 src- 접두사, 기록은 그대로)", () => {
    expect(CAPTURE).toContain('const savedOrigin = savedKind === "source" ? "source" : "record";');
    expect(CAPTURE).toContain(
      "router.push(domainScreenRoute(savedDomain, pieceIdFor(savedSourceId, savedOrigin)));",
    );
    // 버튼은 하나다. 기록만 따로 보내던 옛 목적지 함수가 남지 않는다.
    expect(CAPTURE.match(/onPress=\{openSavedDestination\}/g)).toHaveLength(1);
    expect(CAPTURE).not.toContain("openSavedRecord");
  });

  test("영역이 없으면 그것의 상세 화면으로, id 가 없을 때만 기록 보관소로 간다", () => {
    const open = between(CAPTURE, "const openSavedDestination = () => {", "\n  };\n");
    const steps = [
      "if (!savedSourceId) {",
      'router.push("/records");',
      "if (savedDomain) {",
      "router.push(domainScreenRoute(savedDomain, pieceIdFor(savedSourceId, savedOrigin)));",
      'if (savedOrigin === "source") {',
      'router.push({ pathname: "/record/[id]", params: { id: savedSourceId, origin: "source" } });',
      'router.push({ pathname: "/record/[id]", params: { id: savedSourceId } });',
    ];
    const at = steps.map((step) => open.indexOf(step));
    expect(steps.filter((_, i) => at[i] < 0)).toEqual([]);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  test("홈에 강조를 부탁하는 파라미터를 더는 보내지 않는다", () => {
    expect(CAPTURE).not.toMatch(/params:\s*\{[^}]*highlightRecordId/);
  });

  test("라벨과 접근성 힌트가 실제로 가는 곳을 말한다", () => {
    // 이동과 같은 순서로 판단한다: id 없음 -> 기록 보관소, 영역 있음 -> 영역, 나머지 -> 상세.
    expect(CAPTURE).toContain('const savedTarget = !savedSourceId ? "records" : savedDomain ? "area" : "piece";');
    expect(CAPTURE).toContain(
      'label={savedTarget === "area" ? t("saved.seeArea", { area: savedAreaName }) : savedTarget === "piece" ? t("saved.seePiece") : t("saved.seeRecords")}',
    );
    expect(CAPTURE).toContain(
      'accessibilityHint={savedTarget === "area" ? t("saved.seeAreaHint", { area: savedAreaName }) : savedTarget === "piece" ? t("saved.seePieceHint") : t("saved.seeRecordsHint")}',
    );
    // 영역 이름은 홈 별자리·대시보드와 같은 번역에서 온다.
    expect(CAPTURE).toContain("t(`home:ds.home.domainName.${savedDomain}`)");
    // 그래프·강조를 약속하던 옛 키가 화면에 남지 않는다.
    expect(CAPTURE).not.toMatch(/saved\.see(Ocr)?Graph/);
  });

  test("기록이 갈 수 있는 일곱 영역(collect 포함)의 이름이 다섯 언어에 다 있다", () => {
    const ids = DOMAIN_STARS.map((star) => star.id).sort();
    for (const lang of ["en", "ko", "es", "id", "pt"]) {
      const home = JSON.parse(
        readFileSync(join(__dirname, "..", "..", "..", "locales", lang, "home.json"), "utf8"),
      ) as { ds: { home: { domainName: Record<string, string> } } };
      const names = home.ds.home.domainName;
      expect({ lang, ids: Object.keys(names).sort() }).toEqual({ lang, ids });
      expect({ lang, empty: ids.filter((id) => !names[id]?.trim()) }).toEqual({ lang, empty: [] });
    }
  });
});

describe("배송 기록 상세의 영역 버튼", () => {
  test("영역 태그가 있을 때만 보인다", () => {
    expect(DETAIL).toContain("const area = lifeDomainOf(piece.tags);");
    expect(DETAIL).toContain("{area ? (");
  });

  test("그 영역 화면에 이 조각을 보여 달라고 보낸다", () => {
    expect(DETAIL).toContain("router.push(domainScreenRoute(area, pieceIdFor(piece.id, piece.origin)))");
  });

  test("라벨과 접근성 힌트가 번역에서 온다", () => {
    expect(DETAIL).toContain('accessibilityLabel={t("recordDetail:actions.seeArea", { area: areaName })}');
    expect(DETAIL).toContain(
      'accessibilityHint={t("recordDetail:actions.seeAreaHint", { area: areaName })}',
    );
  });
});

describe("/star/[domain] 이 가리킨 조각을 보여준다", () => {
  test("pieceId 를 받는다", () => {
    expect(STAR).toContain("useLocalSearchParams<{ domain: string; pieceId?: string | string[] }>()");
  });

  test("형식을 통과한 id 만, 본인 행으로 읽는다", () => {
    expect(STAR).toContain("const pieceRef = parsePieceId(pieceId);");
    expect(STAR).toContain("getPieceSummary(userId, { origin: pieceOrigin, uuid: pieceUuid })");
    const summary = between(GET_PIECE, "export async function getPieceSummary(", "\n}\n");
    // 두 갈래(sources · records) 모두 명시적으로 본인 행만 고른다. RLS 는 그 뒤의 두 번째 벽이다.
    expect(summary.match(/\.eq\("user_id", userId\)/g)).toHaveLength(2);
  });

  test("이 영역에 담긴 것일 때만 보여준다 (기록은 collect 로도 온다)", () => {
    expect(STAR).toContain("filedDomainOf(shownPiece.tags) === domainId");
    expect(STAR).not.toContain("lifeDomainOf(shownPiece.tags)");
  });

  test("읽기에 실패해도 에러를 띄우거나 id·태그를 로그에 남기지 않는다", () => {
    const load = between(
      STAR,
      "getPieceSummary(userId,",
      "}, [userId, domainId, pieceOrigin, pieceUuid, pieceReadNo]);",
    );
    expect(load).not.toContain("console.");
    expect(load).not.toMatch(/set(Failed|Error)\(/);
    const summary = between(GET_PIECE, "export async function getPieceSummary(", "\n}\n");
    expect(summary).not.toContain("console.");
    expect(summary).not.toContain("downloadRawClipping");
  });

  test("카드를 누르면 그것의 상세로 간다 (조각 · 기록)", () => {
    expect(STAR).toContain('params: { id: piece.uuid, origin: "source" }');
    expect(STAR).toContain('{ pathname: "/record/[id]", params: { id: piece.uuid } }');
    expect(STAR).toContain('accessibilityHint={t("star.pieceOpenHint")}');
  });
});
