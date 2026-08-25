// pdfjs 워커 시임 — WEB 쪽. 배경 전체는 ./pdf-worker.ts 헤더에 있다.
//
// pdfjs-dist/build/pdf.worker.mjs 는 이렇게 끝난다:
//
//     globalThis.pdfjsWorker = { WorkerMessageHandler };
//
// 그리고 PDFWorker 는 워커를 띄우기 전에 그 전역을 먼저 본다. 그래서 **이 파일을
// import 하는 것이 곧 워커 등록**이고, workerSrc 를 채울 필요도 Worker 생성자를
// 쓸 필요도 없다. pdfjs 는 메인스레드에서 돈다 — 큰 PDF 는 느리지만, 워커 URL 을
// 번들러마다 다르게 맞추는 세금 없이 **실제로 동작한다**(지금은 동작하지 않는다).
//
// 한 번만 하고, 실패해도 조용히 넘어간다(추출 쪽에서 null 로 이어진다).

let registered: Promise<void> | null = null;

export async function ensurePdfWorker(): Promise<void> {
  if (!registered) {
    registered = (async () => {
      try {
        await import("pdfjs-dist/build/pdf.worker.mjs");
      } catch {
        // 등록 실패는 여기서 삼키고, getDocument 쪽에서 정직하게 실패하게 둔다.
        registered = null;
      }
    })();
  }
  return registered ?? Promise.resolve();
}
