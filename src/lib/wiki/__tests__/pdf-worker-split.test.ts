// 웹 export 와 네이티브 Hermes 그래프를 동시에 지키는 정적 가드.
//
// Metro 는 모듈 그래프를 **정적으로** 걷는다. 그래서 기본(네이티브) 변형이 pdfjs 를
// 참조하면 웹 전용 의존성이 Hermes 쪽으로 새고, 특히 pdf.worker.mjs 안의 비-리터럴
// `await import(path)` 두 개가 metro.config.js 가 적어둔 "Invalid expression
// encountered" 를 일으킨다. 반대로 웹 변형이 워커를 안 들이면 아무 일도 일어나지
// 않는 대신 **PDF 텍스트가 조용히 안 나온다**(2026-08-28 이전 상태가 그랬다).
//
// 이 검사는 두 방향을 다 본다: 기본 변형은 pdfjs 를 몰라야 하고, 웹 변형은 워커
// 모듈을 반드시 들여야 한다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(__dirname, "..");
const read = (f: string) => readFileSync(join(DIR, f), "utf8");

describe("pdf 워커 시임의 플랫폼 분기", () => {
  it("기본(네이티브) 변형은 pdfjs 를 참조하지 않는다", () => {
    const src = read("pdf-worker.ts");
    expect(src).not.toMatch(/from\s+["']pdfjs-dist/);
    expect(src).not.toMatch(/import\(["']pdfjs-dist/);
    expect(src).toContain("export async function ensurePdfWorker");
  });

  it("웹 변형은 워커 모듈을 들여 전역 핸들러를 등록한다", () => {
    const src = read("pdf-worker.web.ts");
    expect(src).toContain('import("pdfjs-dist/build/pdf.worker.mjs")');
    expect(src).toContain("export async function ensurePdfWorker");
  });

  it("추출 경로가 워커 등록을 먼저 부른다", () => {
    const src = read("capture-file.ts");
    expect(src).toContain('import { ensurePdfWorker } from "./pdf-worker"');
    const start = src.indexOf("async function extractPdfText");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf("\n}", start));
    const ensureAt = body.indexOf("ensurePdfWorker()");
    const getDocAt = body.indexOf("getDocument(");
    expect(ensureAt).toBeGreaterThan(-1);
    expect(getDocAt).toBeGreaterThan(ensureAt);
  });

  it("죽은 GlobalWorkerOptions 대입이 돌아오지 않았다", () => {
    // 그 한 줄이 웹 PDF 를 통째로 죽였다. 되살리면 여기서 막는다.
    const src = read("capture-file.ts");
    expect(src).not.toMatch(/\.GlobalWorkerOptions\s*=/);
    expect(src).not.toContain('workerSrc: ""');
  });
});
