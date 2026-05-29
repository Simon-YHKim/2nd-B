import React from "react";

export type SecondBChatMode =
  | "empty"
  | "thinking"
  | "answer"
  | "referenceDrawer"
  | "nodeContext";

export type ReferenceShard = {
  id: string;
  title: string;
  type: "journal" | "wiki" | "persona" | "imagine" | "record";
  subtitle?: string;
  excerpt?: string;
};

const ASSET_BASE = "/assets/cosmic-pixel-v2/secondb-chat";

export function SecondBChatSkeleton({
  mode = "empty",
  references = [],
}: {
  mode?: SecondBChatMode;
  references?: ReferenceShard[];
}) {
  return (
    <section className="secondb-chat-screen" aria-label="세컨비 대화">
      <header className="secondb-chat-header">
        <img
          src={`${ASSET_BASE}/chat/secondb_avatar_badge_v2.svg`}
          alt="세컨비"
          className="secondb-chat-avatar"
        />
        <div>
          <h1>세컨비</h1>
          <p>내 조각을 참고해서 답해요</p>
        </div>
      </header>

      <main className="secondb-chat-thread">
        {mode === "empty" && <ChatEmptyState />}
        {mode === "thinking" && <ThinkingMessage />}
        {mode === "answer" && <AnswerExample references={references} />}
        {mode === "nodeContext" && <NodeContextIntro />}
      </main>

      {mode === "referenceDrawer" && <ReferenceDrawer references={references} />}

      <footer className="secondb-chat-inputbar">
        <input aria-label="세컨비에게 물어보기" placeholder="세컨비에게 물어보기..." />
        <button type="button">전송</button>
      </footer>
    </section>
  );
}

function ChatEmptyState() {
  return (
    <div className="secondb-empty-state">
      <img src={`${ASSET_BASE}/chat/chat_ready_empty_state.svg`} alt="" aria-hidden="true" />
    </div>
  );
}

function ThinkingMessage() {
  return (
    <div className="secondb-message-row is-secondb">
      <img src={`${ASSET_BASE}/chat/thinking_bubble_v2.svg`} alt="관련 조각을 찾는 중" />
    </div>
  );
}

function AnswerExample({ references }: { references: ReferenceShard[] }) {
  return (
    <>
      <div className="secondb-message-row is-user">
        <div className="secondb-user-bubble">이 아이디어를 다음 한 걸음으로 줄일까?</div>
      </div>
      <div className="secondb-message-row is-secondb">
        <div className="secondb-answer-bubble">
          <div className="secondb-grounding-badge">내 기록 기반 답변</div>
          <p>지금은 완성보다 작은 화면 하나를 먼저 잡는 게 좋아 보여요.</p>
        </div>
      </div>
      <ReferenceStrip references={references} />
    </>
  );
}

function NodeContextIntro() {
  return (
    <div className="secondb-context-card">
      <span className="context-pixel" />
      <div>
        <strong>만드는 나에서 질문</strong>
        <p>선택한 노드와 연결된 조각을 먼저 참고해요.</p>
      </div>
    </div>
  );
}

function ReferenceStrip({ references }: { references: ReferenceShard[] }) {
  const items = references.length
    ? references
    : [
        { id: "1", title: "오늘의 조각", type: "journal", subtitle: "journal · 최근 기록" },
        { id: "2", title: "만드는 나", type: "persona", subtitle: "나의 모습" },
      ];
  return (
    <aside className="secondb-reference-strip" aria-label="참고한 조각들">
      <h2>참고한 조각</h2>
      {items.map((item) => (
        <button key={item.id} type="button" className={`reference-card type-${item.type}`}>
          <span className="reference-dot" />
          <span>
            <strong>{item.title}</strong>
            <small>{item.subtitle}</small>
          </span>
        </button>
      ))}
    </aside>
  );
}

function ReferenceDrawer({ references }: { references: ReferenceShard[] }) {
  return (
    <aside className="secondb-reference-drawer" aria-label="참고한 조각 상세">
      <div className="drawer-handle" />
      <h2>참고한 조각들</h2>
      <p>답변에 영향을 준 기록과 나의 모습이에요.</p>
      <ReferenceStrip references={references} />
    </aside>
  );
}
