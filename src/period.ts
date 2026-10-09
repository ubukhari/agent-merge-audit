/** The period an audit covers: whole UTC days, `since` to `until` inclusive. */
import { usage } from "./errors.js";

export interface Period {
  since: string;
  until: string;
}

const DAY = 86_400_000;
const iso = (d: Date): string => d.toISOString().slice(0, 10);

function day(raw: string, flag: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const d = m ? new Date(`${raw}T00:00:00Z`) : null;
  if (!d || Number.isNaN(d.getTime()) || iso(d) !== raw)
    throw usage(`${flag} takes a date as YYYY-MM-DD, got "${raw}"`, `e.g. \`${flag} 2026-07-01\``);
  return raw;
}

/** `2026-09` (a month) or `2026-Q3` (a quarter), as a period. */
export function namedPeriod(raw: string): Period {
  const month = /^(\d{4})-(\d{2})$/.exec(raw);
  if (month) {
    const y = Number(month[1]);
    const mo = Number(month[2]);
    if (mo >= 1 && mo <= 12)
      return {
        since: iso(new Date(Date.UTC(y, mo - 1, 1))),
        until: iso(new Date(Date.UTC(y, mo, 0))),
      };
  }
  const q = /^(\d{4})-[Qq]([1-4])$/.exec(raw);
  if (q) {
    const y = Number(q[1]);
    const n = Number(q[2]);
    return {
      since: iso(new Date(Date.UTC(y, (n - 1) * 3, 1))),
      until: iso(new Date(Date.UTC(y, n * 3, 0))),
    };
  }
  throw usage(
    `--period takes a month (2026-09) or a quarter (2026-Q3), got "${raw}"`,
    "e.g. `--period 2026-Q3`, or `--since 2026-07-01 --until 2026-09-30`",
  );
}

/**
 * The period from the flags: `--period`, or `--since`/`--until`, or by default the 30 days to
 * today. `until` may not be after today, and the period may not run backwards.
 */
export function resolvePeriod(
  flags: { since?: string; until?: string; period?: string },
  now: Date,
): Period {
  const today = iso(now);
  let p: Period;
  if (flags.period !== undefined) {
    if (flags.since !== undefined || flags.until !== undefined)
      throw usage("--period cannot be combined with --since or --until", "give one or the other");
    p = namedPeriod(flags.period);
    if (p.until > today && p.since <= today) p = { ...p, until: today };
  } else {
    const until = flags.until !== undefined ? day(flags.until, "--until") : today;
    const since =
      flags.since !== undefined
        ? day(flags.since, "--since")
        : iso(new Date(new Date(`${until}T00:00:00Z`).getTime() - 29 * DAY));
    p = { since, until };
  }
  if (p.since > today)
    throw usage(`the period starts after today (${today})`, "give a period that has begun");
  if (p.until > today)
    throw usage(`--until ${p.until} is after today (${today})`, "give a date up to today");
  if (p.since > p.until)
    throw usage(`the period runs backwards: ${p.since} is after ${p.until}`, "swap the dates");
  return p;
}

/** The period cut into calendar months, because GitHub's search returns at most 1,000 results. */
export function months(p: Period): Period[] {
  const out: Period[] = [];
  let start = p.since;
  while (start <= p.until) {
    const d = new Date(`${start}T00:00:00Z`);
    const end = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
    const until = end < p.until ? end : p.until;
    out.push({ since: start, until });
    start = iso(new Date(new Date(`${until}T00:00:00Z`).getTime() + DAY));
  }
  return out;
}

/** Days in a period, both ends counted. */
export function lengthInDays(p: Period): number {
  return (
    Math.round(
      (new Date(`${p.until}T00:00:00Z`).getTime() - new Date(`${p.since}T00:00:00Z`).getTime()) /
        DAY,
    ) + 1
  );
}
