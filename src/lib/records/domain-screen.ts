// 저장한 것 하나를 "그것이 담긴 영역 화면"에서 보여주는 길 (P1).
//
// Simon 결정 2026-09-13 22:26 (DECISIONS.md): 저장 후 버튼은 방금 담은 것이 쌓인 영역 화면
// (/star/<도메인>)으로 가고, 도착한 화면에서 그것을 표시한다. 도메인 태그가 없으면 기록
// 화면으로 간다. 배송 기록 상세에도 같은 규칙의 버튼을 둔다.
//
// Simon 결정 2026-09-14 01:45: /capture 의 기록 저장(일기 · 음성 · 할 일 · 4W1H, 별 렌즈
// '담기' 포함)도 같은 규칙으로 넓힌다. 조각(sources)에는 도메인을 자동으로 붙이지 않는다 -
// load-domain-levels.ts 가 조각의 domain: 태그를 사용자가 고른 연결로 세서, 자동으로 붙이면
// 비준하지 않은 조각이 별을 밝힌다.
//
// 그 전에는 두 버튼이 `/?highlightRecordId=<id>` 로 홈에 강조를 부탁했다. 그 이름을 읽던
// 그래프 홈은 아카이브됐고, 배송 홈의 별 일곱은 도메인이 아니라 시기·주제 자리라
// (persona/home-stars.ts) 받을 곳이 없었다.
//
//   조각 · 기록 상세     lifeDomainOf    생활 영역 태그              ->  /star/[domain] 에 pieceId 를 실어 보낸다
//                                        collect · 태그 없음         ->  null (상세로 가거나 버튼을 숨긴다)
//   /capture 기록 저장   filedDomainOf   domain: 태그 (collect 포함)  ->  /star/[domain] 에 pieceId 를 실어 보낸다
//                                        태그 없음                   ->  null (상세로 간다)
//
// 해석은 recordDomain 과 같다: 첫 번째로 유효한 domain: 태그를 쓰고, 알 수 없는 슬러그는
// 건너뛰고, 대소문자를 가린다. /star/[domain] 의 목록도 domain:<id> 를 정확히 맞춰 읽으니
// 그 화면에 없는 태그로는 보내지 않는 셈이다.
//
// collect 는 생활 영역이 아니라 데이터가 흘러드는 통로라, 조각과 기록 상세는 영역 화면으로
// 보내지 않는다 - DomainDashboard 의 LIFE_DOMAINS 와 같은 선이다. /capture 의 기록 저장만
// collect 로도 보낸다: createRecord 는 기록마다 domain: 태그를 정확히 하나 붙이고 못 찾으면
// domain:collect 를 붙이므로, 그 기록은 /star/collect 의 목록에 실제로 있다.
//
// ⚠ /star/[domain] 은 isDomainId 로 받는다(collect 도 받는다). 여기서 보내는 값은 그 집합의
//   부분집합이어야 하고, 테스트가 그 화면의 판정 줄을 읽어 확인한다.

import { domainTagFor, type DomainId } from "../persona/domain-stars";
import { recordDomain } from "./records-graph";

/** A domain with its own screen to open: every domain except the collect channel. */
export type LifeDomainId = Exclude<DomainId, "collect">;

/** The life area a piece is filed under, or null (collect, untagged, unknown slug). */
export function lifeDomainOf(tags: readonly string[] | null | undefined): LifeDomainId | null {
  const domain = recordDomain(tags);
  return domain === "collect" ? null : domain;
}

/**
 * The domain a record was filed under, collect included, or null when no `domain:` tag names
 * one. The same reading as recordDomain without its fallback: recordDomain also answers
 * collect for a row with no domain tag at all, but /star/collect lists rows tagged
 * `domain:collect`, so an untagged row is not filed there.
 */
export function filedDomainOf(tags: readonly string[] | null | undefined): DomainId | null {
  const domain = recordDomain(tags);
  return domain === "collect" && !(tags ?? []).includes(domainTagFor("collect")) ? null : domain;
}

/**
 * The route that opens that area and tells it which piece to show at the top.
 * `pieceId` follows get-piece.ts (a record's uuid, or `src-<uuid>` for a source);
 * src/app/star/[domain].tsx is the reader. Only a saved record is sent to collect.
 */
export function domainScreenRoute(domain: DomainId, pieceId: string) {
  return { pathname: "/star/[domain]", params: { domain, pieceId } } as const;
}
