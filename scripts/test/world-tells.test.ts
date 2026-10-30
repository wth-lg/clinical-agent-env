// Residual tells (builder-189's open risks, verifier P17i W0 S1 and S2): nothing in the committed
// world (fixtures/world.ndjson.gz) may tell a resource a task overlay planted from one the Synthea
// cohort generated, apart from what the record says.
//   - Ids. Every numbered id follows Synthea's own rule (scripts/fixtures-synthea.ts): per type,
//     numbered 1..N in (patient, date) order. So a planted id sits inside its patient's block, by
//     date, among the generated ones, never above the type's base range or in a run of its own,
//     and the types only overlays write (Task, Communication, ServiceRequest, Appointment,
//     EpisodeOfCare) are numbered the same way. An id then says nothing a reader cannot see in the
//     record's patient and date.
//   - Shape. Every planted resource's set of top-level fields is one some generated resource of
//     its type also has, and no field path (code.text, dosageInstruction.route, ...) appears only
//     on planted resources of a type, or on every generated one but not on a planted one.
// Planted means named in a task's id registry (tasks/planted.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPlanted } from '../../tasks/planted.ts';
import { gunzip } from '../fixtures-lib.ts';
import { repoRoot } from './helpers.ts';

type R = Record<string, unknown> & { resourceType: string; id: string };
const world = gunzip(readFileSync(join(repoRoot, 'fixtures/world.ndjson.gz')))
  .toString('utf8')
  .split('\n')
  .filter((l) => l !== '')
  .map((l) => JSON.parse(l) as R);

const NUMBERED = /^[a-z]+-(\d{5})$/;
const num = (r: R) => Number(NUMBERED.exec(r.id)![1]);

// The patient a resource is about: its first Patient reference, at any depth.
function patientOf(v: unknown): string | undefined {
  if (Array.isArray(v)) {
    for (const x of v) {
      const p = patientOf(x);
      if (p) return p;
    }
  } else if (v !== null && typeof v === 'object') {
    const ref = (v as { reference?: unknown }).reference;
    if (typeof ref === 'string' && ref.startsWith('Patient/')) return ref.slice(8);
    for (const x of Object.values(v)) {
      const p = patientOf(x);
      if (p) return p;
    }
  }
  return undefined;
}

// The record's clinical date, as Synthea's numbering reads it (fixtures-synthea.ts dateOf), plus
// the date fields of the types only overlays write.
function dateOf(r: R): number {
  for (const k of ['effectiveDateTime', 'onsetDateTime', 'authoredOn', 'performedDateTime', 'recordedDate', 'date', 'sent', 'start']) {
    if (typeof r[k] === 'string') return Date.parse((r[k] as string).length === 10 ? `${r[k] as string}T00:00:00Z` : (r[k] as string));
  }
  for (const k of ['period', 'performedPeriod', 'effectivePeriod']) {
    const start = (r[k] as { start?: string } | undefined)?.start;
    if (start) return Date.parse(start);
  }
  return -Infinity;
}

const byType = new Map<string, R[]>();
for (const r of world) if (NUMBERED.test(r.id)) byType.set(r.resourceType, [...(byType.get(r.resourceType) ?? []), r]);
for (const rs of byType.values()) rs.sort((a, b) => num(a) - num(b));

describe('planted ids are numbered as the generated ones are', () => {
  it('every type is numbered 1..N with no gap', () => {
    const gaps = [...byType].filter(([, rs]) => rs.some((r, i) => num(r) !== i + 1)).map(([t, rs]) => `${t}: ${rs.length} ids, last ${rs.at(-1)!.id}`);
    expect(gaps).toEqual([]);
  });

  it('no planted id sorts above its type\'s generated range', () => {
    const above = [...byType].flatMap(([, rs]) => {
      const base = rs.filter((r) => !isPlanted(r.id));
      if (!base.length) return [];
      const max = Math.max(...base.map(num));
      return rs.filter((r) => isPlanted(r.id) && num(r) > max).map((r) => `${r.resourceType}/${r.id} > ${base.find((b) => num(b) === max)!.id}`);
    });
    expect(above).toEqual([]);
  });

  it("each patient's resources of a type hold one contiguous block of ids, planted and generated together", () => {
    const split = [...byType].flatMap(([t, rs]) => {
      const blocks = new Map<string, number[]>();
      for (const r of rs) {
        const p = patientOf(r) ?? '(none)';
        blocks.set(p, [...(blocks.get(p) ?? []), num(r)]);
      }
      return [...blocks].filter(([, ns]) => ns.at(-1)! - ns[0]! + 1 !== ns.length).map(([p, ns]) => `${t} ${p}: ${ns.length} ids over ${ns[0]}-${ns.at(-1)}`);
    });
    expect(split).toEqual([]);
  });

  it('ids follow (patient, date) order in every type, the planted-only types included', () => {
    const order = (r: R) => [patientOf(r) ?? '￿', dateOf(r)] as const;
    const out = [...byType].flatMap(([, rs]) =>
      rs.slice(1).flatMap((r, i) => {
        const [pa, da] = order(rs[i]!);
        const [pb, db] = order(r);
        return pa < pb || (pa === pb && da <= db) ? [] : [`${rs[i]!.resourceType}/${rs[i]!.id} (${pa}) before ${r.id} (${pb})`];
      }),
    );
    expect(out.slice(0, 20)).toEqual([]);
  });
});

// Every key path of a resource (arrays flattened): 'code', 'code.coding', 'code.coding.system', ...
function paths(v: unknown, at = '', out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) paths(x, at, out);
  else if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      const p = at ? `${at}.${k}` : k;
      out.add(p);
      paths(x, p, out);
    }
  }
  return out;
}

describe('planted resources have the shape of generated ones', () => {
  const types = [...new Set(world.filter((r) => isPlanted(r.id)).map((r) => r.resourceType))].filter((t) => world.some((r) => r.resourceType === t && !isPlanted(r.id) && NUMBERED.test(r.id)));
  const of = (t: string, planted: boolean) => world.filter((r) => r.resourceType === t && isPlanted(r.id) === planted && (planted || NUMBERED.test(r.id)));

  it('every planted top-level field set is one a generated resource of its type has', () => {
    const out = types.flatMap((t) => {
      const base = new Set(of(t, false).map((r) => Object.keys(r).sort().join(',')));
      return of(t, true).filter((r) => !base.has(Object.keys(r).sort().join(','))).map((r) => `${t}/${r.id}: ${Object.keys(r).sort().join(',')}`);
    });
    expect(out).toEqual([]);
  });

  it('no field path appears only on planted resources of a type', () => {
    const out = types.flatMap((t) => {
      const base = new Set(of(t, false).flatMap((r) => [...paths(r)]));
      const only = new Set(of(t, true).flatMap((r) => [...paths(r)].filter((p) => !base.has(p))));
      return [...only].sort().map((p) => `${t}.${p}`);
    });
    expect(out).toEqual([]);
  });

  it('no field path on every generated resource of a type is missing from a planted one', () => {
    const out = types.flatMap((t) => {
      const base = of(t, false).map((r) => paths(r));
      const everywhere = [...base[0]!].filter((p) => base.every((s) => s.has(p)));
      return of(t, true).flatMap((r) => {
        const own = paths(r);
        return everywhere.filter((p) => !own.has(p)).map((p) => `${t}/${r.id} lacks ${p}`);
      });
    });
    expect(out).toEqual([]);
  });
});
