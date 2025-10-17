import js from "@eslint/js";
import globals from "globals";

export default [
  // Configuration for Node.js files (server-side)
  {
    files: ["server.js", "aws-config.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      ecmaVersion: 2022,
      sourceType: "commonjs",
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
  // Configuration for browser files (client-side)
  {
    files: ["public/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      ecmaVersion: 2022,
      sourceType: "script",
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
  // Configuration for ES modules
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
];
