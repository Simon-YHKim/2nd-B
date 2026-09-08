// 이 저장소가 **태울 수 있는** LLM 벤더와 프록시가 무엇인가.
//
// 법무 문서 두 벌이 같은 질문에 답해야 한다:
//
//   DPIA §2.7 하위처리자 표    내부 문서. "코드가 이 벤더를 태울 수 있다" 를 적는다.
//   개인정보처리방침 §4 수탁사  **이용자가 읽는 문서.** "이 회사가 실제로 받는다" 를 적는다.
//
// 둘의 기준이 다르다는 것이 요점이다 - 태울 수 있는 것과 지금 받는 것은
// 구분되는 상태다. 그런데 **판정의 출발점은 하나여야 한다.** 벤더 목록을 두
// 검사가 따로 파싱하면 두 검사가 서로 다른 세계를 세게 되고, 그 차이는
// 아무에게도 안 보인다(회차 64 에서 죽은-렌더러 판정이 정확히 그랬다:
// 독립 조사는 112, 공용 모듈은 110 이었고 차이는 판정 기준이었다).
//
// 그래서 유니온을 읽는 자리를 여기 하나로 둔다.
import fs from "node:fs";
import path from "node:path";

/** `export type LlmProxyFn = "gemini-proxy" | … ;` 에서 슬러그를 뽑는다. */
export function proxySlugsFromSource(source: string): string[] {
  const decl = /export type LlmProxyFn\s*=\s*([^;]+);/.exec(source);
  if (!decl) return [];
  return [...decl[1].matchAll(/"([a-z0-9-]+)"/g)].map(m => m[1]);
}

/** `export type LlmVendor = "gemini" | … ;` 에서 벤더 이름을 뽑는다. */
export function vendorNamesFromSource(source: string): string[] {
  const decl = /export type LlmVendor\s*=\s*([^;]+);/.exec(source);
  if (!decl) return [];
  return [...decl[1].matchAll(/"([a-z0-9-]+)"/g)].map(m => m[1]);
}

/** `src/lib/llm/routing.ts` 원문. 두 검사가 같은 파일을 읽게 한다. */
export function readRouting(root: string = process.cwd()): string {
  return fs.readFileSync(path.join(root, "src", "lib", "llm", "routing.ts"), "utf8");
}
