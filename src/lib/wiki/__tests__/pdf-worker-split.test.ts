// 웹 export 와 네이티브 Hermes 그래프를 동시에 지키는 정적 가드.
//
// Metro 는 모듈 그래프를 **정적으로** 걷는다. 그래서 기본(네이티브) 변형이 pdfjs 를
// 참조하면 웹 전용 의존성이 Hermes 쪽으로 새고, 특히 pdf.worker.mjs 안의 비-리터럴
// `await import(path)` 두 개가 metro.config.js 가 적어둔 "Invalid expression
// encountered" 를 일으킨다. 웹 변형은 추후 안전한 parser 격리가 생길 때에만 쓸 수
// 있도록 분리해 둔다. 현재 capture 경로는 메모리 상한을 강제할 수 없어 fail-closed다.
//
// 이 검사는 기본 변형과 웹 변형의 격리, 그리고 capture의 parser 비도달을 함께 본다.
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

  it("capture 추출 경로는 워커나 PDF parser를 참조하지 않는다", () => {
    const src = read("capture-file.ts");
    expect(src).not.toContain("ensurePdfWorker");
    expect(src).not.toContain("extractPdfText");
    expect(src).not.toContain('import("pdfjs-dist")');
    expect(src).toContain(
      "if (PDF_MIMES.has(normalizedMimeType) || DOCX_MIMES.has(normalizedMimeType)) return null",
    );
  });

  it("죽은 GlobalWorkerOptions 대입이 돌아오지 않았다", () => {
    // 그 한 줄이 웹 PDF 를 통째로 죽였다. 되살리면 여기서 막는다.
    const src = read("capture-file.ts");
    expect(src).not.toMatch(/\.GlobalWorkerOptions\s*=/);
    expect(src).not.toContain('workerSrc: ""');
  });
});
