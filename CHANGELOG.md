# Changelog

## 0.1.0 (2026-10-09)

First release.

- `agent-merge-audit owner/repo` lists every pull request merged into the default branch in a
  period (the last 30 days, `--since`/`--until`, or `--period 2026-09` / `2026-Q3`), read from
  GitHub's REST API with your own token (`GITHUB_TOKEN`, `GH_TOKEN` or `gh auth token`) or none for
  a public repository.
- For each one:
  - whether an agent wrote or co-wrote it: GitHub Copilot's coding agent, Claude Code, the Claude
    GitHub app, OpenAI Codex, Cursor, Devin, Jules, Amp, Gemini, OpenHands or aider, found by bot
    accounts, commit identities, `Co-authored-by` trailers and PR-body markers, each match shown;
  - whether a person other than its authors and co-authors approved it before the merge, on the
    final code;
  - who merged it, crediting a merge queue or auto-merge to the person who queued it;
  - the branch's review rule now, and at the merge where GitHub still keeps the evaluation.
- The exceptions an auditor asks about under SOC 2 CC8.1, each with the question to answer:
  `agent-no-human-approval`, `no-approval`, `self-approval-only`, `bot-approval-only`,
  `stale-approval`, `merged-by-bot`, `rule-bypassed`, `unapproved-while-rule-requires` and
  `direct-push` (a commit on the branch that no merged pull request accounts for).
- A dated evidence pair: a CSV with a preamble, and a markdown report that names the CSV's SHA-256.
  `--json`, `--no-write`, `--fail-on agent-unapproved|any`, `demo`, `signatures`.
- `agent-merge-audit mcp` serves two read-only tools, `agent_merge_audit_run` and
  `agent_merge_audit_signatures`, both with all four annotations.
- A GitHub Action, `uses: agentwares/agent-merge-audit@main`.
- No runtime dependencies, no account, no telemetry, no LLM calls. Not audit advice.
