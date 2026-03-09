import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Disable no-explicit-any - types will be fixed in future refactor
  // Disable setState in effect warning (false positive)
  // Disable warnings that don't affect build
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react/no-unstable-nested-components": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Local-only tooling/scripts (not shipped):
    "scripts/**",
  ]),
]);

export default eslintConfig;
