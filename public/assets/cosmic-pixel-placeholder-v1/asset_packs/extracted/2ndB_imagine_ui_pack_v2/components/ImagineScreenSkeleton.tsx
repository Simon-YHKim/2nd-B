import React, { useMemo, useState } from "react";
import "./imagine-v2.css";

export type ImagineEntry = "direct" | "graphNode" | "coreBrain" | "chat";

export type ImagineSeedContext = {
  entry: ImagineEntry;
  nodeId?: string;
  nodeLabel?: string;
  nodeType?: "core" | "domain" | "persona" | "record" | "wiki";
  connectedRecordIds?: string[];
  coreSummaryId?: string;
};

export type ImagineResult = {
  id: string;
  title: string;
  worldline: string;
  scenes: Array<{ id: string; title: string; description: string }>;
  objects: Array<{ id: string; name: string; description: string }>;
  characters: Array<{ id: string; name: string; role: string }>;
  nextStep: { label: string; reason?: string; route?: string };
  graphLinks?: Array<{ nodeId: string; label: string; type: string }>;
};

const sampleResult: ImagineResult = {
  id: "imagine_sample_1",
  title: "밤빛 그래프 마을의 첫 불빛",
  worldline: "사용자의 조각들이 길이 되고, 작은 로봇 친구들이 그 길을 따라 다음 한 걸음을 밝혀주는 마을.",
  scenes: [
    { id: "s1", title: "첫 불빛", description: "세컨비가 작은 조각을 들고 중심 길로 걸어가요. 연결선 하나가 민트빛으로 켜져요." },
    { id: "s2", title: "벨라의 펼침", description: "벨라가 말이 안 된 생각을 장면 카드 세 장으로 펼쳐요." },
  ],
  objects: [
    { id: "o1", name: "생각 조각 램프", description: "저장된 기록을 작은 등불처럼 보여주는 오브젝트" },
  ],
  characters: [
    { id: "c1", name: "벨라", role: "생각을 장면으로 펼치는 친구" },
  ],
  nextStep: { label: "3초 저장 애니메이션 초안 만들기", reason: "오늘 바로 만들 수 있는 크기로 접었어요." },
};

export function ImagineScreenSkeleton({ seedContext }: { seedContext?: ImagineSeedContext }) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"empty" | "input" | "generating" | "result" | "saved">("input");
  const [selectedTab, setSelectedTab] = useState<"scene" | "object" | "character" | "nextStep">("scene");
  const result = sampleResult;

  const contextLabel = useMemo(() => {
    if (!seedContext) return null;
    if (seedContext.entry === "graphNode") return `${seedContext.nodeLabel ?? "선택한 노드"}에서 시작`;
    if (seedContext.entry === "coreBrain") return "나의 중심에서 시작";
    if (seedContext.entry === "chat") return "세컨비 대화에서 시작";
    return null;
  }, [seedContext]);

  return (
    <main className="imagineScreen" aria-label="공상 작업실">
      <header className="imagineHeader">
        <button className="imagineBackButton" aria-label="뒤로가기">‹</button>
        <div>
          <h1>공상 작업실</h1>
          <p>아직 말이 안 된 생각도 장면으로 펼쳐봐요.</p>
        </div>
        <button className="imagineIconButton" aria-label="공상 조각 보기">✦</button>
      </header>

      {contextLabel && (
        <section className="imagineSeedChip" aria-label="시작 맥락">
          {contextLabel} · 연결된 조각을 먼저 참고해요.
        </section>
      )}

      {mode === "empty" && (
        <section className="imagineHero">
          <img src="/assets/cosmic-pixel-v2/imagine/imagine/imagination_empty_state.svg" alt="" aria-hidden="true" />
        </section>
      )}

      {mode === "input" && (
        <>
          <section className="imagineHero">
            <img src="/assets/cosmic-pixel-v2/imagine/imagine/vela_avatar_badge_v2.svg" alt="" aria-hidden="true" />
          </section>
          <section className="ideaInputPanel">
            <label htmlFor="ideaPrompt">생각을 던져보세요</label>
            <textarea
              id="ideaPrompt"
              className="ideaTextarea"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="예: 밤빛 조각마을의 첫 장면을 만들고 싶어"
            />
            <div className="imagineChipRow" aria-label="공상 씨앗 예시">
              <button className="imagineSeedChip">장면으로</button>
              <button className="imagineSeedChip">캐릭터로</button>
              <button className="imagineSeedChip">다음 한 걸음으로</button>
            </div>
          </section>
          <button className="imaginePrimaryButton" onClick={() => setMode("generating")}>장면으로 펼치기</button>
        </>
      )}

      {mode === "generating" && (
        <section className="imagineResultCard" aria-live="polite">
          <img src="/assets/cosmic-pixel-v2/imagine/imagine/generating_panel_v2.svg" alt="벨라가 조각을 펼치는 중" />
          <button className="imaginePrimaryButton" onClick={() => setMode("result")}>샘플 결과 보기</button>
        </section>
      )}

      {mode === "result" && (
        <section className="imagineResultCard">
          <h2>{result.title}</h2>
          <p>{result.worldline}</p>
          <nav className="imagineTabs" aria-label="공상 결과 탭">
            {[
              ["scene", "장면"],
              ["object", "사물"],
              ["character", "친구"],
              ["nextStep", "한 걸음"],
            ].map(([key, label]) => (
              <button key={key} className="imagineTab" aria-selected={selectedTab === key} onClick={() => setSelectedTab(key as any)}>{label}</button>
            ))}
          </nav>
          {selectedTab === "scene" && result.scenes.map((scene) => <article key={scene.id}><h3>{scene.title}</h3><p>{scene.description}</p></article>)}
          {selectedTab === "object" && result.objects.map((object) => <article key={object.id}><h3>{object.name}</h3><p>{object.description}</p></article>)}
          {selectedTab === "character" && result.characters.map((character) => <article key={character.id}><h3>{character.name}</h3><p>{character.role}</p></article>)}
          {selectedTab === "nextStep" && <article><h3>다음 한 걸음</h3><p>{result.nextStep.label}</p><small>{result.nextStep.reason}</small></article>}
          <button className="imagineSaveButton" onClick={() => setMode("saved")}>마을에 공상 조각으로 저장</button>
        </section>
      )}

      {mode === "saved" && (
        <section className="imagineResultCard">
          <img src="/assets/cosmic-pixel-v2/imagine/imagine/graph_link_result_v2.svg" alt="공상 조각이 그래프에 연결됨" />
          <button className="imaginePrimaryButton">그래프로 보기</button>
        </section>
      )}
    </main>
  );
}
