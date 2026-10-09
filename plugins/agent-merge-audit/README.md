# agent-merge-audit

Find which merges an AI agent wrote, and whether a person approved them, inside Claude Code.

- `/agent-merge-audit:agent-merge-audit owner/repo` runs
  `npx -y --allow-git=root github:agentwares/agent-merge-audit` on the repository and period you
  give, and explains each exception an auditor would ask about under SOC 2 CC8.1: an agent's change
  with no independent approval, a merge with no approval, an approval only from the author or a
  bot, an approval given before the last commit, a bot's merge, a commit pushed without a pull
  request.

## What it runs, reads and sends

- **Runs** one command, through the Bash tool. The skill and plugin pre-approve nothing, so Claude
  Code asks you before the command runs.
- **Fetches** agent-merge-audit with `npx`, from where that command names.
- **Reads** the repository's merged pull requests, their reviews, commits and timeline, the
  branch's rules, and its commits, through GitHub's API with your own token, or none for a public
  repo. GETs only: nothing is written to GitHub.
- **Sends nothing** to us. No account, no LLM calls of its own.

It is not audit advice: it lists what GitHub's records show.

Source, the full CLI, the GitHub Action and its documentation:
[github.com/agentwares/agent-merge-audit](https://github.com/agentwares/agent-merge-audit). MIT
licensed, by agentwares.
