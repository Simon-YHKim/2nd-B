import React, { useMemo, useState } from "react";

export type WikiRecordsMode = "wikiHome" | "wikiPage" | "records" | "recordDetail" | "search" | "empty";

export type KnowledgeItemType = "wiki_page" | "record" | "journal" | "capture" | "imagine" | "interview" | "audit";

export type KnowledgeListItem = {
  id: string;
  type: KnowledgeItemType;
  title: string;
  previewText?: string;
  updatedAt?: string;
  recordCount?: number;
  linkedNodeIds?: string[];
  tags?: string[];
  route: string;
};

const ASSET_BASE = "/assets/cosmic-pixel-v2/wiki-records";

export function WikiRecordsScreenSkeleton({
  mode = "wikiHome",
  items = [],
}: {
  mode?: WikiRecordsMode;
  items?: KnowledgeListItem[];
}) {
  const [query, setQuery] = useState("");
  const isEmpty = mode === "empty" || items.length === 0;

  return (
    <main className="wr-screen" data-mode={mode}>
      <header className="wr-header">
        <button className="wr-back" aria-label="뒤로 가기" />
        <div>
          <p className="wr-kicker">지식 창고</p>
          <h1>{mode === "records" ? "조각 기록" : "지식 창고"}</h1>
        </div>
      </header>

      <section className="wr-search" role="search">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="조각, 제목, 태그 검색"
          aria-label="지식 창고 검색"
        />
        <button aria-label="필터 열기">필터</button>
      </section>

      {isEmpty ? (
        <section className="wr-empty">
          <img src={`${ASSET_BASE}/widgets/wiki_empty_state_v2.svg`} alt="" aria-hidden="true" />
          <button>오늘의 조각 남기기</button>
          <button>조각 담기</button>
        </section>
      ) : (
        <section className="wr-list" aria-label="저장된 조각 목록">
          {items.map((item) => (
            <article key={item.id} className="wr-item-card" data-type={item.type}>
              <span className="wr-shard-dot" aria-hidden="true" />
              <div>
                <p>{item.type}</p>
                <h2>{item.title}</h2>
                {item.previewText && <span>{item.previewText}</span>}
              </div>
              <button aria-label={`${item.title} 열기`}>열기</button>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
