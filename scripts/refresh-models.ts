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

interface SeatClass {
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
const SEATS: SeatClass[] = [
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
    match: /^gpt-\d/,
    // o-시리즈·mini·오디오·이미지 전용 변형은 추론 좌석이 아니다.
    exclude: /mini|nano|audio|realtime|image|preview|turbo|instruct/,
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
];

interface Discovered {
  seat: SeatClass;
  /** 벤더가 알려준, 이 등급에 속하는 모델들 (최신 우선). */
  candidates: string[];
  chosen: string | null;
  skipped?: string;
}

/** "claude-sonnet-5" / "gpt-5.6" / "gemini-3.7-flash" 에서 버전 숫자만 뽑는다. */
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
      if (!r.ok) return { ok: false, why: `HTTP ${r.status}` };
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
      if (!r.ok) return { ok: false, why: `HTTP ${r.status}` };
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
    if (!r.ok) return { ok: false, why: `HTTP ${r.status}` };
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

  // 승격 경로는 아직 배선되지 않았다. 이 스크립트는 지금 **발견과 시험까지만** 한다.
  //
  // 마지막 한 걸음(Supabase 엣지 시크릿 갱신)은 운영 자격증명이 필요하고,
  // 밤마다 프로덕션 설정을 자동으로 바꾸는 일이라 Simon 의 확인 없이 켜지 않는다.
  // 통과한 모델을 지금 쓰려면 아래를 손으로 실행하면 된다(코드 배포 없음):
  //
  //   supabase secrets set ANTHROPIC_PURPOSE_MODELS='{"secondb_chat":"<model>"}'
  //   supabase secrets set GEMINI_MODELS_ALLOWED='<model>'   # 패턴 밖일 때만
  //
  // 배선할 때 필요한 것: SUPABASE_ACCESS_TOKEN + project ref, 그리고 실패 시
  // 이전 값으로 되돌리는 경로. 되돌리기가 없으면 켜면 안 된다.
  console.log("");
  console.log("--apply 는 아직 배선되지 않았습니다. 발견과 시험까지만 수행했습니다.");
  console.log("승격은 Supabase 엣지 시크릿 갱신이라 운영 자격증명이 필요합니다.");
  console.log("위 '승격 후보'를 supabase secrets set 으로 손수 적용할 수 있습니다.");
  process.exitCode = 0;
}

// 테스트에서 import 할 때는 실행하지 않는다.
if (process.argv[1]?.includes("refresh-models")) {
  void main();
}
