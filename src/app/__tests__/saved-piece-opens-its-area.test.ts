// P1 (Simon 결정 2026-09-13 22:26): 저장한 조각을 그것이 담긴 생활 영역 화면에서 보여준다.
//
//   보내는 곳   /capture 저장 후 버튼 · 배송 기록 상세의 영역 버튼
//   받는 곳     /star/[domain] 이 pieceId 로 그 조각을 읽어 맨 위에 보여준다
//   영역 없음   /capture 는 그 조각의 상세(/record/[id]?origin=source)로, 기록 상세는 버튼을 숨긴다
//
// 전에는 두 버튼이 `/?highlightRecordId=<id>` 로 갔고 라벨은 "그래프 보기", 힌트는 "…강조해요"
// 였다. 그 이름을 읽던 그래프 홈은 아카이브됐고 배송 홈의 별 일곱은 도메인이 아니라서
// (lib/persona/home-stars.ts) 두 약속이 다 지켜지지 않았다.
//
// 태그 -> 경로 해석과 조회는 lib/records/__tests__ 의 domain-screen · get-piece-summary 가
// 순수하게 잰다. 여기서는 화면이 그것을 **실제로 쓰는지**를 소스로 잰다 - 컴포넌트 렌더
// 테스트는 이 저장소에서 막혀 있다(RN 0.85 upstream).
//
// ⚠ 레거시 src/app/record/[id].tsx 의 같은 버튼은 여기서 재지 않는다. 그 반쪽은 어떤 배송
//   빌드도 그리지 않고, guard-pins-not-in-dead-renderers 래칫이 그 파일을 0 으로 막는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

describe("/capture 저장 후 버튼", () => {
  test("저장한 소스의 태그로 영역을 정한다", () => {
    expect(CAPTURE).toContain("setSavedDomain(lifeDomainOf(result.source.tags));");
  });

  test("영역이 있으면 그 영역 화면에 그 조각을 보여 달라고 보낸다", () => {
    expect(CAPTURE).toContain(
      'router.push(domainScreenRoute(savedDomain, pieceIdFor(savedSourceId, "source")));',
    );
    expect(CAPTURE).toContain("onPress={openSavedDestination}");
  });

  test("영역이 없으면 그 조각의 상세 화면으로 간다", () => {
    expect(CAPTURE).toContain(
      'router.push({ pathname: "/record/[id]", params: { id: savedSourceId, origin: "source" } });',
    );
  });

  test("홈에 강조를 부탁하는 파라미터를 더는 보내지 않는다", () => {
    expect(CAPTURE).not.toMatch(/params:\s*\{[^}]*highlightRecordId/);
  });

  test("라벨과 접근성 힌트가 실제로 가는 곳을 말한다", () => {
    expect(CAPTURE).toContain(
      'label={savedDomain ? t("saved.seeArea", { area: savedAreaName }) : t("saved.seePiece")}',
    );
    expect(CAPTURE).toContain(
      'accessibilityHint={savedDomain ? t("saved.seeAreaHint", { area: savedAreaName }) : t("saved.seePieceHint")}',
    );
    // 영역 이름은 홈 별자리·대시보드와 같은 번역에서 온다(5개 언어).
    expect(CAPTURE).toContain("t(`home:ds.home.domainName.${savedDomain}`)");
    // 그래프·강조를 약속하던 옛 키가 화면에 남지 않는다.
    expect(CAPTURE).not.toMatch(/saved\.see(Ocr)?Graph/);
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

  test("이 영역에 담긴 조각일 때만 보여준다", () => {
    expect(STAR).toContain("lifeDomainOf(shownPiece.tags) === domainId");
  });

  test("읽기에 실패해도 에러를 띄우거나 id·태그를 로그에 남기지 않는다", () => {
    const load = between(STAR, "getPieceSummary(userId,", "}, [userId, domainId, pieceOrigin, pieceUuid]);");
    expect(load).not.toContain("console.");
    expect(load).not.toMatch(/set(Failed|Error)\(/);
    const summary = between(GET_PIECE, "export async function getPieceSummary(", "\n}\n");
    expect(summary).not.toContain("console.");
    expect(summary).not.toContain("downloadRawClipping");
  });

  test("카드를 누르면 그 조각의 상세로 간다", () => {
    expect(STAR).toContain('params: { id: piece.uuid, origin: "source" }');
    expect(STAR).toContain('accessibilityHint={t("star.pieceOpenHint")}');
  });
});
