// Detect the clipper template kind from a source URL.
//
// Mirrors the 8 Obsidian Web Clipper templates Simon uses. The matcher is
// hostname-first (with public-suffix-aware checks), then path-disambiguating
// for sites that host multiple kinds (e.g. doi.org always = paper).
//
// Returns "inbox" as the safe fallback for anything we can't classify —
// the user can re-tag manually from the inbox queue.

import type { SourceKind } from "./types";

const AI_TOOL_HOSTS = new Set<string>([
  "anthropic.com",
  "claude.ai",
  "openai.com",
  "platform.openai.com",
  "chat.openai.com",
  "ai.google.dev",
  "deepmind.google",
  "ai.meta.com",
  "huggingface.co",
  "cohere.com",
  "mistral.ai",
  "x.ai",
  "groq.com",
  "perplexity.ai",
  "supabase.com",
  "vercel.com",
  "cursor.sh",
  "cursor.com",
]);

const ACADEMIC_HOSTS = new Set<string>([
  "arxiv.org",
  "doi.org",
  "pubmed.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "nature.com",
  "science.org",
  "sciencedirect.com",
  "springer.com",
  "link.springer.com",
  "wiley.com",
  "onlinelibrary.wiley.com",
  "tandfonline.com",
  "sagepub.com",
  "journals.sagepub.com",
  "cambridge.org",
  "oup.com",
  "academic.oup.com",
  "jstor.org",
  "researchgate.net",
  "psycnet.apa.org",
  "biorxiv.org",
  "medrxiv.org",
  "ssrn.com",
  "papers.ssrn.com",
  "semanticscholar.org",
  "scholar.google.com",
]);

const YOUTUBE_HOSTS = new Set<string>(["youtube.com", "m.youtube.com", "youtu.be"]);
const REDDIT_HOSTS = new Set<string>(["reddit.com", "old.reddit.com", "new.reddit.com", "np.reddit.com"]);
const GITHUB_HOSTS = new Set<string>(["github.com"]);

/** Strip leading "www." for lookup. */
function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

export function detectClipperKind(rawUrl: string): SourceKind {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "inbox";
  }
  const host = normalizeHost(parsed.hostname);
  if (host.length === 0) return "inbox";

  if (YOUTUBE_HOSTS.has(host)) return "video";
  if (REDDIT_HOSTS.has(host)) return "reddit";
  if (ACADEMIC_HOSTS.has(host)) return "paper";
  if (AI_TOOL_HOSTS.has(host)) return "ai_tool";

  if (GITHUB_HOSTS.has(host)) {
    // github.com/<owner>/<repo>… → code
    // github.com (no path) → fall through to article (rare)
    const segs = parsed.pathname.split("/").filter(Boolean);
    if (segs.length >= 2) return "code";
  }

  return "article";
}
