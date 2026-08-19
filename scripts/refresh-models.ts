// 모델 최신화 — 벤더에게 물어보고, 시험해보고, 통과한 것만 승격한다.
//
// 문제: 모델 ID 가 세 군데에 따로 하드코딩돼 있고 각자 따로 낡는다.
//   1) 클라이언트 티어      src/lib/llm/types.ts  MODELS       (gemini-2.5-*)
//   2) 프록시 허용 목록      gemini-proxy          MODELS_ALLOWED
//   3) 좌석별 모델          claude-proxy          PURPOSE_MODEL / ANTHROPIC_PURPOSE_MODELS
// 셋 중 하나만 낡아도 조용히 구형 모델을 쓰거나 400 이 난다. 실제로 지금
// gemini-proxy 허용 목록에 3.5-flash 까지만 있어서 그 위 세대는 넣어도 거부된다.
//
// 해법: **버전이 아니라 등급(class)으로 좌석을 선언**하고, 그 등급의 최신 모델을
// 벤더 API 에서 발견한다. 사람이 "지금 최신이 뭐지"를 기억할 필요가 없어진다.
//
// 안전장치가 승격의 전제다:
//   - 등급 매칭      "제일 새 모델"이 아니라 "이 등급에서 제일 새 모델". 실험판이나
//                    엉뚱하게 비싼 티어로 건너뛰지 않는다.
//   - 스모크 테스트   구조화 출력을 실제로 시켜본다. 스키마를 못 지키면 승격 없음.
//   - 핀             MODEL_PIN_<SEAT> 이 있으면 그 좌석은 건드리지 않는다.
//   - 기본 dry-run   --apply 를 주기 전까지는 아무것도 바꾸지 않고 보고만 한다.
//
// 사용:
//   npx tsx scripts/refresh-models.ts            # 발견 + 시험, 보고만
//   npx tsx scripts/refresh-models.ts --apply    # 통과한 것을 실제로 승격
//
// 키가 없는 벤더는 건너뛴다(에러가 아니다). CI 에서 키 없이 돌려도 통과한다.

type Vendor = "anthropic" | "openai" | "google";

export interface SeatClass {
  /** 좌석 등급 이름. 로그와 핀 환경변수에 쓰인다. */
  id: string;
  vendor: Vendor;
  /** 이 등급에 속하는 모델 이름 패턴. 첫 매치가 아니라 전부 모아 최신을 고른다. */
  match: RegExp;
  /** 실험판·미리보기·구세대를 걸러낸다. */
  exclude?: RegExp;
  /** 사람이 읽는 설명. */
  note: string;
}

// 등급 정의. **여기에 버전 숫자를 적지 않는다.** 숫자를 적는 순간 다시 낡는다.
//
// export 인 이유: 테스트가 **이 정의 자체**를 검사해야 하기 때문이다. 예전 테스트는
// 같은 모양의 사본을 따로 들고 있었는데, 그러면 여기를 고쳐도 테스트는 사본을 계속
// 통과시킨다. 2026-08-18 의 검색-모델 구멍이 정확히 그래서 테스트를 빠져나갔다.
export const SEATS: SeatClass[] = [
  {
    id: "anthropic-sonnet",
    vendor: "anthropic",
    match: /^claude-sonnet-/,
    exclude: /preview|beta|latest/,
    note: "대화·짧은 상호작용 좌석 (secondb_chat, advisor 등)",
  },
  {
    id: "anthropic-opus",
    vendor: "anthropic",
    match: /^claude-opus-/,
    exclude: /preview|beta|latest/,
    note: "고위험 서술 좌석 (persona_narrative, digest_weekly 등)",
  },
  {
    id: "openai-frontier",
    vendor: "openai",
    // **모양을 고정하는 허용 목록이다. 금지 목록이 아니다.**
    //
    // 예전에는 `/^gpt-\d/` 로 문을 열어두고 exclude 로 변형을 하나씩 막았다.
    // 금지 목록은 새 변형이 나올 때마다 조용히 열린다. 2026-08-18 dry-run
    // (run 32135458171) 이 그 구멍을 실제로 밟았다 — 검색 전용 변형
    // `gpt-5-search-api-2025-10-14` 가 `/^gpt-\d/` 에 걸리고 어떤 exclude 에도
    // 안 걸려서 **추론 좌석 9개의 승격 후보로 올라왔다.**
    //
    // 스모크 테스트는 이걸 못 잡는다. 검색 모델도 `{"ok":true}` 는 정상적으로
    // 뱉으므로 "시험 통과" 가 뜬다. "스모크 테스트가 있으니 안전하다"는 가정이
    // 여기서 깨진다 — 그래서 방어선을 시험이 아니라 **모양**에 둔다.
    //
    //   통과: gpt-5 · gpt-5.4 · gpt-5.10 · gpt-4.1   (접미사 없는 세대 슬러그)
    //   거절: gpt-5-search-api-… · gpt-5-codex · gpt-4o-mini · gpt-5-2025-08-07
    //
    // 아무것도 안 걸리면 승격이 없다 = 쓰던 모델이 그대로 남는다. 실패가 닫히는
    // 쪽으로 떨어진다. 날짜 스냅샷을 거절하는 것도 의도다 — versionKey 주석 참조.
    match: /^gpt-\d+(?:\.\d+)*$/,
    // 이중 방어. match 가 언젠가 느슨해져도 전용 변형은 여기서 한 번 더 막힌다.
    exclude: /mini|nano|audio|realtime|image|preview|turbo|instruct|search|transcribe|tts|codex/,
    note: "추론 좌석 9개",
  },
  {
    id: "google-flash",
    vendor: "google",
    match: /^models\/gemini-[\d.]+-flash$/,
    exclude: /preview|exp|thinking/,
    note: "OCR·음성 전사 (gemini-proxy 만 이미지·오디오 inline data 를 전달)",
  },
  {
    id: "google-flash-lite",
    vendor: "google",
    match: /^models\/gemini-[\d.]+-flash-lite$/,
    exclude: /preview|exp/,
    note: "분류 등 경량 좌석",
  },
  {
    id: "google-pro",
    vendor: "google",
    match: /^models\/gemini-[\d.]+-pro$/,
    exclude: /preview|exp|thinking/,
    note: "깊은 분석이 필요한 Gemini 좌석",
  },
];

// 비용 정책 (Simon 2026-08-17): "간단한 작업은 최신이되 저렴한 모델, effort 가
// 필요하면 고비용 모델로 상세 분석."
//
// 등급을 **비용 축**으로 세워둔다. 자동 승격은 같은 축 안에서만 움직인다 —
// 분류 좌석이 어느 날 프론티어 모델로 올라가서 요금이 튀는 일이 없어야 하고,
// 반대로 깊은 분석 좌석이 조용히 싼 모델로 내려가서 품질이 떨어져도 안 된다.
//
// 어느 목적이 어느 축에 있는지는 코드가 이미 갖고 있다:
//   src/lib/llm/types.ts   PURPOSE_TIER   lite | flash | pro
//   src/lib/llm/routing.ts PHASE2_EFFORT  low | medium | high | xhigh
// 이 스크립트는 그 축의 **모델만** 최신으로 유지한다. 어느 목적이 어느 축인지는
// 바꾸지 않는다. 그건 제품 결정이지 자동화가 할 일이 아니다.
export const COST_AXIS: Readonly<Record<"cheap" | "mid" | "deep", readonly string[]>> = {
  // 분류·태깅처럼 양이 많고 뉘앙스가 필요 없는 것
  cheap: ["google-flash-lite"],
  // 대화·구조화 출력처럼 상호작용하지만 깊지 않은 것
  mid: ["anthropic-sonnet", "google-flash"],
  // 페르소나 종합·주간 다이제스트처럼 effort 가 필요한 것
  deep: ["anthropic-opus", "openai-frontier", "google-pro"],
};

/** 이 좌석이 속한 비용 축. 축이 없으면 승격 대상이 아니다. */
export function costAxisOf(seatId: string): "cheap" | "mid" | "deep" | null {
  for (const [axis, seats] of Object.entries(COST_AXIS)) {
    if (seats.includes(seatId)) return axis as "cheap" | "mid" | "deep";
  }
  return null;
}

// ── 승격을 어떤 시크릿으로 쓰는가 ─────────────────────────────────
//
// ⚠ **여기가 2026-08-20 에 고쳐진 자리다. 되돌리지 말 것.**
//
// 이 스크립트는 "승격은 자기 비용 축 안에서만" 을 약속한다(COST_AXIS 주석).
// 그런데 openai-frontier 만 그 약속을 **적용 단계에서** 깨고 있었다 — 승격 값을
// `OPENAI_MODEL` 로 썼는데 그건 좌석별 값이 아니라 **전역 킬스위치**다.
// openai-proxy 의 resolveModel() 우선순위가 이렇다:
//
//   OPENAI_PURPOSE_MODELS (좌석별 JSON)  >  OPENAI_MODEL (전역)  >  PURPOSE_MODEL (내장 좌석)
//
// 즉 `OPENAI_MODEL=gpt-5.5` 한 줄이 내장 좌석을 **전부** 덮는다. 실측 피해:
//
//   safety_classify : gpt-5.4-nano -> gpt-5.5   ← 싼 축 좌석이 프론티어로. C9 상
//                                                 모든 LLM 호출 앞에서 도는 좌석이다
//   secondb_chat    : gpt-5.4      -> gpt-5.5   ← 앱 최다 호출 표면
//
// 앞의 것이 정확히 COST_AXIS 주석이 "없어야 한다" 고 적어둔 사고다. 스모크
// 테스트는 못 잡는다 — 승격된 모델 자체는 멀쩡하니까 시험은 통과한다.
//
// 그래서 Anthropic 쪽이 이미 하던 방식으로 맞춘다: **좌석별 JSON 으로 쓴다.**
// 전역 킬스위치는 사람이 사고 대응으로 쓰는 손잡이로 남겨둔다.

/** claude-proxy PURPOSE_MODEL 의 sonnet 좌석. 등급 배정이 아니라 **모델 이름만** 갱신한다. */
export const ANTHROPIC_SONNET_PURPOSES = [
  "advisor",
  "secondb_chat",
  "gap_synthesize",
  "self_model_propose",
  "northstar_propose",
  "ops_recommend",
  "ops_daily_brief",
  "ttfv_first_insight",
] as const;

/** claude-proxy PURPOSE_MODEL 의 opus 좌석. */
export const ANTHROPIC_OPUS_PURPOSES = [
  "persona_narrative",
  "axis_estimate",
  "persona_synthesis",
  "digest_weekly",
] as const;

/**
 * openai-proxy PURPOSE_MODEL 좌석 중 **프론티어 축에 있는 것들**.
 *
 * `safety_classify` 는 여기 없다 — 그 좌석은 `gpt-5.4-nano`(싼 축)고, 값이 싸다는
 * 것 자체가 그 좌석의 설계다(reasoning_effort none). 프론티어 승격이 거기 닿으면
 * 안 된다. 목록에서 빼는 것이 그 방어선이다.
 *
 * ⚠ openai-proxy 의 좌석표와 **손으로 맞춰둔 사본**이다. 어긋나면
 * `refresh-models.test.ts` 의 표류 가드가 잡는다 (프록시 파일을 직접 읽어 대조).
 */
export const OPENAI_FRONTIER_PURPOSES = [
  "cluster_infer",
  "advisor",
  "persona_narrative",
  "gap_synthesize",
  "self_model_propose",
  "northstar_propose",
  "axis_estimate",
  "persona_synthesis",
  "ops_recommend",
  "ops_daily_brief",
  "digest_weekly",
  "ttfv_first_insight",
  "secondb_chat",
] as const;

/** 좌석 -> 시크릿 이름. 등급별로 하나씩이라 승격이 축을 넘나들 수 없다. */
const SECRET_OF: Record<string, string> = {
  "google-flash": "GEMINI_MODEL_FLASH",
  "google-flash-lite": "GEMINI_MODEL_FLASH_LITE",
  "google-pro": "GEMINI_MODEL_PRO",
};

/**
 * 승격 결정 -> 설정할 엣지 시크릿. 네트워크가 없는 순수 함수라 테스트가 붙는다.
 *
 * 승격이 없으면 빈 배열이다. Google 은 좌석당 시크릿 하나, Anthropic·OpenAI 는
 * 목적별 JSON 하나씩이다.
 */
export function secretsFor(
  promotable: readonly { seat: { id: string }; chosen: string | null }[]
): { name: string; value: string }[] {
  const secrets: { name: string; value: string }[] = [];
  const anthropic: { sonnet?: string; opus?: string } = {};
  let openaiFrontier: string | null = null;

  for (const d of promotable) {
    if (!d.chosen) continue;
    // Google 모델 이름은 목록 API 가 "models/" 접두사를 붙여 준다. 프록시는 슬러그만 쓴다.
    const value = d.chosen.replace(/^models\//, "");
    const direct = SECRET_OF[d.seat.id];
    if (direct) secrets.push({ name: direct, value });
    else if (d.seat.id === "anthropic-sonnet") anthropic.sonnet = value;
    else if (d.seat.id === "anthropic-opus") anthropic.opus = value;
    else if (d.seat.id === "openai-frontier") openaiFrontier = value;
  }

  if (anthropic.sonnet || anthropic.opus) {
    const map: Record<string, string> = {};
    if (anthropic.sonnet) for (const p of ANTHROPIC_SONNET_PURPOSES) map[p] = anthropic.sonnet;
    if (anthropic.opus) for (const p of ANTHROPIC_OPUS_PURPOSES) map[p] = anthropic.opus;
    secrets.push({ name: "ANTHROPIC_PURPOSE_MODELS", value: JSON.stringify(map) });
  }

  if (openaiFrontier) {
    const map: Record<string, string> = {};
    for (const p of OPENAI_FRONTIER_PURPOSES) map[p] = openaiFrontier;
    secrets.push({ name: "OPENAI_PURPOSE_MODELS", value: JSON.stringify(map) });
  }

  return secrets;
}

interface Discovered {
  seat: SeatClass;
  /** 벤더가 알려준, 이 등급에 속하는 모델들 (최신 우선). */
  candidates: string[];
  chosen: string | null;
  skipped?: string;
}

/**
 * "claude-sonnet-5" / "gpt-5.6" / "gemini-3.7-flash" 에서 버전 숫자만 뽑는다.
 *
 * ⚠ **이름 안의 숫자를 전부 버전으로 읽는다. 날짜도 버전이 된다.**
 *   gpt-5-2025-08-07 -> [5, 2025, 8, 7]
 *   gpt-5.4          -> [5, 4]
 * 자리별로 비교하므로 둘째 자리에서 2025 > 4 가 되어 **날짜 붙은 스냅샷이 깔끔한
 * 세대 슬러그를 항상 이긴다.** 이건 고치지 않고 좌석 쪽에서 피한다 —
 * openai-frontier 의 match 가 접미사 없는 슬러그만 받아서 날짜 스냅샷이 애초에
 * 후보로 들어오지 않는다. 벤더가 날짜 스냅샷만 내는 좌석을 새로 만들 거라면
 * 그 좌석에서 이 함수를 쓰기 전에 날짜를 떼는 정규화가 먼저 필요하다.
 */
function versionKey(name: string): number[] {
  const nums = name.match(/\d+(?:\.\d+)*/g) ?? [];
  const flat = nums.join(".").split(".").map((n) => Number.parseInt(n, 10));
  return flat.filter((n) => Number.isFinite(n));
}

/** 버전 배열 비교. 자리수가 다르면 짧은 쪽을 0 으로 채운다. */
function compareVersions(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = (b[i] ?? 0) - (a[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** 등급에 속하는 모델 중 가장 새 것. 이름의 버전 숫자로만 판단한다. */
export function pickNewest(names: readonly string[], seat: SeatClass): string | null {
  const inClass = names.filter((n) => seat.match.test(n) && !(seat.exclude?.test(n) ?? false));
  if (inClass.length === 0) return null;
  return [...inClass].sort((x, y) => compareVersions(versionKey(x), versionKey(y)))[0];
}

async function listAnthropic(key: string): Promise<string[]> {
  const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const body = (await res.json()) as { data?: { id?: string }[] };
  return (body.data ?? []).map((m) => m.id ?? "").filter(Boolean);
}

async function listOpenAI(key: string): Promise<string[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  const body = (await res.json()) as { data?: { id?: string }[] };
  return (body.data ?? []).map((m) => m.id ?? "").filter(Boolean);
}

async function listGoogle(key: string): Promise<string[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=200`,
  );
  if (!res.ok) throw new Error(`google ${res.status}`);
  const body = (await res.json()) as { models?: { name?: string }[] };
  return (body.models ?? []).map((m) => m.name ?? "").filter(Boolean);
}

const KEY_ENV: Record<Vendor, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
};

async function listModels(vendor: Vendor, key: string): Promise<string[]> {
  if (vendor === "anthropic") return listAnthropic(key);
  if (vendor === "openai") return listOpenAI(key);
  return listGoogle(key);
}

/**
 * 실패한 응답을 사람이 읽을 한 줄로 만든다.
 *
 * 본문을 버리고 코드만 남기면 진단이 불가능하다. 2026-08-18 로그의
 * `anthropic-sonnet: claude-sonnet-5 - 시험 실패 (HTTP 400)` 이 그랬다 —
 * 크레딧이 없는 것인지 모델 ID 형식이 틀린 것인지 구분할 방법이 없었고,
 * 확인하려면 사람이 직접 curl 을 쳐야 했다. 벤더는 이유를 본문에 담아 준다.
 */
async function httpWhy(r: { status: number; text: () => Promise<string> }): Promise<string> {
  const body = await r.text().catch(() => "");
  const head = body.replace(/\s+/g, " ").trim().slice(0, 200);
  return head ? `HTTP ${r.status} ${head}` : `HTTP ${r.status}`;
}

/**
 * 승격 전 시험. 구조화 출력을 실제로 시켜보고 스키마를 지키는지 본다.
 *
 * 이게 이 스크립트에서 제일 중요한 부분이다. "새 모델 = 더 좋은 모델"이 아니다.
 * 새 모델이 JSON 을 다르게 감싸거나 스키마를 무시하면, 이 앱의 파서가 조용히
 * 빈 결과를 돌려주고 사용자는 "세컨비가 아무 말도 안 한다"를 겪는다.
 * 시험을 통과하지 못하면 승격하지 않고 쓰던 모델을 그대로 둔다.
 */
async function smokeTest(vendor: Vendor, model: string, key: string): Promise<{ ok: boolean; why: string }> {
  const ask = '{"ok":true} 라는 JSON 만 출력해라. 설명하지 마라.';
  try {
    if (vendor === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 64, messages: [{ role: "user", content: ask }] }),
      });
      if (!r.ok) return { ok: false, why: await httpWhy(r) };
      const b = (await r.json()) as { content?: { text?: string }[] };
      const text = (b.content ?? []).map((c) => c.text ?? "").join("");
      return text.includes('"ok"') ? { ok: true, why: "구조화 출력 확인" } : { ok: false, why: `예상 밖 출력: ${text.slice(0, 60)}` };
    }
    if (vendor === "openai") {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: ask }], max_completion_tokens: 64 }),
      });
      if (!r.ok) return { ok: false, why: await httpWhy(r) };
      const b = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      const text = b.choices?.[0]?.message?.content ?? "";
      return text.includes('"ok"') ? { ok: true, why: "구조화 출력 확인" } : { ok: false, why: `예상 밖 출력: ${text.slice(0, 60)}` };
    }
    const slug = model.replace(/^models\//, "");
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${slug}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: ask }] }] }),
      },
    );
    if (!r.ok) return { ok: false, why: await httpWhy(r) };
    const b = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = (b.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    return text.includes('"ok"') ? { ok: true, why: "구조화 출력 확인" } : { ok: false, why: `예상 밖 출력: ${text.slice(0, 60)}` };
  } catch (e) {
    return { ok: false, why: (e as Error).message };
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const out: Discovered[] = [];

  console.log(apply ? "모델 최신화 (적용 모드)" : "모델 최신화 (dry-run - 아무것도 바꾸지 않습니다)");
  console.log("");

  const byVendor = new Map<Vendor, string[]>();
  for (const vendor of ["anthropic", "openai", "google"] as Vendor[]) {
    const key = (process.env[KEY_ENV[vendor]] ?? "").trim();
    if (!key) continue;
    try {
      byVendor.set(vendor, await listModels(vendor, key));
    } catch (e) {
      console.log(`  ${vendor}: 목록 조회 실패 - ${(e as Error).message}`);
    }
  }

  for (const seat of SEATS) {
    const pin = (process.env[`MODEL_PIN_${seat.id.toUpperCase().replace(/-/g, "_")}`] ?? "").trim();
    if (pin) {
      out.push({ seat, candidates: [], chosen: pin, skipped: `핀 고정: ${pin}` });
      console.log(`  ${seat.id}: 핀 고정 (${pin}) - 건너뜀`);
      continue;
    }
    const names = byVendor.get(seat.vendor);
    if (!names) {
      out.push({ seat, candidates: [], chosen: null, skipped: `${KEY_ENV[seat.vendor]} 없음` });
      console.log(`  ${seat.id}: ${KEY_ENV[seat.vendor]} 가 없어 건너뜀`);
      continue;
    }
    const newest = pickNewest(names, seat);
    if (!newest) {
      out.push({ seat, candidates: [], chosen: null, skipped: "등급에 맞는 모델 없음" });
      console.log(`  ${seat.id}: 등급에 맞는 모델을 찾지 못함`);
      continue;
    }
    const key = (process.env[KEY_ENV[seat.vendor]] ?? "").trim();
    const test = await smokeTest(seat.vendor, newest, key);
    out.push({ seat, candidates: [newest], chosen: test.ok ? newest : null, skipped: test.ok ? undefined : test.why });
    console.log(`  ${seat.id}: ${newest} - ${test.ok ? "시험 통과" : `시험 실패 (${test.why}) - 승격 안 함`}`);
  }

  console.log("");
  const promotable = out.filter((d) => d.chosen && !d.skipped);
  if (promotable.length === 0) {
    console.log("승격할 것이 없습니다.");
  } else {
    console.log("승격 후보:");
    for (const d of promotable) console.log(`  ${d.seat.id} -> ${d.chosen}   (${d.seat.note})`);
  }

  if (!apply) {
    console.log("");
    console.log("dry-run 이라 아무것도 바꾸지 않았습니다.");
    return;
  }

  // ── 승격 ──────────────────────────────────────────────────────────
  //
  // 모델 선택은 서버 소유다. 그래서 승격은 **코드 배포가 아니라 엣지 시크릿
  // 갱신**이고, 되돌리기도 같은 방식이다.
  //
  // 되돌리는 법 (한 줄): 그 좌석의 핀을 세우고 다시 돌린다.
  //   MODEL_PIN_ANTHROPIC_OPUS=claude-opus-4-8
  // 핀이 있으면 발견 자체를 건너뛰므로 이전 모델이 그대로 다시 쓰인다.
  const token = (process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
  const ref = (process.env.SUPABASE_PROJECT_REF ?? "").trim();

  const secrets = secretsFor(promotable);

  if (secrets.length === 0) {
    console.log("승격할 시크릿이 없습니다.");
    return;
  }

  console.log("");
  console.log("설정할 시크릿:");
  for (const sec of secrets) console.log(`  ${sec.name}=${sec.value}`);

  if (!token || !ref) {
    // 자격증명이 없는 곳(로컬·포크 CI)에서는 실패가 아니라 안내로 끝낸다.
    console.log("");
    console.log("SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF 가 없어 적용하지 않았습니다.");
    console.log("손으로 적용하려면:");
    for (const sec of secrets) console.log(`  supabase secrets set ${sec.name}='${sec.value}' --project-ref <ref>`);
    return;
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/secrets`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(secrets),
  });
  if (!res.ok) {
    console.error(`시크릿 적용 실패: HTTP ${res.status} ${await res.text()}`);
    process.exitCode = 1;
    return;
  }
  console.log("");
  console.log(`적용 완료 (${secrets.length}건). 엣지 함수는 다음 호출부터 새 모델을 씁니다.`);
  console.log("되돌리려면 그 좌석에 MODEL_PIN_<SEAT> 을 세우고 다시 실행하십시오.");
}

// 테스트에서 import 할 때는 실행하지 않는다.
if (process.argv[1]?.includes("refresh-models")) {
  void main();
}
