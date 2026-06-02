import React, { useMemo, useState } from "react";
import "./core-brain-v2.css";

export type CoreDomain = {
  id: string;
  label: string;
  intensity: number;
  shardCount: number;
  summary: string;
};

export type CorePersona = {
  id: string;
  label: string;
  summary: string;
  who?: string;
  forWhom?: string;
  goal?: string;
  do?: string;
  fuel?: string;
  shardCount: number;
};

export type CoreEvidenceShard = {
  id: string;
  type: "journal" | "capture" | "wiki" | "interview" | "audit" | "imagine";
  title: string;
  dateLabel: string;
  route?: string;
};

export type CoreBrainSummary = {
  headline: string;
  subline: string;
  phase: "preDawn" | "dawn" | "sunrise" | "dayGarden" | "twilight" | "deepNight";
  brightConnection: string;
  domains: CoreDomain[];
  personas: CorePersona[];
  evidence: CoreEvidenceShard[];
  nextStep: { label: string; route: string };
};

const sampleSummary: CoreBrainSummary = {
  headline: "요즘 가장 밝은 연결",
  subline: "기록들이 공상 작업실과 지식 창고로 이어지고 있어요.",
  phase: "sunrise",
  brightConnection: "공상 작업실 · 지식 창고 · 만드는 나",
  domains: [
    { id: "knowledge", label: "지식", intensity: 0.74, shardCount: 18, summary: "저장한 링크와 메모가 자주 이어져요." },
    { id: "imagine", label: "공상", intensity: 0.68, shardCount: 11, summary: "아이디어를 장면으로 펼치는 흐름이 보여요." },
    { id: "record", label: "기록", intensity: 0.57, shardCount: 22, summary: "오늘의 조각이 꾸준히 쌓이고 있어요." },
  ],
  personas: [
    { id: "maker", label: "만드는 나", summary: "조각을 구조로 바꾸는 모습", who: "복잡한 걸 구조로 바꾸는 사람", forWhom: "나와 팀이 다시 쓸 수 있게", goal: "다음 구현으로 떨어뜨리기", do: "분해하고 이름 붙이고 연결하기", fuel: "귀여움과 완성도", shardCount: 23 },
    { id: "organizer", label: "정리하는 나", summary: "흩어진 걸 보기 쉽게 묶는 모습", shardCount: 15 },
    { id: "learner", label: "배우는 나", summary: "새로운 자료를 모아 흐름을 만드는 모습", shardCount: 12 },
  ],
  evidence: [
    { id: "e1", type: "journal", title: "밤빛 그래프 마을 아이디어", dateLabel: "오늘" },
    { id: "e2", type: "wiki", title: "Obsidian graph 메모", dateLabel: "최근" },
    { id: "e3", type: "imagine", title: "공상 작업실 화면 초안", dateLabel: "최근" },
  ],
  nextStep: { label: "공상 작업실에서 한 장면으로 펼쳐보기", route: "/imagine" },
};

export function CoreBrainScreenSkeleton({ summary = sampleSummary }: { summary?: CoreBrainSummary }) {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(summary.personas[0]?.id ?? null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const selectedPersona = useMemo(
    () => summary.personas.find((persona) => persona.id === selectedPersonaId),
    [summary.personas, selectedPersonaId]
  );

  return (
    <main className="coreBrainScreen" aria-label="나의 중심">
      <header className="coreBrainHeader">
        <button className="coreBackButton" aria-label="뒤로가기">‹</button>
        <div>
          <h1>나의 중심</h1>
          <p>요즘 자주 이어지는 조각들을 살펴봐요.</p>
        </div>
        <button className="coreIconButton" aria-label="세컨비에게 묻기">✦</button>
      </header>

      <section className="coreHero" aria-label="중심 미니 그래프">
        <img src="/assets/cosmic-pixel-v2/core-brain/core/center_core_orb_v2.svg" alt="" aria-hidden="true" />
      </section>

      <section className="coreCard" data-accent="mint">
        <h2 className="coreSectionTitle">{summary.headline}</h2>
        <strong>{summary.brightConnection}</strong>
        <p>{summary.subline}</p>
      </section>

      <section className="coreCard">
        <h2 className="coreSectionTitle">밝아진 동네</h2>
        {summary.domains.map((domain) => (
          <article key={domain.id} className="coreDomainRow">
            <strong>{domain.label}</strong>
            <span>{domain.shardCount} 조각</span>
            <p>{domain.summary}</p>
          </article>
        ))}
      </section>

      <section className="coreCard" data-accent="violet">
        <h2 className="coreSectionTitle">자주 보이는 나의 모습</h2>
        <div className="corePersonaChips" role="list">
          {summary.personas.map((persona) => (
            <button key={persona.id} className="corePersonaChip" onClick={() => setSelectedPersonaId(persona.id)}>
              {persona.label}
            </button>
          ))}
        </div>
        {selectedPersona && (
          <article className="corePersonaDetail">
            <h3>{selectedPersona.label}</h3>
            <p>{selectedPersona.summary}</p>
            {selectedPersona.who && <dl><dt>who</dt><dd>{selectedPersona.who}</dd></dl>}
            {selectedPersona.forWhom && <dl><dt>for whom</dt><dd>{selectedPersona.forWhom}</dd></dl>}
            {selectedPersona.goal && <dl><dt>goal</dt><dd>{selectedPersona.goal}</dd></dl>}
            {selectedPersona.do && <dl><dt>do</dt><dd>{selectedPersona.do}</dd></dl>}
            {selectedPersona.fuel && <dl><dt>fuel</dt><dd>{selectedPersona.fuel}</dd></dl>}
          </article>
        )}
      </section>

      <section className="coreCard" data-accent="lamp">
        <h2 className="coreSectionTitle">이걸 만든 조각들</h2>
        {summary.evidence.slice(0, 2).map((item) => (
          <article key={item.id} className="coreEvidenceRow">
            <span aria-hidden="true">✦</span>
            <div><strong>{item.title}</strong><p>{item.type} · {item.dateLabel}</p></div>
            <button aria-label={`${item.title} 열기`}>열기</button>
          </article>
        ))}
        <button onClick={() => setEvidenceOpen(true)}>조각 더 보기</button>
      </section>

      <button className="coreAskSecondB">세컨비에게 이 중심으로 묻기</button>

      {evidenceOpen && (
        <section className="coreEvidenceDrawer" role="dialog" aria-modal="true" aria-label="이걸 만든 조각들">
          <button onClick={() => setEvidenceOpen(false)} aria-label="닫기">닫기</button>
          <h2>이걸 만든 조각들</h2>
          {summary.evidence.map((item) => <p key={item.id}>{item.title}</p>)}
        </section>
      )}
    </main>
  );
}
