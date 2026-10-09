/** Every error and warning carries what went wrong, why, how to fix it, and whether a retry helps. */
interface Problem {
    code: string;
    cause: string;
    fix: string;
    retryable: boolean;
}
declare class CliError extends Error implements Problem {
    readonly code: string;
    readonly cause: string;
    readonly fix: string;
    readonly retryable: boolean;
    /** 2 for a usage mistake, 1 for anything else */
    readonly exitCode: number;
    constructor(p: Problem, exitCode?: number);
    toJSON(): Problem;
}

type FetchLike = (url: string, init?: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
}) => Promise<Response>;
/** `owner/repo`, from an argument or a github.com URL. */
declare function parseRepo(text: string): string | null;
/** Run a command and return its trimmed stdout, or null if it is missing, fails or takes too long. */
type Exec = (cmd: string, args: string[], cwd: string) => Promise<string | null>;
/**
 * The user's own token, without printing it: `GITHUB_TOKEN`, then `GH_TOKEN`, then `gh auth
 * token` (the GitHub CLI's stored login). Null when there is none, which reads public repos only.
 */
declare function findToken(env: Record<string, string | undefined>, cwd: string, exec?: Exec): Promise<string | null>;
interface Got<T> {
    status: number;
    body: T | null;
    /** the `Link` header's next page, as a path */
    next: string | null;
}
interface GitHubOptions {
    token: string | null;
    fetch?: FetchLike;
    apiUrl?: string;
}
/** A read-only GitHub REST client that counts its requests and knows its remaining budget. */
declare class GitHub {
    readonly base: string;
    readonly token: string | null;
    private readonly fetchImpl;
    /** requests made, by bucket */
    readonly made: {
        core: number;
        search: number;
    };
    /** what GitHub said was left, by bucket; null until a response says */
    readonly remaining: {
        core: number | null;
        search: number | null;
    };
    constructor(opts: GitHubOptions);
    get requests(): number;
    /**
     * GET a path. 404 and, when `soft`, 401/403 come back as a status with no body, for the
     * endpoints that only some tokens may read; every other failure is a CliError.
     */
    get<T>(path: string, opts?: {
        soft?: boolean;
    }): Promise<Got<T>>;
    /** Every page of a list endpoint, up to `maxPages`; `truncated` when there were more. */
    all<T>(path: string, maxPages: number, opts?: {
        soft?: boolean;
    }): Promise<{
        status: number;
        items: T[];
        truncated: boolean;
    }>;
    rateLimited(at: string | null, bucket?: "core" | "search"): CliError;
}

interface Period {
    since: string;
    until: string;
}
/** `2026-09` (a month) or `2026-Q3` (a quarter), as a period. */
declare function namedPeriod(raw: string): Period;
/**
 * The period from the flags: `--period`, or `--since`/`--until`, or by default the 30 days to
 * today. `until` may not be after today, and the period may not run backwards.
 */
declare function resolvePeriod(flags: {
    since?: string;
    until?: string;
    period?: string;
}, now: Date): Period;
/** The period cut into calendar months, because GitHub's search returns at most 1,000 results. */
declare function months(p: Period): Period[];

/**
 * How an agent shows up in GitHub's records, and how each sign is matched.
 *
 * Every signature below was seen in GitHub's own records on 9 Oct 2026: a merged pull request
 * opened by the account, or commits carrying the identity or trailer, counted with GitHub's search
 * API (keyword matches, so signals, not unique uses). Where a vendor documents it, the source says
 * so. Nothing here guesses from code style: an agent that leaves no sign is not found, and every
 * report says the count is a floor.
 */
type ActorKind = "human" | "agent" | "automation";
interface Signature {
    id: string;
    name: string;
    /** GitHub logins it acts as, lower case */
    logins?: readonly string[];
    /** GitHub App slugs, from a user's html_url (github.com/apps/<slug>) or performed_via_github_app */
    apps?: readonly string[];
    /** commit author or co-author emails, exact, lower case */
    emails?: readonly string[];
    /** email endings, lower case, for GitHub noreply addresses such as 123+name[bot]@users.noreply… */
    emailSuffixes?: readonly string[];
    /** a co-author trailer's name, as a case-insensitive regular expression, when its email is generic */
    names?: readonly string[];
    /** trailer keys only this agent writes, lower case */
    trailers?: readonly string[];
    /** text only this agent writes into a PR body or commit message */
    markers?: readonly string[];
    /** where the sign was seen, and how often */
    seen: string;
}
/** Agents that write code, and AI reviewers whose approval is not a person's. */
declare const AGENTS: readonly Signature[];
interface ActorInput {
    login: string;
    /** GitHub's user type: "User", "Bot" or "Organization" */
    type?: string;
    /** the GitHub App behind the account, when known */
    app?: string | null;
}
interface Classified {
    kind: ActorKind;
    agent?: Signature;
}
/** Whether an account is a person, an agent (and which), or other automation. */
declare function classifyActor(a: ActorInput): Classified;
/** The GitHub login in a noreply address (123+octocat@users.noreply.github.com), or null. */
declare function loginFromEmail(email: string): string | null;
interface Trailer {
    key: string;
    value: string;
    name: string;
    email: string;
}
/** Every `Key: value` trailer line of a commit message, with `Name <email>` split out. */
declare function parseTrailers(message: string): Trailer[];
interface Match {
    agent: Signature;
    /** what was seen, safe to print: agent identities only, never a person's address */
    how: string;
}
/** Agent signs in a commit: its author identity, its trailers and its markers. */
declare function agentsInCommit(c: {
    authorName: string;
    authorEmail: string;
    authorLogin?: string | null;
    authorType?: string;
    /** the GitHub App behind the author account, when known */
    authorApp?: string | null;
    message: string;
}): Match[];
/** Human co-authors named in a message's trailers: their login when the address is a noreply. */
declare function humanCoAuthors(message: string): {
    name: string;
    login: string | null;
}[];

interface GhUser {
    login: string;
    type?: string;
    html_url?: string;
}
interface GhTimelineEvent {
    event?: string;
    created_at?: string;
    actor?: GhUser | null;
    user?: GhUser | null;
    state?: string;
    submitted_at?: string;
    commit_id?: string | null;
}
interface GhCommit {
    sha: string;
    html_url?: string;
    commit: {
        author: {
            name: string;
            email: string;
            date: string;
        } | null;
        committer: {
            name: string;
            email: string;
            date: string;
        } | null;
        message: string;
    };
    author: GhUser | null;
    committer?: GhUser | null;
    parents: {
        sha: string;
    }[];
}
interface GhBranchRule {
    type: string;
    parameters?: Record<string, unknown>;
    ruleset_source_type?: string;
    ruleset_source?: string;
    ruleset_id?: number;
}
interface GhClassicProtection {
    required_pull_request_reviews?: {
        required_approving_review_count?: number;
        dismiss_stale_reviews?: boolean;
        require_code_owner_reviews?: boolean;
        require_last_push_approval?: boolean;
    };
    enforce_admins?: {
        enabled?: boolean;
    };
}
interface Person {
    login: string;
    kind: ActorKind;
    /** the agent's name, when kind is agent */
    agent?: string;
}
interface AgentInvolvement {
    /** author: an agent opened it or authored its commits; co-author: trailers or markers only */
    role: "author" | "co-author" | null;
    agents: string[];
    /** what was seen; agent identities only, never a person's address */
    evidence: string[];
}
interface ApprovalRow extends Person {
    at: string;
    /** a person who is not the PR's author, a commit author or a co-author */
    independent: boolean;
    /** given before the last commit that is not a merge of another branch */
    stale: boolean;
}
type ApprovalClass = "independent" | "stale" | "self" | "bot" | "none";
type RuleAtMerge = "pass" | "bypass" | "fail" | "none-recorded" | "older-than-a-month" | "not-readable";
declare const EXCEPTIONS: {
    readonly "agent-no-human-approval": {
        readonly title: "An agent wrote it, and no independent person approved it";
        readonly ask: "Who reviewed this agent's change before it merged, and where is that recorded?";
    };
    readonly "no-approval": {
        readonly title: "Merged with no approval";
        readonly ask: "Why did this merge without review? If it was an emergency change, where is the review after it?";
    };
    readonly "self-approval-only": {
        readonly title: "Approved only by its own author or co-author";
        readonly ask: "Who other than the people who wrote it reviewed it?";
    };
    readonly "bot-approval-only": {
        readonly title: "Approved only by a bot or an AI reviewer";
        readonly ask: "Is an automated approval part of your documented review control, and who designed it?";
    };
    readonly "stale-approval": {
        readonly title: "Approved before its last commit";
        readonly ask: "Who reviewed the commits added after the approval?";
    };
    readonly "merged-by-bot": {
        readonly title: "Merged by a bot or agent account";
        readonly ask: "Which person authorised this merge?";
    };
    readonly "rule-bypassed": {
        readonly title: "The branch rule was bypassed";
        readonly ask: "Who bypassed the rule, and why?";
    };
    readonly "unapproved-while-rule-requires": {
        readonly title: "No approval, though the branch rule now requires one";
        readonly ask: "Was the rule added after this merge, or was it bypassed or exempted?";
    };
    readonly "direct-push": {
        readonly title: "On the branch without a merged pull request";
        readonly ask: "Why did this change reach the branch without a reviewed pull request?";
    };
};
type ExceptionCode = keyof typeof EXCEPTIONS;
interface PrRow {
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
interface PushRow {
    sha: string;
    url: string;
    title: string;
    at: string;
    author: Person;
    committer: Person | null;
    agent: AgentInvolvement;
    exceptions: ExceptionCode[];
}
interface ReviewRule {
    /** where the rule comes from */
    source: string;
    approvals: number;
    last_push_approval: boolean | null;
    dismiss_stale: boolean | null;
    code_owners: boolean | null;
}
interface Rules {
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
interface Summary {
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
interface Report {
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
    requests: {
        core: number;
        search: number;
    };
    handoff: {
        line: string;
        detail: string;
        url: string;
    };
}
/** Agent signs on a PR: its author, its commits' identities and trailers, and its body. */
declare function involvement(author: Person, authorApp: string | null, body: string, commits: GhCommit[]): AgentInvolvement;
/** The people who wrote a PR: its author, its commits' authors and its human co-authors. */
declare function writers(author: Person, commits: GhCommit[]): Set<string>;
/** Each reviewer's last decision before the merge, kept when it is an approval. */
declare function approvalsOf(timeline: GhTimelineEvent[], mergedAt: string, self: Set<string>, lastCommitAt: string | null): ApprovalRow[];
declare function approvalClass(approvals: ApprovalRow[]): ApprovalClass;
/** Who pressed merge: a bot that merged for a person who queued it counts as that person. */
declare function mergedBy(timeline: GhTimelineEvent[]): {
    by: Person | null;
    via?: "merge queue" | "auto-merge";
    commit: string | null;
    at: string | null;
};
declare function exceptionsOf(row: Pick<PrRow, "agent" | "approval" | "merged_by" | "rule_at_merge">, rules: Pick<Rules, "requires_approvals">): ExceptionCode[];
/** The pull-request rules on the branch, from its rulesets and, when readable, classic protection. */
declare function readRules(branchRules: GhBranchRule[] | null, classic: {
    status: number;
    body: GhClassicProtection | null;
}, suites: "read" | "not-readable", anonymous: boolean): Rules;
interface AuditInput {
    repo: string;
    period: Period;
    base?: string;
    gh: GitHub;
    now: Date;
    /** parallel requests; default 4 */
    concurrency?: number;
}
declare function runAudit(input: AuditInput): Promise<Report>;
declare function summarise(prs: PrRow[], pushes: PushRow[], commitsOnBase: number, unchecked: number): Summary;

/**
 * Recorded GitHub responses, replayed as `fetch`: the demo runs on a synthetic recording bundled
 * here, and the tests on one anonymous run against a public repo (scripts/record.mjs). A request
 * that was not recorded fails loudly, so a test never reaches the network.
 */

interface RecordedResponse {
    /** path and query under the API base, e.g. /repos/o/r/rules/branches/main */
    path: string;
    status: number;
    headers?: Record<string, string>;
    body: unknown;
}
interface Recording {
    recorded_at: string;
    note: string;
    responses: RecordedResponse[];
}
/** The same request whichever way its query was encoded. */
declare function normalisePath(path: string): string;
declare function replayFetch(rec: Recording, base?: string): FetchLike;

/**
 * A synthetic repository, octo-org/demo-app, as GitHub's API would return it for September 2026:
 * written for `agent-merge-audit demo` and the README sample, so they run with no network and name
 * no real person. Each pull request shows one case an auditor asks about.
 *
 *   #101  a person's change, approved by another person: clean
 *   #102  Copilot's coding agent, approved and merged only by the person who asked for it
 *   #103  Claude Code co-wrote it; only Copilot code review approved
 *   #104  Cursor's agent wrote it; the approval came before its last commit
 *   #105  Dependabot, merged by the merge queue with no approval at all
 *   #106  claude[bot] wrote it, a person approved it, a bot merged it
 *   and a commit pushed straight to main, co-written by Amp
 */

declare const DEMO_REPO = "octo-org/demo-app";
declare const DEMO_PERIOD = "2026-09";
declare const DEMO_RECORDING: Recording;

/**
 * What every output ends with (brief DOOR-20): the not-advice line, and the hand-off to okgate,
 * worded as not built. okgate's hook mode already holds an agent's push or merge until a person
 * types the go-ahead and logs the decision on the machine; a continuous record of every merge,
 * kept across an audit window for an auditor, does not exist. The /merge-audit/record page's view
 * is the count. No price is named until one is decided and its checkout works.
 */
/** On every output: the CLI's text, the markdown, the CSV preamble, the JSON, the MCP results. */
declare const NOT_ADVICE = "Not audit advice: this lists what GitHub's records show. Whether it meets your controls is for you and your auditor.";
/** That detection is by signature, said wherever a count of agent-written PRs is shown. */
declare const FLOOR_NOTE = "Agents are found by the signatures they leave (bot accounts, commit identities, co-author trailers, PR-body markers). An agent that leaves none, or a trailer someone removed, is not found, so the count is a floor.";
declare const PAGES_URL = "https://agentwares-agentguard.vercel.app/merge-audit";
/** Where a run's hand-off line points: the hub's record section, attributed. */
declare const HANDOFF_URL = "https://agentwares-agentguard.vercel.app/merge-audit?ref=agent-merge-audit#record";
/** The hand-off, word for word, at the end of every run and on every page. */
declare const HANDOFF_LINE = "A continuous, hash-chained record of every agent change, kept across your audit window, is not built.";
/** What it would do, and what works today. */
declare const HANDOFF_DETAIL = "It would record each merge as it happens (who or what wrote it, who approved it, who merged it, under which rule) in okgate's hash-chained log, with a quarterly CC8.1 export and a read-only link for your auditor. What works today, free: okgate's hook mode holds an agent's git push or merge in Claude Code, Codex and Gemini CLI until a person types the go-ahead, and logs each decision in a hash-chained log on your machine (`okgate verify` checks it). If you would pay for the record, say so with one click:";

interface Deps {
    stdout: (s: string) => void;
    stderr: (s: string) => void;
    fetch?: FetchLike;
    now?: () => Date;
    cwd?: string;
    env?: Record<string, string | undefined>;
    exec?: Exec;
}
declare function main(argv: string[], deps?: Deps): Promise<number>;
declare const FAIL_ON: readonly ["agent-unapproved", "any", "none"];
type FailOn = (typeof FAIL_ON)[number];
declare function fails(r: Report, failOn: FailOn): boolean;
/** The signatures, as `signatures` and the MCP tool list them. */
declare function signaturesJson(): {
    read: string;
    agents: {
        id: string;
        name: string;
        logins: readonly string[];
        apps: readonly string[];
        emails: readonly string[];
        email_suffixes: readonly string[];
        co_author_names: readonly string[];
        trailers: readonly string[];
        markers: readonly string[];
        seen: string;
    }[];
    automation: readonly string[];
    note: string;
};
interface AuditRequest {
    repo: string;
    flags: {
        since?: string;
        until?: string;
        period?: string;
        base?: string;
    };
    anonymous: boolean;
    now: Date;
    deps: Pick<Deps, "fetch" | "exec">;
    cwd: string;
    env: Record<string, string | undefined>;
}
/** The whole audit, for the CLI and the MCP tool alike. */
declare function audit(req: AuditRequest): Promise<Report>;

interface ToolDefinition {
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
declare const TOOLS: readonly ToolDefinition[];
interface McpContext {
    env?: Record<string, string | undefined>;
    cwd?: string;
    exec?: Exec;
    fetch?: FetchLike;
    now?: () => Date;
}
declare function callTool(name: string, rawArgs: unknown, ctx?: McpContext): Promise<{
    structured: Record<string, unknown>;
    isError: boolean;
}>;
declare function handleMessage(msg: unknown, ctx: McpContext): Promise<unknown>;

declare const CSV_COLUMNS: readonly ["type", "number", "url", "title", "merged_at", "author", "author_kind", "agent", "agent_role", "agent_evidence", "approved_by_independent", "approved_by_other", "approval", "merged_by", "merged_by_kind", "rule_at_merge", "exceptions"];
/** One CSV cell: quoted when it must be, and never a formula. */
declare function cell(v: string | number | null | undefined): string;
declare function csvName(r: Pick<Report, "repo" | "period">): string;
declare function renderCsv(r: Report): string;
declare const sha256: (s: string) => string;
declare function renderMarkdown(r: Report, csv?: {
    name: string;
    sha256: string;
}): string;
/** What a run prints: the counts, the exceptions in a line each, the files and the hand-off. */
declare function renderSummary(r: Report, files: string[]): string;
declare const renderJson: (r: Report) => string;

/**
 * The library behind the CLI: read a repository's merged pull requests from GitHub, classify who
 * wrote, approved and merged each one, and render the evidence pair. The GitHub Action
 * (action.yml) imports `renderMarkdown`, `renderCsv` and the helpers from here to render the JSON
 * report the CLI wrote.
 */

/** The day the README sample was recorded on (scripts/sample.mjs). */
declare const SAMPLE_DATE = "2026-10-09";

export { AGENTS, type AgentInvolvement, type ApprovalClass, type ApprovalRow, CSV_COLUMNS, CliError, DEMO_PERIOD, DEMO_RECORDING, DEMO_REPO, EXCEPTIONS, type ExceptionCode, FLOOR_NOTE, type FetchLike, GitHub, HANDOFF_DETAIL, HANDOFF_LINE, HANDOFF_URL, NOT_ADVICE, PAGES_URL, type Period, type Person, type PrRow, type Problem, type PushRow, type RecordedResponse, type Recording, type Report, type Rules, SAMPLE_DATE, type Summary, TOOLS, agentsInCommit, approvalClass, approvalsOf, audit, callTool, cell, classifyActor, csvName, exceptionsOf, fails, findToken, handleMessage, humanCoAuthors, involvement, loginFromEmail, main, mergedBy, months, namedPeriod, normalisePath, parseRepo, parseTrailers, readRules, renderCsv, renderJson, renderMarkdown, renderSummary, replayFetch, resolvePeriod, runAudit, sha256, signaturesJson, summarise, writers };
