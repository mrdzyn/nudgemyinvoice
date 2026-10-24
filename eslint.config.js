import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "packages/db/migrations/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "error",
    },
  },
  {
    // A TrustedActor may only be minted from a database-validated session (apps/api/src/auth/trusted-actor.ts).
    files: ["apps/**/*.ts", "packages/**/*.ts"],
    ignores: ["apps/api/src/auth/trusted-actor.ts", "**/*.test.ts", "packages/domain/src/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@nmi/domain",
              importNames: ["asTrustedActor"],
              message:
                "asTrustedActor may only be used in apps/api/src/auth/trusted-actor.ts (validated sessions).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { console: "readonly", process: "readonly" } },
    rules: { "no-console": "off" },
  },
);
