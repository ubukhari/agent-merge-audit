/**
 * The evidence pair (CSV and markdown), the terminal summary, JSON and errors.
 *
 * The CSV is one row per merged PR and per direct push, after a `#` preamble that names the tool,
 * the repo, the period, when it was generated and the not-advice line. Cells that a spreadsheet
 * would run as a formula (PR titles are written by anyone) are prefixed with `'`. The markdown
 * names the CSV's SHA-256, so the two can be checked against each other.
 */
import { createHash } from "node:crypto";
import {
  EXCEPTIONS,
  type ApprovalRow,
  type ExceptionCode,
  type Person,
  type PrRow,
  type PushRow,
  type Report,
} from "./audit.js";
import type { Problem } from "./errors.js";
import { OKGATE_HOOKS } from "./handoff.js";

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export const CSV_COLUMNS = [
  "type",
  "number",
  "url",
  "title",
  "merged_at",
  "author",
  "author_kind",
  "agent",
  "agent_role",
  "agent_evidence",
  "approved_by_independent",
  "approved_by_other",
  "approval",
  "merged_by",
  "merged_by_kind",
  "rule_at_merge",
  "exceptions",
] as const;

/** One CSV cell: quoted when it must be, and never a formula. */
export function cell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const who = (p: Person | null | undefined) => p?.login ?? "";
const approvers = (a: ApprovalRow[], independent: boolean) =>
  a
    .filter((x) => x.independent === independent)
    .map(
      (x) =>
        `${x.login}${x.stale ? " (before last commit)" : ""}${x.kind !== "human" ? ` (${x.kind})` : ""}`,
    )
    .join("; ");

export function csvName(r: Pick<Report, "repo" | "period">): string {
  const slug = r.repo.replace(/[^A-Za-z0-9._-]+/g, "-");
  return `${slug}-merge-audit-${r.period.since}-to-${r.period.until}`;
}

export function renderCsv(r: Report): string {
  const lines = [
    `# agent-merge-audit ${r.version}; ${r.repo}, branch ${r.base}, merged ${r.period.since} to ${r.period.until} (UTC); generated ${r.generated_at} from GitHub's API (${r.auth})`,
    `# ${r.note}`,
    `# ${r.detection_note}`,
    CSV_COLUMNS.join(","),
  ];
  const prRow = (p: PrRow) =>
    [
      "pr",
      p.number,
      p.url,
      p.title,
      p.merged_at,
      p.author.login,
      p.author.kind,
      p.agent.agents.join("; "),
      p.agent.role ?? "",
      p.agent.evidence.join("; "),
      approvers(p.approvals, true),
      approvers(p.approvals, false),
      p.approval,
      `${who(p.merged_by)}${p.merged_via ? ` (via ${p.merged_via})` : ""}`,
      p.merged_by?.kind ?? "",
      p.rule_at_merge,
      p.exceptions.join("; "),
    ]
      .map(cell)
      .join(",");
  const pushRow = (d: PushRow) =>
    [
      "direct-push",
      "",
      d.url,
      d.title,
      d.at,
      d.author.login,
      d.author.kind,
      d.agent.agents.join("; "),
      d.agent.role ?? "",
      d.agent.evidence.join("; "),
      "",
      "",
      "none",
      who(d.committer),
      d.committer?.kind ?? "",
      "",
      d.exceptions.join("; "),
    ]
      .map(cell)
      .join(",");
  for (const p of r.prs) lines.push(prRow(p));
  for (const d of r.direct_pushes) lines.push(pushRow(d));
  return lines.join("\n") + "\n";
}

export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

/** A table cell: no pipes or line breaks. */
const md = (s: string) => s.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
const day = (iso: string) => iso.slice(0, 10);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function ruleLine(r: Report["rules"]["review"][number]): string {
  const parts = [`${plural(r.approvals, "approval")} required`];
  if (r.last_push_approval) parts.push("the last push must be approved by someone else");
  if (r.dismiss_stale) parts.push("stale approvals dismissed on push");
  if (r.code_owners) parts.push("code owners must approve");
  return `${r.source}: a pull request is required, ${parts.join(", ")}`;
}

const approvalText: Record<PrRow["approval"], string> = {
  independent: "independent person",
  stale: "before last commit",
  self: "own author only",
  bot: "bot only",
  none: "none",
};

function agentCell(p: { agent: PrRow["agent"] }): string {
  if (p.agent.role === null) return "";
  return `${p.agent.agents.join(", ")} (${p.agent.role === "author" ? "wrote" : "co-wrote"})`;
}

export function renderMarkdown(r: Report, csv?: { name: string; sha256: string }): string {
  const s = r.summary;
  const out: string[] = [];
  out.push(`# Agent-merge audit: ${r.repo}, ${r.period.since} to ${r.period.until}`);
  out.push("");
  out.push(
    `Every pull request merged into \`${r.base}\` from ${r.period.since} to ${r.period.until} (UTC), read from GitHub's API ${r.auth === "token" ? "with your token" : "without a token"} on ${r.generated_at} by agent-merge-audit ${r.version}.`,
  );
  out.push("");
  out.push(`**${r.note}**`);
  out.push("");
  out.push("## Summary");
  out.push("");
  out.push("| | |");
  out.push("| --- | --- |");
  out.push(`| Pull requests merged into \`${r.base}\` | ${s.merged_prs} |`);
  const agents = Object.entries(s.by_agent)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([a, n]) => `${a} ${n}`)
    .join(", ");
  out.push(`| Written or co-written by an agent | ${s.agent_prs}${agents ? ` (${agents})` : ""} |`);
  out.push(
    `| ...of them with no independent person's approval | ${s.agent_without_independent_approval} |`,
  );
  out.push(
    `| Approved by an independent person, on the final code | ${s.independent_approval} of ${s.merged_prs} |`,
  );
  out.push(`| Pull requests with an exception | ${s.prs_with_exceptions} |`);
  out.push(
    `| Commits on \`${r.base}\` without a merged pull request | ${s.direct_pushes} of ${s.commits_on_base}${s.commits_unchecked ? ` (${s.commits_unchecked} unchecked)` : ""} |`,
  );
  out.push("");
  out.push(r.detection_note);
  out.push("");
  if (r.incomplete.length) {
    out.push("**Not complete:**");
    out.push("");
    for (const i of r.incomplete) out.push(`- ${i}`);
    out.push("");
  }

  out.push(`## The review rule on \`${r.base}\``);
  out.push("");
  if (r.rules.review.length === 0)
    out.push(
      `- No rule readable here requires a pull request or an approval on \`${r.base}\`${r.rules.classic === "not-readable" ? " (classic branch protection was not readable)" : ""}.`,
    );
  for (const rule of r.rules.review) out.push(`- ${ruleLine(rule)}.`);
  for (const n of r.rules.notes) out.push(`- ${n}`);
  out.push("");

  const withEx = [...r.prs.filter((p) => p.exceptions.length), ...r.direct_pushes];
  out.push("## Exceptions an auditor will ask about");
  out.push("");
  if (withEx.length === 0) out.push("None in this period.");
  const codes = Object.keys(EXCEPTIONS) as ExceptionCode[];
  for (const code of codes) {
    const rows = withEx.filter((x) => x.exceptions.includes(code));
    if (!rows.length) continue;
    out.push(`### ${EXCEPTIONS[code].title} (${rows.length})`);
    out.push("");
    out.push(`To answer: ${EXCEPTIONS[code].ask}`);
    out.push("");
    for (const x of rows) {
      if ("number" in x) {
        const a = x.approvals.length
          ? x.approvals
              .map(
                (p) =>
                  `${p.login}${p.kind !== "human" ? ` (${p.agent ?? p.kind})` : ""}${p.independent ? "" : p.kind === "human" ? " (wrote it)" : ""}${p.stale ? " before the last commit" : ""}`,
              )
              .join(", ")
          : "no one";
        out.push(
          `- [#${x.number}](${x.url}) ${md(x.title)}: merged ${day(x.merged_at)} by ${who(x.merged_by) || "unknown"}${x.merged_via ? ` (via ${x.merged_via})` : ""}; written by ${x.author.login}${x.agent.role ? `, agent: ${x.agent.agents.join(", ")}` : ""}; approved by ${a}.`,
        );
      } else {
        out.push(
          `- [${x.sha.slice(0, 7)}](${x.url}) ${md(x.title)}: ${day(x.at)}, by ${x.author.login}${x.agent.role ? `, agent: ${x.agent.agents.join(", ")}` : ""}.`,
        );
      }
    }
    out.push("");
  }

  out.push("## Every merged pull request");
  out.push("");
  if (r.prs.length === 0) out.push(`No pull request was merged into \`${r.base}\` in this period.`);
  else {
    out.push(
      "| PR | Merged | Opened by | Agent | Approved by | Approval | Merged by | Rule at merge | Exceptions |",
    );
    out.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const p of r.prs)
      out.push(
        `| [#${p.number}](${p.url}) ${md(p.title)} | ${day(p.merged_at)} | ${p.author.login} | ${agentCell(p)} | ${p.approvals.map((a) => a.login).join(", ")} | ${approvalText[p.approval]} | ${who(p.merged_by)}${p.merged_via ? ` (${p.merged_via})` : ""} | ${p.rule_at_merge} | ${p.exceptions.join(", ")} |`,
      );
  }
  out.push("");
  if (r.prs.some((p) => p.agent.evidence.length)) {
    out.push("### How each agent was found");
    out.push("");
    for (const p of r.prs.filter((x) => x.agent.evidence.length))
      out.push(`- #${p.number}: ${p.agent.evidence.map(md).join("; ")}`);
    out.push("");
  }
  if (r.direct_pushes.length || r.unchecked_commits.length) {
    out.push(`## Commits on \`${r.base}\` without a merged pull request`);
    out.push("");
    for (const d of r.direct_pushes)
      out.push(
        `- [${d.sha.slice(0, 7)}](${d.url}) ${md(d.title)}: ${day(d.at)}, author ${d.author.login}${d.committer ? `, committer ${d.committer.login}` : ""}${d.agent.role ? `; agent: ${d.agent.evidence.join("; ")}` : ""}`,
      );
    for (const sha of r.unchecked_commits) out.push(`- ${sha.slice(0, 7)}: not checked`);
    out.push("");
  }

  out.push("## How this was read");
  out.push("");
  out.push(
    `- ${plural(r.requests.core + r.requests.search, "GET request")} to GitHub's REST API (${r.requests.search} search). Nothing was sent anywhere else, and nothing was written to GitHub.`,
  );
  out.push(
    "- An approval counts as independent when it comes from a person who is not the pull request's author, a commit author or a co-author named in a trailer. Merges of another branch into the pull request do not count as writing it.",
  );
  out.push(
    "- An approval is marked before the last commit when it was given before the latest commit that is not such a merge, by commit date.",
  );
  out.push(
    `- Agent signatures as read on ${r.signatures_read}; \`agent-merge-audit signatures\` lists them.`,
  );
  if (csv) out.push(`- The evidence file: \`${csv.name}\`, SHA-256 \`${csv.sha256}\`.`);
  out.push("");
  out.push(`## ${r.handoff.line.replace(/\.$/, "")}`);
  out.push("");
  out.push(`${r.handoff.detail} ${r.handoff.url}`);
  out.push("");
  out.push(`okgate's hook mode: \`${OKGATE_HOOKS}\``);
  out.push("");
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Terminal and JSON
// ---------------------------------------------------------------------------

/** What a run prints: the counts, the exceptions in a line each, the files and the hand-off. */
export function renderSummary(r: Report, files: string[]): string {
  const s = r.summary;
  const out: string[] = [];
  out.push(
    `agent-merge-audit ${r.version}: ${r.repo}, ${r.base}, ${r.period.since} to ${r.period.until} (UTC)`,
  );
  out.push("");
  out.push(
    `  ${plural(s.merged_prs, "pull request")} merged; ${s.agent_prs} written or co-written by an agent`,
  );
  out.push(
    `  ${s.agent_without_independent_approval} agent-written with no independent person's approval`,
  );
  out.push(
    `  ${s.independent_approval} of ${s.merged_prs} approved by an independent person on the final code`,
  );
  out.push(
    `  ${plural(s.direct_pushes, "commit")} on ${r.base} without a merged pull request${s.commits_unchecked ? ` (${s.commits_unchecked} unchecked)` : ""}`,
  );
  const rule = r.rules.review.length
    ? `${r.rules.requires_approvals} approval${r.rules.requires_approvals === 1 ? "" : "s"} required now`
    : "no review rule readable";
  out.push(
    `  rule: ${rule}${r.rules.at_merge === "read" ? "; each merge's evaluation read" : "; at each merge: not readable"}`,
  );
  out.push("");
  const ex = [...r.prs.filter((p) => p.exceptions.length), ...r.direct_pushes];
  if (ex.length) {
    out.push("Exceptions:");
    for (const x of ex.slice(0, 20)) {
      const id = "number" in x ? `#${x.number}` : x.sha.slice(0, 7);
      out.push(`  ${id.padEnd(8)} ${x.title.length > 64 ? `${x.title.slice(0, 63)}…` : x.title}`);
      out.push(`  ${"".padEnd(8)} ${x.exceptions.join(", ")}`);
    }
    if (ex.length > 20) out.push(`  … and ${ex.length - 20} more in the files`);
    out.push("");
  } else {
    out.push("No exceptions in this period.");
    out.push("");
  }
  for (const i of r.incomplete) out.push(`Not complete: ${i}`);
  if (r.incomplete.length) out.push("");
  if (files.length) {
    out.push("Wrote:");
    for (const f of files) out.push(`  ${f}`);
    out.push("");
  }
  out.push(r.detection_note);
  out.push(r.note);
  out.push("");
  out.push(r.handoff.line);
  out.push(`  ${r.handoff.url}`);
  out.push("");
  return out.join("\n");
}

export const renderJson = (r: Report): string => JSON.stringify(r, null, 2) + "\n";

export function renderError(p: Problem, json: boolean): string {
  if (json) return JSON.stringify({ error: p }, null, 2) + "\n";
  return `agent-merge-audit: ${p.code}: ${p.cause}\n  fix: ${p.fix}${p.retryable ? "\n  (retrying later may work)" : ""}\n`;
}
