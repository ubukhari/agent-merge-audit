/**
 * One recorded run against a public repository: github/github-mcp-server, PRs merged 1–2 Oct 2026,
 * read anonymously on 9 Oct 2026 with read-only GETs (scripts/record.mjs). Replayed here with no
 * network, so what GitHub returned that day is what the classification is tested on.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runAudit } from "./audit.js";
import { GitHub } from "./github.js";
import { renderCsv, renderMarkdown } from "./render.js";
import { replayFetch, type Recording } from "./replay.js";

const rec = JSON.parse(
  readFileSync(
    new URL("./fixtures/github-mcp-server-2026-10-01-to-2026-10-02.json", import.meta.url),
    "utf8",
  ),
) as Recording;

const run = () =>
  runAudit({
    repo: "github/github-mcp-server",
    period: { since: "2026-10-01", until: "2026-10-02" },
    gh: new GitHub({ token: null, fetch: replayFetch(rec) }),
    now: new Date(rec.recorded_at),
  });

describe("the recorded run (github/github-mcp-server, 1–2 Oct 2026, anonymous)", () => {
  it("was anonymous, read-only and recorded on 9 Oct 2026", () => {
    expect(rec.recorded_at.slice(0, 10)).toBe("2026-10-09");
    expect(rec.note).toMatch(/anonymous run .* read-only GETs to api\.github\.com with no token/);
    expect(JSON.stringify(rec)).not.toMatch(/"authorization"/i);
  });

  it("reads 11 merged PRs in 26 requests, and the branch rule anyone can read", async () => {
    const r = await run();
    expect(r.auth).toBe("anonymous");
    expect(r.requests).toEqual({ core: 25, search: 1 });
    expect(r.prs.map((p) => p.number).sort()).toEqual([
      3348, 3350, 3355, 3357, 3370, 3378, 3379, 3380, 3381, 3382, 3383,
    ]);
    expect(r.rules.review).toEqual([
      {
        source: "ruleset 4531665 (repository github/github-mcp-server)",
        approvals: 1,
        last_push_approval: true,
        dismiss_stale: true,
        code_owners: true,
      },
    ]);
    expect(r.rules.copilot_review).toBe(true);
    expect(r.rules.at_merge).toBe("not-readable");
  });

  it("tells Copilot's coding agent from Copilot code review, and from Copilot as co-author", async () => {
    const r = await run();
    const p = r.prs.find((x) => x.number === 3355)!;
    expect(p.author).toEqual({
      login: "Copilot",
      kind: "agent",
      agent: "GitHub Copilot coding agent",
    });
    expect(p.agent.role).toBe("author");
    expect(p.agent.evidence[0]).toBe("opened by Copilot (app copilot-swe-agent)");
    // the maintainer who only merged main into the branch still counts as independent
    expect(p.approvals.map((a) => [a.login, a.independent, a.stale])).toEqual([
      ["timrogers", true, false],
      ["SamMorrowDrums", true, false],
    ]);
    expect(p.exceptions).toEqual([]);
    // the others carry Copilot as a co-author trailer
    const co = r.prs.find((x) => x.number === 3348)!;
    expect(co.agent).toMatchObject({ role: "co-author", agents: ["GitHub Copilot"] });
  });

  it("asks about the merges that show no approval under a rule that now requires one", async () => {
    const r = await run();
    const flagged = r.prs.filter((p) => p.exceptions.length).map((p) => p.number);
    expect(flagged.sort()).toEqual([3370, 3378, 3379, 3380, 3381, 3382, 3383]);
    for (const p of r.prs.filter((x) => x.exceptions.length))
      expect(p.exceptions).toEqual([
        "agent-no-human-approval",
        "no-approval",
        "unapproved-while-rule-requires",
      ]);
    expect(r.summary).toMatchObject({
      merged_prs: 11,
      agent_prs: 11,
      agent_without_independent_approval: 7,
      independent_approval: 4,
      commits_on_base: 11,
      direct_pushes: 0,
      commits_unchecked: 0,
    });
  });

  it("prints no person's address, only the agents' own", async () => {
    const r = await run();
    const out = renderMarkdown(r) + renderCsv(r);
    expect(out).not.toContain("redacted@example.invalid");
    for (const m of out.matchAll(/[\w.+-]+@[\w.-]+\.[a-z]+/g))
      expect(m[0], m[0]).toMatch(/\+Copilot@users\.noreply\.github\.com$/);
  });
});
