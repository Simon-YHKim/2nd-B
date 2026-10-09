import React from "react";
import type { ContextItem, ContextSource, ProfileContext } from "@/lib/import/profile-context";

(globalThis as { React?: typeof React }).React = React;
let revealSources = false;
let locale = "ko";
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useState: (initial: unknown) => [typeof initial === "boolean" ? revealSources : initial, jest.fn()],
}));
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, values?: { count: number }) => {
  const dictionary = require(`../../../../locales/${locale}/profile.json`) as Record<string, unknown>;
  const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], dictionary);
  return String(value ?? key).replace("{{count}}", String(values?.count ?? ""));
} }) }));
jest.mock("@/components/phone/PhoneUIKit", () => ({
  PhoneView: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  PhoneFlatList: ({ data, renderItem, ListHeaderComponent, ListFooterComponent }: {
    data: unknown[]; renderItem: (value: { item: unknown }) => React.ReactNode;
    ListHeaderComponent?: React.ReactNode; ListFooterComponent?: React.ReactNode;
  }) => React.createElement("div", null, ListHeaderComponent, ...data.map((item, index) =>
    React.createElement("div", { key: index }, renderItem({ item }))), ListFooterComponent),
}));
jest.mock("@/components/ui/Text", () => ({ Text: ({ children }: { children: React.ReactNode }) => React.createElement("span", null, children) }));
jest.mock("@/components/m3", () => ({
  MdCard: ({ children }: { children: React.ReactNode }) => React.createElement("section", null, children),
  MdButton: ({ label }: { label: string }) => React.createElement("button", null, label),
}));
jest.mock("../parts", () => ({ useImportStyles: () => ({}) }));

import { ContextSummaryItem, ProfileContextSummary } from "../summary";
const { renderToStaticMarkup } = require("react-dom/server") as { renderToStaticMarkup: (element: React.ReactElement) => string };
const item: ContextItem = {
  id: "private-item-id", category: "preference", statement: "나는 아침에 산책하는 것을 좋아해요.", reported_basis: "assistant_inference",
  evidence_ids: ["linked-source"], valid_time: { from: null, to: null, description: null }, conflicts_with: [],
};
const source: ContextSource = {
  id: "linked-source", kind: "chat_excerpt", speaker: "user", conversation_id: "private-conversation-id", message_id: "private-message-id",
  label: "internal source label", occurred_at: null, excerpt: "아침에 걸으면 좋아요.",
};

beforeEach(() => { revealSources = false; locale = "ko"; });

test.each(["ko", "en"])("the %s reader displays localized story labels without JSON or editable selection", (language) => {
  locale = language;
  const html = renderToStaticMarkup(React.createElement(ContextSummaryItem, { item, sources: [source], confirmed: true }));
  const translations = require(`../../../../locales/${language}/profile.json`) as { contextImport: { category: { preference: string }; basis: { assistant_inference: string }; confirmInference: string } };
  expect(html).toContain(item.statement);
  expect(html).toContain(translations.contextImport.category.preference);
  expect(html).toContain(translations.contextImport.basis.assistant_inference);
  expect(html).toContain(translations.contextImport.confirmInference);
  expect(html).not.toMatch(/checkbox|textarea|<input|polascope.user-context|private-item-id|private-conversation-id|reported_basis/);
  expect(html).not.toContain(source.excerpt);
});

test("opening sources shows only linked quotations, without conversation metadata or unrelated excerpts", () => {
  revealSources = true;
  const unrelated = { ...source, id: "unrelated-source", excerpt: "A different story's quote." };
  const html = renderToStaticMarkup(React.createElement(ContextSummaryItem, { item, sources: [source, unrelated], confirmed: false }));
  expect(html).toContain(source.excerpt);
  expect(html).not.toContain(unrelated.excerpt);
  expect(html).not.toContain(source.label);
  expect(html).not.toContain(source.conversation_id);
  expect(html).not.toContain("내 이야기와 맞는지 확인했어요");
});

test("the saved document is shown in bounded pages and unreferenced source content stays hidden", () => {
  revealSources = true;
  const document: ProfileContext = {
    format: "polascope.user-context", version: "1.0-draft", origin: { service: "private-service", model: null, exported_at: null },
    coverage: { accessed: ["current_chat"], unavailable: [], omissions: [], more_items: "unknown", account_completeness: "unknown" },
    items: Array.from({ length: 6 }, (_, index) => ({ ...item, id: `item-${index}`, statement: `Saved story ${index}` })),
    sources: [source, { ...source, id: "unrelated", excerpt: "Unrelated sensitive quote" }],
  };
  const html = renderToStaticMarkup(React.createElement(ProfileContextSummary, { context: { document, confirmedIds: ["item-0"] } }));
  expect(html).toContain("6개의 이야기를 기록에 추가했어요.");
  expect(html).toContain("Saved story 4");
  expect(html).not.toContain("Saved story 5");
  expect(html).toContain("더 보기");
  expect(html).not.toMatch(/Unrelated sensitive quote|private-service|account_completeness|format|1.0-draft/);
});
