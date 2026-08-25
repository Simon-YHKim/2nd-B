// pdfjs-dist 는 메인 엔트리에만 타입을 준다(package.json "types": "types/src/pdf.d.ts").
// build/pdf.worker.mjs 용 선언이 없고 exports 맵·typesVersions 도 없어서, strict +
// moduleResolution "bundler" 에서 그 서브패스를 import 하면 TS7016 으로 깨진다.
//
// 이 모듈은 **부수효과만** 쓴다(globalThis.pdfjsWorker 등록). 그래서 내보내는 값의
// 모양을 적을 이유가 없고, 빈 선언이 사실에 가장 가깝다.
declare module "pdfjs-dist/build/pdf.worker.mjs";
