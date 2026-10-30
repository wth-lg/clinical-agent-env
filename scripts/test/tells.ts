// The tells classifier world-tells.test.ts runs over the task charts (verifier P17i W0-1b r2 probe2,
// builder-205 F4). For each record it computes what an agent can compute from fhir_search output
// alone, then scores every feature, and every AND / OR of two of the strongest (negations
// included), by balanced accuracy at telling a planted record from a generated one of its type in
// the task charts. Feature families, by prefix:
//   P  a field path            K  the set of top-level fields
//   E  an exact short value (codes, categories, statuses, performers, providers, units, ...)
//   RT / RX  a reference's target type, and whether it resolves
//   N / NI   a number's decimals, and whether it is whole
//   TP TM5 TM15 TS0 TZ TH TMS TY TY26  a timestamp's precision, minute on a 5 or 15 minute grid,
//            seconds of 00, offset, hour band, millisecond value, year
//   CMODE CTOP3 CSS CSSTOP3 CRARE  a timestamp against its chart's own clock: its mm:ss the chart's
//            modal one or among its three most common, its seconds the same, a mm:ss seen at most
//            twice in the chart
//   DL DN DLINES  an attachment's length, newline and line count
//   GAP      issued against the effective time, a period's length, a note's date against its period
//   ENC      the record against its visit: same day, same instant, inside the visit, no visit
//   O        order in the chart: in the newest tenth, the last three, the newest; newest of its
//            code; how many records share its code; age
//   text shape (verifier P17i W0-1b r3 probe3 and F2, builder-206), what a reader sees in the words:
//   SEM SEMT  a SNOMED semantic tag ('(disorder)', '(procedure)', ...) in a display or text, by path,
//            and in any of them; SEMD the same in an attachment's text
//   TCASE TBRK  a display or text's first letter case, and a bracketed part ('[tylenol]')
//   MD MDB   an attachment's markdown heading ('# Plan') and '- ' list lines
//   DHEAD DLEAD  an attachment's first line (a bare date, 'heading - place', other), and a leading
//            blank line
//   SIGNED HHMM DIGITS  an attachment that ends with a signer, gives a clock time, has many digits
//   TXT NCODING  a code's text against its first coding's display, and how many codings it has
//   WKEND NOTE OUTCOME  a primary time on a weekend; a note; an outcome as text or coded
import { Buffer } from 'node:buffer';

export type R = Record<string, unknown> & { resourceType: string; id: string };
type Json = Record<string, unknown>;

// The patient a resource is about: its first Patient reference, at any depth.
export function patientOf(v: unknown): string | undefined {
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

const TSRE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;
function walk(v: unknown, at: string, f: (at: string, v: unknown) => void): void {
  if (Array.isArray(v)) for (const x of v) walk(x, at, f);
  else if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, at ? `${at}.${k}` : k, f);
  else f(at, v);
}
function allPaths(v: unknown, at: string, f: (at: string) => void): void {
  if (Array.isArray(v)) for (const x of v) allPaths(x, at, f);
  else if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v)) { const p = at ? `${at}.${k}` : k; f(p); allPaths(x, p, f); }
}
const primaryTime = (r: Json): string | undefined => {
  for (const k of ['effectiveDateTime', 'onsetDateTime', 'authoredOn', 'performedDateTime', 'recordedDate', 'date', 'issued']) if (typeof r[k] === 'string') return r[k] as string;
  for (const k of ['period', 'performedPeriod', 'effectivePeriod']) { const s = (r[k] as { start?: string } | undefined)?.start; if (s) return s; }
  return undefined;
};
const codeKey = (r: Json): string => {
  const c = (cc: unknown) => (cc as { coding?: Array<{ code?: string }> } | undefined)?.coding?.[0]?.code;
  return JSON.stringify(c(r.code) ?? c(r.medicationCodeableConcept) ?? c((r.type as unknown[] | undefined)?.[0]) ?? '');
};
type Clock = { mmss: Map<string, number>; ss: Map<string, number> };
const ranked = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).map((x) => x[0]);

export interface TypeScore {
  type: string;
  n: number;
  planted: number;
  // The strongest single feature, and AND / OR of two, that no named residual holds.
  single: { f: string; ba: number; tp: number; fp: number };
  pair: { rule: string; ba: number; tp: number; fp: number };
  // Every residual feature, and the pair holding a residual that most exceeds its cap (the
  // strongest such pair when none does).
  residuals: Array<{ f: string; ba: number; tp: number; fp: number; cap: number }>;
  residualPair: { rule: string; ba: number; tp: number; fp: number; cap: number };
  // The strongest single feature of each family, residuals included, for the report.
  families: Array<{ f: string; ba: number; tp: number; fp: number }>;
}
// A named residual feature: its cap alone, and the cap on any pair that holds it.
export type Residual = (type: string, f: string) => { cap: number; pairCap: number } | undefined;

// A SNOMED CT semantic tag, the hierarchy Synthea's displays end with.
export const SEMANTIC_TAG = / \((disorder|finding|procedure|situation|qualifier value|regime\/therapy|observable entity|morphologic abnormality|substance|environment|organism|record artifact|person|physical object|product|body structure|event|specimen|occupation|social concept|assessment scale|life style|attribute|cell)\)/;
const SIGNER = /\n\n[A-Z][a-z]+(?: [A-Z][a-z.-]+)+, (MD|NP|PA-C|DO|RN|PharmD)\s*$/;

const ba = (tp: number, fp: number, p: number, n: number) => Math.max((tp / p + 1 - fp / n) / 2, (1 - tp / p + fp / n) / 2);

// Score every type that has planted and generated records in the task charts.
// opts.residual names the residual features: scored apart, each held to its cap, and every pair
// that holds one held to its pairCap. opts.charts and opts.types narrow the search (a random-label
// baseline labels generated records as planted in the task charts).
export function scoreTells(world: readonly R[], isPlanted: (id: string) => boolean, opts: { pairsOf?: number; residual?: Residual; charts?: ReadonlySet<string>; types?: readonly string[] } = {}): TypeScore[] {
  const K = opts.pairsOf ?? 150;
  const byKey = new Map(world.map((r) => [`${r.resourceType}/${r.id}`, r]));
  const charts = opts.charts ?? new Set(world.filter((r) => isPlanted(r.id)).map(patientOf).filter((p): p is string => p !== undefined));
  const NUM = /^[a-z]+-\d{5}$/;
  const types = opts.types ?? [...new Set(world.filter((r) => isPlanted(r.id)).map((r) => r.resourceType))].filter((t) => world.some((r) => r.resourceType === t && !isPlanted(r.id) && NUM.test(r.id)));
  // Each chart's clock, over every timestamp of every record in it (what the agent sees).
  const clocks = new Map<string, Clock>();
  for (const r of world) {
    const p = patientOf(r);
    if (p === undefined || !charts.has(p)) continue;
    walk(r, '', (_, v) => {
      if (typeof v !== 'string') return;
      const m = TSRE.exec(v);
      if (!m?.[5]) return;
      const c = clocks.get(p) ?? { mmss: new Map(), ss: new Map() };
      const a = `${m[5]}:${m[6] ?? ''}`;
      c.mmss.set(a, (c.mmss.get(a) ?? 0) + 1);
      c.ss.set(m[6] ?? '', (c.ss.get(m[6] ?? '') ?? 0) + 1);
      clocks.set(p, c);
    });
  }
  const tops = new Map([...clocks].map(([p, c]) => { const mm = ranked(c.mmss); const ss = ranked(c.ss); return [p, { mode: mm[0], top3: new Set(mm.slice(0, 3)), ssMode: ss[0], ssTop3: new Set(ss.slice(0, 3)), counts: c.mmss }] as const; }));

  function features(r: R): Set<string> {
    const f = new Set<string>();
    const c = tops.get(patientOf(r) ?? '');
    let tagged = false;
    allPaths(r, '', (at) => f.add(`P:${at}`));
    f.add(`K:${Object.keys(r).sort().join(',')}`);
    walk(r, '', (at, v) => {
      if (typeof v === 'string' && !/(\.|^)(data|div|id)$/.test(at) && v.length < 80 && !v.startsWith('Patient/')) f.add(`E:${at}=${v}`);
      if (typeof v === 'string' && /reference$/.test(at) && !v.startsWith('Patient/')) { f.add(`RT:${at}=${v.split('/')[0]}`); f.add(`RX:${at}=${byKey.has(v) ? 'resolves' : 'dangling'}`); }
      if (typeof v === 'number') { f.add(`N:${at}=dp${(String(v).split('.')[1] ?? '').length}`); f.add(`NI:${at}=${Number.isInteger(v) ? 'int' : 'frac'}`); }
      if (typeof v === 'string') {
        const m = TSRE.exec(v);
        if (m) {
          f.add(`TP:${at}=${m[4] ? (m[6] ? (m[7] ? `ms${m[7].length}` : 's') : 'm') : 'd'}`);
          if (m[5]) {
            f.add(`TM5:${at}=${Number(m[5]) % 5 === 0}`); f.add(`TM15:${at}=${Number(m[5]) % 15 === 0}`); f.add(`TS0:${at}=${m[6] === '00'}`);
            f.add(`TZ:${at}=${m[8]}`); f.add(`TH:${at}=${Number(m[4]) < 7 ? 'night' : Number(m[4]) < 12 ? 'am' : Number(m[4]) < 18 ? 'pm' : 'eve'}`);
            if (m[7]) f.add(`TMS:${at}=${m[7]}`);
            if (c) {
              const a = `${m[5]}:${m[6] ?? ''}`;
              f.add(`CMODE:${at}=${a === c.mode}`); f.add(`CTOP3:${at}=${c.top3.has(a)}`); f.add(`CSS:${at}=${m[6] === c.ssMode}`); f.add(`CSSTOP3:${at}=${c.ssTop3.has(m[6] ?? '')}`); f.add(`CRARE:${at}=${(c.counts.get(a) ?? 0) <= 2}`);
            }
          }
          f.add(`TY:${at}=${m[1]}`); f.add(`TY26:${at}=${m[1]! >= '2026'}`);
        }
      }
      if (typeof v === 'string' && at.endsWith('data')) {
        const t = Buffer.from(v, 'base64').toString('utf8');
        f.add(`DL:${at}=${t.length < 200 ? '<200' : t.length < 800 ? '<800' : t.length < 2000 ? '<2k' : '2k+'}`); f.add(`DN:${at}=${t.includes('\n') ? 'nl' : 'nonl'}`); f.add(`DLINES:${at}=${Math.min(10, t.split('\n').length)}`);
        f.add(`SEMD:${at}=${SEMANTIC_TAG.test(t)}`); f.add(`MD:${at}=${/^#+ /m.test(t)}`); f.add(`MDB:${at}=${/^\s*[-*] /m.test(t)}`);
        const head = t.trim().split('\n')[0] ?? '';
        f.add(`DHEAD:${at}=${/^\d{4}-\d{2}-\d{2}$/.test(head) ? 'date' : / - /.test(head) ? 'heading - place' : 'other'}`); f.add(`DLEAD:${at}=${/^\s*\n/.test(t)}`);
        f.add(`SIGNED:${at}=${SIGNER.test(t)}`); f.add(`HHMM:${at}=${/\b\d{1,2}:\d{2}\b/.test(t)}`); f.add(`DIGITS:${at}=${(t.match(/\d/g) ?? []).length > 40}`);
      }
      if (typeof v === 'string' && /(^|\.)(display|text)$/.test(at) && !/\.div$/.test(at)) {
        if (SEMANTIC_TAG.test(v)) { f.add(`SEM:${at}`); tagged = true; }
        f.add(`TCASE:${at}=${/^[a-z]/.test(v) ? 'lower' : /^[A-Z]/.test(v) ? 'upper' : 'other'}`);
        if (/\[[^\]]*\]/.test(v)) f.add(`TBRK:${at}`);
      }
    });
    f.add(`SEMT:${tagged}`);
    const cc = (r.code ?? r.medicationCodeableConcept ?? (Array.isArray(r.type) ? r.type[0] : r.type)) as { text?: string; coding?: Array<{ display?: string }> } | undefined;
    if (cc && typeof cc === 'object') { f.add(`TXT:${cc.text === undefined ? 'none' : cc.text === cc.coding?.[0]?.display ? '=display' : 'differs'}`); f.add(`NCODING:${cc.coding?.length ?? 0}`); }
    const tw = primaryTime(r);
    if (tw && tw.length > 10) { const d = new Date(`${tw.slice(0, 19)}Z`).getUTCDay(); f.add(`WKEND:${d === 0 || d === 6}`); }
    if (r.note) f.add('NOTE:present');
    if (r.outcome) f.add(`OUTCOME:${(r.outcome as { text?: string }).text ? 'text' : 'coded'}`);
    const t0 = primaryTime(r);
    if (typeof r.issued === 'string' && t0 && t0 !== r.issued) { const d = Date.parse(r.issued) - Date.parse(t0); f.add(`GAP:issued-eff=${d === 0 ? '0' : d < 0 ? 'neg' : d < 3_600_000 ? '<1h' : d < 86_400_000 ? '<1d' : '>=1d'}`); } else if (r.issued) f.add('GAP:issued-eff=same-str');
    const period = r.period as { start?: string; end?: string } | undefined;
    if (period?.start && period.end) { const d = Date.parse(period.end) - Date.parse(period.start); f.add(`GAP:period=${d <= 0 ? '0' : d <= 900_000 ? '<=15m' : d <= 3_600_000 ? '<=1h' : d < 86_400_000 ? '<1d' : '>=1d'}`); f.add(`GAPM:period=${d / 60_000}`); }
    const ctx = r.context as { period?: { start?: string }; encounter?: Array<{ reference?: string }> } | undefined;
    if (ctx?.period?.start && typeof r.date === 'string') f.add(`GAP:docdate-ctx=${Date.parse(r.date) - Date.parse(ctx.period.start) > 86_400_000 ? '>1d' : '<=1d'}`);
    const enc = (r.encounter as { reference?: string } | undefined)?.reference ?? ctx?.encounter?.[0]?.reference;
    if (enc) {
      const e = byKey.get(enc) as { period?: { start?: string; end?: string } } | undefined;
      if (e && t0) { const s = e.period?.start; f.add(`ENC:sameDay=${s?.slice(0, 10) === t0.slice(0, 10)}`); f.add(`ENC:sameStamp=${s === t0}`); f.add(`ENC:within=${Boolean(s && Date.parse(t0) >= Date.parse(s) && (!e.period?.end || Date.parse(t0) <= Date.parse(e.period.end)))}`); } else if (!e) f.add('ENC:dangling');
    } else f.add('ENC:none');
    return f;
  }

  function order(pop: readonly R[]): Map<R, string[]> {
    const byP = new Map<string, R[]>();
    for (const r of pop) byP.set(patientOf(r)!, [...(byP.get(patientOf(r)!) ?? []), r]);
    const out = new Map<R, string[]>();
    for (const rs of byP.values()) {
      const t = (r: R) => Date.parse(primaryTime(r) ?? '1900-01-01');
      const s = [...rs].sort((a, b) => t(a) - t(b));
      s.forEach((r, i) => {
        const q = i / Math.max(1, s.length - 1);
        const same = s.filter((x) => codeKey(x) === codeKey(r));
        const days = (Date.parse('2026-10-23') - t(r)) / 86_400_000;
        out.set(r, [`O:rank>=0.9=${q >= 0.9}`, `O:last3=${i >= s.length - 3}`, `O:last1=${i === s.length - 1}`, `O:newestOfCode=${same.at(-1) === r}`, `O:codeCount=${Math.min(5, same.length)}`, `O:uniqueCode=${same.length === 1}`, `O:age=${days < 30 ? '<30d' : days < 180 ? '<180d' : days < 365 ? '<1y' : 'old'}`]);
      });
    }
    return out;
  }

  const out: TypeScore[] = [];
  for (const type of types) {
    const pop = world.filter((r) => r.resourceType === type && charts.has(patientOf(r) ?? ''));
    const pos = pop.filter((r) => isPlanted(r.id));
    if (!pos.length || pos.length === pop.length) continue;
    const nNeg = pop.length - pos.length;
    const ord = order(pop);
    const fm = pop.map((r) => new Set([...features(r), ...(ord.get(r) ?? [])]));
    const label = pop.map((r) => isPlanted(r.id));
    const tpc = new Map<string, number>(), fpc = new Map<string, number>();
    fm.forEach((fs, i) => { for (const f of fs) (label[i] ? tpc : fpc).set(f, ((label[i] ? tpc : fpc).get(f) ?? 0) + 1); });
    const singles = [...new Set([...tpc.keys(), ...fpc.keys()])].map((f) => { const tp = tpc.get(f) ?? 0, fp = fpc.get(f) ?? 0; return { f, tp, fp, ba: ba(tp, fp, pos.length, nNeg), res: opts.residual?.(type, f) }; }).sort((a, b) => b.ba - a.ba || (a.f < b.f ? -1 : 1));
    const fam = new Map<string, (typeof singles)[number]>();
    for (const x of singles) if (!fam.has(x.f.split(':')[0]!)) fam.set(x.f.split(':')[0]!, x);
    // Pairs over bitsets: AND and OR of the top K features, each possibly negated.
    const words = Math.ceil(pop.length / 32);
    const bits = (f: string) => { const b = new Uint32Array(words); fm.forEach((fs, i) => { if (fs.has(f)) b[i >>> 5]! |= 1 << (i & 31); }); return b; };
    const posBits = new Uint32Array(words);
    label.forEach((l, i) => { if (l) posBits[i >>> 5]! |= 1 << (i & 31); });
    const all = new Uint32Array(words);
    for (let i = 0; i < pop.length; i++) all[i >>> 5]! |= 1 << (i & 31);
    const pc = (x: number) => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };
    const cand = singles.slice(0, K).map((x) => ({ f: x.f, b: bits(x.f), cap: x.res?.pairCap }));
    let pair = { rule: '', ba: 0, tp: 0, fp: 0 };
    let residualPair = { rule: '', ba: 0, tp: 0, fp: 0, cap: 1 };
    for (let i = 0; i < cand.length; i++) for (let j = i + 1; j < cand.length; j++) {
      const A = cand[i]!.b, B = cand[j]!.b;
      const caps = [cand[i]!.cap, cand[j]!.cap].filter((c): c is number => c !== undefined);
      const cap = caps.length ? Math.max(...caps) : undefined;
      for (const na of [0, 1]) for (const nb of [0, 1]) for (const op of ['AND', 'OR'] as const) {
        let tp = 0, fp = 0;
        for (let w = 0; w < words; w++) {
          const a = na ? ~A[w]! & all[w]! : A[w]!, b = nb ? ~B[w]! & all[w]! : B[w]!;
          const v = op === 'AND' ? a & b : a | b;
          tp += pc(v & posBits[w]!); fp += pc(v & ~posBits[w]!);
        }
        const s = ba(tp, fp, pos.length, nNeg);
        const rule = () => `${na ? 'NOT ' : ''}${cand[i]!.f} ${op} ${nb ? 'NOT ' : ''}${cand[j]!.f}`;
        if (cap === undefined) { if (s > pair.ba + 1e-12) pair = { rule: rule(), ba: s, tp, fp }; }
        else if (s - cap > residualPair.ba - residualPair.cap + 1e-12) residualPair = { rule: rule(), ba: s, tp, fp, cap };
      }
    }
    const strip = ({ f, tp, fp, ba }: (typeof singles)[number]) => ({ f, tp, fp, ba });
    out.push({
      type, n: pop.length, planted: pos.length,
      single: strip(singles.find((x) => !x.res) ?? { f: '', tp: 0, fp: 0, ba: 0, res: undefined }), pair,
      residuals: singles.filter((x) => x.res).map((x) => ({ ...strip(x), cap: x.res!.cap })), residualPair,
      families: [...fam.values()].sort((a, b) => b.ba - a.ba).map(strip),
    });
  }
  return out;
}

if (import.meta.main) {
  const { readFileSync } = await import('node:fs');
  const { gunzipSync } = await import('node:zlib');
  const { join } = await import('node:path');
  const { isPlanted } = await import('../../tasks/planted.ts');
  const root = process.argv[2] ?? '.';
  const world = gunzipSync(readFileSync(join(root, 'fixtures/world.ndjson.gz'))).toString('utf8').split('\n').filter((l) => l).map((l) => JSON.parse(l) as R);
  const scores = scoreTells(world, isPlanted);
  for (const s of scores) {
    console.log(`\n== ${s.type}: n=${s.n} planted=${s.planted}`);
    console.log(` best single ${s.single.ba.toFixed(3)} ${s.single.f.slice(0, 120)} (tp ${s.single.tp} fp ${s.single.fp})`);
    console.log(` best pair   ${s.pair.ba.toFixed(3)} ${s.pair.rule.slice(0, 240)} (tp ${s.pair.tp} fp ${s.pair.fp})`);
    console.log(` families    ${s.families.slice(0, 12).map((x) => `${x.f.split(':')[0]} ${x.ba.toFixed(3)} [${x.f.slice(0, 80)} ${x.tp}/${x.fp}]`).join('\n             ')}`);
  }
  console.log('\n== SUMMARY type n planted single pair');
  for (const s of scores) console.log([s.type, s.n, s.planted, s.single.ba.toFixed(3), s.single.f.slice(0, 70), s.pair.ba.toFixed(3)].join('\t'));
}
