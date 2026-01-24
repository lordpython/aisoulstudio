import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    ignores: ["node_modules/**", "dist/**", "*.min.js", "public/**"],
  },
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: globals.browser } },
  tseslint.configs.recommended,
  pluginReact.configs.flat.recommended as any,
  {
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // React 17+ doesn't need React import for JSX
      "react/react-in-jsx-scope": "off",
      // TypeScript handles prop validation
      "react/prop-types": "off",
      // Allow quotes in JSX text
      "react/no-unescaped-entities": "off",
      // Anonymous components are fine (memo, forwardRef)
      "react/display-name": "off",
      // Allow explicit any (warn instead of error if you want stricter)
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow @ts-ignore when needed
      "@typescript-eslint/ban-ts-comment": "off",
      // Allow unused vars with underscore prefix or usage in specific patterns
      // Also ignore unused caught errors commonly used in try/catch just for control flow
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_"
        }
      ],
      // Allow dynamic require() for conditional imports
      "@typescript-eslint/no-require-imports": "off",
      // Allow control characters in regex (used for cleaning binary data)
      "no-control-regex": "off",
      // Allow lexical declarations in case blocks
      "no-case-declarations": "off",
      // Disable base rule as it can report incorrect errors
      "no-unused-vars": "off",

      // additional common rules to relax
      "no-undef": "off", // TypeScript handles this
    },
  },
]);
