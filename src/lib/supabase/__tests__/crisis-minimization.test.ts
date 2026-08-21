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

  it("그 값을 읽거나 선언하는 코드가 여전히 없다", () => {
    // 소비자가 생기면 최소화 판단의 전제("쓸모가 없다")가 무너진다.
    // 그때는 지우는 게 아니라 동의 근거를 먼저 세워야 한다.
    //
    // ⚠ 이 검사는 원래 **파일 단위**였다: 파일 어딘가에 p_cssrs_level 이 있으면
    // 그 파일 전체가 면제됐다. 그래서 types.gen.ts 가 컬럼 선언 3줄을 0129 이후에도
    // 들고 있었는데 verify 가 통과했다 - 같은 파일 아래쪽 RPC 파라미터가 가려준
    // 것이다. 이제 **줄 단위**로 본다. 덕분에 types.gen.ts 예외도 필요 없어졌다.
    const offenders: string[] = [];
    const NL = String.fromCharCode(10);
    for (const file of walk(join(ROOT, "src"))) {
      if (file.includes("__tests__")) continue;
      // 주석은 이 항목을 **설명하려고** 이름을 부른다. 실행 코드만 본다 -
      // 앞서 다른 가드에서 똑같이 걸렸다. 줄 번호가 밀리지 않도록 블록 주석은
      // 줄바꿈만 남기고 지운다.
      const src = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\r\n]/g, " "))
        .replace(new RegExp("//[^" + NL + "]*", "g"), " ");
      src.split(NL).forEach((line, i) => {
        // 쓰는 쪽(p_cssrs_level)만 허용된다. 설치된 앱이 계속 보내기 때문에
        // RPC 파라미터는 남겨둔 것이고, 그 값은 서버에서 버려진다.
        if (/\bcssrs_level\b/.test(line) && !/p_cssrs_level/.test(line)) {
          offenders.push(`${file.slice(ROOT.length + 1)}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
