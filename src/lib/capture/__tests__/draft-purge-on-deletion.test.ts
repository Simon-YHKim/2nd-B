import { readFileSync } from "fs";
import { join } from "path";

/**
 * R4 (기술 흐름 정합성) — 계정을 지워도 기기에 남던 일기 초안.
 *
 * 삭제 경로는 서버를 지우고(`auth.users` → cascade → raw-clippings sweep) 로그아웃한다.
 * 그런데 **로컬은 아무도 안 지웠다.** `signOut()` 은 Supabase 세션만 비우므로
 * `capture.drafts.v2.<userId>` 와 `capture.journalDraft.v1.<userId>` 가 그대로 남았다 —
 * 아직 보내지 않은 일기 본문, 이 앱이 들고 있는 가장 사적인 내용이 자기가 속했던 계정보다
 * 오래 살아남았다.
 *
 * ⚠ 원장 L6 은 `purgeDeletedAccountLocalDataWithRetry` 가 있다고 적고 있었다.
 * `git log -S ... --all` 이 0건이다. 그 서술이 낡았다.
 */
const ROOT = process.cwd();
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

const DRAFT = "src/lib/capture/draft.ts";
/**
 * 배포되는 삭제 경로 하나만 대상이다.
 *
 * `src/app/account.tsx` 의 `AccountLegacy` 도 같은 구멍을 갖고 있지만 그 함수는
 * `account-pixel-clay-contract.test.ts` 가 **SHA 로 바이트 단위 동결**하고 있다.
 * PIXEL-CLAY 추출이 legacy 경로를 건드리지 않았음을 증명하는 가드다. 여기서 digest 를
 * 다시 박으면 그 증명이 내 편의로 흔들린다 — 그리고 legacy 는 `EXPO_PUBLIC_UI=legacy`
 * 롤백으로만 닿는 스킨이라 배포본 사용자는 DeepSpace 경로를 쓴다.
 *
 * **legacy 쪽은 남아 있는 구멍이다.** 고치려면 digest 재핀이라는 의도된 결정이
 * 필요하고, 그건 이 변경과 함께 몰래 할 일이 아니다.
 */
const CALLERS = ["src/screens/deepspace/DeepSpaceDesignScreens.tsx"] as const;

const src = read(DRAFT);

/**
 * 함수 본문을 web / native 두 분기로 가른다.
 *
 * ⚠ 변이 검증에서 이 단언이 한 번 무뎠다. 처음에는 함수 **전체**에서 legacy 키 삭제를
 * 한 번만 찾았는데, web 분기에서 그 줄을 빼도 **native 분기의 같은 줄**이 매칭돼 초록이
 * 나왔다. 두 분기는 따로 실행되는 코드이므로 따로 못박아야 한다.
 */
function branches(): { web: string; native: string } {
  const start = src.indexOf("export function purgeCaptureDraftsForDeletedAccount");
  expect(start).toBeGreaterThan(-1);
  const body = src.slice(start, src.indexOf("\nexport ", start + 10));
  const split = body.indexOf("nativeStorage()");
  expect(split).toBeGreaterThan(-1);
  return { web: body.slice(0, split), native: body.slice(split) };
}

function wholeBody(): string {
  const start = src.indexOf("export function purgeCaptureDraftsForDeletedAccount");
  return src.slice(start, src.indexOf("\nexport ", start + 10));
}

describe("purgeCaptureDraftsForDeletedAccount", () => {
  test("the web branch drops BOTH storage generations", () => {
    const { web } = branches();
    expect(web).toMatch(/removeItem\(\s*stateKey\(userId\)\s*\)/);
    expect(web).toMatch(/removeItem\(\s*legacyDraftKey\(userId\)\s*\)/);
  });

  test("the native branch drops BOTH storage generations", () => {
    const { native } = branches();
    // runNativeExclusive hands the state key in, so the v2 blob goes through it.
    expect(native).toMatch(/runNativeExclusive\(/);
    expect(native).toMatch(/removeItem\(\s*key\s*\)/);
    expect(native).toMatch(/removeItem\(\s*legacyDraftKey\(userId\)\s*\)/);
  });

  test("is scoped to one user id and never clears storage wholesale", () => {
    // A blanket clear would take the drafts of an account that is switching in.
    const body = wholeBody();
    expect(body).not.toMatch(/\.clear\(\)/);
    expect(body).not.toMatch(/multiRemove/);
    expect(body).not.toMatch(/getAllKeys/);
  });

  test("never throws — a storage failure must not undo a completed deletion", () => {
    const body = wholeBody();
    expect(body).toMatch(/catch/);
    expect(body).toMatch(/\.catch\(\(\)\s*=>\s*false\)/);
  });
});

describe("both deletion paths purge local drafts", () => {
  for (const f of CALLERS) {
    test(`${f} purges after erasure and before sign-out`, () => {
      const caller = read(f);
      expect(caller).toContain("purgeCaptureDraftsForDeletedAccount");

      const erase = caller.indexOf("await requestAccountDeletion()");
      const purge = caller.indexOf("purgeCaptureDraftsForDeletedAccount(targetUserId)");
      const signout = caller.indexOf("await signOut()");
      expect(erase).toBeGreaterThan(-1);
      expect(purge).toBeGreaterThan(-1);
      expect(signout).toBeGreaterThan(-1);

      // Order matters. Purging before the server call would delete a draft the
      // user still owns if the deletion then fails; purging after sign-out risks
      // running once the screen has already been torn down.
      expect(purge).toBeGreaterThan(erase);
      expect(purge).toBeLessThan(signout);
    });

    test(`${f} passes the erased id, not the currently active one`, () => {
      // `targetUserId` is the id captured when the confirmation was accepted.
      // Using a live "current user" ref here would purge the wrong account's
      // drafts when a second session signs in while the request is in flight.
      expect(read(f)).toContain("purgeCaptureDraftsForDeletedAccount(targetUserId)");
    });

    test(`${f} keeps the purge best-effort`, () => {
      const caller = read(f);
      const at = caller.indexOf("purgeCaptureDraftsForDeletedAccount(targetUserId)");
      const around = caller.slice(Math.max(0, at - 300), at + 300);
      expect(around).toMatch(/try\s*\{/);
      expect(around).toMatch(/catch/);
    });
  }
});
