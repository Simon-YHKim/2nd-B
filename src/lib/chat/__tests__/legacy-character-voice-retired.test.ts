// 옛 캐릭터 다섯의 목소리 · 그림이 배송 코드로 돌아오지 않는다.
//
// Simon 결정 Q-261004-14 A · Q-261004-15 A (2026-10-05, PRD v3 §17-j "캐릭터 보이스
// 폐기") + 메모 "가디 영역 전부 legacy 아니야? … 없어지는게 맞는거 같은데".
//
// 왜 검사가 필요했나: 옛 캐릭터 다섯(아치·가디·루루·모모·루미, 표시 이름 Archon ·
// Relia · Lumen · Foreman Momo · Lumina)은 "롤백 스킨에만 보존" 이라고 적혀 있었는데
// 실제로는 배송 /secondb 가 ?character= 를 읽었다. /jarvis 리다이렉트와
// secondbrain:// 딥링크도 그 값을 그대로 넘겼다. 링크 하나로 "Speak as Momo…" 같은
// 지시가 유료 LLM 프롬프트에 들어갔고, 라이브 웹 번들에서 그 문자열이 실측됐다
// (2026-10-04 18:57 KST, QA L4-13). 스킨 플래그도 없이 파라미터만으로 켜졌으니
// 어떤 검사도 그 길을 보지 않았다. 아래 넷이 그 길과 그림을 각각 막는다.
//
// 명부 원본은 E:/Legacy/2ndB 에 있다(MANIFEST batch qa261004-chars).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), "utf8");

/** `//` · `/* *\/` 주석을 걷어낸 코드. 이 저장소의 주석은 걷어낸 것을 이름으로 적는다. */
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

function walk(dir: string, keep: (file: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, keep));
    else if (keep(full)) out.push(full);
  }
  return out;
}

const toRel = (full: string): string => path.relative(ROOT, full).split(path.sep).join("/");
const PRODUCT_SOURCES = walk(path.join(ROOT, "src"), (f) => /\.(ts|tsx)$/.test(f))
  .map(toRel)
  .filter((rel) => !rel.includes("/__tests__/"));

const LOCALES = ["en", "ko", "es", "id", "pt"] as const;

describe("옛 캐릭터 목소리 경로는 꺼져 있다", () => {
  test("대화 화면과 /jarvis 가 ?character= 를 읽거나 넘기지 않는다", () => {
    const chat = code("src/app/secondb.tsx");
    expect(chat).not.toMatch(/\bparams\.character\b/);
    expect(chat).not.toMatch(/\bcharacter\??\s*:\s*string/);
    expect(chat).not.toMatch(/\bisCharacterChat\b|\bgetPersona\b|\bPERSONAS\b/);

    // /jarvis 는 받은 파라미터를 통째로 넘기던 리다이렉트다. 이름을 골라 넘겨야
    // character 가 새지 않는다 - 통째로 넘기는 모양 자체를 막는다.
    const jarvis = code("src/app/jarvis.tsx");
    expect(jarvis).not.toMatch(/\bcharacter\b/);
    expect(jarvis).not.toMatch(/params\s*=\s*useLocalSearchParams/);
  });

  test("명부 모듈이 없고 아무 배송 코드도 그것을 import 하지 않는다", () => {
    expect(existsSync(path.join(ROOT, "src/lib/chat/personas.ts"))).toBe(false);
    expect(existsSync(path.join(ROOT, "src/lib/characters.ts"))).toBe(false);
    const importers = PRODUCT_SOURCES.filter((rel) =>
      /from\s+["'](?:@\/lib\/chat\/personas|@\/lib\/characters|(?:\.\.?\/)+(?:chat\/)?(?:personas|characters))["']/.test(code(rel)),
    );
    expect(importers).toEqual([]);
    // 0건 통과를 막는다 - 스캔이 비면 위 줄은 아무것도 안 본 채 초록이 된다.
    expect(PRODUCT_SOURCES.length).toBeGreaterThan(100);
  });

  test("로케일에 명부 문구와 옛 캐릭터 이름이 없다", () => {
    for (const lang of LOCALES) {
      const bundle = JSON.parse(read(`locales/${lang}/secondb.json`)) as Record<string, unknown>;
      expect({ lang, keys: ["personas", "characters"].filter((k) => k in bundle) }).toEqual({ lang, keys: [] });
    }
    // 이름은 번역 하나에도 숨는다 - 2026-10-05 에 id 의 capture 저장 제목이
    // "Lumen menyimpan catatan baru" 였다. 그래서 묶음 전부를 본다.
    const OLD_NAMES =
      /\b(?:Archon|Relia|Lumen|Lumina|Foreman Momo|Momo|Gadi|Lulu|Archi|Lumi)\b|아콘|릴리아|루멘|루미나|모모|가디|루루|루미|아치|Speak as/;
    const hits: string[] = [];
    for (const lang of LOCALES) {
      for (const file of walk(path.join(ROOT, "locales", lang), (f) => f.endsWith(".json"))) {
        const text = readFileSync(file, "utf8");
        const m = text.match(OLD_NAMES);
        if (m) hits.push(`${toRel(file)}: ${m[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("옛 캐릭터 그림은 배송 화면에 없다 (가디 영역 전부)", () => {
  test("다섯 캐릭터의 스프라이트 자산을 가리키는 코드가 없다", () => {
    const ASSET = /(?:archi|gadi|lulu|momo|lumi)_premium_|companions\/sprites\/|momo-crew\//;
    const refs = PRODUCT_SOURCES.filter((rel) => ASSET.test(code(rel)));
    expect(refs).toEqual([]);
    // 남은 워커 스프라이트는 세컨비 하나다.
    expect(code("src/components/art/WorkerSprite.tsx")).toMatch(/export type WorkerId = "secondb";/);
  });

  test("토큰이 옛 캐릭터 색 키와 Brain Stack 마스코트 팔레트를 내보내지 않는다", () => {
    // 2026-10-05 QA R2E-12: tokens.characters(secondb · momo · lulu · archi · gadi · lumi 키)와
    // mascot 9색은 읽는 곳이 자기 테스트뿐이라 E:/Legacy/2ndB 로 갔다. 키 이름이 곧 옛 캐릭터
    // 명부라, 이것이 돌아오면 명부가 색 이름으로 되살아난다.
    const tokens = code("src/lib/theme/tokens.ts");
    expect(tokens).not.toMatch(/export\s+const\s+(?:characters|mascot)\b/);
    expect(tokens).not.toMatch(/export\s+type\s+(?:CharacterName|MascotName)\b/);
  });

  test("위기 안내 모달과 대화 안전 멈춤이 캐릭터를 그리지 않는다", () => {
    // 위기 모달: 글과 번호만. 그림 모듈을 아예 들이지 않는다.
    const crisis = code("src/components/safety/CrisisRouter.tsx");
    expect(crisis).not.toMatch(/from\s+["']@\/components\/art\//);
    expect(crisis).not.toMatch(/Sprite\b/);

    // 이벤트 순간에는 캐릭터 몸도 안전 이벤트도 없다.
    const moment = code("src/components/art/CompanionSprite.tsx");
    expect(moment).not.toMatch(/WorkerSprite|\bgadi\b|\bmomo\b|\blulu\b|\barchi\b|\blumi\b/);
    expect(moment).not.toMatch(/safety/i);

    // 대화의 멈춤은 글(result.hint)만 남는다.
    const chat = code("src/app/secondb.tsx");
    expect(chat).not.toMatch(/safetySoftStop|safetyClear|CompanionMoment|useCompanionMoment/);
  });
});
