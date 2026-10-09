# Agent-merge audit: octo-org/demo-app, 2026-09-01 to 2026-09-30

Every pull request merged into `main` from 2026-09-01 to 2026-09-30 (UTC), read from GitHub's API without a token on 2026-10-09T12:00:00.000Z by agent-merge-audit 0.1.0.

**Not audit advice: this lists what GitHub's records show. Whether it meets your controls is for you and your auditor.**

## Summary

|                                                      |                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Pull requests merged into `main`                     | 6                                                                                     |
| Written or co-written by an agent                    | 4 (Claude Code 1, Claude GitHub app 1, Cursor agent 1, GitHub Copilot coding agent 1) |
| ...of them with no independent person's approval     | 3                                                                                     |
| Approved by an independent person, on the final code | 2 of 6                                                                                |
| Pull requests with an exception                      | 5                                                                                     |
| Commits on `main` without a merged pull request      | 1 of 7                                                                                |

Agents are found by the signatures they leave (bot accounts, commit identities, co-author trailers, PR-body markers). An agent that leaves none, or a trailer someone removed, is not found, so the count is a floor.

## The review rule on `main`

- ruleset 7002 (repository octo-org/demo-app): a pull request is required, 1 approval required.
- Classic branch protection is readable only with a token from an admin of the repo; rulesets are read without one.
- A ruleset turns on Copilot code review here. Since 1 Sep 2026 an admin can let Copilot's approval count toward required approvals, so a required approval is not always a person's.
- Each merge's rule evaluation (pass, bypass) is kept by GitHub for one month and needs a token with admin read on the repo; it was not read, so the rules above are as they are now, not as they were at each merge.

## Exceptions an auditor will ask about

### An agent wrote it, and no independent person approved it (4)

To answer: Who reviewed this agent's change before it merged, and where is that recorded?

- [#102](https://github.com/octo-org/demo-app/pull/102) Fix timezone handling in invoice dates: merged 2026-09-09 by octo-ben; written by Copilot, agent: GitHub Copilot coding agent; approved by octo-ben (wrote it).
- [#103](https://github.com/octo-org/demo-app/pull/103) Move session storage to Redis: merged 2026-09-15 by octo-cam; written by octo-cam, agent: Claude Code; approved by Copilot (GitHub Copilot code review).
- [#104](https://github.com/octo-org/demo-app/pull/104) Paginate the audit log API: merged 2026-09-18 by octo-ben; written by octo-ben, agent: Cursor agent; approved by octo-ana before the last commit.
- [d000000](https://github.com/octo-org/demo-app/commit/d000000ed000000ed000000ed000000ed000000e) Hotfix: restore the health check path: 2026-09-27, by octo-ana, agent: Amp.

### Merged with no approval (1)

To answer: Why did this merge without review? If it was an emergency change, where is the review after it?

- [#105](https://github.com/octo-org/demo-app/pull/105) Bump undici from 7.2.0 to 7.2.3: merged 2026-09-21 by octo-cam (via merge queue); written by dependabot[bot]; approved by no one.

### Approved only by its own author or co-author (1)

To answer: Who other than the people who wrote it reviewed it?

- [#102](https://github.com/octo-org/demo-app/pull/102) Fix timezone handling in invoice dates: merged 2026-09-09 by octo-ben; written by Copilot, agent: GitHub Copilot coding agent; approved by octo-ben (wrote it).

### Approved only by a bot or an AI reviewer (1)

To answer: Is an automated approval part of your documented review control, and who designed it?

- [#103](https://github.com/octo-org/demo-app/pull/103) Move session storage to Redis: merged 2026-09-15 by octo-cam; written by octo-cam, agent: Claude Code; approved by Copilot (GitHub Copilot code review).

### Approved before its last commit (1)

To answer: Who reviewed the commits added after the approval?

- [#104](https://github.com/octo-org/demo-app/pull/104) Paginate the audit log API: merged 2026-09-18 by octo-ben; written by octo-ben, agent: Cursor agent; approved by octo-ana before the last commit.

### Merged by a bot or agent account (1)

To answer: Which person authorised this merge?

- [#106](https://github.com/octo-org/demo-app/pull/106) Add a retry to the webhook sender: merged 2026-09-24 by octo-release-bot[bot]; written by claude[bot], agent: Claude GitHub app; approved by octo-ana.

### No approval, though the branch rule now requires one (1)

To answer: Was the rule added after this merge, or was it bypassed or exempted?

- [#105](https://github.com/octo-org/demo-app/pull/105) Bump undici from 7.2.0 to 7.2.3: merged 2026-09-21 by octo-cam (via merge queue); written by dependabot[bot]; approved by no one.

### On the branch without a merged pull request (1)

To answer: Why did this change reach the branch without a reviewed pull request?

- [d000000](https://github.com/octo-org/demo-app/commit/d000000ed000000ed000000ed000000ed000000e) Hotfix: restore the health check path: 2026-09-27, by octo-ana, agent: Amp.

## Every merged pull request

| PR                                                                                             | Merged     | Opened by       | Agent                               | Approved by | Approval           | Merged by              | Rule at merge | Exceptions                                  |
| ---------------------------------------------------------------------------------------------- | ---------- | --------------- | ----------------------------------- | ----------- | ------------------ | ---------------------- | ------------- | ------------------------------------------- |
| [#101](https://github.com/octo-org/demo-app/pull/101) Add rate limiting to the export endpoint | 2026-09-03 | octo-ana        |                                     | octo-ben    | independent person | octo-ana               | not-readable  |                                             |
| [#102](https://github.com/octo-org/demo-app/pull/102) Fix timezone handling in invoice dates   | 2026-09-09 | Copilot         | GitHub Copilot coding agent (wrote) | octo-ben    | own author only    | octo-ben               | not-readable  | agent-no-human-approval, self-approval-only |
| [#103](https://github.com/octo-org/demo-app/pull/103) Move session storage to Redis            | 2026-09-15 | octo-cam        | Claude Code (co-wrote)              | Copilot     | bot only           | octo-cam               | not-readable  | agent-no-human-approval, bot-approval-only  |
| [#104](https://github.com/octo-org/demo-app/pull/104) Paginate the audit log API               | 2026-09-18 | octo-ben        | Cursor agent (wrote)                | octo-ana    | before last commit | octo-ben               | not-readable  | agent-no-human-approval, stale-approval     |
| [#105](https://github.com/octo-org/demo-app/pull/105) Bump undici from 7.2.0 to 7.2.3          | 2026-09-21 | dependabot[bot] |                                     |             | none               | octo-cam (merge queue) | not-readable  | no-approval, unapproved-while-rule-requires |
| [#106](https://github.com/octo-org/demo-app/pull/106) Add a retry to the webhook sender        | 2026-09-24 | claude[bot]     | Claude GitHub app (wrote)           | octo-ana    | independent person | octo-release-bot[bot]  | not-readable  | merged-by-bot                               |

### How each agent was found

- #102: opened by Copilot (app copilot-swe-agent); commit author Copilot (1 of 1 commit)
- #103: Co-authored-by: Claude Opus 5.5 <noreply@anthropic.com> (1 of 1 commit); PR body: Generated with [Claude Code]
- #104: commit author cursoragent (2 of 2 commits)
- #106: opened by claude[bot] (app claude); commit author claude[bot] (1 of 1 commit)

## Commits on `main` without a merged pull request

- [d000000](https://github.com/octo-org/demo-app/commit/d000000ed000000ed000000ed000000ed000000e) Hotfix: restore the health check path: 2026-09-27, author octo-ana, committer octo-ana; agent: amp-thread-id: https://ampcode.com/threads/T-0000demo (1 of 1 commit); Co-authored-by: Amp <amp@ampcode.com> (1 of 1 commit)

## How this was read

- 17 GET requests to GitHub's REST API (1 search). Nothing was sent anywhere else, and nothing was written to GitHub.
- An approval counts as independent when it comes from a person who is not the pull request's author, a commit author or a co-author named in a trailer. Merges of another branch into the pull request do not count as writing it.
- An approval is marked before the last commit when it was given before the latest commit that is not such a merge, by commit date.
- Agent signatures as read on 2026-10-09; `agent-merge-audit signatures` lists them.
- The evidence file: `octo-org-demo-app-merge-audit-2026-09-01-to-2026-09-30.csv`, SHA-256 `76544df60c83d89d7a24ae361a561cb9421d09383c267a6b28c7b3120fc64218`.

## A continuous, hash-chained record of every agent change, kept across your audit window, is not built

It would record each merge as it happens (who or what wrote it, who approved it, who merged it, under which rule) in okgate's hash-chained log, with a quarterly CC8.1 export and a read-only link for your auditor. What works today, free: okgate's hook mode holds an agent's git push or merge in Claude Code, Codex and Gemini CLI until a person types the go-ahead, and logs each decision in a hash-chained log on your machine (`okgate verify` checks it). If you would pay for the record, say so with one click: https://agentwares-agentguard.vercel.app/merge-audit?ref=agent-merge-audit#record

okgate's hook mode: `npx -p @agentwares/agentguard okgate hooks install`
