/**
 * The files that put agent-merge-audit where people already are: the package manifest, the README,
 * its recorded sample and the example evidence pair, this package's CHANGELOG, and the repo-root
 * files the sync copies from `distribution/root` (the GitHub Action and the Claude Code plugin
 * marketplace). The public repo has those at its root, so their checks run in the monorepo only;
 * `scripts/sync-oss-repos.sh` re-validates them.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as prettier from "prettier";
import { describe, expect, it } from "vitest";
import { HANDOFF_LINE, NOT_ADVICE, OKGATE_HOOKS } from "./handoff.js";
import { SAMPLE_DATE } from "./index.js";
import { ACTION, INSTALL, ON_NPM, PUBLISHED, REPO, RUN } from "./install.js";
import { main } from "./main.js";
import { TOOLS } from "./mcp.js";

const here = (rel: string): URL => new URL(`../${rel}`, import.meta.url);
const read = (rel: string): string => readFileSync(here(rel), "utf8");
const json = <T>(rel: string): T => JSON.parse(read(rel)) as T;
const pkg = json<{
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  files: string[];
  bin: Record<string, string>;
}>("package.json");

describe("package", () => {
  it("is agent-merge-audit with no runtime dependencies", () => {
    expect(pkg.name).toBe("agent-merge-audit");
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.bin).toEqual({ "agent-merge-audit": "./dist/cli.js" });
    expect(pkg.files).toEqual(expect.arrayContaining(["dist", "README.md", "CHANGELOG.md"]));
  });

  it("CHANGELOG has a section for this version", () => {
    expect(read("CHANGELOG.md")).toMatch(
      new RegExp(`^## ${pkg.version.replace(/\./g, "\\.")} `, "m"),
    );
  });
});

const sampleDeps = (out: { s: string }) => ({
  stdout: (s: string) => (out.s += s),
  stderr: () => undefined,
  now: () => new Date(`${SAMPLE_DATE}T12:00:00Z`),
  cwd: here(".").pathname,
  env: {},
});

describe("README", () => {
  const readme = read("README.md");

  it("leads with the one-line use", () => {
    expect(readme).toContain("```sh\n" + INSTALL + " octo-org/app --period 2026-Q3\n```");
  });

  it("the recorded sample is the CLI's real output on the synthetic demo repo (`node scripts/sample.mjs`)", async () => {
    const out = { s: "" };
    await main(["demo"], sampleDeps(out));
    expect(readme).toContain("**synthetic**");
    expect(readme).toContain("```text\n" + out.s.trimEnd() + "\n```");
  });

  it("the example evidence pair is what the demo writes (`node scripts/sample.mjs`, then prettier)", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ama-sample-"));
    await main(["demo", "--out", dir], sampleDeps({ s: "" }));
    const name = "octo-org-demo-app-merge-audit-2026-09-01-to-2026-09-30";
    const ex = `examples/demo-evidence/${name}`;
    expect(read(`${ex}.csv`)).toBe(readFileSync(path.join(dir, `${name}.csv`), "utf8"));
    const md = readFileSync(path.join(dir, `${name}.md`), "utf8");
    const file = here(`${ex}.md`).pathname;
    const formatted = await prettier.format(md, {
      ...(await prettier.resolveConfig(file)),
      filepath: file,
    });
    expect(read(`${ex}.md`)).toBe(formatted);
    expect(readme).toContain(`(${ex}.md)`);
    expect(readme).toContain(`(${ex}.csv)`);
  });

  it("says what it sends, that it is not advice, and names the Action, the tools and okgate", () => {
    expect(readme).toContain("GETs to `api.github.com`");
    expect(readme).toContain("**Not audit advice:**");
    expect(NOT_ADVICE).toMatch(/^Not audit advice: /);
    expect(readme).toContain(`uses: ${ACTION}`);
    for (const t of TOOLS) expect(readme).toContain(t.name);
    expect(read("examples/github-workflow.yml")).toContain(`uses: ${ACTION}`);
    expect(readme).toContain(OKGATE_HOOKS);
  });
});

const root = "distribution/root";
const frontmatter = (text: string): Record<string, string> =>
  Object.fromEntries(
    (text.split("---")[1] ?? "")
      .split("\n")
      .map((l) => /^([a-z-]+):\s*(.*)$/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1]!, m[2]!.replace(/^"|"$/g, "")]),
  );

describe.skipIf(!existsSync(here(root)))("repo-root files (distribution/root)", () => {
  it("the marketplace's plugin resolves, and versions match this package", () => {
    const marketplace = json<{
      name: string;
      owner: { name: string };
      plugins: { name: string; source: string }[];
    }>(`${root}/.claude-plugin/marketplace.json`);
    // okgate's marketplace is "agentwares"; the same name here would clash
    expect(marketplace.name).toBe("agent-merge-audit");
    expect(marketplace.owner.name).toBe("agentwares");
    expect(marketplace.plugins).toHaveLength(1);
    for (const entry of marketplace.plugins) {
      expect(entry.source.startsWith("./")).toBe(true);
      const plugin = json<{ name: string; version: string }>(
        `${root}/${entry.source.slice(2)}/.claude-plugin/plugin.json`,
      );
      expect(plugin.name).toBe(entry.name);
      expect(plugin.version).toBe(pkg.version);
    }
  });

  it("plugin.json carries the links a directory listing needs", () => {
    const plugin = json<Record<string, unknown>>(
      `${root}/plugins/agent-merge-audit/.claude-plugin/plugin.json`,
    );
    for (const key of [
      "homepage",
      "documentationUrl",
      "repository",
      "privacyPolicyUrl",
      "termsOfServiceUrl",
      "supportUrl",
    ])
      expect(String(plugin[key])).toMatch(/^https:\/\//);
  });

  it("the skill runs the published CLI", () => {
    const skills = readdirSync(here(`${root}/plugins/agent-merge-audit/skills`));
    expect(skills).toEqual(["agent-merge-audit"]);
    const text = read(`${root}/plugins/agent-merge-audit/skills/agent-merge-audit/SKILL.md`);
    const front = frontmatter(text);
    expect(front.name).toBe("agent-merge-audit");
    expect(front.description!.length).toBeGreaterThan(80);
    expect(front.description!.length).toBeLessThanOrEqual(1024);
    expect(text).toContain(`${RUN} $ARGUMENTS --json`);
  });

  it("nothing pre-approves a tool: Claude Code asks before every command", () => {
    const walk = (dir: string): string[] =>
      readdirSync(here(dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      );
    const files = walk(root);
    for (const f of files.filter((x) => x.endsWith(".md"))) {
      const text = read(f);
      const front = text.startsWith("---") ? (text.split("---")[1] ?? "") : "";
      expect(front, f).not.toMatch(/^\s*(allowed-tools|allowedTools)\s*:/m);
    }
    for (const f of files.filter((x) => x.endsWith(".json")))
      expect(read(f), f).not.toMatch(/allowed-?tools/i);
  });

  it("the listing icon is a 1024 px PNG drawn from distribution/icon.svg (`pnpm icon`)", () => {
    const plugin = json<{ icon?: string }>(
      `${root}/plugins/agent-merge-audit/.claude-plugin/plugin.json`,
    );
    expect(plugin.icon).toBe("./.claude-plugin/icon.png");
    const file = `${root}/plugins/agent-merge-audit/${plugin.icon!.slice(2)}`;
    const png = readFileSync(here(file));
    expect(statSync(here(file)).size).toBeLessThan(2 * 1024 * 1024);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.readUInt32BE(16)).toBe(1024);
    expect(png.readUInt32BE(20)).toBe(1024);
    const key = "agent-merge-audit-icon-source-sha256\0";
    const at = png.indexOf(key, 0, "latin1");
    expect(at, "icon.png carries no source hash: run `pnpm icon`").toBeGreaterThan(0);
    const drawnFrom = png.subarray(at + key.length, at + key.length + 64).toString("latin1");
    const svg = createHash("sha256").update(read("distribution/icon.svg")).digest("hex");
    expect(drawnFrom, "distribution/icon.svg changed: run `pnpm icon`").toBe(svg);
  });

  it("the plugin folder has the README the directory lists it by, naming what it runs", () => {
    const readme = read(`${root}/plugins/agent-merge-audit/README.md`);
    expect(readme).toContain(RUN);
    expect(readme).toContain("pre-approve nothing");
  });
});

/**
 * The Action's script, run as GitHub runs it, on the bundled demo recording
 * (AGENT_MERGE_AUDIT_REPLAY=demo): no request is made.
 */
describe.skipIf(!existsSync(here("dist/cli.js")) || !existsSync(here(`${root}/action.yml`)))(
  "the GitHub Action",
  () => {
    // vitest runs a skipped block's body while collecting, so read only where the file exists
    const action = existsSync(here(`${root}/action.yml`)) ? read(`${root}/action.yml`) : "run: |\n";
    const script = /run: \|\n([\s\S]*)$/.exec(action)![1]!.replace(/^ {8}/gm, "");

    function runAction(env: Record<string, string>) {
      const dir = mkdtempSync(path.join(tmpdir(), "ama-action-"));
      const summary = path.join(dir, "summary.md");
      const outputs = path.join(dir, "outputs.txt");
      writeFileSync(summary, "");
      writeFileSync(outputs, "");
      let status = 0;
      let stdout: string;
      try {
        stdout = execFileSync("bash", ["-c", script], {
          cwd: dir,
          env: {
            PATH: process.env["PATH"],
            GITHUB_ACTION_PATH: here(".").pathname,
            RUNNER_TEMP: dir,
            GITHUB_STEP_SUMMARY: summary,
            GITHUB_OUTPUT: outputs,
            AMA_REPO: "octo-org/demo-app",
            AMA_PERIOD: "2026-09",
            AMA_SINCE: "",
            AMA_UNTIL: "",
            AMA_BASE: "",
            AMA_FAIL_ON: "none",
            AGENT_MERGE_AUDIT_REPLAY: "demo",
            ...env,
          },
          encoding: "utf8",
        });
      } catch (e) {
        status = (e as { status: number }).status;
        stdout = String((e as { stdout: unknown }).stdout ?? "");
      }
      return {
        status,
        stdout,
        dir,
        summary: readFileSync(summary, "utf8"),
        outputs: Object.fromEntries(
          readFileSync(outputs, "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((l) => l.split(/=(.*)/s).slice(0, 2) as [string, string]),
        ),
      };
    }

    it("writes the pair, the step summary and the outputs, and passes as evidence only", () => {
      const r = runAction({});
      expect(r.status).toBe(0);
      expect(r.summary).toContain(
        "# Agent-merge audit: octo-org/demo-app, 2026-09-01 to 2026-09-30",
      );
      expect(r.summary).toContain(NOT_ADVICE);
      expect(r.outputs).toMatchObject({
        exceptions: "6",
        "agent-prs": "4",
        "agent-unapproved": "3",
      });
      expect(existsSync(r.outputs["csv"]!)).toBe(true);
      expect(existsSync(r.outputs["markdown"]!)).toBe(true);
      expect(r.stdout).toContain(HANDOFF_LINE);
    });

    it("fails on fail-on, and refuses a value it does not know", () => {
      expect(runAction({ AMA_FAIL_ON: "agent-unapproved" }).status).toBe(1);
      expect(runAction({ AMA_FAIL_ON: "sometimes" }).status).toBe(2);
    });
  },
);

/**
 * One install command (src/install.ts), everywhere it is shown. Any form of it found elsewhere must
 * be INSTALL, or RUN where an agent runs it unattended; code imports it rather than spell it. After
 * flipping ON_NPM, rewrite the files that cannot import it:
 *
 *   AGENT_MERGE_AUDIT_WRITE_INSTALL=1 pnpm --filter agent-merge-audit exec vitest run src/distribution
 */
const COMMAND =
  /npx (?:-{1,2}[\w-]+(?:=[\w-]+)? )*(?:github:agentwares\/)?agent-merge-audit(?:@latest)?(?![\w./-])/g;
const WRITE = Boolean(process.env["AGENT_MERGE_AUDIT_WRITE_INSTALL"]);
const forms = (text: string): string[] => [...text.matchAll(COMMAND)].map((m) => m[0]);
const walk = (rel: string): string[] =>
  !existsSync(here(rel))
    ? []
    : statSync(here(rel)).isFile()
      ? [rel]
      : readdirSync(here(rel), { withFileTypes: true })
          .filter((e) => !["node_modules", "dist", ".next"].includes(e.name))
          .flatMap((e) => walk(`${rel}/${e.name}`));

describe("the install command", () => {
  it(`is ${INSTALL} while ON_NPM is ${String(ON_NPM)}`, () => {
    expect(INSTALL).toBe(`npx ${ON_NPM ? "" : "--allow-git=root github:agentwares/"}${pkg.name}`);
    expect(RUN).toBe(
      ON_NPM
        ? `npx -y ${pkg.name}@latest`
        : `npx -y --allow-git=root github:agentwares/${pkg.name}`,
    );
    expect(REPO).toBe(`https://github.com/agentwares/${pkg.name}`);
    expect(typeof PUBLISHED).toBe("boolean");
  });

  const docs = [
    "README.md",
    "CHANGELOG.md",
    ...walk("distribution"),
    ...walk(".claude-plugin"),
    ...walk("plugins"),
    ...walk("examples"),
  ].filter((f) => /\.(md|json|ya?ml)$/.test(f));

  it.each(docs)("%s names only INSTALL or RUN", (file) => {
    const text = read(file);
    if (WRITE) {
      const next = text.replace(COMMAND, (m) => (/ (?:-y|--yes) /.test(m) ? RUN : INSTALL));
      if (next !== text) writeFileSync(here(file), next);
    }
    for (const form of forms(read(file))) expect([INSTALL, RUN], file).toContain(form);
  });

  it("code, scripts and tests import it rather than spell it", () => {
    const files = [...walk("src"), ...walk("scripts")].filter(
      (f) => f !== "src/install.ts" && !f.startsWith("src/fixtures/"),
    );
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) expect(forms(read(file)), file).toEqual([]);
  });
});

/** The hand-off is one sentence, the same at the end of every run and as the README's heading. */
describe("the hand-off line", () => {
  it("is the README's heading, with the attributed link", () => {
    expect(read("README.md")).toContain(`## ${HANDOFF_LINE.replace(/\.$/, "")}\n`);
    expect(read("README.md")).toContain(
      "https://agentwares-agentguard.vercel.app/merge-audit?ref=agent-merge-audit",
    );
  });
});

/** okgate's pages import a mirror of src/install.ts, written here; nothing there spells it. */
const OKGATE = "../agentguard-app/src/app/merge-audit";
const MIRROR = `${OKGATE}/_lib/install.ts`;
describe.skipIf(!existsSync(here("../agentguard-app/src")))("the pages on okgate's site", () => {
  it("the install mirror its pages import is src/install.ts", () => {
    const text = [
      "/**",
      " * How to run agent-merge-audit, mirrored from apps/agent-merge-audit-cli/src/install.ts, the one constant.",
      " * Written by apps/agent-merge-audit-cli/src/distribution.test.ts, which fails when the two differ.",
      " * While PUBLISHED is false the pages show neither INSTALL nor ACTION, only the hand checks.",
      " */",
      `export const ON_NPM: boolean = ${String(ON_NPM)};`,
      `export const PUBLISHED: boolean = ${String(PUBLISHED)};`,
      `export const INSTALL = ${JSON.stringify(INSTALL)};`,
      `export const REPO = ${JSON.stringify(REPO)};`,
      `export const ACTION = ${JSON.stringify(ACTION)};`,
      "",
    ].join("\n");
    if (WRITE) writeFileSync(here(MIRROR), text);
    expect(read(MIRROR)).toBe(text);
  });

  it("no other page file spells the command", () => {
    const files = walk(OKGATE).filter((f) => f !== MIRROR && /\.(tsx?|md|txt|json)$/.test(f));
    expect(files.length).toBeGreaterThan(4);
    for (const file of files) expect(forms(read(file)), file).toEqual([]);
  });

  it("the pages carry the CLI's not-advice line, hand-off line and okgate command, word for word", () => {
    const content = read(`${OKGATE}/_lib/content.ts`);
    for (const s of [NOT_ADVICE, HANDOFF_LINE, OKGATE_HOOKS])
      expect(content).toContain(JSON.stringify(s));
  });
});
