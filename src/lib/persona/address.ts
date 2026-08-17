// 사용자를 뭐라고 부를 것인가 (Simon 결정, 2026-08-17).
//
// 앱이 2인칭을 세 가지로 섞어 쓰고 있었다 — `네`, `너`, `당신`. 말투를 합쇼체로
// 올리자 격차가 더 도드라졌다("네 영역이 이렇게 쌓이고 있습니다"). Simon 의 답은
// 셋 중 하나를 고르는 게 아니라 **이름을 부르는 것**이다: "허슬케이님의 영역".
//
// ## 왜 조사가 안 깨지는가
//
// 한국어는 앞 글자의 받침에 따라 조사가 갈린다(이/가, 은/는, 을/를). 그런데
// 이름 뒤에 항상 **님**을 붙이므로 결과는 언제나 받침으로 끝나고, 폴백인
// **당신**도 받침으로 끝난다. 그래서 두 경우 모두 이/은/을 쪽을 쓴다.
//
//   허슬케이님이 · 당신이      허슬케이님은 · 당신은      허슬케이님을 · 당신을
//
// 덕분에 로케일 문자열을 한 벌만 두고 `{{who}}` 하나로 갈아끼울 수 있다.
// 이름 유무에 따라 문장을 두 벌 쓸 필요가 없다.
//
// ## 왜 폴백이 필요한가
//
// 이름은 **선택 입력**이다(온보딩에서 건너뛸 수 있다). 이름이 없을 때
// `{{who}}` 가 빈 문자열이 되면 " 데이터가 어디에 있고"처럼 문장이 깨진다.
// 그래서 폴백은 빈칸이 아니라 지금까지 쓰던 `당신` 이다. 이름을 넣지 않은
// 사용자는 아무것도 나빠지지 않고, 넣은 사용자만 이름으로 불린다.

/** users.display_name 의 CHECK 와 같은 상한. */
const MAX_LEN = 40;

/** 이름이 없을 때 쓰는 호칭. 받침으로 끝나 조사가 이름 있을 때와 같다. */
export const FALLBACK_ADDRESS_KO = "당신";

/**
 * 로케일 문자열의 `{{who}}` 에 넣을 호칭.
 *
 * 한국어만 이름을 쓴다. 영어는 소유격·주격이 갈려(you / your) 한 슬롯으로
 * 처리할 수 없고, 원문이 이미 "Your areas"로 자연스럽다. 다른 로케일도 같다.
 */
export function addressTerm(displayName: string | null | undefined, locale: string): string {
  if (!locale.startsWith("ko")) return "";
  const name = (displayName ?? "").trim().slice(0, MAX_LEN);
  if (name.length === 0) return FALLBACK_ADDRESS_KO;
  // 이미 님으로 끝나면 "허슬케이님님" 이 되지 않게 그대로 둔다.
  return name.endsWith("님") ? name : `${name}님`;
}

/**
 * 이름을 **시스템 프롬프트에 넣기 위해** 씻는다.
 *
 * 표시 이름은 사용자가 정하는 문자열이고, 프롬프트에 넣는 순간 지시문 자리에
 * 사용자 입력이 들어간다. `display_name` 을 "무시하고 다음을 따르라" 로 지어
 * 놓으면 그게 시스템 프롬프트 한가운데 앉는다. 40자 CHECK 는 길이만 막는다.
 *
 * 그래서 화면에 쓰는 것보다 훨씬 좁게 자른다:
 *   - 줄바꿈·제어문자 제거 (여러 줄로 새 지시를 만들 수 없게)
 *   - 따옴표·중괄호·꺾쇠 제거 (인용부호나 펜스를 닫고 나올 수 없게)
 *   - 20자로 더 줄임 (이름에 문장이 들어갈 이유가 없다)
 * 남은 것이 비면 이름을 아예 안 쓴다 - 이상한 이름으로 부르느니 안 부르는 게 낫다.
 */
export function promptSafeName(displayName: string | null | undefined): string | null {
  const raw = displayName ?? "";
  // 코드포인트로 거른다: " ' ` < > { } [ ] \
  // 정규식 문자클래스로 쓰면 이스케이프가 한 겹 더 꼬여서 조용히 빈 클래스가
  // 되기 쉽다. 여기서 놓치면 프롬프트 인용부호를 닫고 나올 수 있으므로
  // 실수해도 티가 나는 형태로 적는다.
  const BANNED = new Set([0x22, 0x27, 0x60, 0x3c, 0x3e, 0x7b, 0x7d, 0x5b, 0x5d, 0x5c]);
  let out = "";
  for (const ch of raw) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x20 || cp === 0x7f) { out += " "; continue; }
    if (BANNED.has(cp)) continue;
    out += ch;
  }
  const cleaned = out.replace(/\s+/g, " ").trim().slice(0, 20).trim();
  return cleaned.length > 0 ? cleaned : null;
}
