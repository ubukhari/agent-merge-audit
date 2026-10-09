# agent-merge-audit

Which merges an AI agent wrote, and whether a person approved them. For a period, every pull
request merged into your main branch, with:

- **who wrote it:** a person, or an agent (GitHub Copilot's coding agent, Claude Code, the Claude
  GitHub app, OpenAI Codex, Cursor, Devin, Jules, Amp, Gemini, OpenHands, aider), and how it was
  found;
- **who approved it:** whether a person other than its authors and co-authors approved it before
  the merge, on the code that merged, or only its author, or only a bot;
- **who merged it**, and the branch's **review rule**;
- **the exceptions an auditor asks about** under SOC 2 CC8.1 (change management), each with the
  question to answer.

It writes a dated CSV and markdown pair for the period, to keep with your audit evidence.

```sh
npx --allow-git=root github:agentwares/agent-merge-audit octo-org/app --period 2026-Q3
```

Your own GitHub token (`GITHUB_TOKEN`, `GH_TOKEN` or the `gh` CLI's login), or none for a public
repository. GETs to GitHub's API only. No account, no telemetry, no LLM calls.

**Not audit advice:** it lists what GitHub's records show. Whether that meets your controls is for
you and your auditor.

## What it looks like

A run on a **synthetic** repository written for this demo (`agent-merge-audit demo`; no request is
made and no real person or account is named):

```text
Synthetic repo, written for this demo: not anyone's code or account.

agent-merge-audit 0.1.0: octo-org/demo-app, main, 2026-09-01 to 2026-09-30 (UTC)

  6 pull requests merged; 4 written or co-written by an agent
  3 agent-written with no independent person's approval
  2 of 6 approved by an independent person on the final code
  1 commit on main without a merged pull request
  rule: 1 approval required now; at each merge: not readable

Exceptions:
  #102     Fix timezone handling in invoice dates
           agent-no-human-approval, self-approval-only
  #103     Move session storage to Redis
           agent-no-human-approval, bot-approval-only
  #104     Paginate the audit log API
           agent-no-human-approval, stale-approval
  #105     Bump undici from 7.2.0 to 7.2.3
           no-approval, unapproved-while-rule-requires
  #106     Add a retry to the webhook sender
           merged-by-bot
  d000000  Hotfix: restore the health check path
           agent-no-human-approval, direct-push

Agents are found by the signatures they leave (bot accounts, commit identities, co-author trailers, PR-body markers). An agent that leaves none, or a trailer someone removed, is not found, so the count is a floor.
Not audit advice: this lists what GitHub's records show. Whether it meets your controls is for you and your auditor.

A continuous, hash-chained record of every agent change, kept across your audit window, is not built.
  https://agentwares-agentguard.vercel.app/merge-audit?ref=agent-merge-audit#record
`--out <dir>` writes the evidence pair (octo-org-demo-app-merge-audit-2026-09-01-to-2026-09-30.csv and .md); `--no-write` prints the markdown.
```

The evidence pair that run writes with `--out`:
[markdown](examples/demo-evidence/octo-org-demo-app-merge-audit-2026-09-01-to-2026-09-30.md) and
[CSV](examples/demo-evidence/octo-org-demo-app-merge-audit-2026-09-01-to-2026-09-30.csv). The
markdown names the CSV's SHA-256, so the two can be checked against each other.

## Why now

- **Copilot can approve pull requests.** Since 1 September 2026 an admin can let Copilot code
  review submit an approval that counts toward a branch's required approvals. "The rule required
  one approval" no longer means a person approved.
- **Agents open the pull requests.** By 9 October 2026, 1.5 million merged pull requests on public
  GitHub had been opened by Copilot's coding agent, and Claude Code's co-author trailer was on 9.7
  million commits (GitHub search).
- **Auditors sample merged pull requests** for change management, and check that each was
  reviewed by someone other than its author before it merged. A bot's approval is not a person's
  review unless your control says so.
- **GitHub's own record is short.** Rule evaluations (pass, bypass) are kept for a month, the
  audit log for six months, and a SOC 2 Type II window runs up to twelve.

## The exceptions

| Code                             | What it means                                                        | What an auditor asks                                          |
| -------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| `agent-no-human-approval`        | An agent wrote or co-wrote it, and no independent person approved it | Who reviewed this agent's change, and where is that recorded? |
| `no-approval`                    | Merged with no approval at all                                       | Why did it merge without review?                              |
| `self-approval-only`             | Approved only by its author, a commit author or a co-author          | Who other than its authors reviewed it?                       |
| `bot-approval-only`              | Approved only by a bot or an AI reviewer (Copilot code review, …)    | Is an automated approval part of your documented control?     |
| `stale-approval`                 | Approved before its last commit (merges of the base not counted)     | Who reviewed the commits after the approval?                  |
| `merged-by-bot`                  | Merged by a bot account, with no person queueing it                  | Which person authorised this merge?                           |
| `rule-bypassed`                  | GitHub recorded a bypass of the branch rule at the merge             | Who bypassed it, and why?                                     |
| `unapproved-while-rule-requires` | No approval, though the branch rule now requires one                 | Was the rule added later, or bypassed or exempted?            |
| `direct-push`                    | A commit on the branch that no merged pull request accounts for      | Why did it skip a reviewed pull request?                      |

An approval is **independent** when it comes from a person who is not the pull request's author, a
commit author, or a co-author named in a `Co-authored-by` trailer. For Copilot's coding agent, that
excludes the person who asked for the change, whom GitHub names as co-author: GitHub's own rule is
that their approval does not count.

## Usage

```sh
npx --allow-git=root github:agentwares/agent-merge-audit owner/repo                      # the last 30 days
npx --allow-git=root github:agentwares/agent-merge-audit owner/repo --period 2026-Q3     # a quarter, or a month: 2026-09
npx --allow-git=root github:agentwares/agent-merge-audit owner/repo --since 2026-07-01 --until 2026-09-30
npx --allow-git=root github:agentwares/agent-merge-audit demo                            # the synthetic repo, no requests
npx --allow-git=root github:agentwares/agent-merge-audit signatures                      # every agent signature, with where it was seen
```

| Option                              | What it does                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `--base <branch>`                   | the branch merged into; default the repository's default branch                     |
| `--out <dir>`                       | where the pair is written; default the current directory                            |
| `--no-write`                        | print the markdown instead of writing files                                         |
| `--json`                            | print the report as JSON; write nothing                                             |
| `--fail-on agent-unapproved \| any` | exit 1 when an agent-written merge had no independent approval, or on any exception |
| `--anonymous`                       | send no token, even when one is set                                                 |

## GitHub Action

```yaml
- id: audit
  uses: agentwares/agent-merge-audit@main
  with:
    period: 2026-09 # or since/until; default the last 30 days
    fail-on: none # evidence only; agent-unapproved or any to fail the job
- uses: actions/upload-artifact@v6
  with:
    name: agent-merge-audit
    path: |
      ${{ steps.audit.outputs.csv }}
      ${{ steps.audit.outputs.markdown }}
```

It runs the committed `dist/cli.js` with the job's own token on the repository it runs in, writes
the markdown to the step summary, and sets the outputs `markdown`, `csv`, `exceptions`, `agent-prs`
and `agent-unapproved`. The job needs `contents`, `pull-requests` and `issues` read. A monthly
workflow that keeps last month's pair: [`examples/github-workflow.yml`](examples/github-workflow.yml).

## How agents are found

By the signs they leave in GitHub's records, each seen on public GitHub on 9 October 2026 and listed
by `agent-merge-audit signatures`:

- **the account that opened the pull request**, and the GitHub App behind it: `Copilot`
  (copilot-swe-agent), `claude[bot]`, `devin-ai-integration[bot]`, `google-labs-jules[bot]`,
  `cursor[bot]`;
- **the commit's author**: Copilot's, Cursor's, Devin's, Jules's and Claude's app identities;
- **co-author trailers**: `Co-Authored-By: Claude … <noreply@anthropic.com>`,
  `Co-authored-by: Cursor <cursoragent@cursor.com>`, `Codex <codex@openai.com>`,
  `Copilot <copilot@github.com>`, `Amp <amp@ampcode.com>`, `Gemini`, `openhands`, `aider`; an
  `Assisted-by:` or `Generated-by:` trailer that names a model;
- **agent-only trailers and markers**: `Amp-Thread-ID`, `Entire-Checkpoint`, "Generated with
  [Claude Code]", a Codex task link.

An agent that leaves none of these, or a trailer someone removed, is not found, so **the count is a
floor**. Each pull request's evidence says what matched. A person's email address is never printed.

## What it reads and sends

- **GETs to `api.github.com`** (or `GITHUB_API_URL`), and nothing else: the repository, the merged
  pull requests (search, one calendar month a query), each one's timeline and commits, the branch's
  active rules, its commits in the period, and the pull request behind any commit that no merged
  pull request accounts for. With a token that may read them, also classic branch protection and
  the last month's rule evaluations.
- **The token** goes only in the `Authorization` header of those requests. It is never printed,
  logged or written.
- **Without a token**, GitHub allows 60 requests an hour, about 25 merged pull requests; it says
  so before it would run out. With one, 5,000.
- **Nothing is sent to us.** No account, no telemetry, no LLM calls.

## MCP server

`agent-merge-audit mcp` serves two read-only tools over stdio, with no dependencies:
`agent_merge_audit_run` (a repo and a period in, the report out; it writes no file) and
`agent_merge_audit_signatures`.

```json
{
  "mcpServers": {
    "agent-merge-audit": {
      "command": "npx",
      "args": ["-y", "--allow-git=root", "github:agentwares/agent-merge-audit", "mcp"]
    }
  }
}
```

## Claude Code plugin

```text
/plugin marketplace add agentwares/agent-merge-audit
/plugin install agent-merge-audit@agent-merge-audit
```

Then `/agent-merge-audit:agent-merge-audit owner/repo`. It pre-approves nothing.

## A continuous, hash-chained record of every agent change, kept across your audit window, is not built

It would record each merge as it happens (who or what wrote it, who approved it, who merged it,
under which rule) in okgate's hash-chained log, with a quarterly CC8.1 export and a read-only link
for your auditor. If you would pay for that, say so with one click:
https://agentwares-agentguard.vercel.app/merge-audit?ref=agent-merge-audit

What works today, free: okgate's hook mode holds an agent's `git push` or merge in Claude Code,
Codex and Gemini CLI until a person types the go-ahead, and logs each decision in a hash-chained log
on your machine (`okgate verify` checks it):

```sh
npx -p @agentwares/agentguard okgate hooks install
```

## License

MIT, by agentwares.
