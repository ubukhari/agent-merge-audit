/**
 * The audit: every pull request merged into one branch in a period, read from GitHub's records,
 * with who or what wrote it, who approved it, who merged it, the review rule, and the exceptions an
 * auditor asks about under SOC 2 CC8.1. Then every commit on the branch in the period that no
 * merged pull request accounts for: a direct push.
 *
 * Only GETs (src/github.ts). The classification is pure, over what GitHub returned, so the tests
 * replay recorded responses.
 */
import { CliError } from "./errors.js";
import type { GitHub } from "./github.js";
import { FLOOR_NOTE, HANDOFF_DETAIL, HANDOFF_LINE, HANDOFF_URL, NOT_ADVICE } from "./handoff.js";
import { months, type Period } from "./period.js";
import {
  agentsInCommit,
  appFromUrl,
  classifyActor,
  humanCoAuthors,
  markersIn,
  SIGNATURES_READ,
  type ActorKind,
  type Match,
} from "./signatures.js";
import { version } from "./version.js";

// ---------------------------------------------------------------------------
// What GitHub returns (only the fields read)
// ---------------------------------------------------------------------------

export interface GhUser {
  login: string;
  type?: string;
  html_url?: string;
}

export interface GhRepo {
  full_name: string;
  default_branch: string;
  private: boolean;
  visibility?: string;
  html_url: string;
}

export interface GhSearchItem {
  number: number;
  title: string;
  html_url: string;
  created_at: string;
  body?: string | null;
  user: GhUser | null;
  performed_via_github_app?: { slug?: string } | null;
  pull_request?: { merged_at?: string | null };
}

export interface GhSearch {
  total_count: number;
  incomplete_results: boolean;
  items: GhSearchItem[];
}

export interface GhTimelineEvent {
  event?: string;
  created_at?: string;
  actor?: GhUser | null;
  user?: GhUser | null;
  state?: string;
  submitted_at?: string;
  commit_id?: string | null;
}

export interface GhCommit {
  sha: string;
  html_url?: string;
  commit: {
    author: { name: string; email: string; date: string } | null;
    committer: { name: string; email: string; date: string } | null;
    message: string;
  };
  author: GhUser | null;
  committer?: GhUser | null;
  parents: { sha: string }[];
}

export interface GhBranchRule {
  type: string;
  parameters?: Record<string, unknown>;
  ruleset_source_type?: string;
  ruleset_source?: string;
  ruleset_id?: number;
}

export interface GhClassicProtection {
  required_pull_request_reviews?: {
    required_approving_review_count?: number;
    dismiss_stale_reviews?: boolean;
    require_code_owner_reviews?: boolean;
    require_last_push_approval?: boolean;
  };
  enforce_admins?: { enabled?: boolean };
}

export interface GhRuleSuite {
  after_sha: string;
  result: string;
  pushed_at?: string;
}

export interface GhCommitPull {
  number: number;
  merged_at: string | null;
  base: { ref: string };
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export interface Person {
  login: string;
  kind: ActorKind;
  /** the agent's name, when kind is agent */
  agent?: string;
}

export interface AgentInvolvement {
  /** author: an agent opened it or authored its commits; co-author: trailers or markers only */
  role: "author" | "co-author" | null;
  agents: string[];
  /** what was seen; agent identities only, never a person's address */
  evidence: string[];
}

export interface ApprovalRow extends Person {
  at: string;
  /** a person who is not the PR's author, a commit author or a co-author */
  independent: boolean;
  /** given before the last commit that is not a merge of another branch */
  stale: boolean;
}

export type ApprovalClass = "independent" | "stale" | "self" | "bot" | "none";

export type RuleAtMerge =
  "pass" | "bypass" | "fail" | "none-recorded" | "older-than-a-month" | "not-readable";

export const EXCEPTIONS = {
  "agent-no-human-approval": {
    title: "An agent wrote it, and no independent person approved it",
    ask: "Who reviewed this agent's change before it merged, and where is that recorded?",
  },
  "no-approval": {
    title: "Merged with no approval",
    ask: "Why did this merge without review? If it was an emergency change, where is the review after it?",
  },
  "self-approval-only": {
    title: "Approved only by its own author or co-author",
    ask: "Who other than the people who wrote it reviewed it?",
  },
  "bot-approval-only": {
    title: "Approved only by a bot or an AI reviewer",
    ask: "Is an automated approval part of your documented review control, and who designed it?",
  },
  "stale-approval": {
    title: "Approved before its last commit",
    ask: "Who reviewed the commits added after the approval?",
  },
  "merged-by-bot": {
    title: "Merged by a bot or agent account",
    ask: "Which person authorised this merge?",
  },
  "rule-bypassed": {
    title: "The branch rule was bypassed",
    ask: "Who bypassed the rule, and why?",
  },
  "unapproved-while-rule-requires": {
    title: "No approval, though the branch rule now requires one",
    ask: "Was the rule added after this merge, or was it bypassed or exempted?",
  },
  "direct-push": {
    title: "On the branch without a merged pull request",
    ask: "Why did this change reach the branch without a reviewed pull request?",
  },
} as const;

export type ExceptionCode = keyof typeof EXCEPTIONS;

export interface PrRow {
  number: number;
  title: string;
  url: string;
  created_at: string;
  merged_at: string;
  author: Person;
  merged_by: Person | null;
  /** when a person queued it or turned on auto-merge and a bot pressed the button */
  merged_via?: "merge queue" | "auto-merge";
  merge_commit: string | null;
  agent: AgentInvolvement;
  commits: number;
  last_commit_at: string | null;
  approvals: ApprovalRow[];
  approval: ApprovalClass;
  rule_at_merge: RuleAtMerge;
  exceptions: ExceptionCode[];
}

export interface PushRow {
  sha: string;
  url: string;
  title: string;
  at: string;
  author: Person;
  committer: Person | null;
  agent: AgentInvolvement;
  exceptions: ExceptionCode[];
}

export interface ReviewRule {
  /** where the rule comes from */
  source: string;
  approvals: number;
  last_push_approval: boolean | null;
  dismiss_stale: boolean | null;
  code_owners: boolean | null;
}

export interface Rules {
  /** rules that require a pull request, as read now */
  review: ReviewRule[];
  /** the most approvals any of them requires; 0 when no rule requires a pull request */
  requires_approvals: number;
  /** a ruleset turns on Copilot code review on this branch */
  copilot_review: boolean;
  classic: "read" | "none" | "not-readable";
  /** each merge's rule evaluation, which GitHub keeps for a month */
  at_merge: "read" | "not-readable";
  notes: string[];
}

export interface Summary {
  merged_prs: number;
  agent_prs: number;
  by_agent: Record<string, number>;
  agent_without_independent_approval: number;
  independent_approval: number;
  prs_with_exceptions: number;
  exceptions: Partial<Record<ExceptionCode, number>>;
  commits_on_base: number;
  direct_pushes: number;
  commits_unchecked: number;
}

export interface Report {
  tool: "agent-merge-audit";
  version: string;
  generated_at: string;
  repo: string;
  repo_url: string;
  visibility: "public" | "private";
  base: string;
  period: Period;
  auth: "token" | "anonymous";
  note: string;
  detection_note: string;
  signatures_read: string;
  summary: Summary;
  rules: Rules;
  prs: PrRow[];
  direct_pushes: PushRow[];
  unchecked_commits: string[];
  /** anything that makes the report less than whole, said plainly */
  incomplete: string[];
  requests: { core: number; search: number };
  handoff: { line: string; detail: string; url: string };
}

// ---------------------------------------------------------------------------
// Classification (pure)
// ---------------------------------------------------------------------------

const lower = (s: string) => s.toLowerCase();

function person(u: GhUser | null | undefined, app?: string | null): Person | null {
  if (!u?.login) return null;
  const c = classifyActor({ login: u.login, type: u.type, app: app ?? appFromUrl(u.html_url) });
  return c.agent
    ? { login: u.login, kind: c.kind, agent: c.agent.name }
    : { login: u.login, kind: c.kind };
}

const isMergeCommit = (c: GhCommit) => c.parents.length > 1;

/** Agent signs on a PR: its author, its commits' identities and trailers, and its body. */
export function involvement(
  author: Person,
  authorApp: string | null,
  body: string,
  commits: GhCommit[],
): AgentInvolvement {
  const own = commits.filter((c) => !isMergeCommit(c));
  const evidence: string[] = [];
  const agents = new Set<string>();
  let authored = false;
  let mentioned = false;
  if (author.kind === "agent") {
    authored = true;
    agents.add(author.agent!);
    evidence.push(`opened by ${author.login}${authorApp ? ` (app ${authorApp})` : ""}`);
  }
  const counts = new Map<string, { m: Match; n: number }>();
  for (const c of own) {
    const seen = new Set<string>();
    for (const m of agentsInCommit({
      authorName: c.commit.author?.name ?? "",
      authorEmail: c.commit.author?.email ?? "",
      authorLogin: c.author?.login ?? null,
      authorType: c.author?.type,
      authorApp: appFromUrl(c.author?.html_url),
      message: c.commit.message,
    })) {
      if (seen.has(m.how)) continue;
      seen.add(m.how);
      const e = counts.get(m.how) ?? { m, n: 0 };
      e.n++;
      counts.set(m.how, e);
      agents.add(m.agent.name);
      if (m.how.startsWith("commit author")) authored = true;
      else mentioned = true;
    }
  }
  for (const { m, n } of counts.values())
    evidence.push(`${m.how} (${n} of ${own.length} commit${own.length === 1 ? "" : "s"})`);
  for (const m of markersIn(body, "PR body")) {
    agents.add(m.agent.name);
    mentioned = true;
    evidence.push(m.how);
  }
  // "GitHub Copilot" says less than "GitHub Copilot coding agent" on the same PR
  for (const a of [...agents])
    if ([...agents].some((b) => b !== a && b.startsWith(`${a} `))) agents.delete(a);
  return {
    role: authored ? "author" : mentioned ? "co-author" : null,
    agents: [...agents].sort(),
    evidence,
  };
}

/** The people who wrote a PR: its author, its commits' authors and its human co-authors. */
export function writers(author: Person, commits: GhCommit[]): Set<string> {
  const out = new Set<string>();
  if (author.kind === "human") out.add(lower(author.login));
  for (const c of commits) {
    if (isMergeCommit(c)) continue;
    if (c.author?.login) out.add(lower(c.author.login));
    for (const co of humanCoAuthors(c.commit.message)) if (co.login) out.add(co.login);
  }
  return out;
}

/** Each reviewer's last decision before the merge, kept when it is an approval. */
export function approvalsOf(
  timeline: GhTimelineEvent[],
  mergedAt: string,
  self: Set<string>,
  lastCommitAt: string | null,
): ApprovalRow[] {
  const latest = new Map<string, { e: GhTimelineEvent; p: Person }>();
  const reviews = timeline
    .filter((e) => e.event === "reviewed" && e.user?.login && e.submitted_at)
    .sort((a, b) => a.submitted_at!.localeCompare(b.submitted_at!));
  for (const e of reviews) {
    if (e.submitted_at! > mergedAt) continue;
    const state = lower(e.state ?? "");
    if (!["approved", "changes_requested", "dismissed"].includes(state)) continue;
    const p = person(e.user)!;
    latest.set(lower(p.login), { e, p });
  }
  const out: ApprovalRow[] = [];
  for (const { e, p } of latest.values()) {
    if (lower(e.state ?? "") !== "approved") continue;
    out.push({
      ...p,
      at: e.submitted_at!,
      independent: p.kind === "human" && !self.has(lower(p.login)),
      stale: lastCommitAt !== null && e.submitted_at! < lastCommitAt,
    });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export function approvalClass(approvals: ApprovalRow[]): ApprovalClass {
  const independent = approvals.filter((a) => a.independent);
  if (independent.some((a) => !a.stale)) return "independent";
  if (independent.length) return "stale";
  if (approvals.some((a) => a.kind === "human")) return "self";
  if (approvals.length) return "bot";
  return "none";
}

/** Who pressed merge: a bot that merged for a person who queued it counts as that person. */
export function mergedBy(timeline: GhTimelineEvent[]): {
  by: Person | null;
  via?: "merge queue" | "auto-merge";
  commit: string | null;
  at: string | null;
} {
  const merged = timeline.find((e) => e.event === "merged");
  const by = person(merged?.actor);
  const commit = merged?.commit_id ?? null;
  const at = merged?.created_at ?? null;
  if (by && by.kind !== "human") {
    const queued = timeline
      .filter(
        (e) =>
          (e.event === "added_to_merge_queue" ||
            e.event === "auto_merge_enabled" ||
            e.event === "auto_squash_enabled" ||
            e.event === "auto_rebase_enabled") &&
          (!at || (e.created_at ?? "") <= at),
      )
      .map((e) => ({ e, p: person(e.actor) }))
      .filter((x) => x.p?.kind === "human")
      .pop();
    if (queued)
      return {
        by: queued.p,
        via: queued.e.event === "added_to_merge_queue" ? "merge queue" : "auto-merge",
        commit,
        at,
      };
  }
  return { by, commit, at };
}

export function exceptionsOf(
  row: Pick<PrRow, "agent" | "approval" | "merged_by" | "rule_at_merge">,
  rules: Pick<Rules, "requires_approvals">,
): ExceptionCode[] {
  const out: ExceptionCode[] = [];
  if (row.agent.role !== null && row.approval !== "independent")
    out.push("agent-no-human-approval");
  if (row.approval === "none") out.push("no-approval");
  if (row.approval === "self") out.push("self-approval-only");
  if (row.approval === "bot") out.push("bot-approval-only");
  if (row.approval === "stale") out.push("stale-approval");
  if (row.merged_by && row.merged_by.kind !== "human") out.push("merged-by-bot");
  if (row.rule_at_merge === "bypass") out.push("rule-bypassed");
  if (row.approval === "none" && rules.requires_approvals > 0 && row.rule_at_merge !== "bypass")
    out.push("unapproved-while-rule-requires");
  return out;
}

/** The pull-request rules on the branch, from its rulesets and, when readable, classic protection. */
export function readRules(
  branchRules: GhBranchRule[] | null,
  classic: { status: number; body: GhClassicProtection | null },
  suites: "read" | "not-readable",
  anonymous: boolean,
): Rules {
  const review: ReviewRule[] = [];
  const notes: string[] = [];
  const bool = (v: unknown) => (typeof v === "boolean" ? v : null);
  for (const r of branchRules ?? []) {
    if (r.type !== "pull_request") continue;
    const p = r.parameters ?? {};
    review.push({
      source: `ruleset ${r.ruleset_id ?? "?"}${r.ruleset_source ? ` (${r.ruleset_source_type === "Organization" ? "organization" : "repository"} ${r.ruleset_source})` : ""}`,
      approvals:
        typeof p.required_approving_review_count === "number"
          ? p.required_approving_review_count
          : 0,
      last_push_approval: bool(p.require_last_push_approval),
      dismiss_stale: bool(p.dismiss_stale_reviews_on_push),
      code_owners: bool(p.require_code_owner_review),
    });
  }
  const copilot = (branchRules ?? []).some((r) => r.type === "copilot_code_review");
  let classicState: Rules["classic"] = "none";
  if (classic.status === 200 && classic.body) {
    classicState = "read";
    const pr = classic.body.required_pull_request_reviews;
    if (pr)
      review.push({
        source: `classic branch protection${classic.body.enforce_admins?.enabled ? " (admins included)" : " (admins not included)"}`,
        approvals: pr.required_approving_review_count ?? 0,
        last_push_approval: pr.require_last_push_approval ?? null,
        dismiss_stale: pr.dismiss_stale_reviews ?? null,
        code_owners: pr.require_code_owner_reviews ?? null,
      });
  } else if (classic.status === 401 || classic.status === 403 || anonymous) {
    classicState = "not-readable";
    notes.push(
      "Classic branch protection is readable only with a token from an admin of the repo; rulesets are read without one.",
    );
  }
  if (copilot)
    notes.push(
      "A ruleset turns on Copilot code review here. Since 1 Sep 2026 an admin can let Copilot's approval count toward required approvals, so a required approval is not always a person's.",
    );
  notes.push(
    suites === "read"
      ? "Each merge's rule evaluation was read from GitHub's rule insights, which keep one month."
      : "Each merge's rule evaluation (pass, bypass) is kept by GitHub for one month and needs a token with admin read on the repo; it was not read, so the rules above are as they are now, not as they were at each merge.",
  );
  return {
    review,
    requires_approvals: Math.max(0, ...review.map((r) => r.approvals)),
    copilot_review: copilot,
    classic: classicState,
    at_merge: suites,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Reading GitHub
// ---------------------------------------------------------------------------

const enc = encodeURIComponent;

async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

export interface AuditInput {
  repo: string;
  period: Period;
  base?: string;
  gh: GitHub;
  now: Date;
  /** parallel requests; default 4 */
  concurrency?: number;
}

const MAX_SEARCH_PAGES = 10;

export async function runAudit(input: AuditInput): Promise<Report> {
  const { gh, period } = input;
  const anonymous = !gh.token;
  const incomplete: string[] = [];

  const repoRes = await gh.get<GhRepo>(`/repos/${input.repo}`);
  if (!repoRes.body)
    throw new CliError({
      code: "REPO_NOT_FOUND",
      cause: `GitHub has no repository ${input.repo} that ${anonymous ? "can be read without a token" : "this token can read"}`,
      fix: anonymous
        ? "check the spelling; a private repo needs your token (`gh auth login`, or GITHUB_TOKEN)"
        : "check the owner/repo spelling, and that the token can read this repo",
      retryable: false,
    });
  const repo = repoRes.body;
  const name = repo.full_name;
  const base = input.base ?? repo.default_branch;

  // 1. the merged PRs, a calendar month a query (search returns at most 1,000)
  const items: GhSearchItem[] = [];
  for (const m of months(period)) {
    const q = `repo:${name} is:pr is:merged base:${base} merged:${m.since}..${m.until}`;
    let path: string | null = `/search/issues?q=${enc(q)}&per_page=100`;
    let pages = 0;
    while (path && pages < MAX_SEARCH_PAGES) {
      const got: { body: GhSearch | null; next: string | null } = await gh.get<GhSearch>(path);
      if (!got.body) break;
      if (got.body.total_count > 1000)
        throw new CliError({
          code: "PERIOD_TOO_LARGE",
          cause: `${got.body.total_count} PRs merged into ${base} in ${m.since.slice(0, 7)}; GitHub's search returns at most 1,000 a query`,
          fix: "give a shorter period with --since and --until, within one half of that month",
          retryable: false,
        });
      if (got.body.incomplete_results && !incomplete.some((s) => s.startsWith("GitHub's search")))
        incomplete.push(
          "GitHub's search said its results were incomplete (it timed out); run it again to check the count.",
        );
      items.push(...got.body.items);
      path = got.next;
      pages++;
    }
  }
  const merged = [...new Map(items.map((i) => [i.number, i])).values()].sort((a, b) =>
    (a.pull_request?.merged_at ?? "").localeCompare(b.pull_request?.merged_at ?? ""),
  );

  // 2. the rules, now; and each merge's evaluation, where GitHub still keeps it
  const branchRules = await gh.get<GhBranchRule[]>(`/repos/${name}/rules/branches/${enc(base)}`, {
    soft: true,
  });
  const classic = anonymous
    ? { status: 0, body: null }
    : await gh.get<GhClassicProtection>(`/repos/${name}/branches/${enc(base)}/protection`, {
        soft: true,
      });
  const suiteBySha = new Map<string, string>();
  let suites: "read" | "not-readable" = "not-readable";
  if (!anonymous) {
    const s = await gh.all<GhRuleSuite>(
      `/repos/${name}/rulesets/rule-suites?ref=${enc(`refs/heads/${base}`)}&time_period=month&per_page=100`,
      10,
      { soft: true },
    );
    if (s.status === 200) {
      suites = "read";
      for (const x of s.items) if (x.after_sha) suiteBySha.set(x.after_sha, x.result);
      if (s.truncated)
        incomplete.push(
          "More than 1,000 rule evaluations in the last month; the oldest were not read.",
        );
    }
  }
  const rules = readRules(
    branchRules.status === 200 ? branchRules.body : null,
    classic,
    suites,
    anonymous,
  );

  // 3. the budget: two requests a PR, then the branch's commits
  const need = merged.length * 2 + 2;
  if (gh.remaining.core !== null && gh.remaining.core < need)
    throw new CliError({
      code: "RATE_LIMITED",
      cause: `this period needs about ${need} requests to GitHub's API for ${merged.length} merged PRs, and ${gh.remaining.core} are left this hour${anonymous ? " (60 an hour without a token)" : ""}`,
      fix: anonymous
        ? "sign in with `gh auth login`, or set GITHUB_TOKEN, for 5,000 an hour; or shorten the period"
        : "shorten the period, or wait for the hourly reset",
      retryable: true,
    });

  const monthAgo = new Date(input.now.getTime() - 30 * 86_400_000).toISOString();
  const prCommitShas = new Set<string>();
  const prCommitKeys = new Set<string>();
  const key = (c: GhCommit) =>
    `${lower(c.commit.author?.email ?? "")}|${c.commit.author?.date ?? ""}|${c.commit.message.split("\n")[0]}`;

  const prs = await mapLimit(merged, input.concurrency ?? 4, async (item): Promise<PrRow> => {
    const tl = await gh.all<GhTimelineEvent>(
      `/repos/${name}/issues/${item.number}/timeline?per_page=100`,
      5,
    );
    const cm = await gh.all<GhCommit>(
      `/repos/${name}/pulls/${item.number}/commits?per_page=100`,
      3,
    );
    if (tl.truncated || cm.truncated)
      incomplete.push(
        `#${item.number}: more than ${tl.truncated ? "500 timeline events" : "300 commits"}; the rest were not read.`,
      );
    for (const c of cm.items) {
      prCommitShas.add(c.sha);
      prCommitKeys.add(key(c));
    }
    const app = item.performed_via_github_app?.slug ?? appFromUrl(item.user?.html_url) ?? null;
    const author = person(item.user, app) ?? { login: "(deleted account)", kind: "human" as const };
    const m = mergedBy(tl.items);
    const mergedAt = item.pull_request?.merged_at ?? m.at ?? "";
    const own = cm.items.filter((c) => !isMergeCommit(c));
    const lastCommitAt =
      own
        .map((c) => c.commit.committer?.date ?? c.commit.author?.date ?? "")
        .filter(Boolean)
        .sort()
        .pop() ?? null;
    const self = writers(author, cm.items);
    const approvals = approvalsOf(tl.items, mergedAt, self, lastCommitAt);
    const approval = approvalClass(approvals);
    let ruleAt: RuleAtMerge = "not-readable";
    if (suites === "read") {
      const r = m.commit ? suiteBySha.get(m.commit) : undefined;
      ruleAt =
        r === "pass" || r === "bypass" || r === "fail"
          ? r
          : mergedAt < monthAgo
            ? "older-than-a-month"
            : "none-recorded";
    }
    const agent = involvement(
      author,
      author.kind === "agent" ? app : null,
      item.body ?? "",
      cm.items,
    );
    const row: Omit<PrRow, "exceptions"> = {
      number: item.number,
      title: item.title,
      url: item.html_url,
      created_at: item.created_at,
      merged_at: mergedAt,
      author,
      merged_by: m.by,
      ...(m.via ? { merged_via: m.via } : {}),
      merge_commit: m.commit,
      agent,
      commits: own.length,
      last_commit_at: lastCommitAt,
      approvals,
      approval,
      rule_at_merge: ruleAt,
    };
    return { ...row, exceptions: exceptionsOf(row, rules) };
  });

  // 4. commits on the branch in the period that no merged PR accounts for
  const onBase = await gh.all<GhCommit>(
    `/repos/${name}/commits?sha=${enc(base)}&since=${period.since}T00:00:00Z&until=${period.until}T23:59:59Z&per_page=100`,
    10,
  );
  if (onBase.truncated)
    incomplete.push(
      "More than 1,000 commits on the branch in the period; the rest were not checked for direct pushes.",
    );
  const mergeShas = new Set(prs.map((p) => p.merge_commit).filter((s): s is string => !!s));
  const numbers = new Set(prs.map((p) => p.number));
  const unmatched = onBase.items.filter((c) => {
    if (mergeShas.has(c.sha) || prCommitShas.has(c.sha) || prCommitKeys.has(key(c))) return false;
    const first = c.commit.message.split("\n")[0] ?? "";
    const n = /\(#(\d+)\)\s*$/.exec(first)?.[1] ?? /^Merge pull request #(\d+)/.exec(first)?.[1];
    return !(n && numbers.has(Number(n)));
  });
  const budget =
    gh.remaining.core === null ? 300 : Math.max(0, Math.min(300, gh.remaining.core - 1));
  const toLook = unmatched.slice(0, budget);
  const unchecked = unmatched.slice(budget).map((c) => c.sha);
  if (unchecked.length)
    incomplete.push(
      `${unchecked.length} commit${unchecked.length === 1 ? "" : "s"} on the branch could not be matched to a pull request within the request budget; they are listed, unchecked.`,
    );
  const looked = await mapLimit(toLook, input.concurrency ?? 4, async (c) => {
    const pulls = await gh.get<GhCommitPull[]>(`/repos/${name}/commits/${c.sha}/pulls`);
    const fromPr = (pulls.body ?? []).some((p) => p.merged_at && p.base.ref === base);
    return { c, fromPr };
  });
  const pushes: PushRow[] = looked
    .filter((x) => !x.fromPr)
    .map(({ c }) => {
      const author = person(c.author) ?? {
        login: c.commit.author?.name ?? "(unknown)",
        kind: "human" as const,
      };
      const committer = c.committer?.login === "web-flow" ? null : person(c.committer);
      const agent = involvement(
        author.kind === "agent" ? author : { ...author, kind: "human" },
        null,
        "",
        [c],
      );
      const exceptions: ExceptionCode[] = ["direct-push"];
      if (agent.role !== null) exceptions.unshift("agent-no-human-approval");
      return {
        sha: c.sha,
        url: c.html_url ?? `${repo.html_url}/commit/${c.sha}`,
        title: c.commit.message.split("\n")[0] ?? "",
        at: c.commit.committer?.date ?? c.commit.author?.date ?? "",
        author,
        committer,
        agent,
        exceptions,
      };
    })
    .sort((a, b) => a.at.localeCompare(b.at));

  return {
    tool: "agent-merge-audit",
    version: version(),
    generated_at: input.now.toISOString(),
    repo: name,
    repo_url: repo.html_url,
    visibility: repo.private || repo.visibility === "internal" ? "private" : "public",
    base,
    period,
    auth: anonymous ? "anonymous" : "token",
    note: NOT_ADVICE,
    detection_note: FLOOR_NOTE,
    signatures_read: SIGNATURES_READ,
    summary: summarise(prs, pushes, onBase.items.length, unchecked.length),
    rules,
    prs,
    direct_pushes: pushes,
    unchecked_commits: unchecked,
    incomplete,
    requests: { core: gh.made.core, search: gh.made.search },
    handoff: { line: HANDOFF_LINE, detail: HANDOFF_DETAIL, url: HANDOFF_URL },
  };
}

export function summarise(
  prs: PrRow[],
  pushes: PushRow[],
  commitsOnBase: number,
  unchecked: number,
): Summary {
  const byAgent: Record<string, number> = {};
  const exceptions: Partial<Record<ExceptionCode, number>> = {};
  for (const p of prs) for (const a of p.agent.agents) byAgent[a] = (byAgent[a] ?? 0) + 1;
  for (const r of [...prs, ...pushes])
    for (const e of r.exceptions) exceptions[e] = (exceptions[e] ?? 0) + 1;
  return {
    merged_prs: prs.length,
    agent_prs: prs.filter((p) => p.agent.role !== null).length,
    by_agent: byAgent,
    agent_without_independent_approval: prs.filter((p) =>
      p.exceptions.includes("agent-no-human-approval"),
    ).length,
    independent_approval: prs.filter((p) => p.approval === "independent").length,
    prs_with_exceptions: prs.filter((p) => p.exceptions.length > 0).length,
    exceptions,
    commits_on_base: commitsOnBase,
    direct_pushes: pushes.length,
    commits_unchecked: unchecked,
  };
}
