// pdfjs 워커 시임 — 플랫폼 분기의 기본(=네이티브) 쪽. **pdfjs 를 참조하지 않는다.**
//
// ── 왜 이 파일이 생겼나 (2026-08-28) ────────────────────────────────────────
//
// capture-file.ts 가 "워커를 끄겠다"며 ESM 네임스페이스에 대입하고 있었다:
//
//     (pdfjs as {...}).GlobalWorkerOptions = { ..., workerSrc: "" };
//
// 번들러는 ESM 네임스페이스를 **getter-only** 로 내보낸다. 그래서 이 대입은
// TypeError 를 던지고, 바로 옆 try/catch 가 그걸 삼킨 뒤, 다음 줄의
// getDocument() 가 `No "GlobalWorkerOptions.workerSrc" specified.` 로 죽는다.
// extractText 는 null 을 돌려주고 화면은 "텍스트를 못 읽었어요"로 끝난다 —
// **에러 하나 없이.** 5.x 와 6.x 양쪽에서 재현됐다.
//
// 고치는 방법은 workerSrc 를 채우는 것이 아니라 **메인스레드 핸들러를 등록**하는
// 것이다: pdfjs 의 워커 파일은 마지막 줄에서 `globalThis.pdfjsWorker` 를 세팅하고,
// PDFWorker 는 정확히 그 전역을 먼저 본다. 즉 그 파일을 import 하는 것 자체가
// 등록이고, 그러면 workerSrc 도 Worker 생성자도 필요 없다.
//
// 네이티브에는 그 파일을 들이지 않는다. pdf.worker.mjs 안에 비-리터럴
// `await import(path)` 가 있어서 Metro 의 정적 그래프 걷기가 깨진다(웹 전용
// 의존성이 Hermes 그래프로 새는 것도 함께 막는다). 네이티브는 애초에 PDF 추출
// 경로를 타지 않으므로 여기서는 아무것도 하지 않는 것이 맞다.

/** 웹에서만 실제 등록을 한다. 네이티브/테스트에서는 no-op. */
export async function ensurePdfWorker(): Promise<void> {
  // 의도적 no-op — 플랫폼 분기의 기본 쪽.
}
