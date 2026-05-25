// ESLint v9 flat config.
//
// C1 enforcement points:
//   - Global rule blocks all foreign LLM SDKs and @google/genai
//   - Overrides re-enable @google/genai inside src/lib/llm/gemini.ts only
//   - Separate override blocks direct import of src/lib/supabase/audit.ts
//     from anywhere except src/lib/llm/gemini.ts (C3 bypass prevention)

import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import prettierConfig from "eslint-config-prettier";

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
      ".expo/**",
      "dist/**",
      "web-build/**",
      "ios/**",
      "android/**",
      "coverage/**",
      "expo-env.d.ts",
      "*.config.js",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [...FOREIGN_LLM_SDKS, "@google/genai"],
        },
      ],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  // Allow @google/genai ONLY inside the wrapper module.
  {
    files: ["src/lib/llm/gemini.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [...FOREIGN_LLM_SDKS],
        },
      ],
    },
  },
  // Block direct import of audit module from outside the wrapper.
  // Tests for the wrapper need to import it to mock; allow them explicitly.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: [
      "src/lib/llm/gemini.ts",
      "src/lib/supabase/audit.ts",
      "src/lib/llm/__tests__/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [...FOREIGN_LLM_SDKS, "@google/genai"],
          paths: [
            {
              name: "@/lib/supabase/audit",
              message: "Use callGemini() — direct audit insert bypasses C3.",
            },
          ],
        },
      ],
    },
  },
  prettierConfig,
];
