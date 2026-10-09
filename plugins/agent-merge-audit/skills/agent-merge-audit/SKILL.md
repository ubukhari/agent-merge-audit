---
name: agent-merge-audit
description: List which merges into a GitHub repo's main branch an AI agent wrote or co-wrote (Copilot's coding agent, Claude Code, Codex, Cursor, Devin, Jules, Amp and others), whether a person other than its authors approved each one before merge, who merged it, the branch's review rule, and the SOC 2 CC8.1 exceptions an auditor asks about, by running agent-merge-audit on owner/repo. Use when the user prepares change-management evidence for a SOC 2 or ISO 27001 audit, asks which agent changes merged without a person's review, or whether Copilot's approval stood in for a person's.
argument-hint: "owner/repo [--period 2026-Q3]"
---

# Which merges an agent wrote, and whether a person approved them

agent-merge-audit (MIT, [source](https://github.com/agentwares/agent-merge-audit)) reads one
repository's merged pull requests for a period from GitHub's API, with the user's own token (or
none for a public repo), and classifies who or what wrote, approved and merged each one. Its only
requests are GETs to api.github.com; nothing about the code is sent to us. It is not audit advice.

Run it with the Bash tool (Claude Code asks the user to approve the command; this skill
pre-approves nothing):

```sh
npx -y --allow-git=root github:agentwares/agent-merge-audit $ARGUMENTS --json
```

Then:

1. **Say the period and the counts.** `summary.merged_prs`, `summary.agent_prs` and
   `summary.agent_without_independent_approval`. Say that agents are found by the signatures they
   leave (`detection_note`), so the count is a floor.
2. **Go through the exceptions** in `prs[].exceptions` and `direct_pushes`, most serious first
   (`agent-no-human-approval`, `direct-push`, `no-approval`, then the rest). For each, give the PR
   number and title, who wrote it (`author`, `agent.agents`, `agent.evidence`), who approved it
   (`approvals`, with `independent` and `stale`) and who merged it (`merged_by`, `merged_via`), and
   the question an auditor would ask about it. Do not invent a reason a merge was fine.
3. **Read the rule** in `rules`: how many approvals the branch requires now, whether Copilot code
   review is on (its approval can count toward the requirement since 1 Sep 2026), and that the
   rule at each merge was not readable unless `rules.at_merge` is `read`.
4. **Offer the files.** Running it again without `--json` writes the dated CSV and markdown pair,
   which the user can keep with their evidence. Do not run anything else, and do not change the
   repository's settings.
5. **Say plainly** that this is a list of what GitHub's records show, not an opinion on whether the
   user's controls are met (`note`).
