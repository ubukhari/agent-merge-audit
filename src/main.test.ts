import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_RECORDING } from "./demo.js";
import type { FetchLike } from "./github.js";
import { HANDOFF_LINE, NOT_ADVICE } from "./handoff.js";
import { main, type Deps } from "./main.js";
import { sha256 } from "./render.js";
import { replayFetch, type Recording } from "./replay.js";

const NOW = new Date("2026-10-09T12:00:00Z");

async function run(argv: string[], over: Partial<Deps> = {}) {
  let stdout = "";
  let stderr = "";
  const code = await main(argv, {
    stdout: (s) => (stdout += s),
    stderr: (s) => (stderr += s),
    now: () => NOW,
    env: {},
    exec: async () => null,
    ...over,
  });
  return { code, stdout, stderr };
}

describe("demo", () => {
  it("runs on the synthetic repo with no network, and says it is synthetic", async () => {
    const r = await run(["demo"], {
      fetch: () => Promise.reject(new Error("the demo must not reach the network")),
    });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^Synthetic repo, written for this demo/);
    expect(r.stdout).toContain("6 pull requests merged; 4 written or co-written by an agent");
    expect(r.stdout).toContain(NOT_ADVICE);
    expect(r.stdout).toContain(HANDOFF_LINE);
  });

  it("writes the evidence pair where it is told, and the markdown names the CSV's hash", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ama-"));
    const r = await run(["demo", "--out", dir]);
    expect(r.code).toBe(0);
    const files = readdirSync(dir).sort();
    expect(files).toEqual([
      "octo-org-demo-app-merge-audit-2026-09-01-to-2026-09-30.csv",
      "octo-org-demo-app-merge-audit-2026-09-01-to-2026-09-30.md",
    ]);
    const csv = readFileSync(path.join(dir, files[0]!), "utf8");
    const md = readFileSync(path.join(dir, files[1]!), "utf8");
    expect(md).toContain(`SHA-256 \`${sha256(csv)}\``);
    expect(r.stdout).toContain("Wrote:");
  });

  it("--fail-on turns exceptions into exit 1, for CI", async () => {
    expect((await run(["demo", "--fail-on", "agent-unapproved"])).code).toBe(1);
    expect((await run(["demo", "--fail-on", "any"])).code).toBe(1);
    expect((await run(["demo", "--fail-on", "none"])).code).toBe(0);
    const bad = await run(["demo", "--fail-on", "sometimes"]);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toMatch(/BAD_ARGUMENTS/);
  });

  it("--json prints the report and nothing else", async () => {
    const r = await run(["demo", "--json"]);
    const j = JSON.parse(r.stdout) as { repo: string; note: string; prs: unknown[] };
    expect(j.repo).toBe("octo-org/demo-app");
    expect(j.note).toBe(NOT_ADVICE);
    expect(j.prs).toHaveLength(6);
  });

  it("--no-write prints the markdown", async () => {
    const r = await run(["demo", "--no-write"]);
    expect(r.stdout).toContain("# Agent-merge audit: octo-org/demo-app, 2026-09-01 to 2026-09-30");
  });
});

describe("arguments", () => {
  it.each([
    [["octo-org/app", "--period", "2026-09", "--since", "2026-09-01"], /cannot be combined/],
    [["octo-org/app", "--since", "2026-13-01"], /YYYY-MM-DD/],
    [["octo-org/app", "--until", "2027-01-01"], /after today/],
    [["octo-org/app", "--since", "2026-09-30", "--until", "2026-09-01"], /runs backwards/],
    [["octo-org/app", "--period", "2026-Q5"], /a quarter/],
    [["octo-org/app", "--base", "main;rm"], /not a branch name/],
    [["a", "b"], /one owner\/repo/],
    [["--bogus"], /Unknown option/],
  ])("%j is a usage error", async (argv, msg) => {
    const r = await run(argv);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(msg);
  });

  it("a word that is not owner/repo says what it wants", async () => {
    const r = await run(["not-a-repo"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/BAD_REPO/);
  });

  it("no argument prints the help and exits 2; --help exits 0", async () => {
    expect((await run([])).code).toBe(2);
    const h = await run(["--help"]);
    expect(h.code).toBe(0);
    expect(h.stdout).toContain("--period 2026-09");
    expect(h.stdout).toContain(NOT_ADVICE);
  });

  it("signatures lists every agent with where it was seen", async () => {
    const r = await run(["signatures"]);
    expect(r.stdout).toContain("GitHub Copilot coding agent");
    expect(r.stdout).toContain("<noreply@anthropic.com>");
    const j = JSON.parse((await run(["signatures", "--json"])).stdout) as {
      agents: { id: string; seen: string }[];
    };
    expect(j.agents.map((a) => a.id)).toContain("claude-code");
  });
});

describe("the token", () => {
  const TOKEN = "ghp_exampleTokenThatMustNeverBePrinted0000";
  /** The demo's recording, plus what a token may read: classic protection and rule suites, refused. */
  const withToken: Recording = {
    ...DEMO_RECORDING,
    responses: [
      ...DEMO_RECORDING.responses,
      { path: "/repos/octo-org/demo-app/branches/main/protection", status: 403, body: {} },
      {
        path: "/repos/octo-org/demo-app/rulesets/rule-suites?ref=refs%2Fheads%2Fmain&time_period=month&per_page=100",
        status: 403,
        body: {},
      },
    ],
  };

  it("goes only to api.github.com, in the Authorization header, and is never printed or written", async () => {
    const seen: { url: string; auth?: string }[] = [];
    const replay = replayFetch(withToken);
    const fetch: FetchLike = (url, init) => {
      seen.push({ url, auth: init?.headers?.authorization });
      return replay(url, init);
    };
    const dir = mkdtempSync(path.join(tmpdir(), "ama-token-"));
    const r = await run(["octo-org/demo-app", "--period", "2026-09", "--out", dir], {
      fetch,
      env: { GITHUB_TOKEN: TOKEN },
    });
    expect(r.code).toBe(0);
    expect(seen.length).toBeGreaterThan(10);
    for (const s of seen) {
      expect(s.url.startsWith("https://api.github.com/")).toBe(true);
      expect(s.auth).toBe(`Bearer ${TOKEN}`);
    }
    expect(r.stdout + r.stderr).not.toContain(TOKEN);
    for (const f of readdirSync(dir))
      expect(readFileSync(path.join(dir, f), "utf8")).not.toContain(TOKEN);
    const md = readFileSync(
      path.join(
        dir,
        readdirSync(dir).find((f) => f.endsWith(".md"))!,
      ),
      "utf8",
    );
    expect(md).toContain("with your token");
    expect(md).toContain("needs a token with admin read on the repo");
  });

  it("--anonymous sends none, even when one is set", async () => {
    const seen: (string | undefined)[] = [];
    const replay = replayFetch(DEMO_RECORDING);
    const r = await run(["octo-org/demo-app", "--period", "2026-09", "--json", "--anonymous"], {
      fetch: (url, init) => {
        seen.push(init?.headers?.authorization);
        return replay(url, init);
      },
      env: { GITHUB_TOKEN: TOKEN },
    });
    expect(r.code).toBe(0);
    expect(seen.every((a) => a === undefined)).toBe(true);
  });

  it("a refused token is a clear error with the fix", async () => {
    const r = await run(["octo-org/demo-app"], {
      fetch: () => Promise.resolve(new Response("{}", { status: 401 })),
      env: { GH_TOKEN: TOKEN },
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/BAD_CREDENTIALS/);
    expect(r.stderr).not.toContain(TOKEN);
  });

  it("a spent rate limit says when it resets and how to get more", async () => {
    const r = await run(["octo-org/demo-app", "--json"], {
      fetch: () =>
        Promise.resolve(
          new Response("{}", {
            status: 403,
            headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1791583282" },
          }),
        ),
    });
    expect(r.code).toBe(1);
    const e = JSON.parse(r.stdout) as {
      error: { code: string; cause: string; retryable: boolean };
    };
    expect(e.error.code).toBe("RATE_LIMITED");
    expect(e.error.cause).toContain("2026-10-09T22:01:22.000Z");
    expect(e.error.retryable).toBe(true);
  });
});
