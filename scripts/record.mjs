#!/usr/bin/env node
/**
 * Record one anonymous audit of a public repository as a test fixture: every GET the audit makes,
 * with its status, the rate-limit and Link headers, and its body trimmed to the fields the audit
 * reads. People's email addresses are replaced (noreply and agent addresses are kept, because the
 * audit reads them); names and logins are public and stay. Build first (`pnpm build`).
 *
 *   node scripts/record.mjs owner/repo --since YYYY-MM-DD --until YYYY-MM-DD --out src/fixtures/x.json
 *
 * It never reads a token: the client is built with none, so the run is what anyone can see.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { AGENTS, GitHub, renderSummary, resolvePeriod, runAudit } from "../dist/index.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { since: { type: "string" }, until: { type: "string" }, out: { type: "string" } },
});
const repo = positionals[0];
if (!repo || !values.out) {
  console.error("usage: node scripts/record.mjs owner/repo --since D --until D --out file.json");
  process.exit(2);
}
const BASE = "https://api.github.com";
const now = new Date();
const period = resolvePeriod({ since: values.since, until: values.until }, now);

const agentEmails = AGENTS.flatMap((s) => s.emails ?? []);
const agentSuffixes = AGENTS.flatMap((s) => s.emailSuffixes ?? []);
const keepEmail = (e) => {
  const x = String(e).toLowerCase();
  return (
    x.endsWith("@users.noreply.github.com") ||
    x === "noreply@github.com" ||
    agentEmails.includes(x) ||
    agentSuffixes.some((s) => x.endsWith(s))
  );
};
const REDACTED = "redacted@example.invalid";
const scrub = (text) =>
  String(text ?? "").replace(/<([^<>\s@]+@[^<>\s@]+)>/g, (m, e) =>
    keepEmail(e) ? m : `<${REDACTED}>`,
  );
const who = (u) => (u ? { login: u.login, type: u.type, html_url: u.html_url } : null);
const person = (p) =>
  p ? { name: p.name, email: keepEmail(p.email) ? p.email : REDACTED, date: p.date } : null;
const commit = (c) => ({
  sha: c.sha,
  html_url: c.html_url,
  commit: {
    author: person(c.commit.author),
    committer: person(c.commit.committer),
    message: scrub(c.commit.message),
  },
  author: who(c.author),
  committer: who(c.committer),
  parents: (c.parents ?? []).map((p) => ({ sha: p.sha })),
});

/** The fields the audit reads, by endpoint. */
function trim(path, body) {
  if (body === null || typeof body !== "object") return body;
  const p = path.split("?")[0];
  if (/^\/repos\/[^/]+\/[^/]+$/.test(p))
    return {
      full_name: body.full_name,
      default_branch: body.default_branch,
      private: body.private,
      visibility: body.visibility,
      html_url: body.html_url,
    };
  if (p === "/search/issues")
    return {
      total_count: body.total_count,
      incomplete_results: body.incomplete_results,
      items: body.items.map((i) => ({
        number: i.number,
        title: i.title,
        html_url: i.html_url,
        created_at: i.created_at,
        body: scrub(i.body),
        user: who(i.user),
        performed_via_github_app: i.performed_via_github_app
          ? { slug: i.performed_via_github_app.slug }
          : null,
        pull_request: { merged_at: i.pull_request?.merged_at ?? null },
      })),
    };
  if (p.endsWith("/timeline"))
    return body.map((e) => {
      const out = { event: e.event };
      if (e.created_at) out.created_at = e.created_at;
      if (e.actor) out.actor = who(e.actor);
      if (e.event === "reviewed") {
        out.user = who(e.user);
        out.state = e.state;
        out.submitted_at = e.submitted_at;
        out.commit_id = e.commit_id;
      }
      if (e.event === "merged") out.commit_id = e.commit_id;
      return out;
    });
  if (/\/pulls\/\d+\/commits$/.test(p) || /\/commits$/.test(p)) return body.map(commit);
  if (/\/commits\/[0-9a-f]+\/pulls$/.test(p))
    return body.map((x) => ({
      number: x.number,
      merged_at: x.merged_at,
      base: { ref: x.base.ref },
    }));
  return body;
}

const responses = [];
const recordingFetch = async (url, init) => {
  if ((init?.headers ?? {}).authorization) throw new Error("a recording is anonymous: no token");
  const res = await fetch(url, init);
  const text = await res.clone().text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const path = url.startsWith(BASE) ? url.slice(BASE.length) : url;
  const headers = {};
  for (const h of ["x-ratelimit-remaining", "x-ratelimit-resource", "link"])
    if (res.headers.get(h) !== null) headers[h] = res.headers.get(h);
  responses.push({ path, status: res.status, headers, body: trim(path, body) });
  return res;
};

const gh = new GitHub({ token: null, fetch: recordingFetch });
const report = await runAudit({ repo, period, gh, now, concurrency: 2 });
writeFileSync(
  values.out,
  JSON.stringify(
    {
      recorded_at: now.toISOString(),
      note: `One anonymous run of agent-merge-audit against the public repository ${repo}, ${period.since} to ${period.until}: read-only GETs to api.github.com with no token. Bodies are trimmed to the fields the audit reads; people's email addresses are replaced with ${REDACTED}.`,
      responses,
    },
    null,
    1,
  ) + "\n",
);
process.stdout.write(renderSummary(report, [values.out]));
