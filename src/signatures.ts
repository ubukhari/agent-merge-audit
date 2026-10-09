/**
 * How an agent shows up in GitHub's records, and how each sign is matched.
 *
 * Every signature below was seen in GitHub's own records on 9 Oct 2026: a merged pull request
 * opened by the account, or commits carrying the identity or trailer, counted with GitHub's search
 * API (keyword matches, so signals, not unique uses). Where a vendor documents it, the source says
 * so. Nothing here guesses from code style: an agent that leaves no sign is not found, and every
 * report says the count is a floor.
 */

export type ActorKind = "human" | "agent" | "automation";

export interface Signature {
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

export const SIGNATURES_READ = "2026-10-09";

const SEARCH = "GitHub search API, read 9 Oct 2026";

/** Agents that write code, and AI reviewers whose approval is not a person's. */
export const AGENTS: readonly Signature[] = [
  {
    id: "copilot-coding-agent",
    name: "GitHub Copilot coding agent",
    logins: ["copilot-swe-agent[bot]"],
    apps: ["copilot-swe-agent"],
    seen: `PR author \`Copilot\` (app copilot-swe-agent) on 1,528,286 merged PRs (${SEARCH}); commits co-authored by the person who asked (docs.github.com, Copilot coding agent)`,
  },
  {
    id: "copilot-code-review",
    name: "GitHub Copilot code review",
    logins: ["copilot-pull-request-reviewer[bot]"],
    apps: ["copilot-pull-request-reviewer"],
    seen: "reviewer `Copilot` (app copilot-pull-request-reviewer); its approval can count toward required approvals since 1 Sep 2026 (github.blog changelog)",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    logins: ["copilot"],
    emails: ["copilot@github.com"],
    emailSuffixes: ["+copilot@users.noreply.github.com"],
    names: ["^copilot\\b"],
    seen: `\`Co-authored-by: Copilot <copilot@github.com>\` on 154,211 commits (VS Code's git.addAICoAuthor, on by default since May 2026), and Copilot's noreply identity on its own commits (${SEARCH})`,
  },
  {
    id: "claude-app",
    name: "Claude GitHub app",
    logins: ["claude[bot]"],
    apps: ["claude"],
    emailSuffixes: ["+claude[bot]@users.noreply.github.com"],
    seen: `\`claude[bot]\` as author of 61,813 commits and 51,287 merged PRs (${SEARCH})`,
  },
  {
    id: "claude-code",
    name: "Claude Code",
    emails: ["noreply@anthropic.com"],
    names: ["^claude\\b"],
    markers: ["Generated with [Claude Code]", "claude.ai/code/session_"],
    seen: `\`Co-Authored-By: Claude … <noreply@anthropic.com>\` on 9,684,405 commits and "Generated with [Claude Code]" on 3,811,947 (${SEARCH}); Claude Code adds both by default`,
  },
  {
    id: "cursor",
    name: "Cursor agent",
    logins: ["cursor[bot]", "cursoragent"],
    apps: ["cursor"],
    emails: ["cursoragent@cursor.com"],
    names: ["^cursor agent$"],
    markers: ["cursor.com/agents", "cursor.com/background-agent"],
    seen: `\`Co-authored-by: Cursor <cursoragent@cursor.com>\` on 4,530,975 commits; \`cursor[bot]\` on 29,148 merged PRs (${SEARCH})`,
  },
  {
    id: "codex",
    name: "OpenAI Codex",
    logins: ["chatgpt-codex-connector[bot]"],
    apps: ["chatgpt-codex-connector"],
    emails: ["codex@openai.com"],
    names: ["^(openai )?codex$"],
    markers: ["chatgpt.com/codex/tasks/"],
    seen: `\`Co-authored-by: Codex <codex@openai.com>\` on 262,677 commits; Codex cloud links its task in the PR body (${SEARCH})`,
  },
  {
    id: "devin",
    name: "Devin",
    logins: ["devin-ai-integration[bot]"],
    apps: ["devin-ai-integration"],
    emailSuffixes: ["+devin-ai-integration[bot]@users.noreply.github.com"],
    names: ["^devin ai$"],
    markers: ["app.devin.ai/sessions/"],
    seen: `\`devin-ai-integration[bot]\` as author of 435,807 commits and 184,741 merged PRs (${SEARCH})`,
  },
  {
    id: "jules",
    name: "Google Jules",
    logins: ["google-labs-jules[bot]"],
    apps: ["google-labs-jules"],
    emailSuffixes: ["+google-labs-jules[bot]@users.noreply.github.com"],
    markers: ["jules.google.com/task"],
    seen: `\`google-labs-jules[bot]\` as author of 1,269,140 commits and 205,227 merged PRs (${SEARCH})`,
  },
  {
    id: "amp",
    name: "Amp",
    emails: ["amp@ampcode.com"],
    trailers: ["amp-thread-id", "amp-thread"],
    markers: ["ampcode.com/threads/"],
    seen: `\`Co-authored-by: Amp <amp@ampcode.com>\` with an \`Amp-Thread-ID\` trailer on 107,241 commits (${SEARCH})`,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    logins: ["gemini-code-assist[bot]"],
    apps: ["gemini-code-assist"],
    emails: ["gemini-ai@google.com"],
    emailSuffixes: ["+gemini-code-assist[bot]@users.noreply.github.com"],
    names: ["^gemini\\b"],
    seen: `\`Co-authored-by: Gemini …\` on 130,125 commits, including gemini-code-assist's suggestions (${SEARCH})`,
  },
  {
    id: "openhands",
    name: "OpenHands",
    logins: ["openhands-agent"],
    emails: ["openhands@all-hands.dev"],
    seen: `\`Co-authored-by: openhands <openhands@all-hands.dev>\` on 239,443 commits (${SEARCH})`,
  },
  {
    id: "aider",
    name: "aider",
    emails: ["noreply@aider.chat"],
    names: ["^aider\\b"],
    seen: `\`Co-authored-by: aider (<model>) <noreply@aider.chat>\` on 202 commits (${SEARCH})`,
  },
  {
    id: "entire",
    name: "an agent session recorded by Entire",
    trailers: ["entire-checkpoint"],
    seen: `\`Entire-Checkpoint:\` on 97,375 commits; Entire records the agent session behind a commit (${SEARCH}; kosli.com, 27 Feb 2026)`,
  },
  {
    id: "coderabbit",
    name: "CodeRabbit (AI review)",
    logins: ["coderabbitai[bot]"],
    apps: ["coderabbitai"],
    seen: "an AI reviewer: its approval is a bot's, not a person's",
  },
];

/** A trailer that declares AI help in general words, counted when its value names a model or agent. */
export const DECLARED_TRAILERS: readonly string[] = [
  "assisted-by",
  "generated-by",
  "ai-assisted-by",
];
const MODEL_WORDS =
  /\b(claude|anthropic|gpt|openai|codex|copilot|gemini|cursor|llama|mistral|deepseek|qwen|grok|devin|jules|amp|aider|windsurf|cascade|kiro|opencode|llm)\b/i;

export const DECLARED: Signature = {
  id: "declared",
  name: "declared AI help",
  seen: `\`Assisted-by:\` on 97,753 commits (${SEARCH}); counted only when its value names a model or agent`,
};

/** Bots that are not AI agents: their approval or merge is still not a person's. */
export const AUTOMATION_LOGINS: readonly string[] = [
  "dependabot[bot]",
  "renovate[bot]",
  "github-actions[bot]",
  "github-merge-queue[bot]",
  "release-please[bot]",
  "mergify[bot]",
  "pre-commit-ci[bot]",
  "kodiakhq[bot]",
  "web-flow",
];

export interface ActorInput {
  login: string;
  /** GitHub's user type: "User", "Bot" or "Organization" */
  type?: string;
  /** the GitHub App behind the account, when known */
  app?: string | null;
}

export interface Classified {
  kind: ActorKind;
  agent?: Signature;
}

/** The app slug in a user's html_url (https://github.com/apps/copilot-swe-agent), or null. */
export function appFromUrl(url: string | null | undefined): string | null {
  const m = /github\.com\/apps\/([A-Za-z0-9-]+)/.exec(url ?? "");
  return m ? m[1]!.toLowerCase() : null;
}

/** Whether an account is a person, an agent (and which), or other automation. */
export function classifyActor(a: ActorInput): Classified {
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

/** The agent behind a commit identity or a co-author address, and whether its address said so. */
export function identify(
  name: string,
  email: string,
): { agent: Signature; by: "email" | "name" } | null {
  const e = email.trim().toLowerCase();
  const n = name.trim();
  for (const s of AGENTS) {
    if (e && s.emails?.includes(e)) return { agent: s, by: "email" };
    if (e && s.emailSuffixes?.some((x) => e.endsWith(x))) return { agent: s, by: "email" };
  }
  // a name alone counts only with an address that is not a person's own: a noreply or none
  const generic = e === "" || /noreply|no-reply/.test(e);
  if (generic)
    for (const s of AGENTS)
      if (s.names?.some((r) => new RegExp(r, "i").test(n))) return { agent: s, by: "name" };
  return null;
}

/** The agent behind a commit identity or a co-author address, or null. */
export function agentByIdentity(name: string, email: string): Signature | null {
  return identify(name, email)?.agent ?? null;
}

/** An identity as it may be printed: the address only when it is the agent's own. */
function shown(name: string, email: string): string {
  const id = identify(name, email);
  return id?.by === "email" ? `${name} <${email}>` : name;
}

/** The GitHub login in a noreply address (123+octocat@users.noreply.github.com), or null. */
export function loginFromEmail(email: string): string | null {
  const m = /^(?:\d+\+)?([A-Za-z0-9-]+(?:\[bot\])?)@users\.noreply\.github\.com$/i.exec(
    email.trim(),
  );
  return m ? m[1]!.toLowerCase() : null;
}

export interface Trailer {
  key: string;
  value: string;
  name: string;
  email: string;
}

/** Every `Key: value` trailer line of a commit message, with `Name <email>` split out. */
export function parseTrailers(message: string): Trailer[] {
  const out: Trailer[] = [];
  for (const line of message.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z][A-Za-z0-9-]*):\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    if (!key.includes("-") && key !== "assisted" && key !== "generated") continue;
    const value = m[2]!;
    const who = /^(.*?)\s*<([^>]*)>\s*$/.exec(value);
    out.push({
      key,
      value,
      name: who ? who[1]!.trim() : value.trim(),
      email: who ? who[2]!.trim() : "",
    });
  }
  return out;
}

export interface Match {
  agent: Signature;
  /** what was seen, safe to print: agent identities only, never a person's address */
  how: string;
}

/** Agent signs in a commit: its author identity, its trailers and its markers. */
export function agentsInCommit(c: {
  authorName: string;
  authorEmail: string;
  authorLogin?: string | null;
  authorType?: string;
  /** the GitHub App behind the author account, when known */
  authorApp?: string | null;
  message: string;
}): Match[] {
  const out: Match[] = [];
  const byLogin = c.authorLogin
    ? classifyActor({ login: c.authorLogin, type: c.authorType, app: c.authorApp }).agent
    : undefined;
  if (byLogin) out.push({ agent: byLogin, how: `commit author ${c.authorLogin!}` });
  else {
    const byIdentity = agentByIdentity(c.authorName, c.authorEmail);
    if (byIdentity)
      out.push({ agent: byIdentity, how: `commit author ${shown(c.authorName, c.authorEmail)}` });
  }
  for (const t of parseTrailers(c.message)) {
    if (t.key === "co-authored-by") {
      const s = agentByIdentity(t.name, t.email);
      if (s) out.push({ agent: s, how: `Co-authored-by: ${shown(t.name, t.email)}` });
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
  // a marker says no more than the trailer it sits in
  for (const m of markersIn(c.message, "commit message"))
    if (!out.some((x) => x.agent.id === m.agent.id)) out.push(m);
  return out;
}

/** A trailer value with any `<address>` taken out, so no person's address is printed. */
const bare = (v: string): string => v.replace(/\s*<[^>]*>/g, "").trim();

/** Markers only an agent writes, found in a PR body or a commit message. */
export function markersIn(text: string, where: string): Match[] {
  const out: Match[] = [];
  for (const s of AGENTS)
    for (const m of s.markers ?? [])
      if (text.includes(m)) {
        out.push({ agent: s, how: `${where}: ${m}` });
        break;
      }
  return out;
}

/** Human co-authors named in a message's trailers: their login when the address is a noreply. */
export function humanCoAuthors(message: string): { name: string; login: string | null }[] {
  return parseTrailers(message)
    .filter((t) => t.key === "co-authored-by" && !agentByIdentity(t.name, t.email))
    .map((t) => ({ name: t.name, login: loginFromEmail(t.email) }));
}
