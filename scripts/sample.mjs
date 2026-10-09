#!/usr/bin/env node
/**
 * The README's recorded sample and the example evidence pair: `agent-merge-audit demo` as it runs
 * at noon UTC on 9 October 2026, over the synthetic repo. Build first (`pnpm build`). It prints the
 * sample for the README and writes the pair to examples/demo-evidence/; src/distribution.test.ts
 * fails while either differs from what the CLI produces.
 */
import { fileURLToPath } from "node:url";
import { main, SAMPLE_DATE } from "../dist/index.js";

const deps = {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  now: () => new Date(`${SAMPLE_DATE}T12:00:00Z`),
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: {},
};
await main(["demo"], deps);
await main(["demo", "--out", "examples/demo-evidence"], { ...deps, stdout: () => undefined });
