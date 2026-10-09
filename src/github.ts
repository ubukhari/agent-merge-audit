/**
 * GitHub's REST API, read only. Every request is a GET to api.github.com (or GITHUB_API_URL):
 *
 *   /repos/{o}/{r}                                       default branch, visibility
 *   /search/issues?q=repo:{o}/{r} is:pr is:merged base:{b} merged:{since}..{until}
 *                                                        the merged PRs, one calendar month a query
 *   /repos/{o}/{r}/issues/{n}/timeline                   reviews, the merge and who did it
 *   /repos/{o}/{r}/pulls/{n}/commits                     each commit's author, message, parents
 *   /repos/{o}/{r}/rules/branches/{b}                    the branch's active rules (no token needed
 *                                                        for a public repo)
 *   /repos/{o}/{r}/branches/{b}/protection               classic branch protection (admin token)
 *   /repos/{o}/{r}/rulesets/rule-suites                  each push's rule evaluation, one month
 *                                                        back at most (a token that may read it)
 *   /repos/{o}/{r}/commits?sha={b}&since=…&until=…       commits on the branch in the period
 *   /repos/{o}/{r}/commits/{sha}/pulls                   the PR a commit came from, if any
 *
 * (REST reference, read 9 Oct 2026.) The token is the user's own (`GITHUB_TOKEN`, `GH_TOKEN`, or
 * `gh auth token`), or none for a public repository: 60 requests an hour. It is sent only in the
 * Authorization header of these requests, and never printed, logged or stored.
 */
import { execFile } from "node:child_process";
import { CliError } from "./errors.js";
import { version } from "./version.js";

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<Response>;

/** `owner/repo`, from an argument or a github.com URL. */
export function parseRepo(text: string): string | null {
  const t = text
    .trim()
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  const patterns = [
    /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/,
    /^(?:https?:\/\/)(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)(?:\/.*)?$/,
    /^(?:ssh:\/\/)?git@github\.com[:/]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/,
  ];
  for (const p of patterns) {
    const m = p.exec(t);
    if (m) return `${m[1]}/${m[2]!.replace(/\.git$/, "")}`;
  }
  return null;
}

/** Run a command and return its trimmed stdout, or null if it is missing, fails or takes too long. */
export type Exec = (cmd: string, args: string[], cwd: string) => Promise<string | null>;

export const execQuiet: Exec = (cmd, args, cwd) =>
  new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: 5_000, windowsHide: true }, (err, stdout) =>
      resolve(err ? null : String(stdout).trim() || null),
    );
  });

/**
 * The user's own token, without printing it: `GITHUB_TOKEN`, then `GH_TOKEN`, then `gh auth
 * token` (the GitHub CLI's stored login). Null when there is none, which reads public repos only.
 */
export async function findToken(
  env: Record<string, string | undefined>,
  cwd: string,
  exec: Exec = execQuiet,
): Promise<string | null> {
  for (const k of ["GITHUB_TOKEN", "GH_TOKEN"]) {
    const v = env[k]?.trim();
    if (v) return v;
  }
  return exec("gh", ["auth", "token"], cwd);
}

export interface Got<T> {
  status: number;
  body: T | null;
  /** the `Link` header's next page, as a path */
  next: string | null;
}

export interface GitHubOptions {
  token: string | null;
  fetch?: FetchLike;
  apiUrl?: string;
}

/** A read-only GitHub REST client that counts its requests and knows its remaining budget. */
export class GitHub {
  readonly base: string;
  readonly token: string | null;
  private readonly fetchImpl: FetchLike;
  /** requests made, by bucket */
  readonly made = { core: 0, search: 0 };
  /** what GitHub said was left, by bucket; null until a response says */
  readonly remaining: { core: number | null; search: number | null } = {
    core: null,
    search: null,
  };

  constructor(opts: GitHubOptions) {
    this.base = (opts.apiUrl || "https://api.github.com").replace(/\/+$/, "");
    this.token = opts.token;
    this.fetchImpl = opts.fetch ?? ((url, init) => fetch(url, init));
  }

  get requests(): number {
    return this.made.core + this.made.search;
  }

  /**
   * GET a path. 404 and, when `soft`, 401/403 come back as a status with no body, for the
   * endpoints that only some tokens may read; every other failure is a CliError.
   */
  async get<T>(path: string, opts: { soft?: boolean } = {}): Promise<Got<T>> {
    const bucket = path.startsWith("/search/") ? "search" : "core";
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": `agent-merge-audit/${version()} (+https://github.com/agentwares/agent-merge-audit)`,
    };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    this.made[bucket]++;
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        headers,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      throw new CliError({
        code: "GITHUB_UNREACHABLE",
        cause: `could not reach ${this.base}: ${e instanceof Error ? e.message : String(e)}`,
        fix: "check the network and try again",
        retryable: true,
      });
    }
    const leftRaw = res.headers.get("x-ratelimit-remaining");
    const left = leftRaw === null ? null : Number(leftRaw);
    if (left !== null && Number.isFinite(left)) this.remaining[bucket] = left;
    const next = nextLink(res.headers.get("link"), this.base);
    if (res.ok) return { status: res.status, body: (await res.json()) as T, next };
    if (res.status === 404) return { status: 404, body: null, next: null };
    if ((res.status === 403 || res.status === 429) && (left === 0 || res.status === 429)) {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      const at = Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : null;
      throw this.rateLimited(at, bucket);
    }
    if (opts.soft && (res.status === 401 || res.status === 403))
      return { status: res.status, body: null, next: null };
    if (res.status === 401)
      throw new CliError({
        code: "BAD_CREDENTIALS",
        cause: "GitHub refused the token (401 Bad credentials)",
        fix: "refresh it with `gh auth login` or set a valid GITHUB_TOKEN; `--anonymous` reads a public repo with none",
        retryable: false,
      });
    if (res.status === 403)
      throw new CliError({
        code: "FORBIDDEN",
        cause: `GitHub answered 403 for ${path.split("?")[0]}`,
        fix: "the token needs read access to this repo's pull requests, issues and contents (classic tokens: the repo scope)",
        retryable: false,
      });
    if (res.status === 422)
      throw new CliError({
        code: "GITHUB_REFUSED_QUERY",
        cause: `GitHub refused the query for ${path.split("?")[0]} (422)`,
        fix: "check the branch name and the dates; a private repo needs a token that can read it",
        retryable: false,
      });
    throw new CliError({
      code: "GITHUB_ERROR",
      cause: `GitHub answered ${res.status} for ${path.split("?")[0]}`,
      fix: "try again in a minute; if it persists, check https://www.githubstatus.com",
      retryable: res.status >= 500,
    });
  }

  /** Every page of a list endpoint, up to `maxPages`; `truncated` when there were more. */
  async all<T>(
    path: string,
    maxPages: number,
    opts: { soft?: boolean } = {},
  ): Promise<{ status: number; items: T[]; truncated: boolean }> {
    const items: T[] = [];
    let p: string | null = path;
    let pages = 0;
    let status = 200;
    while (p && pages < maxPages) {
      const got: Got<T[]> = await this.get<T[]>(p, opts);
      status = got.status;
      if (!got.body) return { status, items, truncated: false };
      items.push(...got.body);
      p = got.next;
      pages++;
    }
    return { status, items, truncated: p !== null };
  }

  rateLimited(at: string | null, bucket: "core" | "search" = "core"): CliError {
    return new CliError({
      code: "RATE_LIMITED",
      cause: `GitHub's ${bucket === "search" ? "search " : ""}API rate limit is spent${this.token ? "" : " (60 requests an hour without a token)"}${at ? `; it resets at ${at}` : ""}`,
      fix: this.token
        ? "wait for the reset and run it again, or shorten the period"
        : "sign in with `gh auth login`, or set GITHUB_TOKEN, for 5,000 requests an hour; or shorten the period",
      retryable: true,
    });
  }
}

/** The `rel="next"` URL of a Link header, as a path under `base`. */
export function nextLink(link: string | null, base: string): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (m) {
      const url = m[1]!;
      return url.startsWith(base)
        ? url.slice(base.length)
        : new URL(url).pathname + new URL(url).search;
    }
  }
  return null;
}
