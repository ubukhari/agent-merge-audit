/**
 * What every output ends with (brief DOOR-20): the not-advice line, and the hand-off to okgate,
 * worded as not built. okgate's hook mode already holds an agent's push or merge until a person
 * types the go-ahead and logs the decision on the machine; a continuous record of every merge,
 * kept across an audit window for an auditor, does not exist. The /merge-audit/record page's view
 * is the count. No price is named until one is decided and its checkout works.
 */

/** On every output: the CLI's text, the markdown, the CSV preamble, the JSON, the MCP results. */
export const NOT_ADVICE =
  "Not audit advice: this lists what GitHub's records show. Whether it meets your controls is for you and your auditor.";

/** That detection is by signature, said wherever a count of agent-written PRs is shown. */
export const FLOOR_NOTE =
  "Agents are found by the signatures they leave (bot accounts, commit identities, co-author trailers, PR-body markers). An agent that leaves none, or a trailer someone removed, is not found, so the count is a floor.";

/** okgate's site, where the pages and the waitlist live. */
export const SITE = "https://agentwares-agentguard.vercel.app";
export const REF = "agent-merge-audit";
export const PAGES_URL = `${SITE}/merge-audit`;

/** Where a run's hand-off line points: the hub's record section, attributed. */
export const HANDOFF_URL = `${PAGES_URL}?ref=${REF}#record`;

/** The hand-off, word for word, at the end of every run and on every page. */
export const HANDOFF_LINE =
  "A continuous, hash-chained record of every agent change, kept across your audit window, is not built.";

/** What it would do, and what works today. */
export const HANDOFF_DETAIL =
  "It would record each merge as it happens (who or what wrote it, who approved it, who merged it, under which rule) in okgate's hash-chained log, with a quarterly CC8.1 export and a read-only link for your auditor. What works today, free: okgate's hook mode holds an agent's git push or merge in Claude Code, Codex and Gemini CLI until a person types the go-ahead, and logs each decision in a hash-chained log on your machine (`okgate verify` checks it). If you would pay for the record, say so with one click:";

/** okgate's hook mode, as its own README names it. */
export const OKGATE_HOOKS = "npx -p @agentwares/agentguard okgate hooks install";
