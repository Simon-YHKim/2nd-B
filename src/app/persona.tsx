// /persona — a redirect to 북극성 (/core-brain).
//
// D4 (Simon 2026-08-18): /persona 와 /core-brain 이 같은 것을 두 번 보여주고
// 있었다. 둘 다 buildPersona + buildCenterCards + loadDomainLevels 로 만들고,
// 둘 다 "나의 종합" 을 제시한다. 진입점은 각각 13개와 14개였다.
//
// 캐논이 정한 정본은 /core-brain 이다 - 파일 헤더가 "user-facing name is 북극성"
// 이라 적고 있고, 홈의 북극성 탭과 딥스페이스 lens 독이 둘 다 그리로 간다.
// 그래서 여기는 정본으로 넘긴다. "나를 보는 자리가 어디인가" 에 답이 둘이면
// 그건 화면이 부족한 게 아니라 많은 것이다.
//
// 지우지 않고 리다이렉트로 두는 이유는 이 저장소의 기존 관행과 같다
// (jarvis → secondb, mbti → persona, journal → capture): 저장된 링크와 외부
// 링크가 404 가 되면 안 된다.
//
// 옛 레거시 스킨(EXPO_PUBLIC_UI=legacy)이 그리던 PersonaLegacy 는 레버와 함께
// 빠졌다(2026-10-05, Simon 결정 Q-261004-11). E:/Legacy/2ndB(MANIFEST batch
// qa261004-lever)와 git 이력에 있다.
import { Redirect } from "expo-router";

export default function Persona() {
  return <Redirect href="/core-brain" />;
}
