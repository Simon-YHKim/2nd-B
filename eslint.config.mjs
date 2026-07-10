// ESLint v9 flat config.
//
// C1 enforcement points:
//   - Global rule blocks all foreign LLM SDKs and @google/genai
//   - Overrides re-enable @google/genai inside src/lib/llm/gemini.ts only
//   - Separate override blocks direct import of src/lib/supabase/audit.ts
//     from anywhere except sanctioned LLM-boundary modules (C3 bypass prevention)

import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import prettierConfig from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";

const FOREIGN_LLM_SDKS = [
  "openai",
  "openai/*",
  "@openai/*",
  "anthropic",
  "@anthropic-ai/*",
  "cohere-ai",
  "@cohere-ai/*",
  "mistralai",
  "@mistralai/*",
  "groq-sdk",
  "@xai-sdk/*",
  "@aws-sdk/client-bedrock-runtime",
  "replicate",
];

export default [
  {
    ignores: [
      "node_modules/**",
      // Nested git worktrees (.worktrees/<branch>) are full repo copies — `eslint .`
      // must not lint them (team rule: all 2ndB worktrees live under .worktrees/).
      ".worktrees/**",
      ".expo/**",
      "dist/**",
      // Vendored design-asset packs (reference SVGs / example components) —
      // static deliverables served as-is, not project source to lint.
      "public/**",
      // Generated reports and prototype exports. Already in .gitignore, so CI
      // never sees them, but a populated Output/ made `npm run verify` fail
      // locally on a tree CI called green.
      "Output/**",
      "web-build/**",
      "ios/**",
      "android/**",
      "coverage/**",
      "expo-env.d.ts",
      "*.config.js",
      // Edge Functions target the Deno runtime, not Node — separate type
      // pipeline. Linted by the Supabase CLI when deployed.
      "supabase/functions/**",
      // Design-clone reference bundle (vendored web prototype) + Workflow-runtime
      // orchestration scripts (top-level await/return, wrapped by the runtime) —
      // not lintable as plain ES modules and not app source.
      "docs/clone-audit/**",
      "scripts/wf-*.mjs",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    plugins: { "@typescript-eslint": tsPlugin, "react-hooks": reactHooks },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [...FOREIGN_LLM_SDKS, "@google/genai"],
        },
      ],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Hooks must run unconditionally and in order. Catches the class of bug
      // where a useMemo/useEffect sits after an early return — which blanked
      // /capture with React #300 once it became a primary tab (Phase 3).
      "react-hooks/rules-of-hooks": "error",
    },
  },
  // Allow @google/genai ONLY inside the wrapper module + the safety classifier
  // (which is itself called only from the wrapper). The boundary script
  // `scripts/check-llm-import-boundary.ts` provides the second line of defense.
  {
    files: ["src/lib/llm/gemini.ts", "src/lib/llm/safety.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [...FOREIGN_LLM_SDKS],
        },
      ],
    },
  },
  // Block direct import of audit / crisis-events modules from outside the wrapper
  // and its durable write-outbox helper.
  // Tests for the wrapper need to import them to mock; allow them explicitly.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: [
      "src/lib/llm/gemini.ts",
      "src/lib/llm/audit-write-outbox.ts",
      "src/lib/llm/safety.ts",
      "src/lib/supabase/audit.ts",
      "src/lib/supabase/crisis-events.ts",
      "src/lib/llm/__tests__/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: [...FOREIGN_LLM_SDKS, "@google/genai"] },
            {
              // Glob catches BOTH the @/ alias and the relative form
              // (../supabase/audit) the codebase actually uses; the old `paths`
              // entry only matched the exact "@/lib/supabase/audit" string, so a
              // relative import slipped the C3 boundary.
              group: ["**/supabase/audit"],
              message: "Use callGemini() — direct audit insert bypasses C3.",
            },
          ],
        },
      ],
    },
  },
  prettierConfig,
];
