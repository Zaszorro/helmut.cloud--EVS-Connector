import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import local_rules from "./eslint-local-rules/index.mjs";

export default [
    { files: ["**/*.{js,mjs,cjs,ts}"] },
    { ignores: ["**/bundle.js", "eslint-local-rules/**/*", "tests/framework/engine/**/*"] },
    { languageOptions: { globals: globals.node } },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    {
        plugins: { local_rules },
        rules: {
            "local_rules/node-specification": "warn",
        },
    },
];
