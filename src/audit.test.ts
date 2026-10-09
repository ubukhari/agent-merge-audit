import { describe, expect, it } from "vitest";
import {
  approvalClass,
  approvalsOf,
  exceptionsOf,
  mergedBy,
  readRules,
  runAudit,
  type GhTimelineEvent,
} from "./audit.js";
import { DEMO_RECORDING, DEMO_REPO } from "./demo.js";
import { CliError } from "./errors.js";
import { GitHub } from "./github.js";
import { replayFetch, type Recording } from "./replay.js";

const NOW = new Date("2026-10-09T12:00:00Z");
const demo = () =>
  runAudit({
    repo: DEMO_REPO,
    period: { since: "2026-09-01", until: "2026-09-30" },
    gh: new GitHub({ token: null, fetch: replayFetch(DEMO_RECORDING) }),
    now: NOW,
  });

describe("the demo repo, end to end", () => {
  it("finds each case it was written to show", async () => {
    const r = await demo();
    const ex = Object.fromEntries(r.prs.map((p) => [p.number, p.exceptions]));
    expect(ex).toEqual({
      101: [],
      102: ["agent-no-human-approval", "self-approval-only"],
      103: ["agent-no-human-approval", "bot-approval-only"],
      104: ["agent-no-human-approval", "stale-approval"],
      105: ["no-approval", "unapproved-while-rule-requires"],
      106: ["merged-by-bot"],
    });
    expect(r.direct_pushes.map((d) => d.exceptions)).toEqual([
      ["agent-no-human-approval", "direct-push"],
    ]);
    expect(r.summary).toMatchObject({
      merged_prs: 6,
      agent_prs: 4,
      agent_without_independent_approval: 3,
      independent_approval: 2,
      prs_with_exceptions: 5,
      direct_pushes: 1,
      commits_on_base: 7,
      commits_unchecked: 0,
    });
  });

  it("names the agents, and how each was found", async () => {
    const r = await demo();
    const by = Object.fromEntries(r.prs.map((p) => [p.number, p.agent]));
    expect(by[101]!.role).toBeNull();
    expect(by[102]).toMatchObject({ role: "author", agents: ["GitHub Copilot coding agent"] });
    expect(by[103]).toMatchObject({ role: "co-author", agents: ["Claude Code"] });
    expect(by[103]!.evidence).toContain("PR body: Generated with [Claude Code]");
    expect(by[104]).toMatchObject({ role: "author", agents: ["Cursor agent"] });
    expect(by[106]).toMatchObject({ role: "author", agents: ["Claude GitHub app"] });
    expect(r.summary.by_agent).toEqual({
      "Claude Code": 1,
      "Claude GitHub app": 1,
      "Cursor agent": 1,
      "GitHub Copilot coding agent": 1,
    });
  });

  it("credits a merge queue's merge to the person who queued it", async () => {
    const r = await demo();
    const p = r.prs.find((x) => x.number === 105)!;
    expect(p.merged_by).toEqual({ login: "octo-cam", kind: "human" });
    expect(p.merged_via).toBe("merge queue");
  });

  it("reads the rule now, and says the rule at each merge was not readable without a token", async () => {
    const r = await demo();
    expect(r.auth).toBe("anonymous");
    expect(r.rules.requires_approvals).toBe(1);
    expect(r.rules.copilot_review).toBe(true);
    expect(r.rules.at_merge).toBe("not-readable");
    expect(r.rules.classic).toBe("not-readable");
    expect(new Set(r.prs.map((p) => p.rule_at_merge))).toEqual(new Set(["not-readable"]));
    expect(r.requests).toEqual({ core: 16, search: 1 });
  });
});

const ev = (
  user: string,
  state: string,
  at: string,
  type = "User",
  html = `https://github.com/${user}`,
): GhTimelineEvent => ({
  event: "reviewed",
  user: { login: user, type, html_url: html },
  state,
  submitted_at: at,
});

describe("approvals", () => {
  const merged = "2026-09-10T00:00:00Z";
  it("keeps each reviewer's last decision before the merge; a comment changes nothing", () => {
    const a = approvalsOf(
      [
        ev("ana", "approved", "2026-09-01T00:00:00Z"),
        ev("ana", "commented", "2026-09-02T00:00:00Z"),
        ev("ben", "approved", "2026-09-01T00:00:00Z"),
        ev("ben", "changes_requested", "2026-09-03T00:00:00Z"),
        ev("cam", "approved", "2026-09-04T00:00:00Z"),
        ev("cam", "dismissed", "2026-09-05T00:00:00Z"),
        ev("dee", "approved", "2026-09-11T00:00:00Z"),
      ],
      merged,
      new Set(),
      null,
    );
    expect(a.map((x) => x.login)).toEqual(["ana"]);
  });

  it("an author's own approval and a bot's are not independent; an old one is stale", () => {
    const a = approvalsOf(
      [
        ev("ana", "approved", "2026-09-01T00:00:00Z"),
        ev(
          "Copilot",
          "approved",
          "2026-09-02T00:00:00Z",
          "Bot",
          "https://github.com/apps/copilot-pull-request-reviewer",
        ),
        ev("ben", "approved", "2026-09-03T00:00:00Z"),
      ],
      merged,
      new Set(["ana"]),
      "2026-09-05T00:00:00Z",
    );
    expect(a.map((x) => [x.login, x.kind, x.independent, x.stale])).toEqual([
      ["ana", "human", false, true],
      ["Copilot", "agent", false, true],
      ["ben", "human", true, true],
    ]);
    expect(approvalClass(a)).toBe("stale");
    expect(approvalClass(a.filter((x) => x.login !== "ben"))).toBe("self");
    expect(approvalClass(a.filter((x) => x.login === "Copilot"))).toBe("bot");
    expect(approvalClass([])).toBe("none");
    expect(approvalClass([{ ...a[2]!, stale: false }])).toBe("independent");
  });
});

describe("who merged", () => {
  it("a bot's merge stays a bot's unless a person queued it or turned on auto-merge", () => {
    const bot = { login: "release-bot[bot]", type: "Bot" };
    expect(
      mergedBy([
        { event: "merged", actor: bot, created_at: "2026-09-02T00:00:00Z", commit_id: "a" },
      ]).by,
    ).toEqual({ login: "release-bot[bot]", kind: "automation" });
    const m = mergedBy([
      {
        event: "auto_merge_enabled",
        actor: { login: "ana", type: "User" },
        created_at: "2026-09-01T00:00:00Z",
      },
      { event: "merged", actor: bot, created_at: "2026-09-02T00:00:00Z", commit_id: "a" },
    ]);
    expect(m).toEqual({
      by: { login: "ana", kind: "human" },
      via: "auto-merge",
      commit: "a",
      at: "2026-09-02T00:00:00Z",
    });
  });
});

describe("rules", () => {
  it("reads rulesets and classic protection, and takes the strictest count", () => {
    const r = readRules(
      [
        {
          type: "pull_request",
          parameters: { required_approving_review_count: 1, require_last_push_approval: true },
          ruleset_id: 9,
          ruleset_source_type: "Organization",
          ruleset_source: "octo-org",
        },
      ],
      {
        status: 200,
        body: {
          required_pull_request_reviews: { required_approving_review_count: 2 },
          enforce_admins: { enabled: false },
        },
      },
      "read",
      false,
    );
    expect(r.review.map((x) => [x.source, x.approvals])).toEqual([
      ["ruleset 9 (organization octo-org)", 1],
      ["classic branch protection (admins not included)", 2],
    ]);
    expect(r.requires_approvals).toBe(2);
    expect(r.classic).toBe("read");
    expect(r.at_merge).toBe("read");
  });

  it("no rule at all requires nothing, and says classic protection was not readable", () => {
    const r = readRules(null, { status: 403, body: null }, "not-readable", false);
    expect(r.requires_approvals).toBe(0);
    expect(r.classic).toBe("not-readable");
  });

  it("an unapproved merge under a rule that now requires approval is asked about", () => {
    const row = {
      agent: { role: null, agents: [], evidence: [] },
      approval: "none" as const,
      merged_by: { login: "ana", kind: "human" as const },
      rule_at_merge: "not-readable" as const,
    };
    expect(exceptionsOf(row, { requires_approvals: 1 })).toEqual([
      "no-approval",
      "unapproved-while-rule-requires",
    ]);
    expect(exceptionsOf({ ...row, rule_at_merge: "bypass" }, { requires_approvals: 1 })).toEqual([
      "no-approval",
      "rule-bypassed",
    ]);
    expect(exceptionsOf(row, { requires_approvals: 0 })).toEqual(["no-approval"]);
  });
});

describe("limits", () => {
  const rec = (over: Partial<Record<string, unknown>> = {}): Recording => {
    const base = DEMO_RECORDING.responses.map((r) =>
      r.path === `/repos/${DEMO_REPO}` ? { ...r, headers: { "x-ratelimit-remaining": "5" } } : r,
    );
    return { ...DEMO_RECORDING, responses: base, ...over };
  };

  it("stops before it would spend the hour's requests, and says how to get more", async () => {
    const err = await runAudit({
      repo: DEMO_REPO,
      period: { since: "2026-09-01", until: "2026-09-30" },
      gh: new GitHub({ token: null, fetch: replayFetch(rec()) }),
      now: NOW,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CliError);
    expect((err as CliError).code).toBe("RATE_LIMITED");
    expect((err as CliError).cause).toMatch(/needs about 14 requests .* 5 are left/);
    expect((err as CliError).fix).toMatch(/gh auth login/);
    expect((err as CliError).retryable).toBe(true);
  });

  it("refuses a month with more than GitHub's search returns", async () => {
    const big: Recording = {
      ...DEMO_RECORDING,
      responses: DEMO_RECORDING.responses.map((r) =>
        r.path.startsWith("/search/")
          ? { ...r, body: { total_count: 1500, incomplete_results: false, items: [] } }
          : r,
      ),
    };
    const err = await runAudit({
      repo: DEMO_REPO,
      period: { since: "2026-09-01", until: "2026-09-30" },
      gh: new GitHub({ token: null, fetch: replayFetch(big) }),
      now: NOW,
    }).catch((e: unknown) => e);
    expect((err as CliError).code).toBe("PERIOD_TOO_LARGE");
  });

  it("a repo it cannot see is a clear error", async () => {
    const err = await runAudit({
      repo: "octo-org/missing",
      period: { since: "2026-09-01", until: "2026-09-30" },
      gh: new GitHub({
        token: null,
        fetch: replayFetch({
          recorded_at: "x",
          note: "",
          responses: [
            { path: "/repos/octo-org/missing", status: 404, body: { message: "Not Found" } },
          ],
        }),
      }),
      now: NOW,
    }).catch((e: unknown) => e);
    expect((err as CliError).code).toBe("REPO_NOT_FOUND");
    expect((err as CliError).fix).toMatch(/private repo needs your token/);
  });
});
