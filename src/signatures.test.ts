import { describe, expect, it } from "vitest";
import {
  agentByIdentity,
  agentsInCommit,
  AGENTS,
  appFromUrl,
  classifyActor,
  humanCoAuthors,
  loginFromEmail,
  parseTrailers,
} from "./signatures.js";

const commit = (message: string, authorName = "Ana Example", authorEmail = "ana@example.com") => ({
  authorName,
  authorEmail,
  message,
});
const names = (ms: { agent: { name: string } }[]) => ms.map((m) => m.agent.name);

describe("accounts", () => {
  it("tells Copilot's coding agent from Copilot code review by the app behind the login", () => {
    const agent = classifyActor({ login: "Copilot", type: "Bot", app: "copilot-swe-agent" });
    const review = classifyActor({
      login: "Copilot",
      type: "Bot",
      app: appFromUrl("https://github.com/apps/copilot-pull-request-reviewer"),
    });
    expect(agent.agent?.name).toBe("GitHub Copilot coding agent");
    expect(review.agent?.name).toBe("GitHub Copilot code review");
    expect(classifyActor({ login: "Copilot", type: "Bot" }).agent?.name).toBe("GitHub Copilot");
  });

  it("names the agent apps, counts other bots as automation and the rest as people", () => {
    expect(classifyActor({ login: "claude[bot]", type: "Bot" }).agent?.id).toBe("claude-app");
    expect(classifyActor({ login: "devin-ai-integration[bot]" }).agent?.id).toBe("devin");
    expect(classifyActor({ login: "google-labs-jules[bot]" }).agent?.id).toBe("jules");
    expect(classifyActor({ login: "coderabbitai[bot]" }).agent?.id).toBe("coderabbit");
    expect(classifyActor({ login: "dependabot[bot]", type: "Bot" }).kind).toBe("automation");
    expect(classifyActor({ login: "some-ci[bot]" }).kind).toBe("automation");
    expect(classifyActor({ login: "deploybot", type: "Bot" }).kind).toBe("automation");
    expect(classifyActor({ login: "octocat", type: "User" }).kind).toBe("human");
    // a person whose login happens to be "claude" is a person
    expect(classifyActor({ login: "claude", type: "User" }).kind).toBe("human");
  });

  it("every signature says where it was seen, and ids are unique", () => {
    const ids = AGENTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of AGENTS) expect(s.seen.length, s.id).toBeGreaterThan(20);
  });
});

describe("commits", () => {
  it("finds the co-author trailers each agent writes by default", () => {
    expect(
      names(agentsInCommit(commit("x\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"))),
    ).toEqual(["Claude Code"]);
    expect(
      names(agentsInCommit(commit("x\n\nCo-authored-by: Cursor <cursoragent@cursor.com>"))),
    ).toEqual(["Cursor agent"]);
    expect(names(agentsInCommit(commit("x\n\nCo-authored-by: Codex <codex@openai.com>")))).toEqual([
      "OpenAI Codex",
    ]);
    expect(
      names(agentsInCommit(commit("x\n\nCo-authored-by: Copilot <copilot@github.com>"))),
    ).toEqual(["GitHub Copilot"]);
    expect(
      names(
        agentsInCommit(
          commit("x\n\nCo-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"),
        ),
      ),
    ).toEqual(["GitHub Copilot"]);
    expect(
      names(agentsInCommit(commit("x\n\nCo-authored-by: aider (gpt-5) <noreply@aider.chat>"))),
    ).toEqual(["aider"]);
    expect(
      names(agentsInCommit(commit("x\n\nCo-authored-by: openhands <openhands@all-hands.dev>"))),
    ).toEqual(["OpenHands"]);
    expect(
      names(agentsInCommit(commit("x\n\nCo-authored-by: Gemini AI <gemini-ai@google.com>"))),
    ).toEqual(["Google Gemini"]);
  });

  it("finds an agent that is the commit's author, by account or by address", () => {
    expect(
      names(
        agentsInCommit({
          ...commit("x", "Cursor Agent", "cursoragent@cursor.com"),
          authorLogin: "cursoragent",
        }),
      ),
    ).toEqual(["Cursor agent"]);
    expect(
      names(
        agentsInCommit(
          commit(
            "x",
            "devin-ai-integration[bot]",
            "158243242+devin-ai-integration[bot]@users.noreply.github.com",
          ),
        ),
      ),
    ).toEqual(["Devin"]);
    const m = agentsInCommit({
      ...commit("x", "Copilot", "198982749+Copilot@users.noreply.github.com"),
      authorLogin: "Copilot",
      authorType: "Bot",
      authorApp: "copilot-swe-agent",
    });
    expect(names(m)).toEqual(["GitHub Copilot coding agent"]);
    expect(m[0]!.how).toBe("commit author Copilot");
  });

  it("an Amp commit is one finding, however many of its signs it carries", () => {
    const m = agentsInCommit(
      commit(
        "fix\n\nAmp-Thread-ID: https://ampcode.com/threads/T-1\nCo-authored-by: Amp <amp@ampcode.com>",
      ),
    );
    expect(new Set(names(m))).toEqual(new Set(["Amp"]));
    expect(m.some((x) => x.how.startsWith("commit message"))).toBe(false);
  });

  it("counts Assisted-by only when it names a model or agent", () => {
    expect(names(agentsInCommit(commit("x\n\nAssisted-by: Claude:claude-opus-4")))).toEqual([
      "declared AI help",
    ]);
    expect(agentsInCommit(commit("x\n\nAssisted-by: Jane Doe <jane@example.com>"))).toEqual([]);
  });

  it("a person named Claude with their own address is not an agent; a noreply Claude is", () => {
    expect(agentByIdentity("Claude Monet", "claude@monet.example")).toBeNull();
    expect(agentByIdentity("Claude", "noreply@example.com")?.id).toBe("claude-code");
  });

  it("never prints a person's address in its evidence", () => {
    const all = agentsInCommit(
      commit(
        "x\n\nCo-authored-by: Claude <ana.personal@example.com>\nAssisted-by: GPT-5 via Ana <ana@example.com>\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>",
      ),
    );
    for (const m of all) expect(m.how).not.toContain("@example.com");
    expect(all.map((m) => m.how)).toContain(
      "Co-authored-by: Claude Opus 5.5 <noreply@anthropic.com>",
    );
  });

  it("finds nothing in a plain commit", () => {
    expect(agentsInCommit(commit("Fix the build\n\nSigned-off-by: Ana <ana@example.com>"))).toEqual(
      [],
    );
  });
});

describe("trailers and people", () => {
  it("parses trailers with their name and address", () => {
    expect(parseTrailers("t\n\nCo-authored-by: Ben <ben@example.com>\nnot: a trailer")).toEqual([
      {
        key: "co-authored-by",
        value: "Ben <ben@example.com>",
        name: "Ben",
        email: "ben@example.com",
      },
    ]);
  });

  it("reads a login from a noreply address, and lists human co-authors only", () => {
    expect(loginFromEmail("13161277+octo-ben@users.noreply.github.com")).toBe("octo-ben");
    expect(loginFromEmail("octo-ben@users.noreply.github.com")).toBe("octo-ben");
    expect(loginFromEmail("ben@example.com")).toBeNull();
    expect(
      humanCoAuthors(
        "x\n\nCo-authored-by: octo-ben <1+octo-ben@users.noreply.github.com>\nCo-Authored-By: Claude <noreply@anthropic.com>",
      ),
    ).toEqual([{ name: "octo-ben", login: "octo-ben" }]);
  });
});
