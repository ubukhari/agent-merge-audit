/**
 * Recorded GitHub responses, replayed as `fetch`: the demo runs on a synthetic recording bundled
 * here, and the tests on one anonymous run against a public repo (scripts/record.mjs). A request
 * that was not recorded fails loudly, so a test never reaches the network.
 */
import type { FetchLike } from "./github.js";

export interface RecordedResponse {
  /** path and query under the API base, e.g. /repos/o/r/rules/branches/main */
  path: string;
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}

export interface Recording {
  recorded_at: string;
  note: string;
  responses: RecordedResponse[];
}

/** The same request whichever way its query was encoded. */
export function normalisePath(path: string): string {
  const [p, q] = path.split("?");
  if (!q) return p!;
  const params = new URLSearchParams(q);
  return `${p}?${[...params.entries()].map(([k, v]) => `${k}=${v}`).join("&")}`;
}

export function replayFetch(rec: Recording, base = "https://api.github.com"): FetchLike {
  const byPath = new Map(rec.responses.map((r) => [normalisePath(r.path), r]));
  return (url) => {
    const path = url.startsWith(base) ? url.slice(base.length) : url;
    const r = byPath.get(normalisePath(path));
    if (!r) return Promise.reject(new Error(`not in the recording: GET ${path}`));
    return Promise.resolve(
      new Response(r.status === 204 ? null : JSON.stringify(r.body), {
        status: r.status,
        headers: { "content-type": "application/json", ...(r.headers ?? {}) },
      }),
    );
  };
}
