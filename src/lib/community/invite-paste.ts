// 초대 링크 붙여넣기 수신구의 파서 (2026-09-01 감사 Q2-3).
//
// 링크 베이스가 GitHub Pages 웹 URL 이라(chat.ts COMMUNITY_LINK_BASE) 네이티브
// 수신자는 링크를 눌러도 브라우저로 떨어진다. 이 파서는 받은 링크를 앱 안에서
// 여는 수신측 편의일 뿐이다 — 토큰은 여전히 공유 링크로만 유통되고(발급·저장
// 없음), 검증은 기존 /community/join/[token] 화면과 community_join RPC 가 한다.

/** 붙여넣은 초대 링크(또는 맨 코드)에서 토큰만 꺼낸다. 못 찾으면 null. */
export function inviteTokenFromInput(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const marker = "/community/join/";
  const at = text.indexOf(marker);
  const candidate = (at >= 0 ? text.slice(at + marker.length) : text).split(/[?#\s/]/)[0].trim();
  return /^[A-Za-z0-9_-]{8,}$/.test(candidate) ? candidate : null;
}
