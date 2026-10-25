import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Vendor SDKs may only be imported by the real AI provider. Everything else stays vendor-neutral.
const VENDOR_SDKS = [
  "openai",
  "openai/*",
  "@anthropic-ai/*",
  "@google/genai",
  "@google/generative-ai",
  "@google-cloud/*",
  "replicate",
  "@fal-ai/*",
  "@mistralai/*",
  "cohere-ai",
  "groq-sdk",
  "together-ai",
  "@aws-sdk/client-bedrock*",
  "ai",
  "@ai-sdk/*",
];

export default tseslint.config(
  {
    ignores: [".next/**", "node_modules/**", "coverage/**", "supabase/**", "next-env.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "error",
      eqeqeq: ["error", "always"],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: VENDOR_SDKS,
              message: "Vendor SDKs may only be imported in src/lib/ai/providers/real/.",
            },
            {
              group: ["@/lib/ai/providers/*", "**/ai/providers/*"],
              message: "Use the AiService from @/lib/ai, never a provider directly.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/ai/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: VENDOR_SDKS,
              message: "Vendor SDKs may only be imported in src/lib/ai/providers/real/.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/ai/providers/real/**"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["src/lib/log/**", "scripts/**"],
    rules: { "no-console": "off" },
  },
  {
    files: ["tests/**"],
    rules: { "no-restricted-imports": "off" },
  },
);
