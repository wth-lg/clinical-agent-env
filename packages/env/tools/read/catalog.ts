// lookup_catalog (design section 3): the formulary and the order catalog. Entries are codes,
// not resources, so results carry no exposure.
import { ToolError } from '../errors.ts';
import type { Tool } from '../registry.ts';
import { CATALOG_KINDS, type CatalogEntry, type ReadContext } from './context.ts';
import { page } from './page.ts';
import { count, offset } from './schema.ts';

// Tokens (R14-09): lower-cased, split at every character that is not a letter or digit, except a
// '.' between digits ("2.5"), or, in a query, a '.' right after digits at the end of a word
// ("2."). A number token holds no letter; a word token does.
const LD = /[\p{L}\p{N}]/u;
const DIGIT = /\p{N}/u;
function tokens(s: string, query: boolean): string[] {
  const t = s.toLowerCase();
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    const next = t[i + 1] ?? '';
    if (LD.test(c)) cur += c;
    else if (c === '.' && cur !== '' && DIGIT.test(t[i - 1]!) && (DIGIT.test(next) || (query && !LD.test(next)))) cur += c;
    else if (cur !== '') {
      out.push(cur);
      cur = '';
    }
  }
  if (cur !== '') out.push(cur);
  return out;
}
const isNumber = (token: string) => !/\p{L}/u.test(token);
// A word matches a token it starts; a number ending in '.' a number it starts; any other
// number only an equal number ("5" never matches "2.5" or "25").
function matches(q: string, token: string): boolean {
  if (!isNumber(q)) return token.startsWith(q);
  if (!isNumber(token)) return false;
  return q.endsWith('.') ? token.startsWith(q) : token === q;
}
const entryTokens = (e: CatalogEntry) => [e.display, e.code, ...(e.strengths ?? [])].flatMap((s) => tokens(s, false));

export const lookupCatalog: Tool<ReadContext> = {
  name: 'lookup_catalog',
  description:
    "Look up orderable codes: medication (RxNorm formulary), lab, imaging or referral. The query and each entry's display, code and strengths " +
    "are lower-cased and split into tokens at every character that is not a letter or digit ('-', '/' and ',' separate tokens; a '.' between digits, " +
    "or right after digits at the end of a query word, stays in the token). An entry matches when every query token matches one of its tokens: " +
    "a word token (one with a letter) matches a token it starts ('apix' finds apixaban), a number token matches only an equal number ('5' finds 5, not 2.5 or 25), " +
    "and a number ending in '.' matches a number it starts ('2.' finds 2.5). Returns {code, system, display, strengths?} ordered by display.",
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Words or a code', minLength: 1, maxLength: 100 },
      kind: { type: 'string', description: 'Catalog to search', enum: CATALOG_KINDS },
      count: count(50, 20),
      offset,
    },
    required: ['query', 'kind'],
    additionalProperties: false,
  },
  run(input: { query: string; kind: string; count?: number; offset?: number }, { catalog }) {
    const want = tokens(input.query, true);
    if (want.length === 0) throw new ToolError('INVALID_INPUT', "'query' must contain at least one letter or digit", 'query');
    const rows = catalog
      .filter((e) => {
        if (e.kind !== input.kind) return false;
        const have = entryTokens(e);
        return want.every((q) => have.some((t) => matches(q, t)));
      })
      .map((e) => ({ key: e.display.toLowerCase(), e }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.e.code < b.e.code ? -1 : a.e.code > b.e.code ? 1 : 0))
      .map(({ e }) => ({ code: e.code, system: e.system, display: e.display, ...(e.strengths ? { strengths: [...e.strengths] } : {}) }));
    return page(rows, input.offset ?? 0, input.count ?? 20);
  },
};
