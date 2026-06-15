// O-23 Stage③: /graph renders the village graph (the deep-space shell's 그래프 menu
// routes here). It re-exports GraphScreen from index.tsx with no logic fork — in
// legacy mode `/` already shows the graph, so this route is exercised by the
// deep-space track. See docs/deep-space-nav-contract.md.
export { GraphScreen as default } from "./index";
