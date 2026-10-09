/**
 * `agent-merge-audit` — which merges an agent wrote, and whether a person approved them.
 *
 *   agent-merge-audit [audit] owner/repo [--since D --until D | --period 2026-Q3] [--base b]
 *                     [--out dir] [--json] [--no-write] [--fail-on agent-unapproved|any] [--anonymous]
 *   agent-merge-audit demo [--json] [--no-write]
 *   agent-merge-audit signatures [--json]
 *   agent-merge-audit mcp
 *
 * Every request is a GET to GitHub's REST API, with your own token or none for a public repo.
 * No account, no telemetry, no LLM calls.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { runAudit, type Report } from "./audit.js";
import { DEMO_PERIOD, DEMO_RECORDING, DEMO_REPO } from "./demo.js";
import { CliError, usage } from "./errors.js";
import { execQuiet, findToken, GitHub, parseRepo, type Exec, type FetchLike } from "./github.js";
import { NOT_ADVICE, PAGES_URL } from "./handoff.js";
import { INSTALL } from "./install.js";
import { serveStdio } from "./mcp.js";
import { resolvePeriod, type Period } from "./period.js";
import {
  csvName,
  renderCsv,
  renderError,
  renderJson,
  renderMarkdown,
  renderSummary,
  sha256,
} from "./render.js";
import { replayFetch } from "./replay.js";
import { AGENTS, AUTOMATION_LOGINS, DECLARED, SIGNATURES_READ } from "./signatures.js";
import { version } from "./version.js";

export const HELP = `agent-merge-audit ${version()} — which merges an agent wrote, and whether a person approved them

Usage
  ${INSTALL} owner/repo
      every pull request merged into the default branch in the last 30 days, with whether an agent
      (Copilot's coding agent, Claude Code, Codex, Cursor, Devin, Jules, Amp, …) wrote or co-wrote
      it, whether a person other than its authors approved it before merge on the final code, who
      merged it, the branch's review rule, and the exceptions an auditor asks about (SOC 2 CC8.1).
      Writes a dated CSV and markdown pair. Your token (GITHUB_TOKEN, GH_TOKEN or the gh CLI's
      login), or none for a public repo; --anonymous sends none
  ${INSTALL} demo
      the same on a synthetic repo shipped with this package; no requests
  ${INSTALL} signatures
      every agent signature it looks for, with where it was seen and when
  ${INSTALL} mcp
      a local MCP server over stdio: agent_merge_audit_run and agent_merge_audit_signatures

Options
  --since YYYY-MM-DD     first day of the period (UTC); default 29 days before --until
  --until YYYY-MM-DD     last day; default today
  --period 2026-09       a month, or 2026-Q3 for a quarter, instead of --since and --until
  --base <branch>        the branch merged into; default the repo's default branch
  --out <dir>            where to write the pair; default the current directory
  --no-write             print the markdown instead of writing files
  --json                 print the report as JSON and write nothing
  --fail-on <what>       exit 1 when there is an agent-written merge with no independent person's
                         approval (agent-unapproved) or any exception (any); for CI
  --anonymous            send no token

Requests: GETs to api.github.com only. Nothing is sent to us.
${NOT_ADVICE}
Pages and sources: ${PAGES_URL}
`;

export interface Deps {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  fetch?: FetchLike;
  now?: () => Date;
  cwd?: string;
  env?: Record<string, string | undefined>;
  exec?: Exec;
}

const defaultDeps: Deps = {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

export async function main(argv: string[], deps: Deps = defaultDeps): Promise<number> {
  const json = argv.includes("--json");
  try {
    return await run(argv, deps);
  } catch (e) {
    if (e instanceof CliError) {
      (json ? deps.stdout : deps.stderr)(renderError(e.toJSON(), json));
      return e.exitCode;
    }
    throw e;
  }
}

const COMMANDS = ["audit", "demo", "signatures", "mcp", "help"];
const FAIL_ON = ["agent-unapproved", "any", "none"] as const;
type FailOn = (typeof FAIL_ON)[number];

export function fails(r: Report, failOn: FailOn): boolean {
  if (failOn === "agent-unapproved")
    return (
      r.summary.agent_without_independent_approval > 0 ||
      r.direct_pushes.some((d) => d.agent.role !== null)
    );
  if (failOn === "any") return r.summary.prs_with_exceptions > 0 || r.summary.direct_pushes > 0;
  return false;
}

/** The signatures, as `signatures` and the MCP tool list them. */
export function signaturesJson() {
  return {
    read: SIGNATURES_READ,
    agents: [...AGENTS, DECLARED].map((s) => ({
      id: s.id,
      name: s.name,
      logins: s.logins ?? [],
      apps: s.apps ?? [],
      emails: s.emails ?? [],
      email_suffixes: s.emailSuffixes ?? [],
      co_author_names: s.names ?? [],
      trailers: s.trailers ?? [],
      markers: s.markers ?? [],
      seen: s.seen,
    })),
    automation: AUTOMATION_LOGINS,
    note: "An account whose type is Bot, or whose login ends in [bot], and that is not listed as an agent, is counted as automation: its approval or merge is not a person's.",
  };
}

function renderSignatures(): string {
  const j = signaturesJson();
  const out = [`Agent signatures, as read on ${j.read}:`, ""];
  for (const a of j.agents) {
    const signs = [
      ...a.logins.map((l) => `login ${l}`),
      ...a.apps.map((x) => `app ${x}`),
      ...a.emails.map((e) => `<${e}>`),
      ...a.email_suffixes.map((e) => `*${e}`),
      ...a.trailers.map((t) => `${t}:`),
      ...a.markers.map((m) => `"${m}"`),
    ];
    out.push(`${a.name}`);
    if (signs.length) out.push(`  ${signs.join(", ")}`);
    out.push(`  seen: ${a.seen}`);
  }
  out.push("", `Automation (not agents): ${j.automation.join(", ")}`, j.note, "");
  return out.join("\n");
}

async function run(argv: string[], deps: Deps): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        since: { type: "string" },
        until: { type: "string" },
        period: { type: "string" },
        base: { type: "string" },
        out: { type: "string" },
        json: { type: "boolean" },
        "no-write": { type: "boolean" },
        "fail-on": { type: "string" },
        anonymous: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (e) {
    throw usage(
      e instanceof Error ? e.message : String(e),
      `run \`${INSTALL} --help\` for the options`,
    );
  }
  const { values, positionals } = parsed;
  if (values.version) {
    deps.stdout(`${version()}\n`);
    return 0;
  }
  let [command, ...rest] = positionals;
  if (values.help || command === "help") {
    deps.stdout(HELP);
    return 0;
  }
  if (command !== undefined && !COMMANDS.includes(command)) {
    rest = [command, ...rest];
    command = "audit";
  }
  if (command === undefined) {
    deps.stdout(HELP);
    return 2;
  }
  const failOn = (values["fail-on"] ?? "none") as FailOn;
  if (!FAIL_ON.includes(failOn))
    throw usage(
      `--fail-on is agent-unapproved, any or none, got "${values["fail-on"]}"`,
      "e.g. `--fail-on agent-unapproved`",
    );
  const now = deps.now?.() ?? new Date();
  const cwd = deps.cwd ?? process.cwd();
  const env = deps.env ?? process.env;

  if (command === "mcp") {
    if (rest.length) throw usage("mcp takes no arguments", `run \`${INSTALL} mcp\``);
    await serveStdio({ fetch: deps.fetch, now: deps.now, cwd, env, exec: deps.exec });
    return 0;
  }
  if (command === "signatures") {
    if (rest.length) throw usage("signatures takes no arguments", `run \`${INSTALL} signatures\``);
    deps.stdout(
      values.json ? JSON.stringify(signaturesJson(), null, 2) + "\n" : renderSignatures(),
    );
    return 0;
  }

  let report: Report;
  if (command === "demo") {
    if (rest.length) throw usage("demo takes no arguments", `run \`${INSTALL} demo\``);
    if (!values.json)
      deps.stdout("Synthetic repo, written for this demo: not anyone's code or account.\n\n");
    report = await audit({
      repo: DEMO_REPO,
      flags: { period: DEMO_PERIOD },
      anonymous: true,
      now,
      deps: { ...deps, fetch: replayFetch(DEMO_RECORDING) },
      cwd,
      env: {},
    });
  } else {
    if (rest.length !== 1)
      throw usage(
        rest.length ? `audit takes one owner/repo, got ${rest.length}` : "which repository?",
        `run \`${INSTALL} owner/repo\`, e.g. \`${INSTALL} octo-org/app --period 2026-Q3\``,
      );
    report = await audit({
      repo: rest[0]!,
      flags: { since: values.since, until: values.until, period: values.period, base: values.base },
      anonymous: !!values.anonymous,
      now,
      deps,
      cwd,
      env,
    });
  }

  if (values.json) {
    deps.stdout(renderJson(report));
    return fails(report, failOn) ? 1 : 0;
  }
  const csv = renderCsv(report);
  const name = csvName(report);
  const markdown = renderMarkdown(report, { name: `${name}.csv`, sha256: sha256(csv) });
  if (values["no-write"]) {
    deps.stdout(markdown);
    return fails(report, failOn) ? 1 : 0;
  }
  // the demo writes its pair only where it is told to
  if (command === "demo" && values.out === undefined) {
    deps.stdout(renderSummary(report, []));
    deps.stdout(
      `\`--out <dir>\` writes the evidence pair (${name}.csv and .md); \`--no-write\` prints the markdown.\n`,
    );
    return fails(report, failOn) ? 1 : 0;
  }
  const dir = path.resolve(cwd, values.out ?? ".");
  await mkdir(dir, { recursive: true });
  const files = [path.join(dir, `${name}.csv`), path.join(dir, `${name}.md`)];
  await writeFile(files[0]!, csv);
  await writeFile(files[1]!, markdown);
  deps.stdout(
    renderSummary(
      report,
      files.map((f) => path.relative(cwd, f) || f),
    ),
  );
  return fails(report, failOn) ? 1 : 0;
}

export interface AuditRequest {
  repo: string;
  flags: { since?: string; until?: string; period?: string; base?: string };
  anonymous: boolean;
  now: Date;
  deps: Pick<Deps, "fetch" | "exec">;
  cwd: string;
  env: Record<string, string | undefined>;
}

/** The whole audit, for the CLI and the MCP tool alike. */
export async function audit(req: AuditRequest): Promise<Report> {
  const repo = parseRepo(req.repo);
  if (!repo)
    throw new CliError({
      code: "BAD_REPO",
      cause: `"${req.repo}" is not owner/repo or a github.com URL`,
      fix: `pass a repository, e.g. \`${INSTALL} octo-org/app\``,
      retryable: false,
    });
  const period: Period = resolvePeriod(req.flags, req.now);
  if (req.flags.base !== undefined && !/^[A-Za-z0-9._/-]{1,200}$/.test(req.flags.base))
    throw usage(`--base "${req.flags.base}" is not a branch name`, "e.g. `--base main`");
  // AGENT_MERGE_AUDIT_REPLAY=demo answers from the bundled synthetic recording, with no network:
  // how the Action's own test runs it (src/distribution.test.ts)
  const replay = req.env["AGENT_MERGE_AUDIT_REPLAY"] === "demo";
  const token =
    req.anonymous || replay ? null : await findToken(req.env, req.cwd, req.deps.exec ?? execQuiet);
  const gh = new GitHub({
    token,
    fetch: replay ? replayFetch(DEMO_RECORDING) : req.deps.fetch,
    apiUrl: replay ? undefined : req.env["GITHUB_API_URL"],
  });
  return runAudit({ repo, period, base: req.flags.base, gh, now: req.now });
}
