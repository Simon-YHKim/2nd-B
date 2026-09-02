/* ============================================================
   2nd-Brain · AI 뮤지엄 — 심화 데이터 (enrichment)
     MZ_EXTRA  : 타임라인에 추가되는 사건들 (인과 연결 보강)
     MZ_DETAIL : 사건별 깊은 설명 · 핵심 사실 · 배경(cause) · 영향(effect)
   sb-museum.jsx 보다 먼저 로드되어 window 로 전달된다.
   ============================================================ */

window.MZ_EXTRA = window.SB_DATA.museum.extra; // → data/screens/museum.json
window.MZ_DETAIL = window.SB_DATA.museum.detail; // → data/screens/museum.json
