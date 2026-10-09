// 하루 관리판 화면(BoardParts.tsx · DashboardPhone.tsx)을 소스로 지킨다. 발주 2 완료조건 4 · 5 · 6 · 7 · 8.
// 렌더 테스트가 막혀 있어(RN 0.85) 마운트 대신 소스를 읽는다.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const parts = read("src/components/dashboard/board/BoardParts.tsx");
const phone = read("src/components/dashboard/DashboardPhone.tsx");
const build = read("src/lib/dashboard/board/build.ts");
const contract = read("src/lib/dashboard/board/contract.ts");

/** 주석을 뺀 코드. 설명 문장이 검사에 걸리지 않게 한다. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

describe("완료조건 5: 화면은 표시 여부 · 순서 · 색을 계약 값으로만 읽는다", () => {
  test("부품 목록은 partsOnPage 하나로 받는다", () => {
    expect(parts).toContain("partsOnPage(board, page).map((part)");
    expect(parts).toContain('<PartView part={part} events={events} />');
  });

  test("화면 파일에 정렬 · visible · order 판단이 없다", () => {
    for (const source of [code(parts)]) {
      expect(source).not.toMatch(/\.sort\(/);
      expect(source).not.toMatch(/\.visible\b/);
      expect(source).not.toMatch(/\.order\b/);
    }
  });

  test("색은 boardTone(basis) 와 테마 토큰에서만 온다(hex 0)", () => {
    expect(code(parts)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // 리터럴 basis 로 색을 고르는 곳은 늘 점선인 '+ 위젯 추가' 자리 하나뿐이다.
    expect(code(parts).match(/boardTone\("(ai|fact|rule|locked)"\)/g)).toEqual(['boardTone("locked")']);
    expect(code(parts)).not.toMatch(/basis="(ai|fact|rule|locked)"/);
  });
});

describe("완료조건 6: 화면에서 LLM · 서버 프롬프트 직접 호출 0", () => {
  test.each([["BoardParts.tsx", parts], ["build.ts", build], ["contract.ts", contract]])("%s", (_name, source) => {
    expect(source).not.toMatch(/@\/lib\/llm|lib\/llm\/|callLlm|boundary|supabase\.from|\.rpc\(|fetch\(/);
  });
});

describe("완료조건 4: 부품의 동작", () => {
  test("P-03: 카드 안 좌우 넘김(바깥 쪽 넘김보다 먼저) + 화살표 둘, 네 날 범위 안", () => {
    expect(parts).toContain("onPanResponderTerminationRequest: () => false");
    expect(parts).toContain("const step = (delta: number) => setIndex((current) => Math.min(last, Math.max(0, current + delta)));");
    expect(parts).toContain('accessibilityLabel={t("phone.board.reminders.previous")}');
    expect(parts).toContain('accessibilityLabel={t("phone.board.reminders.next")}');
    expect(parts).toContain("const [index, setIndex] = useState<number>(part.startDay);");
  });

  test("P-03: 제안 칩 최대 2개, [추가][무시]", () => {
    expect(parts).toContain("suggestions.slice(0, 2).map(");
    expect(parts).toContain('t("phone.board.reminders.add")');
    expect(parts).toContain('t("phone.board.reminders.dismiss")');
  });

  test("P-03: 이유 문구 · 알림 시각은 값이 있을 때만 한 줄씩(Q-261007-38)", () => {
    expect(parts).toContain('{item.reason ? <Text variant="caption" numberOfLines={1} style={styles.muted}>{item.reason}</Text> : null}');
    expect(parts).toContain('{item.alarmAt ? <Text variant="caption" style={styles.muted}>{t("phone.board.reminders.alarm", { time: item.alarmAt })}</Text> : null}');
  });

  test("P-04: n/3 과 버튼 셋, 한 장을 처리하면 다음 장", () => {
    expect(parts).toContain("const items = part.items.slice(0, 3);");
    expect(parts).toContain('t("phone.board.queue.title", { index: handled.length + 1, total: items.length })');
    for (const key of ["done", "later", "notImportant"]) expect(parts).toContain(`t("phone.board.queue.${key}")`);
    expect(parts).toContain("const current = items.find((item) => !handled.includes(item.id));");
  });

  test("P-06: 출처 줄은 source 가 있을 때만(연동 전에는 숨김)", () => {
    expect(parts).toContain("{part.source && syncedAt && Number.isFinite(syncedAt.getTime()) ? <Text");
    expect(parts).toContain('t("phone.board.health.synced", {');
  });

  test("P-09: 좌우 넘김 · 제안 카드 [만들기][괜찮아요] · 길게 눌러 숨김", () => {
    expect(parts).toContain('accessibilityLabel={t("phone.board.custom.previous")}');
    expect(parts).toContain('accessibilityLabel={t("phone.board.custom.next")}');
    expect(parts).toContain('t("phone.board.custom.make")');
    expect(parts).toContain('t("phone.board.custom.skip")');
    expect(parts).toContain('events.custom(widget.id, "hide")');
    expect(parts).toContain("delayLongPress={500}");
  });

  test("P-02 를 누르면 한마디 상세(요약·읽기 통합)로", () => {
    expect(parts).toContain("onPress={events.openSummary}");
  });
});

describe("완료조건 7: 접근성 라벨 · 터치 영역 44 이상", () => {
  test("누르는 자리는 44 이상", () => {
    // The iOS buttons live in IosParts.tsx (pixel iPhone, Simon 2026-10-07).
    expect(read("src/components/dashboard/board/IosParts.tsx")).toContain("button: { minHeight: 44, minWidth: 44,");
    expect(parts).toContain("evidence: { width: 44, height: 44,");
    expect(parts).toContain("dayArrow: { width: 44, height: 44,");
    expect(parts).toContain("tapRow: { minHeight: 44,");
    expect(parts).toContain("item: { minHeight: 44,");
  });

  test("누르는 자리마다 라벨이 있다", () => {
    // 태그 끝 '>' 를 찾되 화살표 함수의 '=>' 와 비교의 '>=' 는 건너뛴다.
    const pressables = code(parts).match(/<(Pressable|PixelPressable)\b(?:=>|>=|[^>])*>/g) ?? [];
    expect(pressables.length).toBeGreaterThan(10);
    for (const tag of pressables) expect(tag).toMatch(/accessibilityLabel=|accessibilityHint=|accessibilityRole="button"/);
  });

  test("독은 그리지 않는다 (Simon 2026-10-07: 제거)", () => {
    // 담기 · 대화는 핸드폰 밖 아래 막대에 있다. 계약의 dock 칸은 재설계 세션 몫이라 그대로 두고 화면만 그리지 않는다.
    expect(parts).not.toContain("BoardDock");
    expect(parts).not.toContain("board-dock");
    expect(phone).not.toContain("BoardDock");
  });
});

describe("완료조건 8 + 08:32 보강: 옛 위젯 8개를 대시보드에서 내린다", () => {
  test.each([
    ["우선순위 카드", 't("phone.todayLabel")'],
    ["내 말", 't("phone.myWords")'],
    ["오늘 할 일", 't("phone.agenda")'],
    ["한눈 지표", 't("phone.operational.atGlance")'],
    ["7일 막대", 't("phone.operational.recordTrend")'],
    ["7일 전망", 't("phone.weekAhead")'],
    ["6영역 수", 't("phone.lifeAreas")'],
    ["최근 활동", 't("phone.latestActivity")'],
  ])("%s", (_name, marker) => {
    expect(phone).not.toContain(marker);
  });

  test("대시보드 쪽은 하루 관리판을 그린다", () => {
    expect(phone).toContain("<BoardPageView board={board} page={boardPage} events={boardEvents}");
    expect(phone).toContain('<DeepSpaceOpsScreen surface="board" />');
    expect(phone).toContain("withGeneratedBoard(buildBoard(data, new Date(), isMinor, clockWeather.state), generated)");
  });

  test("새 부품이 삭제 금지 목록의 읽기 함수를 다시 쓴다", () => {
    expect(build).toContain('import { localDate, realHealthSamples, routineActionRoute, todayAgenda, type DashboardData } from "../model";');
  });
});

describe("S-03 위젯 관리 · S-02 녹음 전사 골격", () => {
  const shelf = read("src/components/dashboard/board/BoardShelf.tsx");
  const transcribe = read("src/components/dashboard/board/TranscribeSkeleton.tsx");

  test("순서 바꾸기 · 숨기기는 계약이 받을 때만 보인다", () => {
    expect(shelf).toContain("{board.shelf.canReorder ? <View style={styles.section}>");
    expect(shelf).toContain('events.move(part.id, "up")');
    expect(shelf).toContain('events.move(part.id, "down")');
    expect(shelf).toContain("events.hide(part.id)");
  });

  test("잠긴 부품은 이유 + [연동 화면], 숨긴 것은 [다시 켜기]", () => {
    expect(shelf).toContain("{say(item.reason)}");
    expect(shelf).toContain("{item.action ? <Button label={say(item.action.label)} onPress={() => events.go(item.action!.route)} /> : null}");
    expect(shelf).toContain('{item.canShow ? <Button label={t("phone.board.shelf.show")} onPress={() => events.show(item.id)} /> : null}');
    expect(code(shelf)).not.toMatch(/[.]sort[(]/);
  });

  test("녹음 전사 골격: 녹음 코드 0, 성인만, '내가 참여한 대화만' 안내", () => {
    expect(transcribe).not.toMatch(/expo-audio|expo-av|useAudioRecorder|record[(]/);
    expect(transcribe).toContain('if (!adult) return');
    expect(transcribe).toContain('t("phone.board.transcribe.ownTalkOnly")');
    expect(transcribe).toContain("accessibilityState={{ disabled: true }}");
    expect(phone).toContain('if (route === "/board/transcribe") return <TranscribeSkeleton adult={isMinor === false} />;');
  });

  test.each([["BoardShelf.tsx", "src/components/dashboard/board/BoardShelf.tsx"], ["TranscribeSkeleton.tsx", "src/components/dashboard/board/TranscribeSkeleton.tsx"], ["DailySummary.tsx", "src/components/dashboard/board/DailySummary.tsx"]])(
    "%s: LLM · 서버 직접 호출 0", (_name, path) => {
      expect(read(path)).not.toMatch(/@[/]lib[/]llm|lib[/]llm[/]|callLlm|boundary|supabase[.]from|[.]rpc[(]|fetch[(]/);
    });
});

