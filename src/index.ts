/**
 * The library behind the CLI: read a repository's merged pull requests from GitHub, classify who
 * wrote, approved and merged each one, and render the evidence pair. The GitHub Action
 * (action.yml) imports `renderMarkdown`, `renderCsv` and the helpers from here to render the JSON
 * report the CLI wrote.
 */
export {
  approvalClass,
  approvalsOf,
  EXCEPTIONS,
  exceptionsOf,
  involvement,
  mergedBy,
  readRules,
  runAudit,
  summarise,
  writers,
} from "./audit.js";
export type {
  AgentInvolvement,
  ApprovalClass,
  ApprovalRow,
  ExceptionCode,
  Person,
  PrRow,
  PushRow,
  Report,
  Rules,
  Summary,
} from "./audit.js";
export { DEMO_PERIOD, DEMO_RECORDING, DEMO_REPO } from "./demo.js";
export { CliError, type Problem } from "./errors.js";
export { findToken, GitHub, parseRepo } from "./github.js";
export type { FetchLike } from "./github.js";
export {
  FLOOR_NOTE,
  HANDOFF_DETAIL,
  HANDOFF_LINE,
  HANDOFF_URL,
  NOT_ADVICE,
  PAGES_URL,
} from "./handoff.js";
export { audit, fails, main, signaturesJson } from "./main.js";
export { TOOLS, callTool, handleMessage } from "./mcp.js";
export { months, namedPeriod, resolvePeriod } from "./period.js";
export type { Period } from "./period.js";
export {
  cell,
  CSV_COLUMNS,
  csvName,
  renderCsv,
  renderJson,
  renderMarkdown,
  renderSummary,
  sha256,
} from "./render.js";
export { normalisePath, replayFetch } from "./replay.js";
export type { Recording, RecordedResponse } from "./replay.js";
export {
  AGENTS,
  agentsInCommit,
  classifyActor,
  humanCoAuthors,
  loginFromEmail,
  parseTrailers,
} from "./signatures.js";

/** The day the README sample was recorded on (scripts/sample.mjs). */
export const SAMPLE_DATE = "2026-10-09";
