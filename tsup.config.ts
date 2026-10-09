import { defineConfig } from "tsup";

/**
 * No runtime dependencies: npx installs one package, and the GitHub Action runs the committed
 * dist/ with no install. The demo's synthetic recording is bundled, so `demo` makes no request;
 * every other request is a GET to GitHub's REST API (src/github.ts).
 */
export default defineConfig({
  entry: { cli: "src/cli.ts", index: "src/index.ts" },
  format: ["esm"],
  platform: "node",
  target: "node20",
  dts: { entry: { index: "src/index.ts" } },
  sourcemap: true,
  clean: true,
  splitting: false,
});
