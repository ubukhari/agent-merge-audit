import { describe, expect, it } from "vitest";
import { runAudit } from "./audit.js";
import { DEMO_RECORDING, DEMO_REPO } from "./demo.js";
import { GitHub } from "./github.js";
import { HANDOFF_LINE, NOT_ADVICE } from "./handoff.js";
import {
  cell,
  CSV_COLUMNS,
  csvName,
  renderCsv,
  renderJson,
  renderMarkdown,
  renderSummary,
  sha256,
} from "./render.js";
import { replayFetch } from "./replay.js";

const report = () =>
  runAudit({
    repo: DEMO_REPO,
    period: { since: "2026-09-01", until: "2026-09-30" },
    gh: new GitHub({ token: null, fetch: replayFetch(DEMO_RECORDING) }),
    now: new Date("2026-10-09T12:00:00Z"),
  });

/** A minimal CSV reader: enough to prove the file parses back into the same cells. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += c;
  }
  return rows;
}

describe("CSV", () => {
  it("never lets a spreadsheet run a title as a formula, and quotes what needs it", () => {
    expect(cell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(cell("+1")).toBe("'+1");
    expect(cell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(cell("-2")).toBe("'-2");
    expect(cell("a, b")).toBe('"a, b"');
    expect(cell("two\nlines")).toBe('"two\nlines"');
    expect(cell(null)).toBe("");
    expect(cell(7)).toBe("7");
  });

  it("opens with the tool, repo, period, time and the not-advice line, then one row a PR and a push", async () => {
    const r = await report();
    const text = renderCsv(r);
    const lines = text.split("\n");
    expect(lines[0]).toBe(
      `# agent-merge-audit ${r.version}; octo-org/demo-app, branch main, merged 2026-09-01 to 2026-09-30 (UTC); generated 2026-10-09T12:00:00.000Z from GitHub's API (anonymous)`,
    );
    expect(lines[1]).toBe(`# ${NOT_ADVICE}`);
    const rows = parseCsv(lines.slice(3).join("\n"));
    expect(rows[0]).toEqual([...CSV_COLUMNS]);
    expect(rows).toHaveLength(1 + 6 + 1);
    for (const row of rows) expect(row).toHaveLength(CSV_COLUMNS.length);
    const byNumber = Object.fromEntries(rows.slice(1).map((x) => [x[1], x]));
    expect(byNumber["102"]![CSV_COLUMNS.indexOf("exceptions")]).toBe(
      "agent-no-human-approval; self-approval-only",
    );
    expect(byNumber["105"]![CSV_COLUMNS.indexOf("merged_by")]).toBe("octo-cam (via merge queue)");
    expect(rows.at(-1)![0]).toBe("direct-push");
    // no person's address in the evidence
    expect(text).not.toMatch(/@example\.com/);
  });

  it("names the pair by repo and period", async () => {
    expect(csvName(await report())).toBe("octo-org-demo-app-merge-audit-2026-09-01-to-2026-09-30");
  });
});

describe("markdown", () => {
  it("names the CSV's hash, says it is not advice, and ends with the hand-off", async () => {
    const r = await report();
    const csv = renderCsv(r);
    const md = renderMarkdown(r, { name: "x.csv", sha256: sha256(csv) });
    expect(md).toContain(`\`x.csv\`, SHA-256 \`${sha256(csv)}\``);
    expect(md).toContain(`**${NOT_ADVICE}**`);
    expect(md).toContain(`## ${HANDOFF_LINE.replace(/\.$/, "")}\n`);
    expect(md).toContain("### An agent wrote it, and no independent person approved it (4)");
    expect(md).toContain("To answer: Who reviewed this agent's change before it merged");
    expect(md).toMatch(/\| \[#102\]\(https:\/\/github\.com\/octo-org\/demo-app\/pull\/102\)/);
    expect(md).not.toMatch(/@example\.com/);
  });

  it("escapes a title that would break the table", async () => {
    const r = await report();
    r.prs[0]!.title = "a | b\nc";
    expect(renderMarkdown(r)).toContain("a \\| b c");
  });
});

describe("summary and JSON", () => {
  it("both carry the not-advice line and the hand-off", async () => {
    const r = await report();
    const s = renderSummary(r, ["out.csv"]);
    expect(s).toContain(NOT_ADVICE);
    expect(s).toContain(HANDOFF_LINE);
    expect(s).toContain("Wrote:\n  out.csv");
    const j = JSON.parse(renderJson(r)) as { note: string; handoff: { line: string } };
    expect(j.note).toBe(NOT_ADVICE);
    expect(j.handoff.line).toBe(HANDOFF_LINE);
  });
});
