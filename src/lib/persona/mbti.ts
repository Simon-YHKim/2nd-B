// MBTI 잔재 — **표시 전용.** 새로 측정하는 길은 없다.
//
// ── 무엇이 남았고 왜 남았나 ───────────────────────────────────────────
// 이 파일에는 32문항 스크리너와 채점기가 있었다. 그걸 쓰던 화면(`/mbti`)은
// 이미 은퇴해서 `/persona` 로 리다이렉트하고, 남아 있던 문항과 `scoreMbti` 는
// **자기 테스트 말고 부르는 곳이 없었다**(실측 2026-08-23). 그래서 지웠다.
//
// 남긴 것은 `TYPE_NICKNAME` 하나다. 이건 **이미 결과를 가진 사용자**를 위한
// 것이다 -- 은퇴 전에 검사를 했다면 그 기록이 `records` 에 남아 있고
// (`loadLatestMbti`, tags `["mbti","assessment"]`), `/persona` ·
// `build-iden` · `self-portrait` 이 그걸 읽어 "INTJ · 전략가" 처럼 보여준다.
// 지우면 그 사람들의 화면에서 값이 조용히 사라진다.
//
// ── 왜 새로 측정하지 않나 (기록해 두는 판단) ──────────────────────────
// 리서치 코퍼스가 MBTI 를 **명시적으로 거부**했다:
//   · `docs/research/README.md` 의 거부 사유 체크리스트가 "MBTI / Enneagram /
//     5 Love Languages 등 검증 미흡 프레임워크" 를 올려놨다.
//   · `docs/research/batches/assessment-landscape.md` 가 MBTI critique 를 담고 있다.
// 알려진 문제는 낮은 재검사 신뢰도, 약한 구성타당도, 이분형 유형에 대한
// 차원적 근거 부재다. 앱의 검증된 성격 측정은 Big Five(BFI-44 / IPIP-NEO-120)고,
// 관계는 ECR-S 다.
//
// **그래서 남은 것은 "예전 결과를 계속 보여준다" 지 "MBTI 를 측정한다" 가
// 아니다.** 새 진입점을 만들지 말 것 -- `src/lib/assess/registry.ts` 가 이걸
// `provenance: "retired"` 로 표시하고, 그 테스트가 어떤 도구 목록에도 다시
// 나타나지 못하게 막는다.
//
// 별명 표는 널리 쓰이는 관용 명칭이라 저작권 대상인 공식 MBTI 문항과 무관하다.

export const TYPE_NICKNAME: Record<"en" | "ko", Record<string, string>> = {
  en: {
    INTJ: "Architect", INTP: "Logician", ENTJ: "Commander", ENTP: "Debater",
    INFJ: "Advocate", INFP: "Mediator", ENFJ: "Protagonist", ENFP: "Campaigner",
    ISTJ: "Logistician", ISFJ: "Defender", ESTJ: "Executive", ESFJ: "Consul",
    ISTP: "Virtuoso", ISFP: "Adventurer", ESTP: "Entrepreneur", ESFP: "Entertainer",
  },
  ko: {
    INTJ: "전략가", INTP: "논리술사", ENTJ: "통솔자", ENTP: "변론가",
    INFJ: "옹호자", INFP: "중재자", ENFJ: "선도자", ENFP: "활동가",
    ISTJ: "현실주의자", ISFJ: "수호자", ESTJ: "경영자", ESFJ: "집정관",
    ISTP: "장인", ISFP: "모험가", ESTP: "사업가", ESFP: "연예인",
  },
};
