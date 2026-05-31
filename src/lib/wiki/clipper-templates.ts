// Canonical clipper templates (the 8 Obsidian Web Clipper templates Simon
// uses, bundled 2026-06-01). This is the single source of truth for:
//   - the kind picker / AI classifier (classify-clipper.ts) — what each kind
//     means + which semantic properties the AI should fill from the content,
//   - the shared template registry seed (clipper_templates table, Phase G3).
//
// Mechanical properties the clipper/buildSourcePayload already derive from the
// URL/page (title, source, author, video-id, arxiv-id, repo, …) are NOT listed
// here; only the kind metadata + the SEMANTIC properties an AI fills by reading
// the content. Common semantic fields (target-category, simon-relevance,
// actionable-takeaway, tags, summary) are produced by the classifier for every
// kind, so they live in the classifier output rather than per-template.
//
// Vocabulary stays in the project register (no clinical / internal-tech terms).

import type { SourceKind } from "./types";

/** A target wiki bucket the classifier sorts a piece into. */
export const TARGET_CATEGORIES = ["concepts", "entities", "projects"] as const;
export type TargetCategory = (typeof TARGET_CATEGORIES)[number];

export interface ClipperAiProperty {
  /** Frontmatter key, e.g. "topic-area". */
  name: string;
  type: "text" | "multitext" | "number";
  /** What the AI should put here, shown to it in the classify prompt. */
  describe: { en: string; ko: string };
}

export interface ClipperTemplate {
  /** "00".."07" — stable id matching the source JSON files. */
  id: string;
  kind: SourceKind;
  name: { en: string; ko: string };
  /** One line on what this kind is — drives the AI kind picker. */
  what: { en: string; ko: string };
  /** URL globs that auto-route to this kind (mirrors the clipper triggers). */
  triggers: readonly string[];
  /** Storage path prefix the raw clipping lands under. */
  pathPrefix: string;
  /** Filename token, e.g. "yt" → 2026-06-01-yt-<slug>. */
  noteNamePrefix: string;
  /** Tags every piece of this kind carries. */
  defaultTags: readonly string[];
  /** Default wiki bucket; the AI may override per piece. */
  targetCategoryDefault: TargetCategory | "";
  /** Optional wiki sub-folder hint (e.g. "tools/"). */
  wikiTargetDefault: string;
  /** Kind-specific semantic properties the AI fills from the content. */
  aiProperties: readonly ClipperAiProperty[];
}

export const CLIPPER_TEMPLATES: Record<SourceKind, ClipperTemplate> = {
  inbox: {
    id: "00",
    kind: "inbox",
    name: { en: "Default Inbox", ko: "기본 받은함" },
    what: {
      en: "Anything that doesn't fit a specific kind — needs triage later.",
      ko: "특정 종류에 안 맞는 자료. 나중에 분류가 필요한 임시함.",
    },
    triggers: [],
    pathPrefix: "raw/clipped/_inbox",
    noteNamePrefix: "",
    defaultTags: ["clippings", "inbox-needs-triage"],
    targetCategoryDefault: "",
    wikiTargetDefault: "",
    aiProperties: [],
  },
  article: {
    id: "01",
    kind: "article",
    name: { en: "General Article", ko: "일반 아티클" },
    what: {
      en: "A web article, essay, or blog post — prose meant to be read.",
      ko: "웹 아티클·에세이·블로그 글. 읽기 위한 산문.",
    },
    triggers: [],
    pathPrefix: "raw/clipped/articles",
    noteNamePrefix: "",
    defaultTags: ["clippings", "article"],
    targetCategoryDefault: "concepts",
    wikiTargetDefault: "",
    aiProperties: [],
  },
  video: {
    id: "02",
    kind: "video",
    name: { en: "YouTube Video", ko: "유튜브 영상" },
    what: {
      en: "A YouTube (or similar) video page.",
      ko: "유튜브 등 영상 페이지.",
    },
    triggers: ["https://www.youtube.com/watch*", "https://youtu.be/*", "https://m.youtube.com/watch*"],
    pathPrefix: "raw/clipped/videos",
    noteNamePrefix: "yt",
    defaultTags: ["clippings", "video", "youtube"],
    targetCategoryDefault: "concepts",
    wikiTargetDefault: "",
    aiProperties: [],
  },
  paper: {
    id: "03",
    kind: "paper",
    name: { en: "Academic Paper", ko: "학술 논문" },
    what: {
      en: "A research paper, preprint, or journal article.",
      ko: "연구 논문·프리프린트·저널 아티클.",
    },
    triggers: [
      "https://arxiv.org/*", "https://www.nature.com/articles/*",
      "https://www.sciencedirect.com/science/article/*", "https://link.springer.com/article/*",
      "https://www.semanticscholar.org/paper/*", "https://papers.ssrn.com/*", "https://psycnet.apa.org/*",
    ],
    pathPrefix: "raw/clipped/papers",
    noteNamePrefix: "paper",
    defaultTags: ["clippings", "paper", "research"],
    targetCategoryDefault: "concepts",
    wikiTargetDefault: "",
    aiProperties: [],
  },
  reddit: {
    id: "04",
    kind: "reddit",
    name: { en: "Reddit Post", ko: "레딧 글" },
    what: {
      en: "A Reddit thread or post, usually with community discussion.",
      ko: "레딧 스레드·글. 보통 커뮤니티 토론 포함.",
    },
    triggers: ["https://www.reddit.com/r/*", "https://old.reddit.com/r/*", "https://reddit.com/r/*"],
    pathPrefix: "raw/clipped/reddit",
    noteNamePrefix: "reddit",
    defaultTags: ["clippings", "reddit", "community"],
    targetCategoryDefault: "projects",
    wikiTargetDefault: "",
    aiProperties: [
      {
        name: "post-type",
        type: "text",
        describe: {
          en: "One of: question, discussion, showcase, news, guide.",
          ko: "다음 중 하나: question, discussion, showcase, news, guide.",
        },
      },
    ],
  },
  code: {
    id: "05",
    kind: "code",
    name: { en: "GitHub Repo", ko: "깃허브 저장소" },
    what: {
      en: "A GitHub repository, gist, or code project.",
      ko: "깃허브 저장소·gist·코드 프로젝트.",
    },
    triggers: ["https://github.com/*", "https://gist.github.com/*"],
    pathPrefix: "raw/clipped/code",
    noteNamePrefix: "gh",
    defaultTags: ["clippings", "code", "github"],
    targetCategoryDefault: "entities",
    wikiTargetDefault: "tools/",
    aiProperties: [
      {
        name: "language",
        type: "text",
        describe: { en: "Primary programming language, if evident.", ko: "주 프로그래밍 언어(드러나면)." },
      },
    ],
  },
  ai_tool: {
    id: "06",
    kind: "ai_tool",
    name: { en: "AI Tool Doc", ko: "AI 도구 문서" },
    what: {
      en: "Docs, release notes, or a blog post for an AI tool / product.",
      ko: "AI 도구·제품의 문서·릴리스 노트·블로그.",
    },
    triggers: [
      "https://docs.anthropic.com/*", "https://www.anthropic.com/news/*",
      "https://platform.openai.com/docs/*", "https://ai.google.dev/*",
      "https://docs.cursor.com/*", "https://huggingface.co/blog/*", "https://docs.langchain.com/*",
    ],
    pathPrefix: "raw/clipped/ai-tools",
    noteNamePrefix: "ai",
    defaultTags: ["clippings", "ai-tool", "docs"],
    targetCategoryDefault: "entities",
    wikiTargetDefault: "tools/",
    aiProperties: [
      {
        name: "doc-type",
        type: "text",
        describe: { en: "One of: guide, reference, changelog, blog.", ko: "다음 중: guide, reference, changelog, blog." },
      },
      {
        name: "stack-impact",
        type: "text",
        describe: {
          en: "One line: how this could affect or apply to Simon's build.",
          ko: "한 줄: Simon의 작업/스택에 어떤 영향·적용 가능성이 있는지.",
        },
      },
    ],
  },
  self_knowledge: {
    id: "07",
    kind: "self_knowledge",
    name: { en: "Self-Knowledge", ko: "자기 이해" },
    what: {
      en: "Material about understanding oneself — frameworks, reflections, growth.",
      ko: "자기 이해에 관한 자료 — 프레임워크·성찰·성장.",
    },
    triggers: [
      "https://www.psychologytoday.com/*", "https://hbr.org/*", "https://nesslabs.com/*",
      "https://fs.blog/*", "https://markmanson.net/*", "https://tim.blog/*",
    ],
    pathPrefix: "raw/clipped/self-knowledge",
    noteNamePrefix: "sk",
    defaultTags: ["clippings", "self-knowledge"],
    targetCategoryDefault: "concepts",
    wikiTargetDefault: "",
    aiProperties: [
      {
        name: "topic-area",
        type: "text",
        describe: { en: "The self-understanding theme (e.g. habits, focus, relationships).", ko: "자기 이해 주제(예: 습관, 집중, 관계)." },
      },
      {
        name: "framework",
        type: "text",
        describe: { en: "A named framework or model it draws on, if any.", ko: "근거로 삼는 프레임워크·모델(있으면)." },
      },
      {
        name: "applicable-circuit",
        type: "multitext",
        describe: { en: "Which areas of one's life it speaks to.", ko: "삶의 어떤 영역에 닿는지." },
      },
    ],
  },
};

export const CLIPPER_TEMPLATE_LIST: readonly ClipperTemplate[] = [
  CLIPPER_TEMPLATES.inbox,
  CLIPPER_TEMPLATES.article,
  CLIPPER_TEMPLATES.video,
  CLIPPER_TEMPLATES.paper,
  CLIPPER_TEMPLATES.reddit,
  CLIPPER_TEMPLATES.code,
  CLIPPER_TEMPLATES.ai_tool,
  CLIPPER_TEMPLATES.self_knowledge,
];

/** Look up a template by kind (always defined — every SourceKind has one). */
export function clipperTemplate(kind: SourceKind): ClipperTemplate {
  return CLIPPER_TEMPLATES[kind];
}
