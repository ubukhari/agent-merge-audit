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
import type { Recording, RecordedResponse } from "./replay.js";

export const DEMO_REPO = "octo-org/demo-app";
export const DEMO_PERIOD = "2026-09";

const R = `/repos/${DEMO_REPO}`;
const HTML = `https://github.com/${DEMO_REPO}`;

const user = (login: string, type = "User", app?: string) => ({
  login,
  type,
  html_url: app ? `https://github.com/apps/${app}` : `https://github.com/${login}`,
});
const ANA = user("octo-ana");
const BEN = user("octo-ben");
const CAM = user("octo-cam");
const COPILOT_AGENT = user("Copilot", "Bot", "copilot-swe-agent");
const COPILOT_REVIEW = user("Copilot", "Bot", "copilot-pull-request-reviewer");
const CURSOR = user("cursoragent");
const DEPENDABOT = user("dependabot[bot]", "Bot", "dependabot");
const CLAUDE_BOT = user("claude[bot]", "Bot", "claude");
const RELEASE_BOT = user("octo-release-bot[bot]", "Bot", "octo-release-bot");
const QUEUE = user("github-merge-queue[bot]", "Bot", "github-merge-queue");

/** A made-up commit id: 40 hex digits, distinct per call; the tag only reads well in this file. */
let shaN = 0;
const sha = (_tag: string) => `d${(++shaN).toString(16).padStart(7, "0")}`.repeat(5);

function commit(
  s: string,
  author: { name: string; email: string; login: ReturnType<typeof user> | null },
  date: string,
  message: string,
  parents = 1,
) {
  return {
    sha: s,
    html_url: `${HTML}/commit/${s}`,
    commit: {
      author: { name: author.name, email: author.email, date },
      committer: { name: author.name, email: author.email, date },
      message,
    },
    author: author.login,
    committer: author.login,
    parents: Array.from({ length: parents }, (_, i) => ({ sha: `${"0".repeat(39)}${i}` })),
  };
}

const review = (u: ReturnType<typeof user>, state: string, at: string) => ({
  event: "reviewed",
  user: u,
  state,
  submitted_at: at,
});
const merged = (u: ReturnType<typeof user>, at: string, s: string) => ({
  event: "merged",
  actor: u,
  created_at: at,
  commit_id: s,
});

interface DemoPr {
  number: number;
  title: string;
  author: ReturnType<typeof user>;
  body: string;
  created: string;
  merged: string;
  commits: ReturnType<typeof commit>[];
  timeline: Record<string, unknown>[];
}

const ana = { name: "Ana Example", email: "ana@example.com", login: ANA };
const copilot = {
  name: "Copilot",
  email: "198982749+Copilot@users.noreply.github.com",
  login: COPILOT_AGENT,
};
const cursor = { name: "Cursor Agent", email: "cursoragent@cursor.com", login: CURSOR };
const dependabot = {
  name: "dependabot[bot]",
  email: "49699333+dependabot[bot]@users.noreply.github.com",
  login: DEPENDABOT,
};
const claudeBot = {
  name: "claude[bot]",
  email: "209825114+claude[bot]@users.noreply.github.com",
  login: CLAUDE_BOT,
};

const s102 = sha("102");
const s104a = sha("104");
const s104b = sha("104");

const PRS: DemoPr[] = [
  {
    number: 101,
    title: "Add rate limiting to the export endpoint",
    author: ANA,
    body: "Limits exports to 10 a minute per account.",
    created: "2026-09-02T09:00:00Z",
    merged: "2026-09-03T15:10:00Z",
    commits: [commit(sha("101"), ana, "2026-09-02T08:55:00Z", "Add rate limiting to exports")],
    timeline: [
      review(BEN, "approved", "2026-09-03T14:00:00Z"),
      merged(ANA, "2026-09-03T15:10:00Z", sha("m101")),
    ],
  },
  {
    number: 102,
    title: "Fix timezone handling in invoice dates",
    author: COPILOT_AGENT,
    body: "Fixes #88. Invoice dates now render in the account's time zone.",
    created: "2026-09-08T10:00:00Z",
    merged: "2026-09-09T11:30:00Z",
    commits: [
      commit(
        s102,
        copilot,
        "2026-09-08T10:20:00Z",
        "Fix timezone handling in invoice dates\n\nCo-authored-by: octo-ben <2001+octo-ben@users.noreply.github.com>",
      ),
    ],
    timeline: [
      review(COPILOT_REVIEW, "commented", "2026-09-08T10:40:00Z"),
      review(BEN, "approved", "2026-09-09T11:00:00Z"),
      merged(BEN, "2026-09-09T11:30:00Z", sha("m102")),
    ],
  },
  {
    number: 103,
    title: "Move session storage to Redis",
    author: CAM,
    body: "Session storage moves from memory to Redis.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)",
    created: "2026-09-14T13:00:00Z",
    merged: "2026-09-15T09:00:00Z",
    commits: [
      commit(
        sha("103"),
        { name: "Cam Example", email: "cam@example.com", login: CAM },
        "2026-09-14T12:50:00Z",
        "Move session storage to Redis\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>",
      ),
    ],
    timeline: [
      review(COPILOT_REVIEW, "approved", "2026-09-14T13:20:00Z"),
      merged(CAM, "2026-09-15T09:00:00Z", sha("m103")),
    ],
  },
  {
    number: 104,
    title: "Paginate the audit log API",
    author: BEN,
    body: "Adds cursor pagination.",
    created: "2026-09-17T08:00:00Z",
    merged: "2026-09-18T16:00:00Z",
    commits: [
      commit(
        s104a,
        cursor,
        "2026-09-17T07:50:00Z",
        "Paginate the audit log API\n\nCo-authored-by: Ben Example <ben@example.com>",
      ),
      commit(
        s104b,
        cursor,
        "2026-09-18T15:30:00Z",
        "Raise the page size limit to 500\n\nCo-authored-by: Ben Example <ben@example.com>",
      ),
    ],
    timeline: [
      review(ANA, "approved", "2026-09-17T12:00:00Z"),
      merged(BEN, "2026-09-18T16:00:00Z", sha("m104")),
    ],
  },
  {
    number: 105,
    title: "Bump undici from 7.2.0 to 7.2.3",
    author: DEPENDABOT,
    body: "Bumps undici from 7.2.0 to 7.2.3.",
    created: "2026-09-21T04:00:00Z",
    merged: "2026-09-21T09:15:00Z",
    commits: [
      commit(sha("105"), dependabot, "2026-09-21T03:59:00Z", "Bump undici from 7.2.0 to 7.2.3"),
    ],
    timeline: [
      { event: "added_to_merge_queue", actor: CAM, created_at: "2026-09-21T09:00:00Z" },
      merged(QUEUE, "2026-09-21T09:15:00Z", sha("m105")),
    ],
  },
  {
    number: 106,
    title: "Add a retry to the webhook sender",
    author: CLAUDE_BOT,
    body: "Retries a failed webhook three times with backoff.",
    created: "2026-09-24T10:00:00Z",
    merged: "2026-09-24T17:45:00Z",
    commits: [
      commit(
        sha("106"),
        claudeBot,
        "2026-09-24T09:58:00Z",
        "Add a retry to the webhook sender\n\nCo-authored-by: octo-cam <2003+octo-cam@users.noreply.github.com>",
      ),
    ],
    timeline: [
      review(ANA, "approved", "2026-09-24T15:00:00Z"),
      merged(RELEASE_BOT, "2026-09-24T17:45:00Z", sha("m106")),
    ],
  },
];

const PUSHED = commit(
  sha("abc"),
  ana,
  "2026-09-27T22:10:00Z",
  "Hotfix: restore the health check path\n\nAmp-Thread-ID: https://ampcode.com/threads/T-0000demo\nCo-authored-by: Amp <amp@ampcode.com>",
);

const enc = encodeURIComponent;
const SEARCH_Q = `repo:${DEMO_REPO} is:pr is:merged base:main merged:2026-09-01..2026-09-30`;

function mergeCommitOnMain(p: DemoPr) {
  const m = p.timeline.find((e) => e.event === "merged") as { commit_id: string };
  return {
    sha: m.commit_id,
    html_url: `${HTML}/commit/${m.commit_id}`,
    commit: {
      author: p.commits[0]!.commit.author,
      committer: { name: "GitHub", email: "noreply@github.com", date: p.merged },
      message: `${p.title} (#${p.number})`,
    },
    author: p.commits[0]!.author,
    committer: user("web-flow"),
    parents: [{ sha: "0".repeat(40) }],
  };
}

const responses: RecordedResponse[] = [
  {
    path: R,
    status: 200,
    body: {
      full_name: DEMO_REPO,
      default_branch: "main",
      private: false,
      visibility: "public",
      html_url: HTML,
    },
  },
  {
    path: `/search/issues?q=${enc(SEARCH_Q)}&per_page=100`,
    status: 200,
    body: {
      total_count: PRS.length,
      incomplete_results: false,
      items: PRS.map((p) => ({
        number: p.number,
        title: p.title,
        html_url: `${HTML}/pull/${p.number}`,
        created_at: p.created,
        body: p.body,
        user: p.author,
        pull_request: { merged_at: p.merged },
      })),
    },
  },
  {
    path: `${R}/rules/branches/main`,
    status: 200,
    body: [
      {
        type: "copilot_code_review",
        parameters: { review_on_push: true },
        ruleset_source_type: "Repository",
        ruleset_source: DEMO_REPO,
        ruleset_id: 7001,
      },
      {
        type: "pull_request",
        parameters: {
          required_approving_review_count: 1,
          dismiss_stale_reviews_on_push: false,
          require_code_owner_review: false,
          require_last_push_approval: false,
        },
        ruleset_source_type: "Repository",
        ruleset_source: DEMO_REPO,
        ruleset_id: 7002,
      },
    ],
  },
  ...PRS.flatMap((p): RecordedResponse[] => [
    { path: `${R}/issues/${p.number}/timeline?per_page=100`, status: 200, body: p.timeline },
    { path: `${R}/pulls/${p.number}/commits?per_page=100`, status: 200, body: p.commits },
  ]),
  {
    path: `${R}/commits?sha=main&since=2026-09-01T00:00:00Z&until=2026-09-30T23:59:59Z&per_page=100`,
    status: 200,
    body: [...PRS.map(mergeCommitOnMain), PUSHED].reverse(),
  },
  { path: `${R}/commits/${PUSHED.sha}/pulls`, status: 200, body: [] },
];

export const DEMO_RECORDING: Recording = {
  recorded_at: "synthetic",
  note: "A synthetic repository written for the demo: no real person, account or code.",
  responses,
};
