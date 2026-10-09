// src/errors.ts
var CliError = class extends Error {
  code;
  cause;
  fix;
  retryable;
  /** 2 for a usage mistake, 1 for anything else */
  exitCode;
  constructor(p, exitCode = 1) {
    super(`${p.code}: ${p.cause}`);
    this.name = "CliError";
    this.code = p.code;
    this.cause = p.cause;
    this.fix = p.fix;
    this.retryable = p.retryable;
    this.exitCode = exitCode;
  }
  toJSON() {
    return { code: this.code, cause: this.cause, fix: this.fix, retryable: this.retryable };
  }
};
function usage(cause, fix) {
  return new CliError({ code: "BAD_ARGUMENTS", cause, fix, retryable: false }, 2);
}

// src/handoff.ts
var NOT_ADVICE = "Not audit advice: this lists what GitHub's records show. Whether it meets your controls is for you and your auditor.";
var FLOOR_NOTE = "Agents are found by the signatures they leave (bot accounts, commit identities, co-author trailers, PR-body markers). An agent that leaves none, or a trailer someone removed, is not found, so the count is a floor.";
var SITE = "https://agentwares-agentguard.vercel.app";
var REF = "agent-merge-audit";
var PAGES_URL = `${SITE}/merge-audit`;
var HANDOFF_URL = `${PAGES_URL}?ref=${REF}#record`;
var HANDOFF_LINE = "A continuous, hash-chained record of every agent change, kept across your audit window, is not built.";
var HANDOFF_DETAIL = "It would record each merge as it happens (who or what wrote it, who approved it, who merged it, under which rule) in okgate's hash-chained log, with a quarterly CC8.1 export and a read-only link for your auditor. What works today, free: okgate's hook mode holds an agent's git push or merge in Claude Code, Codex and Gemini CLI until a person types the go-ahead, and logs each decision in a hash-chained log on your machine (`okgate verify` checks it). If you would pay for the record, say so with one click:";
var OKGATE_HOOKS = "npx -p @agentwares/agentguard okgate hooks install";

// src/period.ts
var DAY = 864e5;
var iso = (d) => d.toISOString().slice(0, 10);
function day(raw, flag) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const d = m ? /* @__PURE__ */ new Date(`${raw}T00:00:00Z`) : null;
  if (!d || Number.isNaN(d.getTime()) || iso(d) !== raw)
    throw usage(`${flag} takes a date as YYYY-MM-DD, got "${raw}"`, `e.g. \`${flag} 2026-07-01\``);
  return raw;
}
function namedPeriod(raw) {
  const month = /^(\d{4})-(\d{2})$/.exec(raw);
  if (month) {
    const y = Number(month[1]);
    const mo = Number(month[2]);
    if (mo >= 1 && mo <= 12)
      return {
        since: iso(new Date(Date.UTC(y, mo - 1, 1))),
        until: iso(new Date(Date.UTC(y, mo, 0)))
      };
  }
  const q = /^(\d{4})-[Qq]([1-4])$/.exec(raw);
  if (q) {
    const y = Number(q[1]);
    const n = Number(q[2]);
    return {
      since: iso(new Date(Date.UTC(y, (n - 1) * 3, 1))),
      until: iso(new Date(Date.UTC(y, n * 3, 0)))
    };
  }
  throw usage(
    `--period takes a month (2026-09) or a quarter (2026-Q3), got "${raw}"`,
    "e.g. `--period 2026-Q3`, or `--since 2026-07-01 --until 2026-09-30`"
  );
}
function resolvePeriod(flags, now) {
  const today = iso(now);
  let p;
  if (flags.period !== void 0) {
    if (flags.since !== void 0 || flags.until !== void 0)
      throw usage("--period cannot be combined with --since or --until", "give one or the other");
    p = namedPeriod(flags.period);
    if (p.until > today && p.since <= today) p = { ...p, until: today };
  } else {
    const until = flags.until !== void 0 ? day(flags.until, "--until") : today;
    const since = flags.since !== void 0 ? day(flags.since, "--since") : iso(new Date((/* @__PURE__ */ new Date(`${until}T00:00:00Z`)).getTime() - 29 * DAY));
    p = { since, until };
  }
  if (p.since > today)
    throw usage(`the period starts after today (${today})`, "give a period that has begun");
  if (p.until > today)
    throw usage(`--until ${p.until} is after today (${today})`, "give a date up to today");
  if (p.since > p.until)
    throw usage(`the period runs backwards: ${p.since} is after ${p.until}`, "swap the dates");
  return p;
}
function months(p) {
  const out = [];
  let start = p.since;
  while (start <= p.until) {
    const d = /* @__PURE__ */ new Date(`${start}T00:00:00Z`);
    const end = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
    const until = end < p.until ? end : p.until;
    out.push({ since: start, until });
    start = iso(new Date((/* @__PURE__ */ new Date(`${until}T00:00:00Z`)).getTime() + DAY));
  }
  return out;
}

// src/signatures.ts
var SIGNATURES_READ = "2026-10-09";
var SEARCH = "GitHub search API, read 9 Oct 2026";
var AGENTS = [
  {
    id: "copilot-coding-agent",
    name: "GitHub Copilot coding agent",
    logins: ["copilot-swe-agent[bot]"],
    apps: ["copilot-swe-agent"],
    seen: `PR author \`Copilot\` (app copilot-swe-agent) on 1,528,286 merged PRs (${SEARCH}); commits co-authored by the person who asked (docs.github.com, Copilot coding agent)`
  },
  {
    id: "copilot-code-review",
    name: "GitHub Copilot code review",
    logins: ["copilot-pull-request-reviewer[bot]"],
    apps: ["copilot-pull-request-reviewer"],
    seen: "reviewer `Copilot` (app copilot-pull-request-reviewer); its approval can count toward required approvals since 1 Sep 2026 (github.blog changelog)"
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    logins: ["copilot"],
    emails: ["copilot@github.com"],
    emailSuffixes: ["+copilot@users.noreply.github.com"],
    names: ["^copilot\\b"],
    seen: `\`Co-authored-by: Copilot <copilot@github.com>\` on 154,211 commits (VS Code's git.addAICoAuthor, on by default since May 2026), and Copilot's noreply identity on its own commits (${SEARCH})`
  },
  {
    id: "claude-app",
    name: "Claude GitHub app",
    logins: ["claude[bot]"],
    apps: ["claude"],
    emailSuffixes: ["+claude[bot]@users.noreply.github.com"],
    seen: `\`claude[bot]\` as author of 61,813 commits and 51,287 merged PRs (${SEARCH})`
  },
  {
    id: "claude-code",
    name: "Claude Code",
    emails: ["noreply@anthropic.com"],
    names: ["^claude\\b"],
    markers: ["Generated with [Claude Code]", "claude.ai/code/session_"],
    seen: `\`Co-Authored-By: Claude \u2026 <noreply@anthropic.com>\` on 9,684,405 commits and "Generated with [Claude Code]" on 3,811,947 (${SEARCH}); Claude Code adds both by default`
  },
  {
    id: "cursor",
    name: "Cursor agent",
    logins: ["cursor[bot]", "cursoragent"],
    apps: ["cursor"],
    emails: ["cursoragent@cursor.com"],
    names: ["^cursor agent$"],
    markers: ["cursor.com/agents", "cursor.com/background-agent"],
    seen: `\`Co-authored-by: Cursor <cursoragent@cursor.com>\` on 4,530,975 commits; \`cursor[bot]\` on 29,148 merged PRs (${SEARCH})`
  },
  {
    id: "codex",
    name: "OpenAI Codex",
    logins: ["chatgpt-codex-connector[bot]"],
    apps: ["chatgpt-codex-connector"],
    emails: ["codex@openai.com"],
    names: ["^(openai )?codex$"],
    markers: ["chatgpt.com/codex/tasks/"],
    seen: `\`Co-authored-by: Codex <codex@openai.com>\` on 262,677 commits; Codex cloud links its task in the PR body (${SEARCH})`
  },
  {
    id: "devin",
    name: "Devin",
    logins: ["devin-ai-integration[bot]"],
    apps: ["devin-ai-integration"],
    emailSuffixes: ["+devin-ai-integration[bot]@users.noreply.github.com"],
    names: ["^devin ai$"],
    markers: ["app.devin.ai/sessions/"],
    seen: `\`devin-ai-integration[bot]\` as author of 435,807 commits and 184,741 merged PRs (${SEARCH})`
  },
  {
    id: "jules",
    name: "Google Jules",
    logins: ["google-labs-jules[bot]"],
    apps: ["google-labs-jules"],
    emailSuffixes: ["+google-labs-jules[bot]@users.noreply.github.com"],
    markers: ["jules.google.com/task"],
    seen: `\`google-labs-jules[bot]\` as author of 1,269,140 commits and 205,227 merged PRs (${SEARCH})`
  },
  {
    id: "amp",
    name: "Amp",
    emails: ["amp@ampcode.com"],
    trailers: ["amp-thread-id", "amp-thread"],
    markers: ["ampcode.com/threads/"],
    seen: `\`Co-authored-by: Amp <amp@ampcode.com>\` with an \`Amp-Thread-ID\` trailer on 107,241 commits (${SEARCH})`
  },
  {
    id: "gemini",
    name: "Google Gemini",
    logins: ["gemini-code-assist[bot]"],
    apps: ["gemini-code-assist"],
    emails: ["gemini-ai@google.com"],
    emailSuffixes: ["+gemini-code-assist[bot]@users.noreply.github.com"],
    names: ["^gemini\\b"],
    seen: `\`Co-authored-by: Gemini \u2026\` on 130,125 commits, including gemini-code-assist's suggestions (${SEARCH})`
  },
  {
    id: "openhands",
    name: "OpenHands",
    logins: ["openhands-agent"],
    emails: ["openhands@all-hands.dev"],
    seen: `\`Co-authored-by: openhands <openhands@all-hands.dev>\` on 239,443 commits (${SEARCH})`
  },
  {
    id: "aider",
    name: "aider",
    emails: ["noreply@aider.chat"],
    names: ["^aider\\b"],
    seen: `\`Co-authored-by: aider (<model>) <noreply@aider.chat>\` on 202 commits (${SEARCH})`
  },
  {
    id: "entire",
    name: "an agent session recorded by Entire",
    trailers: ["entire-checkpoint"],
    seen: `\`Entire-Checkpoint:\` on 97,375 commits; Entire records the agent session behind a commit (${SEARCH}; kosli.com, 27 Feb 2026)`
  },
  {
    id: "coderabbit",
    name: "CodeRabbit (AI review)",
    logins: ["coderabbitai[bot]"],
    apps: ["coderabbitai"],
    seen: "an AI reviewer: its approval is a bot's, not a person's"
  }
];
var DECLARED_TRAILERS = [
  "assisted-by",
  "generated-by",
  "ai-assisted-by"
];
var MODEL_WORDS = /\b(claude|anthropic|gpt|openai|codex|copilot|gemini|cursor|llama|mistral|deepseek|qwen|grok|devin|jules|amp|aider|windsurf|cascade|kiro|opencode|llm)\b/i;
var DECLARED = {
  id: "declared",
  name: "declared AI help",
  seen: `\`Assisted-by:\` on 97,753 commits (${SEARCH}); counted only when its value names a model or agent`
};
var AUTOMATION_LOGINS = [
  "dependabot[bot]",
  "renovate[bot]",
  "github-actions[bot]",
  "github-merge-queue[bot]",
  "release-please[bot]",
  "mergify[bot]",
  "pre-commit-ci[bot]",
  "kodiakhq[bot]",
  "web-flow"
];
function appFromUrl(url) {
  const m = /github\.com\/apps\/([A-Za-z0-9-]+)/.exec(url ?? "");
  return m ? m[1].toLowerCase() : null;
}
function classifyActor(a) {
  const login = a.login.toLowerCase();
  const app = a.app?.toLowerCase() ?? null;
  if (app) {
    const byApp = AGENTS.find((s) => s.apps?.includes(app));
    if (byApp) return { kind: "agent", agent: byApp };
  }
  const byLogin = AGENTS.find((s) => s.logins?.includes(login));
  if (byLogin) return { kind: "agent", agent: byLogin };
  if (AUTOMATION_LOGINS.includes(login) || login.endsWith("[bot]") || a.type === "Bot")
    return { kind: "automation" };
  return { kind: "human" };
}
function identify(name, email) {
  const e = email.trim().toLowerCase();
  const n = name.trim();
  for (const s of AGENTS) {
    if (e && s.emails?.includes(e)) return { agent: s, by: "email" };
    if (e && s.emailSuffixes?.some((x) => e.endsWith(x))) return { agent: s, by: "email" };
  }
  const generic = e === "" || /noreply|no-reply/.test(e);
  if (generic) {
    for (const s of AGENTS)
      if (s.names?.some((r) => new RegExp(r, "i").test(n))) return { agent: s, by: "name" };
  }
  return null;
}
function agentByIdentity(name, email) {
  return identify(name, email)?.agent ?? null;
}
function shown(name, email) {
  const id = identify(name, email);
  return id?.by === "email" ? `${name} <${email}>` : name;
}
function loginFromEmail(email) {
  const m = /^(?:\d+\+)?([A-Za-z0-9-]+(?:\[bot\])?)@users\.noreply\.github\.com$/i.exec(
    email.trim()
  );
  return m ? m[1].toLowerCase() : null;
}
function parseTrailers(message) {
  const out = [];
  for (const line of message.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z][A-Za-z0-9-]*):\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (!key.includes("-") && key !== "assisted" && key !== "generated") continue;
    const value = m[2];
    const who2 = /^(.*?)\s*<([^>]*)>\s*$/.exec(value);
    out.push({
      key,
      value,
      name: who2 ? who2[1].trim() : value.trim(),
      email: who2 ? who2[2].trim() : ""
    });
  }
  return out;
}
function agentsInCommit(c) {
  const out = [];
  const byLogin = c.authorLogin ? classifyActor({ login: c.authorLogin, type: c.authorType, app: c.authorApp }).agent : void 0;
  if (byLogin) out.push({ agent: byLogin, how: `commit author ${c.authorLogin}` });
  else {
    const byIdentity = agentByIdentity(c.authorName, c.authorEmail);
    if (byIdentity)
      out.push({ agent: byIdentity, how: `commit author ${shown(c.authorName, c.authorEmail)}` });
  }
  for (const t of parseTrailers(c.message)) {
    if (t.key === "co-authored-by") {
      const s2 = agentByIdentity(t.name, t.email);
      if (s2) out.push({ agent: s2, how: `Co-authored-by: ${shown(t.name, t.email)}` });
      continue;
    }
    if (DECLARED_TRAILERS.includes(t.key)) {
      if (MODEL_WORDS.test(t.value))
        out.push({ agent: DECLARED, how: `${t.key}: ${bare(t.value)}`.slice(0, 120) });
      continue;
    }
    const s = AGENTS.find((x) => x.trailers?.includes(t.key));
    if (s) out.push({ agent: s, how: `${t.key}: ${bare(t.value)}`.slice(0, 120) });
  }
  for (const m of markersIn(c.message, "commit message"))
    if (!out.some((x) => x.agent.id === m.agent.id)) out.push(m);
  return out;
}
var bare = (v) => v.replace(/\s*<[^>]*>/g, "").trim();
function markersIn(text, where) {
  const out = [];
  for (const s of AGENTS)
    for (const m of s.markers ?? [])
      if (text.includes(m)) {
        out.push({ agent: s, how: `${where}: ${m}` });
        break;
      }
  return out;
}
function humanCoAuthors(message) {
  return parseTrailers(message).filter((t) => t.key === "co-authored-by" && !agentByIdentity(t.name, t.email)).map((t) => ({ name: t.name, login: loginFromEmail(t.email) }));
}

// src/version.ts
import { readFileSync } from "fs";
var cached;
function version() {
  if (cached !== void 0) return cached;
  try {
    cached = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  } catch {
    cached = "0.0.0";
  }
  return cached;
}

// src/audit.ts
var EXCEPTIONS = {
  "agent-no-human-approval": {
    title: "An agent wrote it, and no independent person approved it",
    ask: "Who reviewed this agent's change before it merged, and where is that recorded?"
  },
  "no-approval": {
    title: "Merged with no approval",
    ask: "Why did this merge without review? If it was an emergency change, where is the review after it?"
  },
  "self-approval-only": {
    title: "Approved only by its own author or co-author",
    ask: "Who other than the people who wrote it reviewed it?"
  },
  "bot-approval-only": {
    title: "Approved only by a bot or an AI reviewer",
    ask: "Is an automated approval part of your documented review control, and who designed it?"
  },
  "stale-approval": {
    title: "Approved before its last commit",
    ask: "Who reviewed the commits added after the approval?"
  },
  "merged-by-bot": {
    title: "Merged by a bot or agent account",
    ask: "Which person authorised this merge?"
  },
  "rule-bypassed": {
    title: "The branch rule was bypassed",
    ask: "Who bypassed the rule, and why?"
  },
  "unapproved-while-rule-requires": {
    title: "No approval, though the branch rule now requires one",
    ask: "Was the rule added after this merge, or was it bypassed or exempted?"
  },
  "direct-push": {
    title: "On the branch without a merged pull request",
    ask: "Why did this change reach the branch without a reviewed pull request?"
  }
};
var lower = (s) => s.toLowerCase();
function person(u, app) {
  if (!u?.login) return null;
  const c = classifyActor({ login: u.login, type: u.type, app: app ?? appFromUrl(u.html_url) });
  return c.agent ? { login: u.login, kind: c.kind, agent: c.agent.name } : { login: u.login, kind: c.kind };
}
var isMergeCommit = (c) => c.parents.length > 1;
function involvement(author, authorApp, body, commits) {
  const own = commits.filter((c) => !isMergeCommit(c));
  const evidence = [];
  const agents = /* @__PURE__ */ new Set();
  let authored = false;
  let mentioned = false;
  if (author.kind === "agent") {
    authored = true;
    agents.add(author.agent);
    evidence.push(`opened by ${author.login}${authorApp ? ` (app ${authorApp})` : ""}`);
  }
  const counts = /* @__PURE__ */ new Map();
  for (const c of own) {
    const seen = /* @__PURE__ */ new Set();
    for (const m of agentsInCommit({
      authorName: c.commit.author?.name ?? "",
      authorEmail: c.commit.author?.email ?? "",
      authorLogin: c.author?.login ?? null,
      authorType: c.author?.type,
      authorApp: appFromUrl(c.author?.html_url),
      message: c.commit.message
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
  for (const a of [...agents])
    if ([...agents].some((b) => b !== a && b.startsWith(`${a} `))) agents.delete(a);
  return {
    role: authored ? "author" : mentioned ? "co-author" : null,
    agents: [...agents].sort(),
    evidence
  };
}
function writers(author, commits) {
  const out = /* @__PURE__ */ new Set();
  if (author.kind === "human") out.add(lower(author.login));
  for (const c of commits) {
    if (isMergeCommit(c)) continue;
    if (c.author?.login) out.add(lower(c.author.login));
    for (const co of humanCoAuthors(c.commit.message)) if (co.login) out.add(co.login);
  }
  return out;
}
function approvalsOf(timeline, mergedAt, self, lastCommitAt) {
  const latest = /* @__PURE__ */ new Map();
  const reviews = timeline.filter((e) => e.event === "reviewed" && e.user?.login && e.submitted_at).sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  for (const e of reviews) {
    if (e.submitted_at > mergedAt) continue;
    const state = lower(e.state ?? "");
    if (!["approved", "changes_requested", "dismissed"].includes(state)) continue;
    const p = person(e.user);
    latest.set(lower(p.login), { e, p });
  }
  const out = [];
  for (const { e, p } of latest.values()) {
    if (lower(e.state ?? "") !== "approved") continue;
    out.push({
      ...p,
      at: e.submitted_at,
      independent: p.kind === "human" && !self.has(lower(p.login)),
      stale: lastCommitAt !== null && e.submitted_at < lastCommitAt
    });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
function approvalClass(approvals) {
  const independent = approvals.filter((a) => a.independent);
  if (independent.some((a) => !a.stale)) return "independent";
  if (independent.length) return "stale";
  if (approvals.some((a) => a.kind === "human")) return "self";
  if (approvals.length) return "bot";
  return "none";
}
function mergedBy(timeline) {
  const merged2 = timeline.find((e) => e.event === "merged");
  const by = person(merged2?.actor);
  const commit2 = merged2?.commit_id ?? null;
  const at = merged2?.created_at ?? null;
  if (by && by.kind !== "human") {
    const queued = timeline.filter(
      (e) => (e.event === "added_to_merge_queue" || e.event === "auto_merge_enabled" || e.event === "auto_squash_enabled" || e.event === "auto_rebase_enabled") && (!at || (e.created_at ?? "") <= at)
    ).map((e) => ({ e, p: person(e.actor) })).filter((x) => x.p?.kind === "human").pop();
    if (queued)
      return {
        by: queued.p,
        via: queued.e.event === "added_to_merge_queue" ? "merge queue" : "auto-merge",
        commit: commit2,
        at
      };
  }
  return { by, commit: commit2, at };
}
function exceptionsOf(row, rules) {
  const out = [];
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
function readRules(branchRules, classic, suites, anonymous) {
  const review2 = [];
  const notes = [];
  const bool = (v) => typeof v === "boolean" ? v : null;
  for (const r of branchRules ?? []) {
    if (r.type !== "pull_request") continue;
    const p = r.parameters ?? {};
    review2.push({
      source: `ruleset ${r.ruleset_id ?? "?"}${r.ruleset_source ? ` (${r.ruleset_source_type === "Organization" ? "organization" : "repository"} ${r.ruleset_source})` : ""}`,
      approvals: typeof p.required_approving_review_count === "number" ? p.required_approving_review_count : 0,
      last_push_approval: bool(p.require_last_push_approval),
      dismiss_stale: bool(p.dismiss_stale_reviews_on_push),
      code_owners: bool(p.require_code_owner_review)
    });
  }
  const copilot2 = (branchRules ?? []).some((r) => r.type === "copilot_code_review");
  let classicState = "none";
  if (classic.status === 200 && classic.body) {
    classicState = "read";
    const pr = classic.body.required_pull_request_reviews;
    if (pr)
      review2.push({
        source: `classic branch protection${classic.body.enforce_admins?.enabled ? " (admins included)" : " (admins not included)"}`,
        approvals: pr.required_approving_review_count ?? 0,
        last_push_approval: pr.require_last_push_approval ?? null,
        dismiss_stale: pr.dismiss_stale_reviews ?? null,
        code_owners: pr.require_code_owner_reviews ?? null
      });
  } else if (classic.status === 401 || classic.status === 403 || anonymous) {
    classicState = "not-readable";
    notes.push(
      "Classic branch protection is readable only with a token from an admin of the repo; rulesets are read without one."
    );
  }
  if (copilot2)
    notes.push(
      "A ruleset turns on Copilot code review here. Since 1 Sep 2026 an admin can let Copilot's approval count toward required approvals, so a required approval is not always a person's."
    );
  notes.push(
    suites === "read" ? "Each merge's rule evaluation was read from GitHub's rule insights, which keep one month." : "Each merge's rule evaluation (pass, bypass) is kept by GitHub for one month and needs a token with admin read on the repo; it was not read, so the rules above are as they are now, not as they were at each merge."
  );
  return {
    review: review2,
    requires_approvals: Math.max(0, ...review2.map((r) => r.approvals)),
    copilot_review: copilot2,
    classic: classicState,
    at_merge: suites,
    notes
  };
}
var enc = encodeURIComponent;
async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}
var MAX_SEARCH_PAGES = 10;
async function runAudit(input) {
  const { gh, period } = input;
  const anonymous = !gh.token;
  const incomplete = [];
  const repoRes = await gh.get(`/repos/${input.repo}`);
  if (!repoRes.body)
    throw new CliError({
      code: "REPO_NOT_FOUND",
      cause: `GitHub has no repository ${input.repo} that ${anonymous ? "can be read without a token" : "this token can read"}`,
      fix: anonymous ? "check the spelling; a private repo needs your token (`gh auth login`, or GITHUB_TOKEN)" : "check the owner/repo spelling, and that the token can read this repo",
      retryable: false
    });
  const repo = repoRes.body;
  const name = repo.full_name;
  const base = input.base ?? repo.default_branch;
  const items = [];
  for (const m of months(period)) {
    const q = `repo:${name} is:pr is:merged base:${base} merged:${m.since}..${m.until}`;
    let path2 = `/search/issues?q=${enc(q)}&per_page=100`;
    let pages = 0;
    while (path2 && pages < MAX_SEARCH_PAGES) {
      const got = await gh.get(path2);
      if (!got.body) break;
      if (got.body.total_count > 1e3)
        throw new CliError({
          code: "PERIOD_TOO_LARGE",
          cause: `${got.body.total_count} PRs merged into ${base} in ${m.since.slice(0, 7)}; GitHub's search returns at most 1,000 a query`,
          fix: "give a shorter period with --since and --until, within one half of that month",
          retryable: false
        });
      if (got.body.incomplete_results && !incomplete.some((s) => s.startsWith("GitHub's search")))
        incomplete.push(
          "GitHub's search said its results were incomplete (it timed out); run it again to check the count."
        );
      items.push(...got.body.items);
      path2 = got.next;
      pages++;
    }
  }
  const merged2 = [...new Map(items.map((i) => [i.number, i])).values()].sort(
    (a, b) => (a.pull_request?.merged_at ?? "").localeCompare(b.pull_request?.merged_at ?? "")
  );
  const branchRules = await gh.get(`/repos/${name}/rules/branches/${enc(base)}`, {
    soft: true
  });
  const classic = anonymous ? { status: 0, body: null } : await gh.get(`/repos/${name}/branches/${enc(base)}/protection`, {
    soft: true
  });
  const suiteBySha = /* @__PURE__ */ new Map();
  let suites = "not-readable";
  if (!anonymous) {
    const s = await gh.all(
      `/repos/${name}/rulesets/rule-suites?ref=${enc(`refs/heads/${base}`)}&time_period=month&per_page=100`,
      10,
      { soft: true }
    );
    if (s.status === 200) {
      suites = "read";
      for (const x of s.items) if (x.after_sha) suiteBySha.set(x.after_sha, x.result);
      if (s.truncated)
        incomplete.push(
          "More than 1,000 rule evaluations in the last month; the oldest were not read."
        );
    }
  }
  const rules = readRules(
    branchRules.status === 200 ? branchRules.body : null,
    classic,
    suites,
    anonymous
  );
  const need = merged2.length * 2 + 2;
  if (gh.remaining.core !== null && gh.remaining.core < need)
    throw new CliError({
      code: "RATE_LIMITED",
      cause: `this period needs about ${need} requests to GitHub's API for ${merged2.length} merged PRs, and ${gh.remaining.core} are left this hour${anonymous ? " (60 an hour without a token)" : ""}`,
      fix: anonymous ? "sign in with `gh auth login`, or set GITHUB_TOKEN, for 5,000 an hour; or shorten the period" : "shorten the period, or wait for the hourly reset",
      retryable: true
    });
  const monthAgo = new Date(input.now.getTime() - 30 * 864e5).toISOString();
  const prCommitShas = /* @__PURE__ */ new Set();
  const prCommitKeys = /* @__PURE__ */ new Set();
  const key = (c) => `${lower(c.commit.author?.email ?? "")}|${c.commit.author?.date ?? ""}|${c.commit.message.split("\n")[0]}`;
  const prs = await mapLimit(merged2, input.concurrency ?? 4, async (item) => {
    const tl = await gh.all(
      `/repos/${name}/issues/${item.number}/timeline?per_page=100`,
      5
    );
    const cm = await gh.all(
      `/repos/${name}/pulls/${item.number}/commits?per_page=100`,
      3
    );
    if (tl.truncated || cm.truncated)
      incomplete.push(
        `#${item.number}: more than ${tl.truncated ? "500 timeline events" : "300 commits"}; the rest were not read.`
      );
    for (const c of cm.items) {
      prCommitShas.add(c.sha);
      prCommitKeys.add(key(c));
    }
    const app = item.performed_via_github_app?.slug ?? appFromUrl(item.user?.html_url) ?? null;
    const author = person(item.user, app) ?? { login: "(deleted account)", kind: "human" };
    const m = mergedBy(tl.items);
    const mergedAt = item.pull_request?.merged_at ?? m.at ?? "";
    const own = cm.items.filter((c) => !isMergeCommit(c));
    const lastCommitAt = own.map((c) => c.commit.committer?.date ?? c.commit.author?.date ?? "").filter(Boolean).sort().pop() ?? null;
    const self = writers(author, cm.items);
    const approvals = approvalsOf(tl.items, mergedAt, self, lastCommitAt);
    const approval = approvalClass(approvals);
    let ruleAt = "not-readable";
    if (suites === "read") {
      const r = m.commit ? suiteBySha.get(m.commit) : void 0;
      ruleAt = r === "pass" || r === "bypass" || r === "fail" ? r : mergedAt < monthAgo ? "older-than-a-month" : "none-recorded";
    }
    const agent = involvement(
      author,
      author.kind === "agent" ? app : null,
      item.body ?? "",
      cm.items
    );
    const row = {
      number: item.number,
      title: item.title,
      url: item.html_url,
      created_at: item.created_at,
      merged_at: mergedAt,
      author,
      merged_by: m.by,
      ...m.via ? { merged_via: m.via } : {},
      merge_commit: m.commit,
      agent,
      commits: own.length,
      last_commit_at: lastCommitAt,
      approvals,
      approval,
      rule_at_merge: ruleAt
    };
    return { ...row, exceptions: exceptionsOf(row, rules) };
  });
  const onBase = await gh.all(
    `/repos/${name}/commits?sha=${enc(base)}&since=${period.since}T00:00:00Z&until=${period.until}T23:59:59Z&per_page=100`,
    10
  );
  if (onBase.truncated)
    incomplete.push(
      "More than 1,000 commits on the branch in the period; the rest were not checked for direct pushes."
    );
  const mergeShas = new Set(prs.map((p) => p.merge_commit).filter((s) => !!s));
  const numbers = new Set(prs.map((p) => p.number));
  const unmatched = onBase.items.filter((c) => {
    if (mergeShas.has(c.sha) || prCommitShas.has(c.sha) || prCommitKeys.has(key(c))) return false;
    const first = c.commit.message.split("\n")[0] ?? "";
    const n = /\(#(\d+)\)\s*$/.exec(first)?.[1] ?? /^Merge pull request #(\d+)/.exec(first)?.[1];
    return !(n && numbers.has(Number(n)));
  });
  const budget = gh.remaining.core === null ? 300 : Math.max(0, Math.min(300, gh.remaining.core - 1));
  const toLook = unmatched.slice(0, budget);
  const unchecked = unmatched.slice(budget).map((c) => c.sha);
  if (unchecked.length)
    incomplete.push(
      `${unchecked.length} commit${unchecked.length === 1 ? "" : "s"} on the branch could not be matched to a pull request within the request budget; they are listed, unchecked.`
    );
  const looked = await mapLimit(toLook, input.concurrency ?? 4, async (c) => {
    const pulls = await gh.get(`/repos/${name}/commits/${c.sha}/pulls`);
    const fromPr = (pulls.body ?? []).some((p) => p.merged_at && p.base.ref === base);
    return { c, fromPr };
  });
  const pushes = looked.filter((x) => !x.fromPr).map(({ c }) => {
    const author = person(c.author) ?? {
      login: c.commit.author?.name ?? "(unknown)",
      kind: "human"
    };
    const committer = c.committer?.login === "web-flow" ? null : person(c.committer);
    const agent = involvement(
      author.kind === "agent" ? author : { ...author, kind: "human" },
      null,
      "",
      [c]
    );
    const exceptions = ["direct-push"];
    if (agent.role !== null) exceptions.unshift("agent-no-human-approval");
    return {
      sha: c.sha,
      url: c.html_url ?? `${repo.html_url}/commit/${c.sha}`,
      title: c.commit.message.split("\n")[0] ?? "",
      at: c.commit.committer?.date ?? c.commit.author?.date ?? "",
      author,
      committer,
      agent,
      exceptions
    };
  }).sort((a, b) => a.at.localeCompare(b.at));
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
    handoff: { line: HANDOFF_LINE, detail: HANDOFF_DETAIL, url: HANDOFF_URL }
  };
}
function summarise(prs, pushes, commitsOnBase, unchecked) {
  const byAgent = {};
  const exceptions = {};
  for (const p of prs) for (const a of p.agent.agents) byAgent[a] = (byAgent[a] ?? 0) + 1;
  for (const r of [...prs, ...pushes])
    for (const e of r.exceptions) exceptions[e] = (exceptions[e] ?? 0) + 1;
  return {
    merged_prs: prs.length,
    agent_prs: prs.filter((p) => p.agent.role !== null).length,
    by_agent: byAgent,
    agent_without_independent_approval: prs.filter(
      (p) => p.exceptions.includes("agent-no-human-approval")
    ).length,
    independent_approval: prs.filter((p) => p.approval === "independent").length,
    prs_with_exceptions: prs.filter((p) => p.exceptions.length > 0).length,
    exceptions,
    commits_on_base: commitsOnBase,
    direct_pushes: pushes.length,
    commits_unchecked: unchecked
  };
}

// src/demo.ts
var DEMO_REPO = "octo-org/demo-app";
var DEMO_PERIOD = "2026-09";
var R = `/repos/${DEMO_REPO}`;
var HTML = `https://github.com/${DEMO_REPO}`;
var user = (login, type = "User", app) => ({
  login,
  type,
  html_url: app ? `https://github.com/apps/${app}` : `https://github.com/${login}`
});
var ANA = user("octo-ana");
var BEN = user("octo-ben");
var CAM = user("octo-cam");
var COPILOT_AGENT = user("Copilot", "Bot", "copilot-swe-agent");
var COPILOT_REVIEW = user("Copilot", "Bot", "copilot-pull-request-reviewer");
var CURSOR = user("cursoragent");
var DEPENDABOT = user("dependabot[bot]", "Bot", "dependabot");
var CLAUDE_BOT = user("claude[bot]", "Bot", "claude");
var RELEASE_BOT = user("octo-release-bot[bot]", "Bot", "octo-release-bot");
var QUEUE = user("github-merge-queue[bot]", "Bot", "github-merge-queue");
var shaN = 0;
var sha = (_tag) => `d${(++shaN).toString(16).padStart(7, "0")}`.repeat(5);
function commit(s, author, date, message, parents = 1) {
  return {
    sha: s,
    html_url: `${HTML}/commit/${s}`,
    commit: {
      author: { name: author.name, email: author.email, date },
      committer: { name: author.name, email: author.email, date },
      message
    },
    author: author.login,
    committer: author.login,
    parents: Array.from({ length: parents }, (_, i) => ({ sha: `${"0".repeat(39)}${i}` }))
  };
}
var review = (u, state, at) => ({
  event: "reviewed",
  user: u,
  state,
  submitted_at: at
});
var merged = (u, at, s) => ({
  event: "merged",
  actor: u,
  created_at: at,
  commit_id: s
});
var ana = { name: "Ana Example", email: "ana@example.com", login: ANA };
var copilot = {
  name: "Copilot",
  email: "198982749+Copilot@users.noreply.github.com",
  login: COPILOT_AGENT
};
var cursor = { name: "Cursor Agent", email: "cursoragent@cursor.com", login: CURSOR };
var dependabot = {
  name: "dependabot[bot]",
  email: "49699333+dependabot[bot]@users.noreply.github.com",
  login: DEPENDABOT
};
var claudeBot = {
  name: "claude[bot]",
  email: "209825114+claude[bot]@users.noreply.github.com",
  login: CLAUDE_BOT
};
var s102 = sha("102");
var s104a = sha("104");
var s104b = sha("104");
var PRS = [
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
      merged(ANA, "2026-09-03T15:10:00Z", sha("m101"))
    ]
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
        "Fix timezone handling in invoice dates\n\nCo-authored-by: octo-ben <2001+octo-ben@users.noreply.github.com>"
      )
    ],
    timeline: [
      review(COPILOT_REVIEW, "commented", "2026-09-08T10:40:00Z"),
      review(BEN, "approved", "2026-09-09T11:00:00Z"),
      merged(BEN, "2026-09-09T11:30:00Z", sha("m102"))
    ]
  },
  {
    number: 103,
    title: "Move session storage to Redis",
    author: CAM,
    body: "Session storage moves from memory to Redis.\n\n\u{1F916} Generated with [Claude Code](https://claude.com/claude-code)",
    created: "2026-09-14T13:00:00Z",
    merged: "2026-09-15T09:00:00Z",
    commits: [
      commit(
        sha("103"),
        { name: "Cam Example", email: "cam@example.com", login: CAM },
        "2026-09-14T12:50:00Z",
        "Move session storage to Redis\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
      )
    ],
    timeline: [
      review(COPILOT_REVIEW, "approved", "2026-09-14T13:20:00Z"),
      merged(CAM, "2026-09-15T09:00:00Z", sha("m103"))
    ]
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
        "Paginate the audit log API\n\nCo-authored-by: Ben Example <ben@example.com>"
      ),
      commit(
        s104b,
        cursor,
        "2026-09-18T15:30:00Z",
        "Raise the page size limit to 500\n\nCo-authored-by: Ben Example <ben@example.com>"
      )
    ],
    timeline: [
      review(ANA, "approved", "2026-09-17T12:00:00Z"),
      merged(BEN, "2026-09-18T16:00:00Z", sha("m104"))
    ]
  },
  {
    number: 105,
    title: "Bump undici from 7.2.0 to 7.2.3",
    author: DEPENDABOT,
    body: "Bumps undici from 7.2.0 to 7.2.3.",
    created: "2026-09-21T04:00:00Z",
    merged: "2026-09-21T09:15:00Z",
    commits: [
      commit(sha("105"), dependabot, "2026-09-21T03:59:00Z", "Bump undici from 7.2.0 to 7.2.3")
    ],
    timeline: [
      { event: "added_to_merge_queue", actor: CAM, created_at: "2026-09-21T09:00:00Z" },
      merged(QUEUE, "2026-09-21T09:15:00Z", sha("m105"))
    ]
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
        "Add a retry to the webhook sender\n\nCo-authored-by: octo-cam <2003+octo-cam@users.noreply.github.com>"
      )
    ],
    timeline: [
      review(ANA, "approved", "2026-09-24T15:00:00Z"),
      merged(RELEASE_BOT, "2026-09-24T17:45:00Z", sha("m106"))
    ]
  }
];
var PUSHED = commit(
  sha("abc"),
  ana,
  "2026-09-27T22:10:00Z",
  "Hotfix: restore the health check path\n\nAmp-Thread-ID: https://ampcode.com/threads/T-0000demo\nCo-authored-by: Amp <amp@ampcode.com>"
);
var enc2 = encodeURIComponent;
var SEARCH_Q = `repo:${DEMO_REPO} is:pr is:merged base:main merged:2026-09-01..2026-09-30`;
function mergeCommitOnMain(p) {
  const m = p.timeline.find((e) => e.event === "merged");
  return {
    sha: m.commit_id,
    html_url: `${HTML}/commit/${m.commit_id}`,
    commit: {
      author: p.commits[0].commit.author,
      committer: { name: "GitHub", email: "noreply@github.com", date: p.merged },
      message: `${p.title} (#${p.number})`
    },
    author: p.commits[0].author,
    committer: user("web-flow"),
    parents: [{ sha: "0".repeat(40) }]
  };
}
var responses = [
  {
    path: R,
    status: 200,
    body: {
      full_name: DEMO_REPO,
      default_branch: "main",
      private: false,
      visibility: "public",
      html_url: HTML
    }
  },
  {
    path: `/search/issues?q=${enc2(SEARCH_Q)}&per_page=100`,
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
        pull_request: { merged_at: p.merged }
      }))
    }
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
        ruleset_id: 7001
      },
      {
        type: "pull_request",
        parameters: {
          required_approving_review_count: 1,
          dismiss_stale_reviews_on_push: false,
          require_code_owner_review: false,
          require_last_push_approval: false
        },
        ruleset_source_type: "Repository",
        ruleset_source: DEMO_REPO,
        ruleset_id: 7002
      }
    ]
  },
  ...PRS.flatMap((p) => [
    { path: `${R}/issues/${p.number}/timeline?per_page=100`, status: 200, body: p.timeline },
    { path: `${R}/pulls/${p.number}/commits?per_page=100`, status: 200, body: p.commits }
  ]),
  {
    path: `${R}/commits?sha=main&since=2026-09-01T00:00:00Z&until=2026-09-30T23:59:59Z&per_page=100`,
    status: 200,
    body: [...PRS.map(mergeCommitOnMain), PUSHED].reverse()
  },
  { path: `${R}/commits/${PUSHED.sha}/pulls`, status: 200, body: [] }
];
var DEMO_RECORDING = {
  recorded_at: "synthetic",
  note: "A synthetic repository written for the demo: no real person, account or code.",
  responses
};

// src/github.ts
import { execFile } from "child_process";
function parseRepo(text) {
  const t = text.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const patterns = [
    /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/,
    /^(?:https?:\/\/)(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)(?:\/.*)?$/,
    /^(?:ssh:\/\/)?git@github\.com[:/]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/
  ];
  for (const p of patterns) {
    const m = p.exec(t);
    if (m) return `${m[1]}/${m[2].replace(/\.git$/, "")}`;
  }
  return null;
}
var execQuiet = (cmd, args, cwd) => new Promise((resolve) => {
  execFile(
    cmd,
    args,
    { cwd, timeout: 5e3, windowsHide: true },
    (err, stdout) => resolve(err ? null : String(stdout).trim() || null)
  );
});
async function findToken(env, cwd, exec = execQuiet) {
  for (const k of ["GITHUB_TOKEN", "GH_TOKEN"]) {
    const v = env[k]?.trim();
    if (v) return v;
  }
  return exec("gh", ["auth", "token"], cwd);
}
var GitHub = class {
  base;
  token;
  fetchImpl;
  /** requests made, by bucket */
  made = { core: 0, search: 0 };
  /** what GitHub said was left, by bucket; null until a response says */
  remaining = {
    core: null,
    search: null
  };
  constructor(opts) {
    this.base = (opts.apiUrl || "https://api.github.com").replace(/\/+$/, "");
    this.token = opts.token;
    this.fetchImpl = opts.fetch ?? ((url, init) => fetch(url, init));
  }
  get requests() {
    return this.made.core + this.made.search;
  }
  /**
   * GET a path. 404 and, when `soft`, 401/403 come back as a status with no body, for the
   * endpoints that only some tokens may read; every other failure is a CliError.
   */
  async get(path2, opts = {}) {
    const bucket = path2.startsWith("/search/") ? "search" : "core";
    const headers = {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": `agent-merge-audit/${version()} (+https://github.com/agentwares/agent-merge-audit)`
    };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    this.made[bucket]++;
    let res;
    try {
      res = await this.fetchImpl(`${this.base}${path2}`, {
        headers,
        signal: AbortSignal.timeout(3e4)
      });
    } catch (e) {
      throw new CliError({
        code: "GITHUB_UNREACHABLE",
        cause: `could not reach ${this.base}: ${e instanceof Error ? e.message : String(e)}`,
        fix: "check the network and try again",
        retryable: true
      });
    }
    const leftRaw = res.headers.get("x-ratelimit-remaining");
    const left = leftRaw === null ? null : Number(leftRaw);
    if (left !== null && Number.isFinite(left)) this.remaining[bucket] = left;
    const next = nextLink(res.headers.get("link"), this.base);
    if (res.ok) return { status: res.status, body: await res.json(), next };
    if (res.status === 404) return { status: 404, body: null, next: null };
    if ((res.status === 403 || res.status === 429) && (left === 0 || res.status === 429)) {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      const at = Number.isFinite(reset) && reset > 0 ? new Date(reset * 1e3).toISOString() : null;
      throw this.rateLimited(at, bucket);
    }
    if (opts.soft && (res.status === 401 || res.status === 403))
      return { status: res.status, body: null, next: null };
    if (res.status === 401)
      throw new CliError({
        code: "BAD_CREDENTIALS",
        cause: "GitHub refused the token (401 Bad credentials)",
        fix: "refresh it with `gh auth login` or set a valid GITHUB_TOKEN; `--anonymous` reads a public repo with none",
        retryable: false
      });
    if (res.status === 403)
      throw new CliError({
        code: "FORBIDDEN",
        cause: `GitHub answered 403 for ${path2.split("?")[0]}`,
        fix: "the token needs read access to this repo's pull requests, issues and contents (classic tokens: the repo scope)",
        retryable: false
      });
    if (res.status === 422)
      throw new CliError({
        code: "GITHUB_REFUSED_QUERY",
        cause: `GitHub refused the query for ${path2.split("?")[0]} (422)`,
        fix: "check the branch name and the dates; a private repo needs a token that can read it",
        retryable: false
      });
    throw new CliError({
      code: "GITHUB_ERROR",
      cause: `GitHub answered ${res.status} for ${path2.split("?")[0]}`,
      fix: "try again in a minute; if it persists, check https://www.githubstatus.com",
      retryable: res.status >= 500
    });
  }
  /** Every page of a list endpoint, up to `maxPages`; `truncated` when there were more. */
  async all(path2, maxPages, opts = {}) {
    const items = [];
    let p = path2;
    let pages = 0;
    let status = 200;
    while (p && pages < maxPages) {
      const got = await this.get(p, opts);
      status = got.status;
      if (!got.body) return { status, items, truncated: false };
      items.push(...got.body);
      p = got.next;
      pages++;
    }
    return { status, items, truncated: p !== null };
  }
  rateLimited(at, bucket = "core") {
    return new CliError({
      code: "RATE_LIMITED",
      cause: `GitHub's ${bucket === "search" ? "search " : ""}API rate limit is spent${this.token ? "" : " (60 requests an hour without a token)"}${at ? `; it resets at ${at}` : ""}`,
      fix: this.token ? "wait for the reset and run it again, or shorten the period" : "sign in with `gh auth login`, or set GITHUB_TOKEN, for 5,000 requests an hour; or shorten the period",
      retryable: true
    });
  }
};
function nextLink(link, base) {
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (m) {
      const url = m[1];
      return url.startsWith(base) ? url.slice(base.length) : new URL(url).pathname + new URL(url).search;
    }
  }
  return null;
}

// src/main.ts
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { parseArgs } from "util";

// src/install.ts
var ON_NPM = false;
var NAME = "agent-merge-audit";
var REPO = `https://github.com/agentwares/${NAME}`;
var INSTALL = ON_NPM ? `npx ${NAME}` : `npx --allow-git=root github:agentwares/${NAME}`;
var RUN = ON_NPM ? `npx -y ${NAME}@latest` : `npx -y --allow-git=root github:agentwares/${NAME}`;

// src/mcp.ts
import { createInterface } from "readline";
var PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
var DATE = "^\\d{4}-\\d{2}-\\d{2}$";
var TOOLS = [
  {
    name: "agent_merge_audit_run",
    title: "Agent-written merges and who approved them",
    description: `Lists every pull request merged into a GitHub repository's branch in a period, read from GitHub's API, with: whether an AI agent wrote or co-wrote it (GitHub Copilot's coding agent, Claude Code, OpenAI Codex, Cursor, Devin, Jules, Amp, Gemini, OpenHands, aider, found by bot accounts, commit identities, Co-authored-by trailers and PR-body markers, each match shown as evidence); whether a person other than its authors and co-authors approved it before merge, on the final code; who merged it; the branch's review rule as read now, and at each merge where GitHub still keeps the evaluation (one month, admin token); and the exceptions an auditor asks about under SOC 2 CC8.1 (agent-no-human-approval, no-approval, self-approval-only, bot-approval-only, stale-approval, merged-by-bot, rule-bypassed, unapproved-while-rule-requires, direct-push), each with the question to answer. Also every commit on the branch in the period that no merged PR accounts for. Use it when someone asks which changes an agent made without a person's review, prepares change-management evidence for a SOC 2 or ISO 27001 audit, or wants to know whether Copilot's approval stood in for a person's. Reads only, with the user's own token (GITHUB_TOKEN, GH_TOKEN or the GitHub CLI login), or anonymously for a public repo (60 requests an hour, about 25 PRs). Writes no file. Detection by signature is a floor. ${NOT_ADVICE} Every result ends with a note that a continuous record is not built: "${HANDOFF_LINE}"`,
    inputSchema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          minLength: 3,
          maxLength: 200,
          description: "The repository as owner/repo (octo-org/app) or its github.com URL."
        },
        since: {
          type: "string",
          pattern: DATE,
          description: "First day of the period, YYYY-MM-DD (UTC). Omitted: 29 days before until. Not with period."
        },
        until: {
          type: "string",
          pattern: DATE,
          description: "Last day of the period, YYYY-MM-DD (UTC), up to today. Omitted: today."
        },
        period: {
          type: "string",
          pattern: "^\\d{4}-(\\d{2}|[Qq][1-4])$",
          description: "A calendar month (2026-09) or quarter (2026-Q3) instead of since and until."
        },
        base: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          pattern: "^[A-Za-z0-9._/-]+$",
          description: "The branch merged into. Omitted: the repository's default branch."
        }
      },
      required: ["repo"],
      additionalProperties: false
    },
    annotations: {
      title: "Agent-written merges and who approved them",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  {
    name: "agent_merge_audit_signatures",
    title: "How AI agents show up in GitHub's records",
    description: "Lists the signatures agent_merge_audit_run uses to tell an AI agent's work from a person's in GitHub's records: the bot accounts and GitHub Apps (copilot-swe-agent, claude[bot], devin-ai-integration[bot], google-labs-jules[bot], cursor[bot], \u2026), commit identities and Co-authored-by addresses (noreply@anthropic.com, cursoragent@cursor.com, codex@openai.com, copilot@github.com, amp@ampcode.com, \u2026), agent-only trailers (Amp-Thread-ID, Entire-Checkpoint) and PR-body markers, each with where and how often it was seen and the date it was read; and the bots counted as automation, not agents. Use it to explain why a PR was or was not counted as agent-written. Reads nothing: the list is bundled with this version.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    annotations: {
      title: "How AI agents show up in GitHub's records",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  }
];
function invalid(cause, fix) {
  throw new CliError({ code: "INVALID_INPUT", cause, fix, retryable: false });
}
function checkArgs(tool, raw) {
  if (raw === void 0 || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw))
    invalid("arguments must be an object", "Pass the arguments as a JSON object.");
  const props = tool.inputSchema.properties;
  const a = raw;
  for (const [k, v] of Object.entries(a)) {
    const p = props[k];
    if (!p)
      invalid(
        `unknown argument \`${k}\``,
        Object.keys(props).length ? `Use only: ${Object.keys(props).join(", ")}.` : "Pass {}."
      );
    if (v === void 0) continue;
    if (typeof v !== "string") invalid(`\`${k}\` must be a string`, "Omit it, or pass a string.");
    if (typeof p.minLength === "number" && v.length < p.minLength)
      invalid(`\`${k}\` is too short`, `Give at least ${p.minLength} characters.`);
    if (typeof p.maxLength === "number" && v.length > p.maxLength)
      invalid(`\`${k}\` is too long`, `Give at most ${p.maxLength} characters.`);
    if (typeof p.pattern === "string" && !new RegExp(p.pattern).test(v))
      invalid(`\`${k}\` does not match ${p.pattern}`, String(p.description));
  }
  for (const r of tool.inputSchema.required ?? [])
    if (a[r] === void 0) invalid(`\`${r}\` is required`, String(props[r].description));
  return a;
}
async function callTool(name, rawArgs, ctx = {}) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`unknown tool ${name}`);
  try {
    const args = checkArgs(tool, rawArgs);
    if (name === "agent_merge_audit_signatures")
      return { structured: signaturesJson(), isError: false };
    if (args.period !== void 0 && (args.since !== void 0 || args.until !== void 0))
      invalid("give period, or since and until, not both", "Drop period, or drop since and until.");
    const report = await audit({
      repo: args.repo,
      flags: {
        since: args.since,
        until: args.until,
        period: args.period,
        base: args.base
      },
      anonymous: false,
      now: ctx.now?.() ?? /* @__PURE__ */ new Date(),
      deps: { fetch: ctx.fetch, exec: ctx.exec },
      cwd: ctx.cwd ?? process.cwd(),
      env: ctx.env ?? process.env
    });
    return { structured: report, isError: false };
  } catch (err) {
    const body = err instanceof CliError ? err.toJSON() : {
      code: "INTERNAL",
      cause: err instanceof Error ? err.message : String(err),
      fix: "Run agent-merge-audit on the same repo in a terminal to see the error with its context, and report it at https://github.com/agentwares/agent-merge-audit/issues.",
      retryable: false
    };
    return { structured: { ...body }, isError: true };
  }
}
var INSTRUCTIONS = "agent-merge-audit lists the pull requests merged into a GitHub branch in a period, with whether an AI agent wrote or co-wrote each one, whether a person other than its authors approved it before merge, who merged it, the review rule, and the SOC 2 CC8.1 exceptions an auditor asks about. Read-only; not audit advice.";
async function handleMessage(msg, ctx) {
  if (Array.isArray(msg)) {
    const out = (await Promise.all(msg.map((m) => handleMessage(m, ctx)))).filter(
      (r) => r !== void 0
    );
    return out.length ? out : void 0;
  }
  const req = msg && typeof msg === "object" ? msg : {};
  const hasId = "id" in req && (typeof req.id === "string" || typeof req.id === "number");
  const id = hasId ? req.id : null;
  const error = (code, message) => ({
    jsonrpc: "2.0",
    id,
    error: { code, message }
  });
  if (!("method" in req) && ("result" in req || "error" in req)) return void 0;
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string")
    return hasId || !("method" in req) ? error(-32600, "Invalid Request") : void 0;
  if (!hasId) return void 0;
  const params = req.params && typeof req.params === "object" ? req.params : {};
  switch (req.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0];
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "agent-merge-audit", title: "agent-merge-audit", version: version() },
          instructions: INSTRUCTIONS
        }
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    case "tools/call": {
      const name = params.name;
      if (typeof name !== "string" || !TOOLS.some((t) => t.name === name))
        return error(
          -32602,
          `Unknown tool: ${String(name)}. Tools: ${TOOLS.map((t) => t.name).join(", ")}`
        );
      const { structured, isError } = await callTool(name, params.arguments, ctx);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(structured) }],
          structuredContent: structured,
          isError
        }
      };
    }
    default:
      return error(-32601, `Method not found: ${req.method}`);
  }
}
async function serveStdio(ctx = {}) {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" }
        }) + "\n"
      );
      continue;
    }
    try {
      const res = await handleMessage(msg, ctx);
      if (res !== void 0) process.stdout.write(JSON.stringify(res) + "\n");
    } catch (err) {
      process.stderr.write(
        `agent-merge-audit mcp: ${err instanceof Error ? err.message : String(err)}
`
      );
    }
  }
}

// src/render.ts
import { createHash } from "crypto";
var CSV_COLUMNS = [
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
  "exceptions"
];
function cell(v) {
  let s = v === null || v === void 0 ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
var who = (p) => p?.login ?? "";
var approvers = (a, independent) => a.filter((x) => x.independent === independent).map(
  (x) => `${x.login}${x.stale ? " (before last commit)" : ""}${x.kind !== "human" ? ` (${x.kind})` : ""}`
).join("; ");
function csvName(r) {
  const slug = r.repo.replace(/[^A-Za-z0-9._-]+/g, "-");
  return `${slug}-merge-audit-${r.period.since}-to-${r.period.until}`;
}
function renderCsv(r) {
  const lines = [
    `# agent-merge-audit ${r.version}; ${r.repo}, branch ${r.base}, merged ${r.period.since} to ${r.period.until} (UTC); generated ${r.generated_at} from GitHub's API (${r.auth})`,
    `# ${r.note}`,
    `# ${r.detection_note}`,
    CSV_COLUMNS.join(",")
  ];
  const prRow = (p) => [
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
    p.exceptions.join("; ")
  ].map(cell).join(",");
  const pushRow = (d) => [
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
    d.exceptions.join("; ")
  ].map(cell).join(",");
  for (const p of r.prs) lines.push(prRow(p));
  for (const d of r.direct_pushes) lines.push(pushRow(d));
  return lines.join("\n") + "\n";
}
var sha256 = (s) => createHash("sha256").update(s).digest("hex");
var md = (s) => s.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
var day2 = (iso2) => iso2.slice(0, 10);
var plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
function ruleLine(r) {
  const parts = [`${plural(r.approvals, "approval")} required`];
  if (r.last_push_approval) parts.push("the last push must be approved by someone else");
  if (r.dismiss_stale) parts.push("stale approvals dismissed on push");
  if (r.code_owners) parts.push("code owners must approve");
  return `${r.source}: a pull request is required, ${parts.join(", ")}`;
}
var approvalText = {
  independent: "independent person",
  stale: "before last commit",
  self: "own author only",
  bot: "bot only",
  none: "none"
};
function agentCell(p) {
  if (p.agent.role === null) return "";
  return `${p.agent.agents.join(", ")} (${p.agent.role === "author" ? "wrote" : "co-wrote"})`;
}
function renderMarkdown(r, csv) {
  const s = r.summary;
  const out = [];
  out.push(`# Agent-merge audit: ${r.repo}, ${r.period.since} to ${r.period.until}`);
  out.push("");
  out.push(
    `Every pull request merged into \`${r.base}\` from ${r.period.since} to ${r.period.until} (UTC), read from GitHub's API ${r.auth === "token" ? "with your token" : "without a token"} on ${r.generated_at} by agent-merge-audit ${r.version}.`
  );
  out.push("");
  out.push(`**${r.note}**`);
  out.push("");
  out.push("## Summary");
  out.push("");
  out.push("| | |");
  out.push("| --- | --- |");
  out.push(`| Pull requests merged into \`${r.base}\` | ${s.merged_prs} |`);
  const agents = Object.entries(s.by_agent).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([a, n]) => `${a} ${n}`).join(", ");
  out.push(`| Written or co-written by an agent | ${s.agent_prs}${agents ? ` (${agents})` : ""} |`);
  out.push(
    `| ...of them with no independent person's approval | ${s.agent_without_independent_approval} |`
  );
  out.push(
    `| Approved by an independent person, on the final code | ${s.independent_approval} of ${s.merged_prs} |`
  );
  out.push(`| Pull requests with an exception | ${s.prs_with_exceptions} |`);
  out.push(
    `| Commits on \`${r.base}\` without a merged pull request | ${s.direct_pushes} of ${s.commits_on_base}${s.commits_unchecked ? ` (${s.commits_unchecked} unchecked)` : ""} |`
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
      `- No rule readable here requires a pull request or an approval on \`${r.base}\`${r.rules.classic === "not-readable" ? " (classic branch protection was not readable)" : ""}.`
    );
  for (const rule of r.rules.review) out.push(`- ${ruleLine(rule)}.`);
  for (const n of r.rules.notes) out.push(`- ${n}`);
  out.push("");
  const withEx = [...r.prs.filter((p) => p.exceptions.length), ...r.direct_pushes];
  out.push("## Exceptions an auditor will ask about");
  out.push("");
  if (withEx.length === 0) out.push("None in this period.");
  const codes = Object.keys(EXCEPTIONS);
  for (const code of codes) {
    const rows = withEx.filter((x) => x.exceptions.includes(code));
    if (!rows.length) continue;
    out.push(`### ${EXCEPTIONS[code].title} (${rows.length})`);
    out.push("");
    out.push(`To answer: ${EXCEPTIONS[code].ask}`);
    out.push("");
    for (const x of rows) {
      if ("number" in x) {
        const a = x.approvals.length ? x.approvals.map(
          (p) => `${p.login}${p.kind !== "human" ? ` (${p.agent ?? p.kind})` : ""}${p.independent ? "" : p.kind === "human" ? " (wrote it)" : ""}${p.stale ? " before the last commit" : ""}`
        ).join(", ") : "no one";
        out.push(
          `- [#${x.number}](${x.url}) ${md(x.title)}: merged ${day2(x.merged_at)} by ${who(x.merged_by) || "unknown"}${x.merged_via ? ` (via ${x.merged_via})` : ""}; written by ${x.author.login}${x.agent.role ? `, agent: ${x.agent.agents.join(", ")}` : ""}; approved by ${a}.`
        );
      } else {
        out.push(
          `- [${x.sha.slice(0, 7)}](${x.url}) ${md(x.title)}: ${day2(x.at)}, by ${x.author.login}${x.agent.role ? `, agent: ${x.agent.agents.join(", ")}` : ""}.`
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
      "| PR | Merged | Opened by | Agent | Approved by | Approval | Merged by | Rule at merge | Exceptions |"
    );
    out.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const p of r.prs)
      out.push(
        `| [#${p.number}](${p.url}) ${md(p.title)} | ${day2(p.merged_at)} | ${p.author.login} | ${agentCell(p)} | ${p.approvals.map((a) => a.login).join(", ")} | ${approvalText[p.approval]} | ${who(p.merged_by)}${p.merged_via ? ` (${p.merged_via})` : ""} | ${p.rule_at_merge} | ${p.exceptions.join(", ")} |`
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
        `- [${d.sha.slice(0, 7)}](${d.url}) ${md(d.title)}: ${day2(d.at)}, author ${d.author.login}${d.committer ? `, committer ${d.committer.login}` : ""}${d.agent.role ? `; agent: ${d.agent.evidence.join("; ")}` : ""}`
      );
    for (const sha2 of r.unchecked_commits) out.push(`- ${sha2.slice(0, 7)}: not checked`);
    out.push("");
  }
  out.push("## How this was read");
  out.push("");
  out.push(
    `- ${plural(r.requests.core + r.requests.search, "GET request")} to GitHub's REST API (${r.requests.search} search). Nothing was sent anywhere else, and nothing was written to GitHub.`
  );
  out.push(
    "- An approval counts as independent when it comes from a person who is not the pull request's author, a commit author or a co-author named in a trailer. Merges of another branch into the pull request do not count as writing it."
  );
  out.push(
    "- An approval is marked before the last commit when it was given before the latest commit that is not such a merge, by commit date."
  );
  out.push(
    `- Agent signatures as read on ${r.signatures_read}; \`agent-merge-audit signatures\` lists them.`
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
function renderSummary(r, files) {
  const s = r.summary;
  const out = [];
  out.push(
    `agent-merge-audit ${r.version}: ${r.repo}, ${r.base}, ${r.period.since} to ${r.period.until} (UTC)`
  );
  out.push("");
  out.push(
    `  ${plural(s.merged_prs, "pull request")} merged; ${s.agent_prs} written or co-written by an agent`
  );
  out.push(
    `  ${s.agent_without_independent_approval} agent-written with no independent person's approval`
  );
  out.push(
    `  ${s.independent_approval} of ${s.merged_prs} approved by an independent person on the final code`
  );
  out.push(
    `  ${plural(s.direct_pushes, "commit")} on ${r.base} without a merged pull request${s.commits_unchecked ? ` (${s.commits_unchecked} unchecked)` : ""}`
  );
  const rule = r.rules.review.length ? `${r.rules.requires_approvals} approval${r.rules.requires_approvals === 1 ? "" : "s"} required now` : "no review rule readable";
  out.push(
    `  rule: ${rule}${r.rules.at_merge === "read" ? "; each merge's evaluation read" : "; at each merge: not readable"}`
  );
  out.push("");
  const ex = [...r.prs.filter((p) => p.exceptions.length), ...r.direct_pushes];
  if (ex.length) {
    out.push("Exceptions:");
    for (const x of ex.slice(0, 20)) {
      const id = "number" in x ? `#${x.number}` : x.sha.slice(0, 7);
      out.push(`  ${id.padEnd(8)} ${x.title.length > 64 ? `${x.title.slice(0, 63)}\u2026` : x.title}`);
      out.push(`  ${"".padEnd(8)} ${x.exceptions.join(", ")}`);
    }
    if (ex.length > 20) out.push(`  \u2026 and ${ex.length - 20} more in the files`);
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
var renderJson = (r) => JSON.stringify(r, null, 2) + "\n";
function renderError(p, json) {
  if (json) return JSON.stringify({ error: p }, null, 2) + "\n";
  return `agent-merge-audit: ${p.code}: ${p.cause}
  fix: ${p.fix}${p.retryable ? "\n  (retrying later may work)" : ""}
`;
}

// src/replay.ts
function normalisePath(path2) {
  const [p, q] = path2.split("?");
  if (!q) return p;
  const params = new URLSearchParams(q);
  return `${p}?${[...params.entries()].map(([k, v]) => `${k}=${v}`).join("&")}`;
}
function replayFetch(rec, base = "https://api.github.com") {
  const byPath = new Map(rec.responses.map((r) => [normalisePath(r.path), r]));
  return (url) => {
    const path2 = url.startsWith(base) ? url.slice(base.length) : url;
    const r = byPath.get(normalisePath(path2));
    if (!r) return Promise.reject(new Error(`not in the recording: GET ${path2}`));
    return Promise.resolve(
      new Response(r.status === 204 ? null : JSON.stringify(r.body), {
        status: r.status,
        headers: { "content-type": "application/json", ...r.headers ?? {} }
      })
    );
  };
}

// src/main.ts
var HELP = `agent-merge-audit ${version()} \u2014 which merges an agent wrote, and whether a person approved them

Usage
  ${INSTALL} owner/repo
      every pull request merged into the default branch in the last 30 days, with whether an agent
      (Copilot's coding agent, Claude Code, Codex, Cursor, Devin, Jules, Amp, \u2026) wrote or co-wrote
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
var defaultDeps = {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s)
};
async function main(argv, deps = defaultDeps) {
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
var COMMANDS = ["audit", "demo", "signatures", "mcp", "help"];
var FAIL_ON = ["agent-unapproved", "any", "none"];
function fails(r, failOn) {
  if (failOn === "agent-unapproved")
    return r.summary.agent_without_independent_approval > 0 || r.direct_pushes.some((d) => d.agent.role !== null);
  if (failOn === "any") return r.summary.prs_with_exceptions > 0 || r.summary.direct_pushes > 0;
  return false;
}
function signaturesJson() {
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
      seen: s.seen
    })),
    automation: AUTOMATION_LOGINS,
    note: "An account whose type is Bot, or whose login ends in [bot], and that is not listed as an agent, is counted as automation: its approval or merge is not a person's."
  };
}
function renderSignatures() {
  const j = signaturesJson();
  const out = [`Agent signatures, as read on ${j.read}:`, ""];
  for (const a of j.agents) {
    const signs = [
      ...a.logins.map((l) => `login ${l}`),
      ...a.apps.map((x) => `app ${x}`),
      ...a.emails.map((e) => `<${e}>`),
      ...a.email_suffixes.map((e) => `*${e}`),
      ...a.trailers.map((t) => `${t}:`),
      ...a.markers.map((m) => `"${m}"`)
    ];
    out.push(`${a.name}`);
    if (signs.length) out.push(`  ${signs.join(", ")}`);
    out.push(`  seen: ${a.seen}`);
  }
  out.push("", `Automation (not agents): ${j.automation.join(", ")}`, j.note, "");
  return out.join("\n");
}
async function run(argv, deps) {
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
        version: { type: "boolean", short: "v" }
      }
    });
  } catch (e) {
    throw usage(
      e instanceof Error ? e.message : String(e),
      `run \`${INSTALL} --help\` for the options`
    );
  }
  const { values, positionals } = parsed;
  if (values.version) {
    deps.stdout(`${version()}
`);
    return 0;
  }
  let [command, ...rest] = positionals;
  if (values.help || command === "help") {
    deps.stdout(HELP);
    return 0;
  }
  if (command !== void 0 && !COMMANDS.includes(command)) {
    rest = [command, ...rest];
    command = "audit";
  }
  if (command === void 0) {
    deps.stdout(HELP);
    return 2;
  }
  const failOn = values["fail-on"] ?? "none";
  if (!FAIL_ON.includes(failOn))
    throw usage(
      `--fail-on is agent-unapproved, any or none, got "${values["fail-on"]}"`,
      "e.g. `--fail-on agent-unapproved`"
    );
  const now = deps.now?.() ?? /* @__PURE__ */ new Date();
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
      values.json ? JSON.stringify(signaturesJson(), null, 2) + "\n" : renderSignatures()
    );
    return 0;
  }
  let report;
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
      env: {}
    });
  } else {
    if (rest.length !== 1)
      throw usage(
        rest.length ? `audit takes one owner/repo, got ${rest.length}` : "which repository?",
        `run \`${INSTALL} owner/repo\`, e.g. \`${INSTALL} octo-org/app --period 2026-Q3\``
      );
    report = await audit({
      repo: rest[0],
      flags: { since: values.since, until: values.until, period: values.period, base: values.base },
      anonymous: !!values.anonymous,
      now,
      deps,
      cwd,
      env
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
  if (command === "demo" && values.out === void 0) {
    deps.stdout(renderSummary(report, []));
    deps.stdout(
      `\`--out <dir>\` writes the evidence pair (${name}.csv and .md); \`--no-write\` prints the markdown.
`
    );
    return fails(report, failOn) ? 1 : 0;
  }
  const dir = path.resolve(cwd, values.out ?? ".");
  await mkdir(dir, { recursive: true });
  const files = [path.join(dir, `${name}.csv`), path.join(dir, `${name}.md`)];
  await writeFile(files[0], csv);
  await writeFile(files[1], markdown);
  deps.stdout(
    renderSummary(
      report,
      files.map((f) => path.relative(cwd, f) || f)
    )
  );
  return fails(report, failOn) ? 1 : 0;
}
async function audit(req) {
  const repo = parseRepo(req.repo);
  if (!repo)
    throw new CliError({
      code: "BAD_REPO",
      cause: `"${req.repo}" is not owner/repo or a github.com URL`,
      fix: `pass a repository, e.g. \`${INSTALL} octo-org/app\``,
      retryable: false
    });
  const period = resolvePeriod(req.flags, req.now);
  if (req.flags.base !== void 0 && !/^[A-Za-z0-9._/-]{1,200}$/.test(req.flags.base))
    throw usage(`--base "${req.flags.base}" is not a branch name`, "e.g. `--base main`");
  const replay = req.env["AGENT_MERGE_AUDIT_REPLAY"] === "demo";
  const token = req.anonymous || replay ? null : await findToken(req.env, req.cwd, req.deps.exec ?? execQuiet);
  const gh = new GitHub({
    token,
    fetch: replay ? replayFetch(DEMO_RECORDING) : req.deps.fetch,
    apiUrl: replay ? void 0 : req.env["GITHUB_API_URL"]
  });
  return runAudit({ repo, period, base: req.flags.base, gh, now: req.now });
}

// src/index.ts
var SAMPLE_DATE = "2026-10-09";
export {
  AGENTS,
  CSV_COLUMNS,
  CliError,
  DEMO_PERIOD,
  DEMO_RECORDING,
  DEMO_REPO,
  EXCEPTIONS,
  FLOOR_NOTE,
  GitHub,
  HANDOFF_DETAIL,
  HANDOFF_LINE,
  HANDOFF_URL,
  NOT_ADVICE,
  PAGES_URL,
  SAMPLE_DATE,
  TOOLS,
  agentsInCommit,
  approvalClass,
  approvalsOf,
  audit,
  callTool,
  cell,
  classifyActor,
  csvName,
  exceptionsOf,
  fails,
  findToken,
  handleMessage,
  humanCoAuthors,
  involvement,
  loginFromEmail,
  main,
  mergedBy,
  months,
  namedPeriod,
  normalisePath,
  parseRepo,
  parseTrailers,
  readRules,
  renderCsv,
  renderJson,
  renderMarkdown,
  renderSummary,
  replayFetch,
  resolvePeriod,
  runAudit,
  sha256,
  signaturesJson,
  summarise,
  writers
};
//# sourceMappingURL=index.js.map