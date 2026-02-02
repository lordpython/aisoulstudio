import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    ignores: ["node_modules/**", "dist/**", "build/**", "*.min.js", "public/**"],
  },
  // Shared config for all files
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    plugins: {
      js,
      "react-hooks": pluginReactHooks
    },
    extends: ["js/recommended"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021
      }
    }
  },
  tseslint.configs.recommended as any,
  pluginReact.configs.flat.recommended as any,
  {
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // --- React Hooks (Essential for Bug Prevention) ---
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // --- React 17+ / Clean UI Logic ---
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react/no-unescaped-entities": "off",
      "react/display-name": "off",
      "react/no-array-index-key": "warn", // Help catch potential list rendering bugs

      // --- Relaxed Rules (Development Speed) ---
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "no-empty": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-unused-vars": "off",
      "no-undef": "off", // TypeScript handles this

      // --- Clean Code Habits ---
      "no-console": ["warn", { allow: ["warn", "error", "info"] }], // Reminds you to clean up logs
      "no-debugger": "warn",
      "no-constant-condition": "warn",
      "no-control-regex": "off",
      "no-case-declarations": "off",
    },
  },
]);
