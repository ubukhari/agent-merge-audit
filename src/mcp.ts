/**
 * `agent-merge-audit mcp`: a local MCP server over stdio with two tools, so an agent can answer
 * "which merges did an agent write here, and did a person approve them?" with the user's own
 * GitHub access.
 *
 * Implemented here rather than on the MCP SDK so the package has no runtime dependencies. It
 * speaks the initialize-based protocol revisions (2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05):
 * newline-delimited JSON-RPC on stdin/stdout, `initialize`, `ping`, `tools/list`, `tools/call`.
 * Any other method answers -32601. Nothing but protocol goes to stdout.
 *
 * Both tools only read. The run reads GitHub's API and writes no file; what it returns goes to the
 * agent's model provider like any tool result: PR numbers, titles, logins, dates. Never a token,
 * and never a person's email address.
 */
import { createInterface } from "node:readline";
import { CliError } from "./errors.js";
import type { Exec, FetchLike } from "./github.js";
import { HANDOFF_LINE, NOT_ADVICE } from "./handoff.js";
import { audit, signaturesJson } from "./main.js";
import { version } from "./version.js";

export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, Record<string, unknown>>;
    required?: string[];
    additionalProperties: false;
  };
  annotations: {
    title: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
}

const DATE = "^\\d{4}-\\d{2}-\\d{2}$";

export const TOOLS: readonly ToolDefinition[] = [
  {
    name: "agent_merge_audit_run",
    title: "Agent-written merges and who approved them",
    description: `Lists every pull request merged into a GitHub repository's branch in a period, read from GitHub's API, with: whether an AI agent wrote or co-wrote it (GitHub Copilot's coding agent, Claude Code, OpenAI Codex, Cursor, Devin, Jules, Amp, Gemini, OpenHands, aider, found by bot accounts, commit identities, Co-authored-by trailers and PR-body markers, each match shown as evidence); whether a person other than its authors and co-authors approved it before merge, on the final code; who merged it; the branch's review rule as read now, and at each merge where GitHub still keeps the evaluation (one month, admin token); and the exceptions an auditor asks about under SOC 2 CC8.1 (agent-no-human-approval, no-approval, self-approval-only, bot-approval-only, stale-approval, merged-by-bot, rule-bypassed, unapproved-while-rule-requires, direct-push), each with the question to answer. Also every commit on the branch in the period that no merged PR accounts for. Use it when someone asks which changes an agent made without a person's review, prepares change-management evidence for a SOC 2 or ISO 27001 audit, or wants to know whether Copilot's approval stood in for a person's. Reads only, with the user's own token (GITHUB_TOKEN, GH_TOKEN or the GitHub CLI login), or anonymously for a public repo (60 requests an hour, about 25 PRs). Writes no file. Detection by signature is a floor. ${NOT_ADVICE} Every result ends with a note that a continuous record is not built: "${HANDOFF_LINE}"`,
    inputSchema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          minLength: 3,
          maxLength: 200,
          description: "The repository as owner/repo (octo-org/app) or its github.com URL.",
        },
        since: {
          type: "string",
          pattern: DATE,
          description:
            "First day of the period, YYYY-MM-DD (UTC). Omitted: 29 days before until. Not with period.",
        },
        until: {
          type: "string",
          pattern: DATE,
          description: "Last day of the period, YYYY-MM-DD (UTC), up to today. Omitted: today.",
        },
        period: {
          type: "string",
          pattern: "^\\d{4}-(\\d{2}|[Qq][1-4])$",
          description:
            "A calendar month (2026-09) or quarter (2026-Q3) instead of since and until.",
        },
        base: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          pattern: "^[A-Za-z0-9._/-]+$",
          description: "The branch merged into. Omitted: the repository's default branch.",
        },
      },
      required: ["repo"],
      additionalProperties: false,
    },
    annotations: {
      title: "Agent-written merges and who approved them",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "agent_merge_audit_signatures",
    title: "How AI agents show up in GitHub's records",
    description:
      "Lists the signatures agent_merge_audit_run uses to tell an AI agent's work from a person's in GitHub's records: the bot accounts and GitHub Apps (copilot-swe-agent, claude[bot], devin-ai-integration[bot], google-labs-jules[bot], cursor[bot], …), commit identities and Co-authored-by addresses (noreply@anthropic.com, cursoragent@cursor.com, codex@openai.com, copilot@github.com, amp@ampcode.com, …), agent-only trailers (Amp-Thread-ID, Entire-Checkpoint) and PR-body markers, each with where and how often it was seen and the date it was read; and the bots counted as automation, not agents. Use it to explain why a PR was or was not counted as agent-written. Reads nothing: the list is bundled with this version.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      title: "How AI agents show up in GitHub's records",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];

export interface McpContext {
  env?: Record<string, string | undefined>;
  cwd?: string;
  exec?: Exec;
  fetch?: FetchLike;
  now?: () => Date;
}

function invalid(cause: string, fix: string): never {
  throw new CliError({ code: "INVALID_INPUT", cause, fix, retryable: false });
}

function checkArgs(tool: ToolDefinition, raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw))
    invalid("arguments must be an object", "Pass the arguments as a JSON object.");
  const props = tool.inputSchema.properties;
  const a = raw as Record<string, unknown>;
  for (const [k, v] of Object.entries(a)) {
    const p = props[k];
    if (!p)
      invalid(
        `unknown argument \`${k}\``,
        Object.keys(props).length ? `Use only: ${Object.keys(props).join(", ")}.` : "Pass {}.",
      );
    if (v === undefined) continue;
    if (typeof v !== "string") invalid(`\`${k}\` must be a string`, "Omit it, or pass a string.");
    if (typeof p.minLength === "number" && v.length < p.minLength)
      invalid(`\`${k}\` is too short`, `Give at least ${p.minLength} characters.`);
    if (typeof p.maxLength === "number" && v.length > p.maxLength)
      invalid(`\`${k}\` is too long`, `Give at most ${p.maxLength} characters.`);
    if (typeof p.pattern === "string" && !new RegExp(p.pattern).test(v))
      invalid(`\`${k}\` does not match ${p.pattern}`, String(p.description));
  }
  for (const r of tool.inputSchema.required ?? [])
    if (a[r] === undefined) invalid(`\`${r}\` is required`, String(props[r]!.description));
  return a;
}

export async function callTool(
  name: string,
  rawArgs: unknown,
  ctx: McpContext = {},
): Promise<{ structured: Record<string, unknown>; isError: boolean }> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`unknown tool ${name}`);
  try {
    const args = checkArgs(tool, rawArgs);
    if (name === "agent_merge_audit_signatures")
      return { structured: signaturesJson() as unknown as Record<string, unknown>, isError: false };
    if (args.period !== undefined && (args.since !== undefined || args.until !== undefined))
      invalid("give period, or since and until, not both", "Drop period, or drop since and until.");
    const report = await audit({
      repo: args.repo as string,
      flags: {
        since: args.since as string | undefined,
        until: args.until as string | undefined,
        period: args.period as string | undefined,
        base: args.base as string | undefined,
      },
      anonymous: false,
      now: ctx.now?.() ?? new Date(),
      deps: { fetch: ctx.fetch, exec: ctx.exec },
      cwd: ctx.cwd ?? process.cwd(),
      env: ctx.env ?? process.env,
    });
    return { structured: report as unknown as Record<string, unknown>, isError: false };
  } catch (err) {
    const body =
      err instanceof CliError
        ? err.toJSON()
        : {
            code: "INTERNAL",
            cause: err instanceof Error ? err.message : String(err),
            fix: "Run agent-merge-audit on the same repo in a terminal to see the error with its context, and report it at https://github.com/agentwares/agent-merge-audit/issues.",
            retryable: false,
          };
    return { structured: { ...body }, isError: true };
  }
}

interface Request {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

const INSTRUCTIONS =
  "agent-merge-audit lists the pull requests merged into a GitHub branch in a period, with whether an AI agent wrote or co-wrote each one, whether a person other than its authors approved it before merge, who merged it, the review rule, and the SOC 2 CC8.1 exceptions an auditor asks about. Read-only; not audit advice.";

export async function handleMessage(msg: unknown, ctx: McpContext): Promise<unknown> {
  if (Array.isArray(msg)) {
    const out = (await Promise.all(msg.map((m) => handleMessage(m, ctx)))).filter(
      (r) => r !== undefined,
    );
    return out.length ? out : undefined;
  }
  const req = (msg && typeof msg === "object" ? msg : {}) as Request;
  const hasId = "id" in req && (typeof req.id === "string" || typeof req.id === "number");
  const id = hasId ? req.id : null;
  const error = (code: number, message: string) => ({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
  if (!("method" in req) && ("result" in req || "error" in req)) return undefined;
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string")
    return hasId || !("method" in req) ? error(-32600, "Invalid Request") : undefined;
  if (!hasId) return undefined; // notifications
  const params = (req.params && typeof req.params === "object" ? req.params : {}) as Record<
    string,
    unknown
  >;
  switch (req.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = (PROTOCOL_VERSIONS as readonly string[]).includes(asked)
        ? asked
        : PROTOCOL_VERSIONS[0];
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "agent-merge-audit", title: "agent-merge-audit", version: version() },
          instructions: INSTRUCTIONS,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    case "tools/call": {
      const name = params.name;
      if (typeof name !== "string" || !TOOLS.some((t) => t.name === name))
        return error(
          -32602,
          `Unknown tool: ${String(name)}. Tools: ${TOOLS.map((t) => t.name).join(", ")}`,
        );
      const { structured, isError } = await callTool(name, params.arguments, ctx);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(structured) }],
          structuredContent: structured,
          isError,
        },
      };
    }
    default:
      return error(-32601, `Method not found: ${req.method}`);
  }
}

/** Serve on stdin/stdout until stdin closes. */
export async function serveStdio(ctx: McpContext = {}): Promise<void> {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        }) + "\n",
      );
      continue;
    }
    try {
      const res = await handleMessage(msg, ctx);
      if (res !== undefined) process.stdout.write(JSON.stringify(res) + "\n");
    } catch (err) {
      process.stderr.write(
        `agent-merge-audit mcp: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
}
