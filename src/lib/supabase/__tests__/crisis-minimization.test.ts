// crisis_events 최소화 (법률 검토 Q4, 2026-08-17).
//
// cssrs_level 은 C-SSRS - 자살 위험도를 재는 임상 척도다. 그 숫자를 사람마다
// 저장하면 PIPA 제23조 민감정보(건강) 처리로 설계해야 하고, 검토 의견은
// §15①5호(긴급 생명·신체 이익)를 민감정보에 원용할 수 없다고 본다. 그러면
// 근거가 §23①1호 별도 동의뿐인데 지금 그 동의는 받지 않는다.
//
// 그리고 이 값을 읽는 코드가 저장소에 없다. 라우팅은 zone 이 하고 그건 따로
// 남는다. 쓸모는 없고 위험만 남는 항목이라 더 쓰지 않는다.
//
// 이 테스트가 지키는 것: 나중에 누가 "메타데이터가 비어 있네" 하고 되살리지
// 못하게 하는 것. 되살리려면 이 파일을 지나야 하고, 그때 위 근거를 읽게 된다.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".worktrees" || name === ".git") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

describe("crisis_events 최소화", () => {
  it("임상 척도 숫자를 더 이상 쓰지 않는다", () => {
    const src = readFileSync(join(ROOT, "src", "lib", "supabase", "crisis-events.ts"), "utf8");
    expect(src).toContain("p_cssrs_level: null");
    expect(src).not.toContain("p_cssrs_level: meta.cssrsLevel");
  });

  it("그래도 위기 사건 자체는 계속 기록된다", () => {
    // 최소화가 "안 남긴다" 가 되면 안 된다. 어떤 경로로 라우팅했는지는
    // 사고 조사와 설명 의무에 필요하다.
    const src = readFileSync(join(ROOT, "src", "lib", "supabase", "crisis-events.ts"), "utf8");
    expect(src).toContain("log_crisis_event");
    expect(src).toContain("p_trigger_categories");
    expect(src).toContain("p_routing_template_version");
  });

  it("그 값을 읽는 코드가 여전히 없다", () => {
    // 소비자가 생기면 최소화 판단의 전제("쓸모가 없다")가 무너진다.
    // 그때는 지우는 게 아니라 동의 근거를 먼저 세워야 한다.
    const readers: string[] = [];
    for (const file of walk(join(ROOT, "src"))) {
      if (file.includes("__tests__")) continue;
      // 주석은 이 항목을 **설명하려고** 이름을 부른다(safety.ts 가 CHECK 제약을
      // 설명한다). 실행 코드만 본다 - 앞서 다른 가드에서 똑같이 걸렸다.
      const src = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(new RegExp("//[^" + String.fromCharCode(10) + "]*", "g"), " ");
      // 쓰는 쪽(p_cssrs_level)과 타입 정의는 소비가 아니다.
      if (/\bcssrs_level\b/.test(src) && !/p_cssrs_level/.test(src) && !file.endsWith("types.gen.ts")) {
        readers.push(file.slice(ROOT.length + 1));
      }
    }
    expect(readers).toEqual([]);
  });
});
