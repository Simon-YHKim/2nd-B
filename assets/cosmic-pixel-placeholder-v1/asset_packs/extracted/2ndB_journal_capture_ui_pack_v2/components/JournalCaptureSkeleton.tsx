import React, { useMemo, useState } from "react";
import "./journal-capture-v2.css";

type CaptureMode = "memo" | "link" | "clip" | "ocr" | "file";
type EntrySource = "journal" | "capture";

type ShardDraft = {
  source: EntrySource;
  mode?: CaptureMode;
  body: string;
  url?: string;
  fileIds?: string[];
  tags?: string[];
};

const ASSET_BASE = "/assets/cosmic-pixel-v2/journal-capture";

export function JournalScreenSkeleton() {
  const [body, setBody] = useState("");
  const canSave = body.trim().length > 0;

  function handleSave() {
    const draft: ShardDraft = { source: "journal", body };
    // TODO: create record, run classify/retrieve as current project requires,
    // then show event cue and connect to graph as Tier 4 data shard.
    console.log("save journal shard", draft);
  }

  return (
    <main className="jc-screen" aria-label="오늘의 조각">
      <div className="jc-scroll">
        <header className="jc-panel" style={{ padding: 16, marginBottom: 16 }}>
          <p style={{ margin: 0, color: "var(--mist-gray)", fontSize: 12 }}>오늘의 조각</p>
          <h1 style={{ margin: "6px 0 0", fontSize: 24 }}>하루에서 남은 생각을 보관해요</h1>
        </header>

        <section className="jc-panel" style={{ padding: 16, marginBottom: 16 }}>
          <label htmlFor="journal-body" style={{ display: "block", marginBottom: 10, fontWeight: 700 }}>
            오늘 머릿속에 남은 조각
          </label>
          <textarea
            id="journal-body"
            className="jc-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="한 문장이어도 충분해요."
            aria-label="오늘의 조각 입력"
          />
          <button className="jc-primary-cta" disabled={!canSave} onClick={handleSave} style={{ width: "100%", marginTop: 14 }}>
            마을에 조각으로 저장
          </button>
        </section>
      </div>
    </main>
  );
}

export function CaptureScreenSkeleton() {
  const [mode, setMode] = useState<CaptureMode>("memo");
  const modeLabel = useMemo(() => ({ memo: "메모", link: "링크", clip: "클립", ocr: "OCR", file: "파일" }[mode]), [mode]);

  return (
    <main className="jc-screen" aria-label="조각 담기">
      <div className="jc-scroll">
        <header className="jc-panel" style={{ padding: 16, marginBottom: 16 }}>
          <p style={{ margin: 0, color: "var(--mist-gray)", fontSize: 12 }}>조각 담기</p>
          <h1 style={{ margin: "6px 0 0", fontSize: 24 }}>자료를 마을로 가져와요</h1>
        </header>

        <section className="jc-panel" style={{ padding: 16, marginBottom: 16 }}>
          <p style={{ marginTop: 0, color: "var(--mist-gray)", fontSize: 13 }}>담을 조각 종류</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
            {(["memo", "link", "clip", "ocr", "file"] as CaptureMode[]).map((m) => (
              <button key={m} className="jc-mode-chip" data-active={mode === m} onClick={() => setMode(m)}>
                {{ memo: "메모", link: "링크", clip: "클립", ocr: "OCR", file: "파일" }[m]}
              </button>
            ))}
          </div>
        </section>

        <section className="jc-panel" style={{ padding: 16 }}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>{modeLabel} 조각 가져오기</h2>
          <p style={{ color: "var(--mist-gray)", fontSize: 13 }}>
            저장하면 그래프의 Tier 4 데이터 조각으로 연결됩니다.
          </p>
          <button className="jc-primary-cta" style={{ width: "100%" }}>루루가 가져오기</button>
        </section>
      </div>
    </main>
  );
}
