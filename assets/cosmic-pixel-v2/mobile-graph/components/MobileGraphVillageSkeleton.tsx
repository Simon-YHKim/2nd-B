import React, { useMemo, useState } from "react";
import "./mobile-graph-v2.css";

type Tier = 1 | 2 | 3 | 4;

type GraphNode = {
  id: string;
  label: string;
  tier: Tier;
  x: number;
  y: number;
  asset: string;
  route?: string;
};

type GraphEdge = {
  id: string;
  source: string;
  target: string;
  recent?: boolean;
};

const WORLD = { width: 1200, height: 1600 };

const defaultNodes: GraphNode[] = [
  { id: "core", label: "나의 중심", tier: 1, x: 600, y: 720, asset: "/assets/cosmic-pixel-v2/mobile-graph/graph/core_node_v2.svg", route: "/core-brain" },
  { id: "records", label: "기록", tier: 2, x: 340, y: 420, asset: "/assets/cosmic-pixel-v2/mobile-graph/graph/domain_node_v2.svg" },
  { id: "knowledge", label: "지식", tier: 2, x: 860, y: 410, asset: "/assets/cosmic-pixel-v2/mobile-graph/graph/domain_node_v2.svg" },
  { id: "relation", label: "관계", tier: 2, x: 320, y: 1020, asset: "/assets/cosmic-pixel-v2/mobile-graph/graph/domain_node_v2.svg" },
  { id: "imagine", label: "공상", tier: 2, x: 890, y: 1040, asset: "/assets/cosmic-pixel-v2/mobile-graph/graph/domain_node_v2.svg", route: "/imagine" },
  { id: "maker", label: "만드는 나", tier: 3, x: 660, y: 1040, asset: "/assets/cosmic-pixel-v2/mobile-graph/graph/persona_node_v2.svg" },
];

const defaultEdges: GraphEdge[] = [
  { id: "core-records", source: "core", target: "records" },
  { id: "core-knowledge", source: "core", target: "knowledge", recent: true },
  { id: "core-relation", source: "core", target: "relation" },
  { id: "core-imagine", source: "core", target: "imagine", recent: true },
  { id: "imagine-maker", source: "imagine", target: "maker", recent: true },
];

function visibleByScale(tier: Tier, scale: number) {
  if (scale < 0.65) return tier <= 2;
  if (scale < 1.1) return tier <= 3;
  return true;
}

export function MobileGraphVillageSkeleton() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scale, setScale] = useState(0.72);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const selectedNode = defaultNodes.find((node) => node.id === selectedId);
  const nodeMap = useMemo(() => new Map(defaultNodes.map((node) => [node.id, node])), []);
  const connectedIds = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const ids = new Set<string>([selectedId]);
    defaultEdges.forEach((edge) => {
      if (edge.source === selectedId) ids.add(edge.target);
      if (edge.target === selectedId) ids.add(edge.source);
    });
    return ids;
  }, [selectedId]);

  return (
    <main className="mobileGraphVillage" aria-label="밤빛 조각마을 그래프">
      <section className="topRibbon">
        <strong>오늘의 중심</strong>
        <p>기록들이 공상 작업실과 연결됐어요.</p>
      </section>

      <button className="settingsButton" aria-label="설정" />

      <section className="graphViewport" aria-label="나의 조각 그래프">
        <div
          className="graphWorld"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        >
          <svg width={WORLD.width} height={WORLD.height} aria-hidden="true">
            {defaultEdges.map((edge) => {
              const source = nodeMap.get(edge.source)!;
              const target = nodeMap.get(edge.target)!;
              const active = selectedId ? edge.source === selectedId || edge.target === selectedId : edge.recent;
              return (
                <path
                  key={edge.id}
                  className={active ? "graphEdgeActive" : "graphEdge"}
                  d={`M${source.x} ${source.y} C${(source.x + target.x) / 2} ${source.y - 120}, ${(source.x + target.x) / 2} ${target.y + 120}, ${target.x} ${target.y}`}
                />
              );
            })}
          </svg>

          {defaultNodes.filter((node) => visibleByScale(node.tier, scale)).map((node) => (
            <button
              key={node.id}
              className="graphNode"
              data-selected={node.id === selectedId}
              style={{ left: node.x, top: node.y }}
              onClick={() => setSelectedId(node.id)}
              aria-label={`${node.label} 열기`}
            >
              <img src={node.asset} alt="" aria-hidden="true" />
              <span>{node.label}</span>
            </button>
          ))}
        </div>
      </section>

      <button className="secondbFab" aria-label="세컨비에게 묻기">
        <img src="/assets/cosmic-pixel-v2/secondb/fab/secondb_fab_default.svg" alt="" aria-hidden="true" />
      </button>

      {selectedNode && (
        <section className="nodeSheet" aria-label={`${selectedNode.label} 상세`}>
          <span className="sheetHandle" />
          <h2>{selectedNode.label}</h2>
          <p>최근 연결된 조각을 바탕으로 이어진 길을 보여줘요.</p>
          <div className="sheetActions">
            <button>살펴보기</button>
            <button>세컨비에게 묻기</button>
          </div>
        </section>
      )}
    </main>
  );
}
