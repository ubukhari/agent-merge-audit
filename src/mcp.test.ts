import { describe, expect, it } from "vitest";
import { DEMO_RECORDING } from "./demo.js";
import { HANDOFF_LINE, NOT_ADVICE } from "./handoff.js";
import { callTool, handleMessage, PROTOCOL_VERSIONS, TOOLS, type McpContext } from "./mcp.js";
import { replayFetch } from "./replay.js";

const ctx: McpContext = {
  env: {},
  exec: async () => null,
  fetch: replayFetch(DEMO_RECORDING),
  now: () => new Date("2026-10-09T12:00:00Z"),
};

describe("tools", () => {
  it("are namespaced, described for a new teammate, strict, and set all four annotations", () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      "agent_merge_audit_run",
      "agent_merge_audit_signatures",
    ]);
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^agent_merge_audit_[a-z_]+$/);
      expect(t.description.length).toBeGreaterThan(200);
      expect(t.inputSchema.additionalProperties).toBe(false);
      for (const [k, p] of Object.entries(t.inputSchema.properties))
        expect(String(p.description).length, `${t.name}.${k}`).toBeGreaterThan(20);
      const a = t.annotations;
      expect(a.title).toBe(t.title);
      expect(typeof a.readOnlyHint).toBe("boolean");
      expect(typeof a.destructiveHint).toBe("boolean");
      expect(typeof a.idempotentHint).toBe("boolean");
      expect(typeof a.openWorldHint).toBe("boolean");
      expect(a.readOnlyHint).toBe(true);
      expect(a.destructiveHint).toBe(false);
      expect(a.idempotentHint).toBe(true);
    }
    expect(TOOLS[0]!.annotations.openWorldHint).toBe(true);
    expect(TOOLS[1]!.annotations.openWorldHint).toBe(false);
    expect(TOOLS[0]!.description).toContain(NOT_ADVICE);
    expect(TOOLS[0]!.description).toContain(HANDOFF_LINE);
    expect(TOOLS[0]!.inputSchema.required).toEqual(["repo"]);
  });
});

describe("agent_merge_audit_run", () => {
  it("returns the report, with the not-advice note and the hand-off, and writes nothing", async () => {
    const r = await callTool(
      "agent_merge_audit_run",
      { repo: "octo-org/demo-app", period: "2026-09" },
      ctx,
    );
    expect(r.isError).toBe(false);
    expect(r.structured).toMatchObject({
      repo: "octo-org/demo-app",
      note: NOT_ADVICE,
      summary: { merged_prs: 6, agent_without_independent_approval: 3 },
      handoff: { line: HANDOFF_LINE },
    });
  });

  it("refuses arguments the schema does not allow, with code, cause, fix and retryable", async () => {
    for (const args of [
      {},
      { repo: "octo-org/demo-app", extra: 1 },
      { repo: "octo-org/demo-app", since: "yesterday" },
      { repo: "octo-org/demo-app", period: "2026-09", since: "2026-09-01" },
      { repo: 5 },
    ]) {
      const r = await callTool("agent_merge_audit_run", args, ctx);
      expect(r.isError, JSON.stringify(args)).toBe(true);
      expect(Object.keys(r.structured).sort()).toEqual(["cause", "code", "fix", "retryable"]);
    }
  });
});

describe("agent_merge_audit_signatures", () => {
  it("lists the signatures with where each was seen, offline", async () => {
    const r = await callTool(
      "agent_merge_audit_signatures",
      {},
      { fetch: () => Promise.reject(new Error("offline")) },
    );
    expect(r.isError).toBe(false);
    const s = r.structured as { read: string; agents: { id: string; seen: string }[] };
    expect(s.read).toBe("2026-10-09");
    expect(s.agents.length).toBeGreaterThan(10);
  });
});

describe("the protocol", () => {
  it("initialises on any listed revision, lists tools and calls one", async () => {
    for (const v of PROTOCOL_VERSIONS) {
      const init = (await handleMessage(
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: v } },
        ctx,
      )) as { result: { protocolVersion: string; serverInfo: { name: string } } };
      expect(init.result.protocolVersion).toBe(v);
      expect(init.result.serverInfo.name).toBe("agent-merge-audit");
    }
    const list = (await handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, ctx)) as {
      result: { tools: unknown[] };
    };
    expect(list.result.tools).toHaveLength(2);
    const call = (await handleMessage(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "agent_merge_audit_signatures", arguments: {} },
      },
      ctx,
    )) as { result: { isError: boolean; content: { type: string }[] } };
    expect(call.result.isError).toBe(false);
    expect(call.result.content[0]!.type).toBe("text");
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx)).toBe(
      undefined,
    );
    expect(
      (await handleMessage({ jsonrpc: "2.0", id: 4, method: "resources/list" }, ctx)) as {
        error: { code: number };
      },
    ).toMatchObject({ error: { code: -32601 } });
  });
});
