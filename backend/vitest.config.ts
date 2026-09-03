import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
    // Without this, a local `npm run build` (which compiles src/**/*.test.ts
    // into dist/**/*.test.js too, since tsconfig's include isn't test-aware)
    // leaves compiled CJS test files vitest's default glob would also pick
    // up — and vitest can't import itself from a require()'d CJS module, so
    // every dist/ copy fails outright. Only the TS sources under src are
    // ever the real test files.
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
